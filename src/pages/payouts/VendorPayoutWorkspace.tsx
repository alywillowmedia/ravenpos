import { AlertTriangle, ArrowLeft, FileText, ReceiptText, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
    FinancialEquation,
    LedgerPageHeader,
    ReadinessStatus,
    ThresholdProgress,
    TransactionLedger,
} from '../../components/payouts/PayoutLedgerUI';
import { Button } from '../../components/ui/Button';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { useToast } from '../../contexts/ToastContext';
import { getVendorPayoutWorkspace, savePayoutDraft } from '../../hooks/usePayouts';
import { hasUnpaidBalance } from '../../lib/payoutLedger';
import { formatCurrency } from '../../lib/utils';
import type { VendorPayoutWorkspaceData } from '../../types/payouts';

type WorkspaceTab = 'activity' | 'deductions' | 'invoices' | 'history';

export function VendorPayoutWorkspace() {
    const { consignorId = '' } = useParams();
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const toast = useToast();
    const [workspace, setWorkspace] = useState<VendorPayoutWorkspaceData | null>(null);
    const [tab, setTab] = useState<WorkspaceTab>('activity');
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const range = useMemo(() => ({
        start: params.get('start'),
        end: params.get('end'),
    }), [params]);
    const selectedRange = params.get('mode') === 'selected_range';

    useEffect(() => {
        let cancelled = false;
        setIsLoading(true);
        getVendorPayoutWorkspace(consignorId, range)
            .then((data) => { if (!cancelled) setWorkspace(data); })
            .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Failed to load payout workspace'); })
            .finally(() => { if (!cancelled) setIsLoading(false); });
        return () => { cancelled = true; };
    }, [consignorId, range]);

    const createDraft = async () => {
        if (!workspace) return;
        setIsSaving(true);
        try {
            const payoutId = await savePayoutDraft({
                consignorId,
                rangeMode: selectedRange ? 'selected_range' : 'all_outstanding',
                sourceRangeStart: selectedRange ? range.start : null,
                sourceRangeEnd: selectedRange ? range.end : null,
                includePriorBalance: true,
                invoiceApplications: null,
            });
            navigate(`/admin/payouts/drafts/${payoutId}`);
        } catch (reason) {
            toast.error('Unable to prepare payout', reason instanceof Error ? reason.message : 'Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) return <div className="flex min-h-72 items-center justify-center"><LoadingSpinner size={30} /></div>;
    if (!workspace || error) return (
        <div className="border border-[var(--color-danger)] bg-[var(--color-danger-bg)] p-6 text-sm text-[var(--color-danger)]">
            {error || 'Vendor payout workspace was not found.'}
        </div>
    );

    const { vendor, summary } = workspace;
    const unpaidSaleItems = workspace.sale_items.filter(hasUnpaidBalance);
    const requiredApplied = workspace.required_adjustments.filter((row) => row.will_apply);
    const pending = workspace.required_adjustments.filter((row) => !row.will_apply);

    return (
        <div className="mx-auto w-full max-w-[1500px] pb-24">
            <LedgerPageHeader
                breadcrumb={<Link className="inline-flex items-center gap-1 hover:text-[var(--color-foreground)]" to="/admin/payouts"><ArrowLeft className="h-3.5 w-3.5" /> Payout queue</Link>}
                title={vendor.business_name || vendor.name}
                description={`${vendor.consignor_number} · Pay to ${vendor.pay_to_name}${vendor.booth_location ? ` · Booth ${vendor.booth_location}` : ''}`}
                actions={(
                    <>
                        {summary.draft_id ? (
                            <Button onClick={() => navigate(`/admin/payouts/drafts/${summary.draft_id}`)}>Continue draft</Button>
                        ) : (
                            <Button onClick={createDraft} isLoading={isSaving} disabled={summary.current_payable <= 0}>Prepare payout</Button>
                        )}
                    </>
                )}
            />

            <section className="grid border border-[var(--color-border)] bg-[var(--color-card)] md:grid-cols-[1.3fr_1fr_1fr]">
                <div className="p-5 md:border-r md:border-[var(--color-border)]">
                    <p className="text-xs text-[var(--color-muted)]">Current payable</p>
                    <p className="mt-1 font-display text-4xl">{formatCurrency(summary.current_payable)}</p>
                    <div className="mt-3"><ReadinessStatus readiness={summary.readiness} /></div>
                </div>
                <div className="border-t border-[var(--color-border)] p-5 md:border-r md:border-t-0">
                    <p className="mb-3 text-xs text-[var(--color-muted)]">Payout threshold</p>
                    <ThresholdProgress current={summary.current_payable} threshold={summary.threshold} />
                    <p className="mt-3 text-xs text-[var(--color-muted)]">{summary.threshold_remaining > 0 ? `${formatCurrency(summary.threshold_remaining)} until ready` : 'Threshold reached'}</p>
                </div>
                <div className="border-t border-[var(--color-border)] p-5 md:border-t-0">
                    <p className="mb-3 text-xs text-[var(--color-muted)]">Compliance</p>
                    <p className={`inline-flex items-center gap-2 text-sm font-medium ${vendor.has_w9_filled_out ? 'text-[var(--color-success)]' : 'text-[var(--color-warning)]'}`}>
                        {vendor.has_w9_filled_out ? <ShieldCheck className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                        W-9 {vendor.has_w9_filled_out ? 'on file' : 'missing'}
                    </p>
                    <p className="mt-2 text-xs text-[var(--color-muted)]">Default vendor share {Number(vendor.commission_split).toFixed(0)}%</p>
                </div>
            </section>

            <div className="mt-5">
                <FinancialEquation
                    terms={[
                        { label: 'Opening unpaid balance', amount: summary.opening_balance },
                        { label: 'Range earnings & refunds', amount: summary.range_activity, operator: '+' },
                        { label: 'Applied adjustments', amount: summary.applied_adjustments, operator: '+' },
                        { label: 'Payments in range', amount: summary.payments_in_range, operator: '−' },
                        { label: 'Closing balance', amount: summary.closing_balance, operator: '=', emphasize: true },
                    ]}
                    note={<>Date filters are a reporting lens. Current balance today is <strong>{formatCurrency(summary.current_payable)}</strong>; older unpaid money remains included.</>}
                />
            </div>

            {summary.legacy_exception_count > 0 ? (
                <div className="mt-5 flex gap-3 border border-[var(--color-warning)] bg-[var(--color-warning-bg)] p-4 text-sm text-[var(--color-warning)]">
                    <AlertTriangle className="h-5 w-5 shrink-0" />
                    <div><p className="font-medium">Historical allocation warning</p><p className="mt-1 text-xs">{summary.legacy_exception_count} sale records cannot be proven from exact historical evidence and are labeled honestly below.</p></div>
                </div>
            ) : null}

            <nav className="mt-7 flex gap-1 overflow-x-auto border-b border-[var(--color-border)]" aria-label="Vendor payout workspace">
                {([
                    ['activity', `Unpaid items (${unpaidSaleItems.length})`],
                    ['deductions', `Deductions (${workspace.required_adjustments.length})`],
                    ['invoices', `Invoices (${workspace.invoices.length})`],
                    ['history', `Payout history (${workspace.payout_history.length})`],
                ] as Array<[WorkspaceTab, string]>).map(([value, label]) => (
                    <button key={value} type="button" onClick={() => setTab(value)} className={`min-h-11 whitespace-nowrap border-b-2 px-4 text-sm font-medium ${tab === value ? 'border-[var(--color-primary)] text-[var(--color-foreground)]' : 'border-transparent text-[var(--color-muted)] hover:text-[var(--color-foreground)]'}`}>{label}</button>
                ))}
            </nav>

            <section className="mt-4">
                {tab === 'activity' ? <TransactionLedger items={unpaidSaleItems} statementHref={(id) => `/admin/payouts/history/${id}`} emptyMessage="No unpaid sale items." /> : null}
                {tab === 'deductions' ? (
                    <div className="grid gap-4 lg:grid-cols-2">
                        <LedgerList title="Will apply when affordable" rows={requiredApplied.map((row) => ({ id: `${row.source_table}-${row.source_reference}`, label: row.description, amount: row.signed_amount, meta: row.adjustment_type.replace(/_/g, ' ') }))} empty="No required deductions are currently applicable." />
                        <LedgerList title="Pending obligations" rows={pending.map((row) => ({ id: `${row.source_table}-${row.source_reference}`, label: row.description, amount: row.signed_amount, meta: row.pending_reason || 'Pending' }))} empty="No pending obligations." warning />
                    </div>
                ) : null}
                {tab === 'invoices' ? (
                    <div className="overflow-hidden border border-[var(--color-border)] bg-[var(--color-card)]">
                        {workspace.invoices.length === 0 ? <p className="p-10 text-center text-sm text-[var(--color-muted)]">No unpaid vendor invoices.</p> : workspace.invoices.map((invoice) => (
                            <Link key={invoice.id} to={`/admin/finances/invoices/${invoice.id}`} className="flex min-h-16 items-center gap-4 border-b border-[var(--color-border)] px-4 last:border-b-0 hover:bg-[var(--color-surface-hover)]">
                                <ReceiptText className="h-5 w-5 text-[var(--color-muted)]" />
                                <div><p className="font-mono text-sm">#{invoice.invoice_number}</p><p className="text-xs text-[var(--color-muted)]">{new Date(invoice.created_at).toLocaleDateString()} · {invoice.status.replace('_', ' ')}</p></div>
                                <div className="ml-auto text-right"><p className="font-display text-xl">{formatCurrency(invoice.balance_due)}</p><p className="text-xs text-[var(--color-muted)]">of {formatCurrency(invoice.total)}</p></div>
                            </Link>
                        ))}
                    </div>
                ) : null}
                {tab === 'history' ? (
                    <div className="overflow-hidden border border-[var(--color-border)] bg-[var(--color-card)]">
                        {workspace.payout_history.length === 0 ? <p className="p-10 text-center text-sm text-[var(--color-muted)]">No completed payouts yet.</p> : workspace.payout_history.map((payout) => (
                            <Link key={payout.id} to={`/admin/payouts/history/${payout.id}`} className="flex min-h-16 items-center gap-4 border-b border-[var(--color-border)] px-4 last:border-b-0 hover:bg-[var(--color-surface-hover)]">
                                <FileText className="h-5 w-5 text-[var(--color-muted)]" />
                                <div><p className="font-mono text-sm">Payout #{payout.id.slice(0, 8).toUpperCase()}</p><p className="text-xs text-[var(--color-muted)]">{payout.paid_at ? new Date(payout.paid_at).toLocaleDateString() : payout.status} · {payout.items_sold} items</p></div>
                                {payout.historical_confidence === 'legacy_unverified' ? <span className="hidden text-xs text-[var(--color-warning)] sm:inline">Legacy record</span> : null}
                                <p className="ml-auto font-display text-xl">{formatCurrency(payout.amount)}</p>
                            </Link>
                        ))}
                    </div>
                ) : null}
            </section>
        </div>
    );
}

function LedgerList({ title, rows, empty, warning = false }: { title: string; rows: Array<{ id: string; label: string; amount: number; meta: string }>; empty: string; warning?: boolean }) {
    return (
        <div className="border border-[var(--color-border)] bg-[var(--color-card)]">
            <h2 className="border-b border-[var(--color-border)] px-4 py-3 text-sm font-semibold">{title}</h2>
            {rows.length === 0 ? <p className="p-6 text-sm text-[var(--color-muted)]">{empty}</p> : rows.map((row) => (
                <div key={row.id} className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-3 last:border-b-0">
                    <div><p className="text-sm font-medium">{row.label}</p><p className={`text-xs ${warning ? 'text-[var(--color-warning)]' : 'text-[var(--color-muted)]'}`}>{row.meta}</p></div>
                    <p className="ml-auto font-medium">{formatCurrency(row.amount)}</p>
                </div>
            ))}
        </div>
    );
}
