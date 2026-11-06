import { ArrowLeft } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Header } from '../../components/layout/Header';
import { MarkPaidDialog, type MarkPaidTarget } from '../../components/payouts/MarkPaidDialog';
import { PayoutEquation } from '../../components/payouts/PayoutLedgerUI';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { Modal, ModalFooter } from '../../components/ui/Modal';
import { Money } from '../../components/ui/Money';
import { Select } from '../../components/ui/Select';
import { useToast } from '../../contexts/ToastContext';
import {
    discardPayoutDraft,
    getPayoutStatement,
    getVendorPayoutWorkspace,
    savePayoutDraft,
} from '../../hooks/usePayouts';
import {
    classifyDraftError,
    draftPayable,
    invoiceAmountsFromAdjustments,
    invoiceApplicationsFrom,
    invoiceRoom,
    isScopeValid,
    nextPayingNow,
    notInThisPayout,
    pendingDeductions,
    pendingReasonText,
    rollsForward,
    sameScope,
    scopeFromPayout,
    scopeToSaveInput,
    startsFollowing,
    statementFigures,
    validateInvoiceAmount,
    validatePayingNow,
    wouldLoseEdits,
    type DraftScope,
} from '../../lib/payoutDraft';
import { fromCents, toCents } from '../../lib/payoutLedger';
import { formatDay, localDateString, parseThrough, payoutsBackPath, shortId } from '../../lib/payoutRun';
import { formatCurrency } from '../../lib/utils';
import type { PayoutStatementData, VendorPayoutWorkspaceData } from '../../types/payouts';

interface Loaded {
    id: string;
    draft: PayoutStatementData;
    workspace: VendorPayoutWorkspaceData;
}

type Busy = 'save' | 'recalculate' | 'discard' | null;

const SCOPE_OPTIONS = [
    { value: 'through', label: 'Everything through' },
    { value: 'between', label: 'Only sales between' },
];

function firstOfMonth(date: string): string {
    return date.length >= 7 ? `${date.slice(0, 7)}-01` : date;
}

export function PayoutDraftReview() {
    const { payoutId = '' } = useParams();
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const today = useMemo(() => new Date(), []);
    const backPath = payoutsBackPath(parseThrough(params.get('through'), today), 'drafts', today);
    const [initial, setInitial] = useState<Loaded | null>(null);
    const [error, setError] = useState<string | null>(null);
    const latestRequest = useRef(0);

    const fetchDraft = useCallback(async (): Promise<Loaded | null> => {
        // A slow reply for an older request must never overwrite a newer one.
        const request = ++latestRequest.current;
        const draft = await getPayoutStatement(payoutId);
        if (request !== latestRequest.current) return null;
        if (draft.payout.status !== 'draft') {
            navigate(`/admin/payouts/history/${payoutId}`, { replace: true });
            return null;
        }
        const workspace = await getVendorPayoutWorkspace(draft.payout.consignor_id);
        if (request !== latestRequest.current) return null;
        return { id: payoutId, draft, workspace };
    }, [navigate, payoutId]);

    const loadFirst = useCallback(() => {
        setInitial(null);
        setError(null);
        fetchDraft()
            .then((loaded) => { if (loaded) setInitial(loaded); })
            .catch((reason) => {
                setError(reason instanceof Error ? reason.message : 'Failed to load the payout draft.');
            });
    }, [fetchDraft]);

    useEffect(() => { loadFirst(); }, [loadFirst]);

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
                    <p role="alert" className="font-medium text-[var(--color-foreground)]">This draft could not be loaded.</p>
                    <p className="text-sm text-[var(--color-muted)]">{error}</p>
                    <Button type="button" variant="secondary" onClick={loadFirst}>Retry</Button>
                </Card>
            </div>
        );
    }

    if (!initial || initial.id !== payoutId) {
        return (
            <div>
                {backLink}
                <div className="flex min-h-72 items-center justify-center"><LoadingSpinner size={30} /></div>
            </div>
        );
    }

    return <DraftEditor key={payoutId} payoutId={payoutId} initial={initial} fetchDraft={fetchDraft} backLink={backLink} backPath={backPath} />;
}

function DraftEditor({ payoutId, initial, fetchDraft, backLink, backPath }: {
    payoutId: string;
    initial: Loaded;
    fetchDraft: () => Promise<Loaded | null>;
    backLink: ReactNode;
    backPath: string;
}) {
    const navigate = useNavigate();
    const toast = useToast();
    const today = useMemo(() => localDateString(new Date()), []);

    const [data, setData] = useState(initial);
    const { draft, workspace } = data;
    const payout = draft.payout;

    const [scope, setScope] = useState<DraftScope>(() => scopeFromPayout(payout, today));
    const [invoiceAmounts, setInvoiceAmounts] = useState(() => invoiceAmountsFromAdjustments(draft.adjustments));
    const [typedPayingNow, setTypedPayingNow] = useState(() => Number(payout.amount).toFixed(2));
    const [following, setFollowing] = useState(() => startsFollowing(Number(payout.amount), payout.original_amount_due));
    const [notes, setNotes] = useState(payout.notes || '');
    const [overrideReason, setOverrideReason] = useState(String(payout.below_threshold_override_reason || ''));
    const [busy, setBusy] = useState<Busy>(null);
    const [staleMessage, setStaleMessage] = useState<string | null>(null);
    const [recalculateWarningOpen, setRecalculateWarningOpen] = useState(false);
    const [discardOpen, setDiscardOpen] = useState(false);
    const [markPaidOpen, setMarkPaidOpen] = useState(false);
    // Two clicks in one frame must not start two requests.
    const working = useRef(false);

    const savedScope = useMemo(() => scopeFromPayout(payout, today), [payout, today]);
    const scopeDirty = !sameScope(scope, savedScope);
    const scopeValid = isScopeValid(scope, today);

    const figures = useMemo(() => statementFigures(payout, draft.adjustments), [payout, draft.adjustments]);
    const invoiceApplications = useMemo(() => invoiceApplicationsFrom(invoiceAmounts), [invoiceAmounts]);
    const invoices = fromCents(invoiceApplications.reduce((sum, row) => sum + toCents(row.amount), 0));
    const payable = draftPayable({ ...figures, invoices });
    const payingNow = nextPayingNow({ payable, typed: typedPayingNow, following });
    const payingNowError = validatePayingNow(payingNow, payable);
    const payingNowAmount = payingNowError ? 0 : Number(payingNow);
    const rolls = rollsForward(payable, payingNowAmount);
    const outsidePayout = payout.payable_before_invoices_snapshot === null
        ? 0
        : notInThisPayout(workspace.summary.current_payable, Number(payout.payable_before_invoices_snapshot));

    const invoiceErrors = useMemo(() => {
        const errors: Record<string, string | null> = {};
        for (const invoice of workspace.invoices) {
            const others = Object.entries(invoiceAmounts)
                .filter(([id]) => id !== invoice.id)
                .reduce((sum, [, value]) => sum + toCents(Number(value) || 0), 0);
            const room = invoiceRoom(figures, fromCents(others));
            errors[invoice.id] = validateInvoiceAmount(invoiceAmounts[invoice.id] ?? '', invoice.balance_due, room);
        }
        return errors;
    }, [figures, invoiceAmounts, workspace.invoices]);
    const hasInvoiceError = Object.values(invoiceErrors).some(Boolean);
    const inputsValid = !payingNowError && !hasInvoiceError;

    const reasonRequired = payingNowAmount > 0
        && payout.payable_before_invoices_snapshot !== null
        && payout.threshold_snapshot !== null
        && Number(payout.payable_before_invoices_snapshot) < Number(payout.threshold_snapshot);

    const vendor = draft.vendor;
    const vendorName = vendor.business_name || vendor.name;
    const scopeInputError = scope.kind === 'between' && scope.from !== '' && scope.to !== '' && scope.from > scope.to
        ? 'Choose a start date on or before the end date.'
        : undefined;

    /** Reads the draft again. `scope` and `text` say which edited fields the server copy replaces. */
    const reload = async (replace: { scope: boolean; text: boolean }): Promise<boolean> => {
        const next = await fetchDraft();
        if (!next) return false;
        setData(next);
        const loadedAmount = Number(next.draft.payout.amount).toFixed(2);
        const loadedInvoices = invoiceAmountsFromAdjustments(next.draft.adjustments);
        setTypedPayingNow(loadedAmount);
        setFollowing(startsFollowing(Number(next.draft.payout.amount), next.draft.payout.original_amount_due));
        setInvoiceAmounts(loadedInvoices);
        if (replace.scope) setScope(scopeFromPayout(next.draft.payout, today));
        if (replace.text) {
            setNotes(next.draft.payout.notes || '');
            setOverrideReason(String(next.draft.payout.below_threshold_override_reason || ''));
        }
        return true;
    };

    /** Handles a failed save or discard. `leaving` means the page is going elsewhere. */
    const handleDraftError = (reason: unknown, fallbackTitle: string): 'leaving' | 'stale' | 'other' => {
        const message = reason instanceof Error ? reason.message : 'Please try again.';
        const kind = classifyDraftError(message);
        if (kind === 'not_a_draft') {
            toast.warning('This payout was already paid or removed.');
            // Paid: open its statement. Removed by someone else: back to the Drafts tab.
            void getPayoutStatement(payoutId).then(
                () => navigate(`/admin/payouts/history/${payoutId}`, { replace: true }),
                () => navigate(backPath, { replace: true }),
            );
            return 'leaving';
        }
        if (kind === 'stale') {
            setStaleMessage(message);
            return 'stale';
        }
        toast.error(fallbackTitle, message);
        return 'other';
    };

    const refreshAfterWrite = async (replace: { scope: boolean; text: boolean }) => {
        try {
            await reload(replace);
        } catch {
            toast.warning('Saved, but the page could not refresh', 'Reload the page to see the latest figures.');
        }
    };

    const save = async (quiet: boolean): Promise<boolean> => {
        if (working.current || !inputsValid) return false;
        working.current = true;
        setBusy('save');
        try {
            await savePayoutDraft({
                consignorId: payout.consignor_id,
                payoutId,
                ...scopeToSaveInput(savedScope),
                paymentAmount: Number(payingNow),
                invoiceApplications,
                notes,
                belowThresholdOverrideReason: overrideReason || null,
            });
            setStaleMessage(null);
            await refreshAfterWrite({ scope: false, text: false });
            if (!quiet) toast.success('Draft saved');
            return true;
        } catch (reason) {
            const outcome = handleDraftError(reason, quiet ? 'Could not save, so nothing was paid' : 'Could not save this draft');
            if (quiet && outcome === 'stale') {
                toast.error('Could not save, so nothing was paid', 'This draft is out of date. Recalculate it first.');
                setMarkPaidOpen(false);
            }
            return false;
        } finally {
            working.current = false;
            setBusy(null);
        }
    };

    const recalculate = async () => {
        if (working.current || !scopeValid) return;
        working.current = true;
        setBusy('recalculate');
        setRecalculateWarningOpen(false);
        try {
            await savePayoutDraft({
                consignorId: payout.consignor_id,
                payoutId,
                ...scopeToSaveInput(scope),
                paymentAmount: null,
                invoiceApplications: null,
                notes,
                belowThresholdOverrideReason: overrideReason || null,
            });
            setStaleMessage(null);
            await refreshAfterWrite({ scope: true, text: false });
            setFollowing(true);
            toast.success('Draft recalculated');
        } catch (reason) {
            handleDraftError(reason, 'Could not recalculate this draft');
        } finally {
            working.current = false;
            setBusy(null);
        }
    };

    const requestRecalculate = () => {
        const losing = wouldLoseEdits({
            payingNow,
            payable,
            invoiceAmounts,
            invoices: workspace.invoices,
            available: invoiceRoom(figures, 0),
        });
        if (losing) setRecalculateWarningOpen(true);
        else void recalculate();
    };

    const confirmDiscard = async () => {
        if (working.current) return;
        working.current = true;
        setBusy('discard');
        try {
            await discardPayoutDraft(payoutId);
            toast.success('Draft discarded');
            navigate(backPath, { replace: true });
        } catch (reason) {
            if (handleDraftError(reason, 'Could not discard this draft') === 'leaving') return;
            setDiscardOpen(false);
        } finally {
            working.current = false;
            setBusy(null);
        }
    };

    const changeScopeKind = (kind: string) => {
        if (kind === scope.kind) return;
        if (scope.kind === 'through') setScope({ kind: 'between', from: firstOfMonth(scope.date), to: scope.date });
        else setScope({ kind: 'through', date: scope.to });
    };

    const changeInvoice = (id: string, value: string) => {
        setInvoiceAmounts((current) => ({ ...current, [id]: value }));
    };

    const markPaidTarget: MarkPaidTarget | null = markPaidOpen
        ? {
            payoutId,
            vendorName,
            payToName: vendor.pay_to_name,
            amount: payingNowAmount,
            rollsForward: rolls,
            email: workspace.vendor.email,
            reasonRequired,
            reason: overrideReason,
        }
        : null;

    const required = draft.adjustments.filter(
        (row) => row.adjustment_type !== 'invoice_deduction' && row.adjustment_type !== 'legacy_carryover' && Number(row.amount) < 0,
    );
    const legacyCarried = fromCents(draft.adjustments
        .filter((row) => row.adjustment_type === 'legacy_carryover')
        .reduce((sum, row) => sum + toCents(Math.abs(Number(row.amount))), 0));
    const pending = pendingDeductions(workspace.required_adjustments, draft.adjustments);
    const canMarkPaid = !scopeDirty && inputsValid && busy === null;

    return (
        <div className="space-y-6">
            <div>
                {backLink}
                <Header
                    className="!mb-0"
                    title={vendorName}
                    description={`#${vendor.consignor_number} · Pay to ${vendor.pay_to_name} · Draft #${shortId(payoutId)}`}
                />
            </div>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="min-w-0 space-y-6">
                    <Card className="space-y-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <h2 className="text-sm font-semibold">Scope</h2>
                                <p className="mt-1 text-sm text-[var(--color-muted)]">
                                    {savedScope.kind === 'through'
                                        ? `Everything through ${formatDay(savedScope.date)}.`
                                        : `Only sales between ${formatDay(savedScope.from)} and ${formatDay(savedScope.to)}.`}
                                </p>
                            </div>
                            {scopeDirty ? (
                                <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={requestRecalculate}
                                    isLoading={busy === 'recalculate'}
                                    disabled={!scopeValid || busy !== null}
                                >
                                    Recalculate
                                </Button>
                            ) : null}
                        </div>
                        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
                            <Select
                                label="Sales to include"
                                options={SCOPE_OPTIONS}
                                value={scope.kind}
                                onChange={(event) => changeScopeKind(event.target.value)}
                            />
                            {scope.kind === 'through' ? (
                                <Input
                                    label="Through"
                                    type="date"
                                    value={scope.date}
                                    max={today}
                                    onChange={(event) => setScope({ kind: 'through', date: event.target.value })}
                                />
                            ) : (
                                <div className="grid gap-3 sm:grid-cols-2 xl:items-start">
                                    <Input
                                        label="From"
                                        type="date"
                                        value={scope.from}
                                        max={today}
                                        onChange={(event) => setScope({ ...scope, from: event.target.value })}
                                    />
                                    <Input
                                        label="To"
                                        type="date"
                                        value={scope.to}
                                        max={today}
                                        onChange={(event) => setScope({ ...scope, to: event.target.value })}
                                        error={scopeInputError}
                                    />
                                </div>
                            )}
                        </div>
                        {scope.kind === 'between' ? (
                            <p className="text-sm text-[var(--color-warning)]">
                                Older money stays out of this payout and rolls forward.
                            </p>
                        ) : null}
                        {scopeDirty ? (
                            <p className="text-sm text-[var(--color-muted)]">
                                The figures below still reflect the saved scope. Recalculate to update them.
                            </p>
                        ) : null}
                    </Card>

                    <Section title="Sale items in this payout" aside={<Money amount={fromCents(draft.allocations.reduce((sum, row) => sum + toCents(row.amount_settled), 0))} />}>
                        {draft.allocations.length === 0 && legacyCarried === 0 ? (
                            <p className="px-4 pb-4 text-sm text-[var(--color-muted)]">No sale items in this payout.</p>
                        ) : (
                            <ul className="divide-y divide-[var(--color-border)] border-t border-[var(--color-border)]">
                                {legacyCarried > 0 ? (
                                    <li className="flex items-center gap-3 px-4 py-3">
                                        <p className="min-w-0 text-sm font-medium">Balance from before sales were tracked</p>
                                        <Money amount={legacyCarried} className="ml-auto font-medium" />
                                    </li>
                                ) : null}
                                {draft.allocations.map((row) => (
                                    <li key={row.id} className="flex items-center gap-3 px-4 py-3">
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-medium">{row.item_name}</p>
                                            <p className="truncate text-xs text-[var(--color-muted)]">
                                                {new Date(row.sale_timestamp).toLocaleDateString()} · {row.sku || 'No SKU'} · Sale #{row.sale_id.slice(0, 8).toUpperCase()}
                                            </p>
                                        </div>
                                        <div className="ml-auto shrink-0 text-right">
                                            <Money amount={row.amount_settled} className="font-medium" />
                                            {row.remaining_amount_after > 0 ? (
                                                <p className="text-xs text-[var(--color-muted)]">{formatCurrency(row.remaining_amount_after)} left</p>
                                            ) : null}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Section>

                    <Section title="Deductions applied">
                        {required.length === 0 ? (
                            <p className="px-4 pb-4 text-sm text-[var(--color-muted)]">No deductions applied.</p>
                        ) : (
                            <ul className="divide-y divide-[var(--color-border)] border-t border-[var(--color-border)]">
                                {required.map((row) => (
                                    <li key={row.id} className="flex items-center gap-3 px-4 py-3">
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium">{row.description}</p>
                                            <p className="text-xs capitalize text-[var(--color-muted)]">{row.adjustment_type.replace(/_/g, ' ')}</p>
                                        </div>
                                        <Money amount={row.amount} className="ml-auto font-medium" />
                                    </li>
                                ))}
                            </ul>
                        )}
                        {pending.length > 0 ? (
                            <div className="border-t border-[var(--color-border)]">
                                <h3 className="px-4 pt-3 text-xs font-medium text-[var(--color-muted)]">Pending</h3>
                                <ul className="divide-y divide-[var(--color-border)]">
                                    {pending.map((row) => (
                                        <li key={`${row.source_table}-${row.source_reference}`} className="flex items-center gap-3 px-4 py-3">
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium">{row.description}</p>
                                                <p className="text-xs text-[var(--color-muted)]">{pendingReasonText(row.pending_reason)}</p>
                                            </div>
                                            <Money amount={row.signed_amount} className="ml-auto font-medium text-[var(--color-muted)]" />
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ) : null}
                    </Section>

                    <Section title="Invoices">
                        {workspace.invoices.length === 0 ? (
                            <p className="px-4 pb-4 text-sm text-[var(--color-muted)]">No unpaid invoices.</p>
                        ) : (
                            <ul className="divide-y divide-[var(--color-border)] border-t border-[var(--color-border)]">
                                {workspace.invoices.map((invoice) => (
                                    <li key={invoice.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                                        <div className="min-w-0">
                                            <p className="font-mono text-sm">#{invoice.invoice_number}</p>
                                            <p className="text-xs text-[var(--color-muted)]">
                                                {formatCurrency(invoice.balance_due)} due of {formatCurrency(invoice.total)}
                                            </p>
                                        </div>
                                        <div className="ml-auto w-32">
                                            <Input
                                                aria-label={`Amount applied to invoice ${invoice.invoice_number}`}
                                                inputMode="decimal"
                                                placeholder="0.00"
                                                value={invoiceAmounts[invoice.id] ?? ''}
                                                onChange={(event) => changeInvoice(invoice.id, event.target.value)}
                                                error={invoiceErrors[invoice.id] ?? undefined}
                                                disabled={busy !== null}
                                            />
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Section>
                </div>

                <aside className="min-w-0 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto">
                    <Card className="space-y-5">
                        {staleMessage ? (
                            <div role="alert" className="space-y-2 rounded-xl bg-[var(--color-danger-bg)] p-3 text-sm text-[var(--color-danger)]">
                                <p>{staleMessage}</p>
                                <p>This draft is out of date. Recalculate to bring it up to date.</p>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    onClick={requestRecalculate}
                                    isLoading={busy === 'recalculate'}
                                    disabled={!scopeValid || busy !== null}
                                >
                                    Recalculate
                                </Button>
                            </div>
                        ) : null}

                        <div>
                            <PayoutEquation
                                lines={[
                                    ...(figures.hasSnapshots ? [{ label: 'Carried in', amount: figures.carriedIn }] : []),
                                    { label: 'Earned', amount: figures.earned, ...(figures.hasSnapshots ? { sign: '+' as const } : {}) },
                                    { label: 'Deductions', amount: figures.required, sign: '−' },
                                    { label: 'Invoices', amount: invoices, sign: '−' },
                                    { label: 'Payable', amount: payable, sign: '=', strong: true },
                                ]}
                            />
                            <PayoutEquation
                                lines={[
                                    { label: 'Paying now', amount: payingNowAmount, strong: true },
                                    ...(rolls > 0 ? [{ label: 'Rolls forward', amount: rolls }] : []),
                                    ...(outsidePayout > 0 ? [{ label: 'Not in this payout', amount: outsidePayout }] : []),
                                ]}
                            />
                        </div>

                        <div className="space-y-3">
                            <Input
                                label="Paying now"
                                inputMode="decimal"
                                value={payingNow}
                                onChange={(event) => {
                                    setTypedPayingNow(event.target.value);
                                    setFollowing(false);
                                }}
                                error={payingNowError ?? undefined}
                                disabled={busy !== null}
                            />
                            {!following ? (
                                <Button type="button" variant="ghost" size="sm" onClick={() => setFollowing(true)} disabled={busy !== null}>
                                    Pay full amount
                                </Button>
                            ) : null}
                            {reasonRequired ? (
                                <Input
                                    label="Reason for paying below the minimum"
                                    value={overrideReason}
                                    onChange={(event) => setOverrideReason(event.target.value)}
                                    hint="Needed to mark this paid because it is under the minimum payout."
                                />
                            ) : null}
                            <label className="block text-sm font-medium text-[var(--color-foreground)]">
                                Notes
                                <textarea
                                    className="mt-1.5 min-h-20 w-full rounded-lg border border-[var(--color-input)] bg-[var(--color-surface-elevated)] p-3 text-sm font-normal text-[var(--color-foreground)]"
                                    value={notes}
                                    onChange={(event) => setNotes(event.target.value)}
                                />
                            </label>
                        </div>

                        <div className="space-y-2">
                            <Button
                                type="button"
                                fullWidth
                                onClick={() => setMarkPaidOpen(true)}
                                disabled={!canMarkPaid}
                            >
                                Mark paid · {formatCurrency(payingNowAmount)}
                            </Button>
                            {scopeDirty ? (
                                <p className="text-xs text-[var(--color-muted)]">Recalculate before marking this paid.</p>
                            ) : null}
                            <div className="grid grid-cols-2 gap-2">
                                <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={() => void save(false)}
                                    isLoading={busy === 'save'}
                                    disabled={!inputsValid || busy !== null}
                                >
                                    Save
                                </Button>
                                <Button
                                    type="button"
                                    variant="dangerQuiet"
                                    onClick={() => setDiscardOpen(true)}
                                    disabled={busy !== null}
                                >
                                    Discard
                                </Button>
                            </div>
                        </div>
                    </Card>
                </aside>
            </div>

            <MarkPaidDialog
                target={markPaidTarget}
                beforeFinalize={() => save(true)}
                onStale={(message) => setStaleMessage(message)}
                onClose={() => setMarkPaidOpen(false)}
                onPaid={(id) => {
                    setMarkPaidOpen(false);
                    navigate(`/admin/payouts/history/${id}`, { replace: true });
                }}
            />

            <Modal
                isOpen={recalculateWarningOpen}
                onClose={() => setRecalculateWarningOpen(false)}
                title="Recalculate this draft?"
                size="sm"
            >
                <p className="text-sm text-[var(--color-muted)]">
                    Recalculating resets Paying now and the invoice amounts to what the new scope produces. Your changes to them will be lost.
                </p>
                <ModalFooter>
                    <Button type="button" variant="ghost" onClick={() => setRecalculateWarningOpen(false)}>Cancel</Button>
                    <Button type="button" onClick={() => void recalculate()}>Recalculate</Button>
                </ModalFooter>
            </Modal>

            <Modal
                isOpen={discardOpen}
                onClose={busy === 'discard' ? () => {} : () => setDiscardOpen(false)}
                title={`Discard this draft for ${vendorName}?`}
                size="sm"
            >
                <p className="text-sm text-[var(--color-muted)]">
                    Nothing has been paid. Sales and deductions go back to the queue.
                </p>
                <ModalFooter>
                    <Button type="button" variant="ghost" onClick={() => setDiscardOpen(false)} disabled={busy === 'discard'}>Cancel</Button>
                    <Button type="button" variant="danger" onClick={() => void confirmDiscard()} isLoading={busy === 'discard'}>
                        Discard draft
                    </Button>
                </ModalFooter>
            </Modal>
        </div>
    );
}

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
    return (
        <Card padding="none" className="overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
                <h2 className="text-sm font-semibold">{title}</h2>
                {aside ? <span className="text-sm font-semibold">{aside}</span> : null}
            </div>
            {children}
        </Card>
    );
}
