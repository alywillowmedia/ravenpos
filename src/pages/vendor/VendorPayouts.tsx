import { FileText, ReceiptText } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Header } from '../../components/layout/Header';
import { PayoutEquation, ReadinessBadge, TransactionLedger } from '../../components/payouts/PayoutLedgerUI';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { Money } from '../../components/ui/Money';
import { Tabs } from '../../components/ui/Tabs';
import { useAuth } from '../../contexts/AuthContext';
import { getVendorPayoutWorkspace } from '../../hooks/usePayouts';
import { normalizeEquationTerm } from '../../lib/payoutLedger';
import { formatPayoutDate, localDateString } from '../../lib/payoutRun';
import { formatCurrency } from '../../lib/utils';
import type { EquationLine } from '../../components/payouts/PayoutLedgerUI';
import type { PayoutWorkspaceSummary, VendorPayoutWorkspaceData } from '../../types/payouts';

type VendorTab = 'sales' | 'deductions' | 'invoices' | 'statements';

/** A negative amount reads as the opposite operation, so a deduction never shows as "+ −$5". */
function reportLine(label: string, amount: number, sign?: '+' | '−' | '=', strong = false): EquationLine {
    const term = normalizeEquationTerm({ label, amount, operator: sign });
    return { label, amount: term.amount, sign: term.operator, strong };
}

function explain(summary: PayoutWorkspaceSummary): string {
    if (summary.readiness === 'draft') return 'The shop is preparing a payout for you.';
    if (summary.readiness === 'ready') return `Your balance has reached the ${formatCurrency(summary.threshold)} minimum payout.`;
    if (summary.readiness === 'accruing') return `${formatCurrency(summary.threshold_remaining)} more is needed to reach the ${formatCurrency(summary.threshold)} minimum payout.`;
    return 'Everything you have earned has been paid out.';
}

export function VendorPayouts() {
    const { userRecord } = useAuth();
    const [range, setRange] = useState(() => {
        const now = new Date();
        return { start: localDateString(new Date(now.getFullYear(), now.getMonth(), 1)), end: localDateString(now) };
    });
    const [workspace, setWorkspace] = useState<VendorPayoutWorkspaceData | null>(null);
    const [tab, setTab] = useState<VendorTab>('sales');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [attempt, setAttempt] = useState(0);

    const consignorId = userRecord?.consignor_id || '';
    useEffect(() => {
        if (!consignorId) return;
        let cancelled = false;
        setIsLoading(true);
        setError(null);
        getVendorPayoutWorkspace(consignorId, range)
            .then((data) => { if (!cancelled) setWorkspace(data); })
            .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Unable to load payouts'); })
            .finally(() => { if (!cancelled) setIsLoading(false); });
        return () => { cancelled = true; };
    }, [consignorId, range, attempt]);

    const applied = useMemo(() => workspace?.required_adjustments.filter((row) => row.will_apply) ?? [], [workspace]);
    const pending = useMemo(() => workspace?.required_adjustments.filter((row) => !row.will_apply) ?? [], [workspace]);

    if (!userRecord || (isLoading && !workspace)) {
        return <div className="flex min-h-72 items-center justify-center"><LoadingSpinner size={30} /></div>;
    }

    if (!workspace) {
        return (
            <div className="mx-auto w-full max-w-[1100px]">
                <Header title="My payouts" />
                <Card className="flex flex-col items-center gap-3 py-10 text-center">
                    <p role="alert" className="font-medium text-[var(--color-foreground)]">Your payouts could not be loaded.</p>
                    <p className="text-sm text-[var(--color-muted)]">{error || 'Payout information is unavailable.'}</p>
                    <Button type="button" variant="secondary" onClick={() => setAttempt((count) => count + 1)}>Retry</Button>
                </Card>
            </div>
        );
    }

    const { summary } = workspace;
    const tabs = [
        { id: 'sales', label: 'Sale history' },
        { id: 'deductions', label: `Deductions (${workspace.required_adjustments.length})` },
        { id: 'invoices', label: `Unpaid invoices (${workspace.invoices.length})` },
        { id: 'statements', label: `Statements (${workspace.payout_history.length})` },
    ];

    return (
        <div className="mx-auto w-full max-w-[1100px] space-y-6 pb-24">
            <Header title="My payouts" description="What you have earned, what has been deducted, and what you have been paid." />

            {error ? <p role="alert" className="text-sm text-[var(--color-danger)]">Could not refresh this report: {error}</p> : null}

            <Card className="space-y-2">
                <div className="flex flex-wrap items-center gap-3">
                    <ReadinessBadge status={summary.readiness} audience="vendor" />
                    {summary.readiness === 'draft' ? null : <Money amount={summary.current_payable} className="text-3xl font-semibold" />}
                </div>
                <p className="text-sm text-[var(--color-muted)]">{explain(summary)}</p>
            </Card>

            <Card className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div className="min-w-0">
                        <h2 className="text-sm font-semibold">Activity report</h2>
                        <p className="mt-1 text-sm text-[var(--color-muted)]">Dates change this report only. Older unpaid money always stays in your balance.</p>
                    </div>
                    <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-[repeat(2,minmax(9.5rem,1fr))] sm:flex">
                        <Input aria-label="Report start date" type="date" inputSize="sm" className="sm:w-40" value={range.start} onChange={(event) => setRange((current) => ({ ...current, start: event.target.value }))} />
                        <Input aria-label="Report end date" type="date" inputSize="sm" className="sm:w-40" value={range.end} onChange={(event) => setRange((current) => ({ ...current, end: event.target.value }))} />
                    </div>
                </div>
                <PayoutEquation
                    lines={[
                        reportLine('Opening balance', summary.opening_balance),
                        reportLine('Sales earnings and refunds', summary.range_activity, '+'),
                        reportLine('Applied adjustments', summary.applied_adjustments, '+'),
                        reportLine('Payouts received', summary.payments_in_range, '−'),
                        reportLine('Closing balance', summary.closing_balance, '=', true),
                    ]}
                />
                <p className="text-xs text-[var(--color-muted)]">
                    Your balance today is {formatCurrency(summary.current_payable)}. Unpaid invoices are shown separately until they are deducted from a payout or paid directly.
                </p>
            </Card>

            {summary.legacy_exception_count > 0 ? (
                <p className="text-xs text-[var(--color-muted)]">
                    Some older records have limited detail. We keep their saved totals, but cannot match them to exact sales.
                </p>
            ) : null}

            <div className="space-y-4">
                <Tabs tabs={tabs} activeTab={tab} onChange={(id) => setTab(id as VendorTab)} ariaLabel="Payout details" />

                {tab === 'sales' ? (
                    <TransactionLedger items={workspace.sale_items} statementHref={(id) => `/vendor/payouts/${id}`} emptyMessage="No sale activity in this report." />
                ) : null}

                {tab === 'deductions' ? (
                    <div className="grid gap-4 lg:grid-cols-2">
                        <DeductionList title="Will be deducted" rows={applied} empty="No deductions apply right now." />
                        <DeductionList title="Waiting until there is enough to cover them" rows={pending} empty="Nothing is waiting." pending />
                    </div>
                ) : null}

                {tab === 'invoices' ? (
                    <RowGroup empty="No unpaid invoices.">
                        {workspace.invoices.map((invoice) => (
                            <div key={invoice.id} className="flex min-h-16 items-center gap-4 px-4">
                                <ReceiptText className="h-5 w-5 shrink-0 text-[var(--color-muted)]" aria-hidden="true" />
                                <div className="min-w-0">
                                    <p className="font-mono text-sm">Invoice #{invoice.invoice_number}</p>
                                    <p className="text-xs text-[var(--color-muted)]">{new Date(invoice.created_at).toLocaleDateString()} · {invoice.status.replace('_', ' ')}</p>
                                </div>
                                <div className="ml-auto text-right">
                                    <Money amount={invoice.balance_due} className="text-lg font-semibold" />
                                    <p className="text-xs text-[var(--color-muted)]">not yet deducted</p>
                                </div>
                            </div>
                        ))}
                    </RowGroup>
                ) : null}

                {tab === 'statements' ? (
                    <RowGroup empty="No payout statements yet.">
                        {workspace.payout_history.map((payout) => (
                            <Link key={payout.id} to={`/vendor/payouts/${payout.id}`} className="flex min-h-16 items-center gap-4 px-4 hover:bg-[var(--color-surface-hover)]">
                                <FileText className="h-5 w-5 shrink-0 text-[var(--color-muted)]" aria-hidden="true" />
                                <div className="min-w-0">
                                    <p className="font-mono text-sm">Payout #{payout.id.slice(0, 8).toUpperCase()}</p>
                                    <p className="text-xs text-[var(--color-muted)]">{formatPayoutDate(payout)}</p>
                                </div>
                                {payout.status === 'voided' ? <Badge variant="danger" size="sm">Voided</Badge> : null}
                                {payout.historical_confidence === 'legacy_unverified' ? <Badge variant="secondary" size="sm">Older record</Badge> : null}
                                <Money amount={payout.amount} className="ml-auto text-lg font-semibold" />
                            </Link>
                        ))}
                    </RowGroup>
                ) : null}
            </div>
        </div>
    );
}

function RowGroup({ children, empty }: { children: ReactNode[]; empty: string }) {
    if (children.length === 0) {
        return <div className="rounded-xl bg-[var(--color-surface)] py-10 text-center text-sm text-[var(--color-muted)]">{empty}</div>;
    }
    return (
        <div className="divide-y divide-[var(--color-border)] overflow-hidden rounded-2xl bg-[var(--color-card)] shadow-[var(--shadow-surface)]">
            {children}
        </div>
    );
}

function DeductionList({ title, rows, empty, pending = false }: {
    title: string;
    rows: VendorPayoutWorkspaceData['required_adjustments'];
    empty: string;
    pending?: boolean;
}) {
    return (
        <Card padding="none" className="overflow-hidden">
            <h2 className="px-4 py-3 text-sm font-semibold">{title}</h2>
            {rows.length === 0 ? (
                <p className="px-4 pb-4 text-sm text-[var(--color-muted)]">{empty}</p>
            ) : (
                <ul className="divide-y divide-[var(--color-border)] border-t border-[var(--color-border)]">
                    {rows.map((row) => (
                        <li key={`${row.source_table}-${row.source_reference}`} className="flex items-center gap-3 px-4 py-3">
                            <div className="min-w-0">
                                <p className="text-sm font-medium">{row.description}</p>
                                <p className="text-xs text-[var(--color-muted)]">{pending ? row.pending_reason || 'Pending' : row.adjustment_type.replace(/_/g, ' ')}</p>
                            </div>
                            <Money amount={row.signed_amount} className="ml-auto font-medium" />
                        </li>
                    ))}
                </ul>
            )}
        </Card>
    );
}
