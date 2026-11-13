import { ArrowLeft } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Header } from '../../components/layout/Header';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Input } from '../../components/ui/Input';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { Modal, ModalFooter } from '../../components/ui/Modal';
import { Money } from '../../components/ui/Money';
import { Select } from '../../components/ui/Select';
import { finalizePayout, getPayoutStatement, sendPayoutStatement, usePayoutRun } from '../../hooks/usePayouts';
import { PAYMENT_METHODS, validatePayment } from '../../lib/payoutDraft';
import {
    defaultThroughDate,
    draftPath,
    formatDay,
    isPayRunSettled,
    localDateString,
    payoutCount,
    payoutsBackPath,
    payRunBlocked,
    payRunReasonRequired,
    payRunSummary,
    payRunTotal,
    runPayRun,
    type PayRunDeps,
    type PayRunEmail,
    type PayRunEntry,
    type PayRunJob,
    type PayRunRowState,
} from '../../lib/payoutRun';
import { formatCurrency } from '../../lib/utils';
import type { PayoutRunRow } from '../../types/payouts';

const IDLE: PayRunRowState = { phase: 'idle' };

function vendorLabel(row: PayoutRunRow): string {
    return row.business_name || row.name;
}

export function PayRunPage() {
    const today = useMemo(() => new Date(), []);
    const through = localDateString(today);
    const { data, error, refetch } = usePayoutRun(through);
    const backPath = payoutsBackPath(defaultThroughDate(today), 'drafts', today);
    const backLink = (
        <Link to={backPath} className="mb-3 inline-flex items-center gap-1 text-sm text-[var(--color-muted)] hover:text-[var(--color-foreground)]">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Vendor payouts
        </Link>
    );

    if (error) {
        return (
            <div>
                {backLink}
                <Card className="flex flex-col items-center gap-3 py-10 text-center">
                    <p role="alert" className="font-medium text-[var(--color-foreground)]">The pay run could not be loaded.</p>
                    <p className="text-sm text-[var(--color-muted)]">{error}</p>
                    <Button type="button" variant="secondary" onClick={() => void refetch()}>Retry</Button>
                </Card>
            </div>
        );
    }

    if (!data) {
        return (
            <div>
                {backLink}
                <div className="flex min-h-72 items-center justify-center"><LoadingSpinner size={30} /></div>
            </div>
        );
    }

    const drafts = data.rows.filter((row) => row.status === 'draft' && row.draft_id);
    if (drafts.length === 0) {
        return (
            <div>
                {backLink}
                <Header title="Pay run" />
                <EmptyState
                    title="No drafts to pay"
                    description="Prepare payouts from the Queue tab and they will appear here."
                    action={<Link to="/admin/payouts" className="text-sm text-[var(--color-primary)] hover:underline">Go to the queue</Link>}
                />
            </div>
        );
    }

    return <PayRun drafts={drafts} through={through} backLink={backLink} />;
}

function PayRun({ drafts, through, backLink }: { drafts: PayoutRunRow[]; through: string; backLink: ReactNode }) {
    const [method, setMethod] = useState('check');
    const [date, setDate] = useState(() => localDateString(new Date()));
    const [sendEmail, setSendEmail] = useState(false);
    const [selected, setSelected] = useState<Record<string, boolean>>(
        () => Object.fromEntries(drafts.map((row) => [row.consignor_id, true])),
    );
    const [references, setReferences] = useState<Record<string, string>>({});
    const [reasons, setReasons] = useState<Record<string, string>>(
        () => Object.fromEntries(drafts.map((row) => [row.consignor_id, row.override_reason ?? ''])),
    );
    const [touched, setTouched] = useState<Record<string, boolean>>({});
    const [states, setStates] = useState<Record<string, PayRunRowState>>({});
    const [running, setRunning] = useState(false);
    const [ended, setEnded] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const runningRef = useRef(false);

    useEffect(() => {
        if (!running) return undefined;
        const warn = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [running]);

    const stateOf = (row: PayoutRunRow): PayRunRowState => states[row.consignor_id] ?? IDLE;

    // Rows already settled (paid, already paid, removed, unconfirmed) are never part of what is left to pay.
    const pending: PayRunEntry[] = drafts.map((row) => ({
        row,
        selected: !!selected[row.consignor_id] && !isPayRunSettled(stateOf(row).phase),
        reference: references[row.consignor_id] ?? '',
        reason: reasons[row.consignor_id] ?? '',
    }));
    const pendingIds = new Set(pending.filter((entry) => entry.selected).map((entry) => entry.row.consignor_id));
    const { count, total } = payRunTotal(drafts, pendingIds);
    const blocked = payRunBlocked(pending, method, date);
    const needAttention = pending.filter((entry) => entry.selected && payRunBlocked([entry], method, date || through)).length;
    const nothingLeft = drafts.every((row) => isPayRunSettled(stateOf(row).phase));
    const noEmailCount = pending.filter((entry) => entry.selected && !entry.row.email).length;
    const methodLabel = PAYMENT_METHODS.find((option) => option.value === method)?.label ?? method;

    const phases = drafts.map((row) => stateOf(row).phase);
    const paidCount = phases.filter((phase) => phase === 'paid').length;
    const failedCount = phases.filter((phase) => phase === 'failed').length;
    const unresolvedCount = phases.filter((phase) => phase === 'unconfirmed').length;
    const isRetry = ended && failedCount > 0;

    const start = async () => {
        if (runningRef.current) return;
        runningRef.current = true;
        setRunning(true);
        setEnded(false);
        setConfirmOpen(false);
        const entries = pending.filter((entry) => entry.selected);
        const byId = new Map(entries.map((entry) => [entry.row.consignor_id, entry]));
        const queue: PayRunJob[] = entries.map((entry) => ({
            id: entry.row.consignor_id,
            payoutId: entry.row.draft_id ?? '',
            amount: entry.row.paying_now,
            reference: entry.reference.trim() || null,
            date,
            sendEmail: sendEmail && !!entry.row.email,
        }));
        const deps: PayRunDeps = {
            pay: async (job) => {
                const entry = byId.get(job.id);
                await finalizePayout({
                    payoutId: job.payoutId,
                    expectedAmount: job.amount,
                    paymentMethod: method,
                    paymentDate: job.date,
                    paymentReference: job.reference,
                    belowThresholdOverrideReason: entry && payRunReasonRequired(entry.row) ? entry.reason.trim() : null,
                });
            },
            checkStatus: async (job) => {
                try {
                    const { payout } = await getPayoutStatement(job.payoutId);
                    return {
                        status: payout.status === 'paid' || payout.status === 'voided' ? payout.status : 'draft',
                        amount: Number(payout.amount),
                        reference: payout.payment_reference,
                        date: payout.payment_date,
                    };
                } catch (err) {
                    if (err instanceof Error && err.message.includes('Payout not found')) return null;
                    throw err;
                }
            },
            sendEmail: async (job): Promise<PayRunEmail> => (await sendPayoutStatement(job.payoutId)),
            onRowState: (id, state) => setStates((current) => ({ ...current, [id]: state })),
        };
        try {
            await runPayRun(queue, deps, states);
        } finally {
            runningRef.current = false;
            setRunning(false);
            setEnded(true);
        }
    };

    return (
        <div>
            {running ? null : backLink}
            <Header
                title="Pay run"
                description="Set the method and date once, add a reference for each vendor, then confirm."
            />

            <Card className="mb-4">
                <div className="grid gap-4 sm:grid-cols-2">
                    <Select
                        label="Payment method"
                        options={PAYMENT_METHODS}
                        value={method}
                        disabled={running}
                        onChange={(event) => setMethod(event.target.value)}
                    />
                    <Input
                        label="Payment date"
                        type="date"
                        value={date}
                        disabled={running}
                        onChange={(event) => setDate(event.target.value)}
                        error={date ? undefined : 'Choose a payment date.'}
                    />
                </div>
            </Card>

            <Card padding="none" className="mb-4">
                <ul className="divide-y divide-[var(--color-border)]">
                    {drafts.map((row) => {
                        const id = row.consignor_id;
                        const state = stateOf(row);
                        const locked = running || isPayRunSettled(state.phase);
                        const reasonRequired = payRunReasonRequired(row);
                        const errors = validatePayment({
                            method,
                            date,
                            reference: references[id] ?? '',
                            amount: row.paying_now,
                            reasonRequired,
                            reason: reasons[id] ?? '',
                        });
                        return (
                            <li key={id} className="space-y-3 p-4">
                                <div className="flex items-start gap-3">
                                    <input
                                        type="checkbox"
                                        aria-label={`Include ${vendorLabel(row)}`}
                                        checked={!!selected[id]}
                                        disabled={locked}
                                        onChange={(event) => setSelected((current) => ({ ...current, [id]: event.target.checked }))}
                                        className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-primary)]"
                                    />
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate font-medium text-[var(--color-foreground)]">{vendorLabel(row)}</p>
                                        <p className="truncate text-sm text-[var(--color-muted)]">
                                            Pay to {row.pay_to_name}
                                            {!row.email ? ' · No email on file' : ''}
                                        </p>
                                    </div>
                                    <p className="shrink-0 text-lg font-semibold text-[var(--color-foreground)]">
                                        <Money amount={row.paying_now} />
                                    </p>
                                </div>
                                <div className="flex flex-col gap-3 pl-7 sm:flex-row">
                                    <Input
                                        className="sm:w-52"
                                        label={method === 'check' ? 'Check number' : 'Reference'}
                                        value={references[id] ?? ''}
                                        disabled={locked}
                                        onChange={(event) => setReferences((current) => ({ ...current, [id]: event.target.value }))}
                                        onBlur={() => setTouched((current) => ({ ...current, [id]: true }))}
                                        error={touched[id] && !locked ? errors.reference : undefined}
                                    />
                                    {reasonRequired ? (
                                        <div className="min-w-0 flex-1">
                                            <Input
                                                label="Reason for paying below the minimum"
                                                value={reasons[id] ?? ''}
                                                disabled={locked}
                                                onChange={(event) => setReasons((current) => ({ ...current, [id]: event.target.value }))}
                                                onBlur={() => setTouched((current) => ({ ...current, [id]: true }))}
                                                error={touched[id] && !locked ? errors.reason : undefined}
                                            />
                                        </div>
                                    ) : null}
                                </div>
                                <div className="pl-7 text-sm" aria-live="polite">
                                    {state.phase === 'paying' ? <p className="text-[var(--color-muted)]">Paying…</p> : null}
                                    {state.phase === 'paid' ? (
                                        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                            {state.email === 'failed' ? (
                                                <span className="font-medium text-[var(--color-danger)]">Paid, email failed</span>
                                            ) : (
                                                <>
                                                    <span className="font-medium text-[var(--color-success)]">Paid</span>
                                                    {state.email === 'sent' ? <span className="text-[var(--color-muted)]">Emailed</span> : null}
                                                    {state.email === 'no_email' ? <span className="text-[var(--color-muted)]">No email on file</span> : null}
                                                </>
                                            )}
                                            <Link to={`/admin/payouts/history/${row.draft_id}`} className="text-[var(--color-primary)] hover:underline">
                                                View statement
                                            </Link>
                                        </p>
                                    ) : null}
                                    {state.phase === 'already_paid' ? (
                                        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                            <span className="font-medium text-[var(--color-muted)]">Already paid</span>
                                            <Link to={`/admin/payouts/history/${row.draft_id}`} className="text-[var(--color-primary)] hover:underline">
                                                View statement
                                            </Link>
                                        </p>
                                    ) : null}
                                    {state.phase === 'removed' ? <p className="font-medium text-[var(--color-muted)]">Removed</p> : null}
                                    {state.phase === 'unconfirmed' ? (
                                        <p role="alert" className="font-medium text-[var(--color-danger)]">{state.error}</p>
                                    ) : null}
                                    {state.phase === 'failed' ? (
                                        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                            <span role="alert" className="font-medium text-[var(--color-danger)]">Failed: {state.error}</span>
                                            <Link to={draftPath(row.draft_id ?? '', through)} className="text-[var(--color-primary)] hover:underline">
                                                Open draft
                                            </Link>
                                        </p>
                                    ) : null}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            </Card>

            <div className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-10 lg:bottom-0 -mx-1 rounded-xl bg-[var(--color-card)] p-4 shadow-[var(--shadow-surface)]">
                {ended ? (
                    <p role="status" className="mb-3 text-sm font-medium text-[var(--color-foreground)]">
                        {payRunSummary(paidCount, failedCount, unresolvedCount)}
                    </p>
                ) : null}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 space-y-2">
                        <p className="font-medium text-[var(--color-foreground)]">
                            {payoutCount(count)} · {formatCurrency(total)}
                        </p>
                        <label className="flex items-start gap-2 text-sm text-[var(--color-foreground)]">
                            <input
                                type="checkbox"
                                checked={sendEmail}
                                disabled={running}
                                onChange={(event) => setSendEmail(event.target.checked)}
                                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-primary)]"
                            />
                            <span>
                                Email statements to vendors
                                {noEmailCount > 0 ? ` (${noEmailCount} ${noEmailCount === 1 ? 'has' : 'have'} no email on file)` : ''}
                            </span>
                        </label>
                        {!date && count > 0 ? (
                            <p className="text-sm text-[var(--color-muted)]">Choose a payment date.</p>
                        ) : null}
                        {date && blocked && count > 0 && needAttention > 0 ? (
                            <p className="text-sm text-[var(--color-muted)]">
                                {needAttention} ticked {needAttention === 1 ? 'payout still needs' : 'payouts still need'} a reference or reason.
                            </p>
                        ) : null}
                    </div>
                    {nothingLeft ? null : (
                        <Button
                            type="button"
                            className="w-full sm:w-auto"
                            disabled={blocked || running}
                            isLoading={running}
                            onClick={() => setConfirmOpen(true)}
                        >
                            {isRetry ? `Retry ${count} · ${formatCurrency(total)}` : `Mark ${count} paid · ${formatCurrency(total)}`}
                        </Button>
                    )}
                </div>
            </div>

            <Modal
                isOpen={confirmOpen}
                onClose={() => setConfirmOpen(false)}
                title={`Mark ${payoutCount(count)} paid?`}
                size="md"
            >
                <dl className="space-y-2 text-sm">
                    <div className="flex justify-between gap-4"><dt className="text-[var(--color-muted)]">Payouts</dt><dd>{count}</dd></div>
                    <div className="flex justify-between gap-4"><dt className="text-[var(--color-muted)]">Total</dt><dd>{formatCurrency(total)}</dd></div>
                    <div className="flex justify-between gap-4"><dt className="text-[var(--color-muted)]">Method</dt><dd>{methodLabel}</dd></div>
                    <div className="flex justify-between gap-4"><dt className="text-[var(--color-muted)]">Payment date</dt><dd>{formatDay(date)}</dd></div>
                </dl>
                <p className="mt-4 text-sm text-[var(--color-muted)]">
                    Each payout is recorded one at a time. Any that fail stay listed with the reason.
                </p>
                <ModalFooter>
                    <Button type="button" variant="ghost" onClick={() => setConfirmOpen(false)}>Cancel</Button>
                    <Button type="button" onClick={() => void start()} disabled={blocked || running}>
                        Mark {count} paid · {formatCurrency(total)}
                    </Button>
                </ModalFooter>
            </Modal>
        </div>
    );
}
