import { AlertTriangle, FileText, ReceiptText } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    FinancialEquation,
    LedgerPageHeader,
    ReadinessStatus,
    ThresholdProgress,
    TransactionLedger,
} from '../../components/payouts/PayoutLedgerUI';
import { Input } from '../../components/ui/Input';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { useAuth } from '../../contexts/AuthContext';
import { getVendorPayoutWorkspace } from '../../hooks/usePayouts';
import { formatCurrency } from '../../lib/utils';
import type { VendorPayoutWorkspaceData } from '../../types/payouts';

type VendorTab = 'sales' | 'deductions' | 'invoices' | 'statements';

function localDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function VendorPayouts() {
    const { userRecord } = useAuth();
    const [range, setRange] = useState(() => {
        const now = new Date();
        return { start: localDate(new Date(now.getFullYear(), now.getMonth(), 1)), end: localDate(now) };
    });
    const [workspace, setWorkspace] = useState<VendorPayoutWorkspaceData | null>(null);
    const [tab, setTab] = useState<VendorTab>('sales');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

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
    }, [consignorId, range]);

    const explanation = useMemo(() => {
        if (!workspace) return '';
        const summary = workspace.summary;
        if (summary.readiness === 'draft') return `A payout draft for ${formatCurrency(summary.current_payable)} is being reviewed by the shop.`;
        if (summary.readiness === 'ready') return `Your payable balance has reached the ${formatCurrency(summary.threshold)} payout threshold.`;
        if (summary.readiness === 'accruing') return `${formatCurrency(summary.threshold_remaining)} more is needed to reach your payout threshold.`;
        return 'All eligible earnings and deductions are settled.';
    }, [workspace]);

    if (isLoading || !userRecord) return <div className="flex min-h-72 items-center justify-center"><LoadingSpinner size={30} /></div>;
    if (!workspace || error) return <div className="border border-[var(--color-danger)] bg-[var(--color-danger-bg)] p-6 text-sm text-[var(--color-danger)]">{error || 'Payout workspace unavailable.'}</div>;

    const { summary } = workspace;
    const applied = workspace.required_adjustments.filter((row) => row.will_apply);
    const pending = workspace.required_adjustments.filter((row) => !row.will_apply);

    return (
        <div className="mx-auto w-full max-w-[1400px] pb-24">
            <LedgerPageHeader title="Payouts & earnings" description="Every balance is traced to exact sale allocations, deductions, invoices, and payments." />

            <section className="grid border border-[var(--color-border)] bg-[var(--color-card)] lg:grid-cols-[1.2fr_1fr_1.4fr]">
                <div className="p-5 lg:border-r lg:border-[var(--color-border)]"><p className="text-xs text-[var(--color-muted)]">Current payable</p><p className="mt-1 font-display text-4xl">{formatCurrency(summary.current_payable)}</p><div className="mt-3"><ReadinessStatus readiness={summary.readiness} /></div></div>
                <div className="border-t border-[var(--color-border)] p-5 lg:border-r lg:border-t-0"><p className="mb-3 text-xs text-[var(--color-muted)]">Payout threshold</p><ThresholdProgress current={summary.current_payable} threshold={summary.threshold} /><p className="mt-3 text-xs text-[var(--color-muted)]">{formatCurrency(summary.current_payable)} of {formatCurrency(summary.threshold)}</p></div>
                <div className="border-t border-[var(--color-border)] p-5 lg:border-t-0"><p className="text-xs text-[var(--color-muted)]">What this means</p><p className="mt-2 text-sm leading-6">{explanation}</p></div>
            </section>

            <section className="mt-5 border border-[var(--color-border)] bg-[var(--color-card)] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">Activity report</p><p className="mt-1 text-sm">Dates change the report view only. Older unpaid money always stays in your balance.</p></div><div className="grid grid-cols-2 gap-2"><Input aria-label="Report start date" type="date" inputSize="sm" value={range.start} onChange={(event) => setRange((current) => ({ ...current, start: event.target.value }))} /><Input aria-label="Report end date" type="date" inputSize="sm" value={range.end} onChange={(event) => setRange((current) => ({ ...current, end: event.target.value }))} /></div></div>
            </section>

            <div className="mt-5"><FinancialEquation terms={[{ label: 'Opening unpaid balance', amount: summary.opening_balance }, { label: 'Sales earnings & refunds', amount: summary.range_activity, operator: '+' }, { label: 'Applied adjustments', amount: summary.applied_adjustments, operator: '+' }, { label: 'Payouts received', amount: summary.payments_in_range, operator: '−' }, { label: 'Closing balance', amount: summary.closing_balance, operator: '=', emphasize: true }]} note={<>Your current balance today is <strong>{formatCurrency(summary.current_payable)}</strong>. Unpaid invoices are shown separately until applied to a payout or paid directly.</>} /></div>

            {summary.legacy_exception_count > 0 ? <div className="mt-5 flex gap-3 border border-[var(--color-warning)] bg-[var(--color-warning-bg)] p-4 text-sm text-[var(--color-warning)]"><AlertTriangle className="h-5 w-5 shrink-0" /><div><p className="font-medium">Some older records have limited detail</p><p className="mt-1 text-xs">We preserve their saved totals, but do not claim an exact sale match where the historical evidence is incomplete.</p></div></div> : null}

            <nav className="mt-7 flex gap-1 overflow-x-auto border-b border-[var(--color-border)]" aria-label="Payout details">
                {([['sales', 'Sale history'], ['deductions', `Deductions (${workspace.required_adjustments.length})`], ['invoices', `Unpaid invoices (${workspace.invoices.length})`], ['statements', `Statements (${workspace.payout_history.length})`]] as Array<[VendorTab, string]>).map(([value, label]) => <button key={value} type="button" onClick={() => setTab(value)} className={`min-h-11 whitespace-nowrap border-b-2 px-4 text-sm font-medium ${tab === value ? 'border-[var(--color-primary)] text-[var(--color-foreground)]' : 'border-transparent text-[var(--color-muted)] hover:text-[var(--color-foreground)]'}`}>{label}</button>)}
            </nav>

            <section className="mt-4">
                {tab === 'sales' ? <TransactionLedger items={workspace.sale_items} statementHref={(id) => `/vendor/payouts/${id}`} emptyMessage="No sale activity in this report." /> : null}
                {tab === 'deductions' ? <div className="grid gap-4 lg:grid-cols-2"><VendorLedgerList title="Will be applied when affordable" rows={applied} empty="No deductions are currently applicable." /><VendorLedgerList title="Pending obligations" rows={pending} empty="No pending obligations." pending /></div> : null}
                {tab === 'invoices' ? <div className="overflow-hidden border border-[var(--color-border)] bg-[var(--color-card)]">{workspace.invoices.length === 0 ? <p className="p-10 text-center text-sm text-[var(--color-muted)]">No unpaid invoices.</p> : workspace.invoices.map((invoice) => <div key={invoice.id} className="flex min-h-16 items-center gap-4 border-b border-[var(--color-border)] px-4 last:border-b-0"><ReceiptText className="h-5 w-5 text-[var(--color-muted)]" /><div><p className="font-mono text-sm">Invoice #{invoice.invoice_number}</p><p className="text-xs text-[var(--color-muted)]">{new Date(invoice.created_at).toLocaleDateString()} · {invoice.status.replace('_', ' ')}</p></div><div className="ml-auto text-right"><p className="font-display text-xl">{formatCurrency(invoice.balance_due)}</p><p className="text-xs text-[var(--color-muted)]">not yet deducted</p></div></div>)}</div> : null}
                {tab === 'statements' ? <div className="overflow-hidden border border-[var(--color-border)] bg-[var(--color-card)]">{workspace.payout_history.length === 0 ? <p className="p-10 text-center text-sm text-[var(--color-muted)]">No payout statements yet.</p> : workspace.payout_history.map((payout) => <Link key={payout.id} to={`/vendor/payouts/${payout.id}`} className="flex min-h-16 items-center gap-4 border-b border-[var(--color-border)] px-4 last:border-b-0 hover:bg-[var(--color-surface-hover)]"><FileText className="h-5 w-5 text-[var(--color-muted)]" /><div><p className="font-mono text-sm">Payout #{payout.id.slice(0, 8).toUpperCase()}</p><p className="text-xs text-[var(--color-muted)]">{payout.paid_at ? new Date(payout.paid_at).toLocaleDateString() : payout.status} · {payout.historical_confidence === 'legacy_unverified' ? 'legacy record' : 'exact statement'}</p></div><p className="ml-auto font-display text-xl">{formatCurrency(payout.amount)}</p></Link>)}</div> : null}
            </section>
        </div>
    );
}

function VendorLedgerList({ title, rows, empty, pending = false }: { title: string; rows: VendorPayoutWorkspaceData['required_adjustments']; empty: string; pending?: boolean }) {
    return <div className="border border-[var(--color-border)] bg-[var(--color-card)]"><h2 className="border-b border-[var(--color-border)] px-4 py-3 font-display text-xl">{title}</h2>{rows.length === 0 ? <p className="p-6 text-sm text-[var(--color-muted)]">{empty}</p> : rows.map((row) => <div key={`${row.source_table}-${row.source_reference}`} className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-3 last:border-b-0"><div><p className="text-sm font-medium">{row.description}</p><p className={`text-xs ${pending ? 'text-[var(--color-warning)]' : 'text-[var(--color-muted)]'}`}>{pending ? row.pending_reason || 'Pending' : row.adjustment_type.replace(/_/g, ' ')}</p></div><p className="ml-auto font-medium">{formatCurrency(row.signed_amount)}</p></div>)}</div>;
}
