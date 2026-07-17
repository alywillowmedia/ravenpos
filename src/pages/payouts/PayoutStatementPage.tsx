import { AlertTriangle, ArrowLeft, Download, Printer, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { LedgerPageHeader } from '../../components/payouts/PayoutLedgerUI';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { Modal, ModalFooter } from '../../components/ui/Modal';
import { useToast } from '../../contexts/ToastContext';
import { getPayoutStatement, voidPayout } from '../../hooks/usePayouts';
import { printPayoutStatementReport } from '../../lib/completedPayoutReport';
import { formatCurrency } from '../../lib/utils';
import type { PayoutStatementData } from '../../types/payouts';

function csvCell(value: unknown): string {
    return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

export function PayoutStatementPage() {
    const { payoutId = '' } = useParams();
    const location = useLocation();
    const toast = useToast();
    const isVendor = location.pathname.startsWith('/vendor/');
    const [statement, setStatement] = useState<PayoutStatementData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showVoid, setShowVoid] = useState(false);
    const [voidReason, setVoidReason] = useState('');
    const [isVoiding, setIsVoiding] = useState(false);

    const load = useCallback(async () => {
        setIsLoading(true);
        try { setStatement(await getPayoutStatement(payoutId)); }
        catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load payout statement'); }
        finally { setIsLoading(false); }
    }, [payoutId]);

    useEffect(() => { void load(); }, [load]);

    const download = () => {
        if (!statement) return;
        const rows: unknown[][] = [
            ['Payout statement', payoutId],
            ['Vendor', statement.vendor.business_name || statement.vendor.name],
            ['Status', statement.payout.status],
            ['Amount paid', statement.payout.amount],
            ['Payment date', statement.payout.payment_date || statement.payout.paid_at || ''],
            [],
            ['Sale ID', 'Sale date', 'SKU', 'Item', 'Gross', 'Item discount', 'Order discount', 'Net sale', 'Commission %', 'Before fees', 'Card fee', 'Vendor cut', 'Settled', 'Remaining after'],
            ...statement.allocations.map((row) => [row.sale_id, row.sale_timestamp, row.sku, row.item_name, row.gross_line_amount, row.item_discount, row.allocated_order_discount, row.net_line_amount, row.commission_percentage, row.vendor_earnings_before_fees, row.allocated_card_fee, row.final_vendor_cut, row.amount_settled, row.remaining_amount_after]),
            [],
            ['Adjustment type', 'Description', 'Amount', 'Source'],
            ...statement.adjustments.map((row) => [row.adjustment_type, row.description, row.amount, `${row.source_table || ''}:${row.source_reference || ''}`]),
            [],
            ['Invoice', 'Payment type', 'Amount', 'Paid date', 'Reference'],
            ...statement.invoice_payments.map((row) => [row.invoice_number, row.payment_type, row.amount, row.paid_date, row.reference || '']),
        ];
        const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n');
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `payout-${payoutId.slice(0, 8)}-immutable-statement.csv`;
        anchor.click();
        URL.revokeObjectURL(url);
    };

    const print = () => {
        if (!statement) return;
        if (!printPayoutStatementReport(statement)) {
            toast.error('Unable to open payout report', 'Allow pop-ups for RavenPOS, then try printing again.');
        }
    };

    const confirmVoid = async () => {
        if (!voidReason.trim()) return;
        setIsVoiding(true);
        try {
            await voidPayout(payoutId, voidReason);
            setShowVoid(false);
            toast.success('Payout voided', 'Reversal records were created; original evidence remains preserved.');
            await load();
        } catch (reason) {
            toast.error('Unable to void payout', reason instanceof Error ? reason.message : 'Please try again.');
        } finally { setIsVoiding(false); }
    };

    if (isLoading) return <div className="flex min-h-72 items-center justify-center"><LoadingSpinner size={30} /></div>;
    if (!statement || error) return <div className="border border-[var(--color-danger)] bg-[var(--color-danger-bg)] p-6 text-sm text-[var(--color-danger)]">{error || 'Statement not found.'}</div>;

    const payout = statement.payout;
    const allocationTotal = statement.allocations.reduce((sum, row) => sum + Number(row.amount_settled), 0);
    const adjustmentTotal = statement.adjustments.reduce((sum, row) => sum + Number(row.amount), 0);
    const backHref = isVendor ? '/vendor/payouts' : `/admin/payouts/vendor/${statement.vendor.id}`;

    return (
        <div className="mx-auto w-full max-w-[1400px] pb-24 print:max-w-none">
            <div className="print:hidden">
                <LedgerPageHeader
                    breadcrumb={<Link className="inline-flex items-center gap-1 hover:text-[var(--color-foreground)]" to={backHref}><ArrowLeft className="h-3.5 w-3.5" /> {isVendor ? 'Payouts' : 'Vendor workspace'}</Link>}
                    title={`Payout statement #${payoutId.slice(0, 8).toUpperCase()}`}
                    description={`${statement.vendor.business_name || statement.vendor.name} · ${payout.status} · ${payout.historical_confidence.replace(/_/g, ' ')}`}
                    locked
                    actions={<><Button variant="secondary" leftIcon={<Printer className="h-4 w-4" />} onClick={print}>Print</Button><Button variant="secondary" leftIcon={<Download className="h-4 w-4" />} onClick={download}>Export</Button>{!isVendor && payout.status === 'paid' ? <Button variant="danger" leftIcon={<RotateCcw className="h-4 w-4" />} onClick={() => setShowVoid(true)}>Void</Button> : null}</>}
                />
            </div>

            <header className="hidden border-b-2 border-black pb-5 print:block"><h1 className="text-3xl font-semibold">Payout statement</h1><p>#{payoutId.toUpperCase()} · {statement.vendor.business_name || statement.vendor.name}</p></header>

            {!statement.is_exact ? (
                <div className="mb-5 flex gap-3 border border-[var(--color-warning)] bg-[var(--color-warning-bg)] p-4 text-sm text-[var(--color-warning)]">
                    <AlertTriangle className="h-5 w-5 shrink-0" /><div><p className="font-medium">Legacy record—exact sale allocation unavailable</p><p className="mt-1 text-xs">Saved totals are preserved, but reconstructed date-window lines are not presented as proof. {payout.reconciliation_explanation || ''}</p></div>
                </div>
            ) : null}
            {payout.status === 'voided' ? <div className="mb-5 border border-[var(--color-danger)] bg-[var(--color-danger-bg)] p-4 text-sm text-[var(--color-danger)]"><strong>Voided.</strong> The original statement remains visible with a separate reversal record.</div> : null}

            <section className="grid border border-[var(--color-border)] bg-[var(--color-card)] sm:grid-cols-2 lg:grid-cols-4">
                <StatementMetric label="Amount paid" value={formatCurrency(Number(payout.amount))} />
                <StatementMetric label="Payment date" value={payout.payment_date ? new Date(`${payout.payment_date}T12:00:00`).toLocaleDateString() : payout.paid_at ? new Date(payout.paid_at).toLocaleDateString() : '—'} />
                <StatementMetric label="Method" value={payout.payment_method || 'Legacy / unspecified'} />
                <StatementMetric label="Reference" value={payout.payment_reference || '—'} />
            </section>

            <section className="mt-6"><div className="mb-3 flex items-end justify-between"><div><p className="text-xs uppercase tracking-wide text-[var(--color-muted)]">Immutable evidence</p><h2 className="font-display text-2xl">Sale allocations</h2></div><p className="font-display text-2xl">{formatCurrency(allocationTotal)}</p></div>
                <div className="overflow-x-auto border border-[var(--color-border)] bg-[var(--color-card)]"><table className="w-full min-w-[1180px] text-xs"><thead className="bg-[var(--color-surface)] text-[var(--color-muted)]"><tr><th className="px-3 py-2 text-left">Sale / item</th><th className="px-3 py-2 text-right">Gross</th><th className="px-3 py-2 text-right">Discounts</th><th className="px-3 py-2 text-right">Net</th><th className="px-3 py-2 text-right">Vendor %</th><th className="px-3 py-2 text-right">Before fees</th><th className="px-3 py-2 text-right">Card fee</th><th className="px-3 py-2 text-right">Vendor cut</th><th className="px-3 py-2 text-right">Settled</th><th className="px-3 py-2 text-right">Remaining</th></tr></thead><tbody>{statement.allocations.map((row) => <tr key={row.id} className="border-t border-[var(--color-border)]"><td className="px-3 py-3"><p className="text-sm font-medium">{row.item_name}</p><p className="font-mono text-[11px] text-[var(--color-muted)]">{new Date(row.sale_timestamp).toLocaleDateString()} · {row.sku || 'No SKU'} · #{row.sale_id.slice(0, 8).toUpperCase()}</p></td><td className="px-3 py-3 text-right">{formatCurrency(row.gross_line_amount)}</td><td className="px-3 py-3 text-right">−{formatCurrency(Number(row.item_discount) + Number(row.allocated_order_discount))}</td><td className="px-3 py-3 text-right">{formatCurrency(row.net_line_amount)}</td><td className="px-3 py-3 text-right">{Number(row.commission_percentage).toFixed(0)}%</td><td className="px-3 py-3 text-right">{formatCurrency(row.vendor_earnings_before_fees)}</td><td className="px-3 py-3 text-right">−{formatCurrency(row.allocated_card_fee)}</td><td className="px-3 py-3 text-right">{formatCurrency(row.final_vendor_cut)}</td><td className="px-3 py-3 text-right font-medium">{formatCurrency(row.amount_settled)}</td><td className="px-3 py-3 text-right">{formatCurrency(row.remaining_amount_after)}</td></tr>)}</tbody></table>{statement.allocations.length === 0 ? <p className="p-8 text-center text-sm text-[var(--color-muted)]">No exact sale allocations are available for this record.</p> : null}</div>
            </section>

            <div className="mt-6 grid gap-5 lg:grid-cols-2">
                <StatementList title="Adjustments" total={adjustmentTotal} empty="No adjustments on this payout." rows={statement.adjustments.map((row) => ({ id: row.id, label: row.description, meta: row.adjustment_type.replace(/_/g, ' '), amount: Number(row.amount), href: row.source_table === 'invoices' && row.source_reference ? `/admin/finances/invoices/${row.source_reference}` : undefined }))} />
                <StatementList title="Invoice payments" total={statement.invoice_payments.reduce((sum, row) => sum + Number(row.amount), 0)} empty="No invoice payments on this payout." rows={statement.invoice_payments.map((row) => ({ id: row.id, label: `Invoice #${row.invoice_number}`, meta: `${row.payment_type.replace(/_/g, ' ')} · ${new Date(`${row.paid_date}T12:00:00`).toLocaleDateString()}`, amount: Number(row.amount), href: isVendor ? undefined : `/admin/finances/invoices/${row.invoice_id}` }))} />
            </div>

            <section className="mt-6 border border-[var(--color-border)] bg-[var(--color-card)] p-5 text-sm"><h2 className="font-display text-xl">Audit details</h2><dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div><dt className="text-xs text-[var(--color-muted)]">Confidence</dt><dd className="mt-1 capitalize">{payout.historical_confidence.replace(/_/g, ' ')}</dd></div><div><dt className="text-xs text-[var(--color-muted)]">Range mode</dt><dd className="mt-1 capitalize">{payout.range_mode.replace(/_/g, ' ')}</dd></div><div><dt className="text-xs text-[var(--color-muted)]">Prior balance</dt><dd className="mt-1">{payout.include_prior_balance ? 'Included' : 'Excluded'}</dd></div><div><dt className="text-xs text-[var(--color-muted)]">Threshold snapshot</dt><dd className="mt-1">{payout.threshold_snapshot == null ? '—' : formatCurrency(Number(payout.threshold_snapshot))}</dd></div></dl>{payout.notes ? <p className="mt-4 border-t border-[var(--color-border)] pt-4 text-[var(--color-muted)]">{payout.notes}</p> : null}</section>

            <Modal isOpen={showVoid} onClose={() => setShowVoid(false)} title="Void this payout?" description="This creates reversal records. The original statement cannot be edited or deleted." size="sm">
                <Input label="Reason" value={voidReason} onChange={(event) => setVoidReason(event.target.value)} required autoFocus />
                <ModalFooter><Button variant="secondary" onClick={() => setShowVoid(false)}>Cancel</Button><Button variant="danger" isLoading={isVoiding} disabled={!voidReason.trim()} onClick={confirmVoid}>Void payout</Button></ModalFooter>
            </Modal>
        </div>
    );
}

function StatementMetric({ label, value }: { label: string; value: string }) { return <div className="border-b border-[var(--color-border)] p-5 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"><p className="text-xs text-[var(--color-muted)]">{label}</p><p className="mt-1 font-display text-2xl capitalize">{value}</p></div>; }

function StatementList({ title, total, rows, empty }: { title: string; total: number; rows: Array<{ id: string; label: string; meta: string; amount: number; href?: string }>; empty: string }) {
    return <section className="border border-[var(--color-border)] bg-[var(--color-card)]"><div className="flex items-center border-b border-[var(--color-border)] px-4 py-3"><h2 className="font-display text-xl">{title}</h2><p className="ml-auto font-display text-xl">{formatCurrency(total)}</p></div>{rows.length ? rows.map((row) => <div key={row.id} className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-3 last:border-b-0"><div>{row.href ? <Link className="text-sm font-medium text-[var(--color-primary)] hover:underline" to={row.href}>{row.label}</Link> : <p className="text-sm font-medium">{row.label}</p>}<p className="text-xs capitalize text-[var(--color-muted)]">{row.meta}</p></div><p className="ml-auto font-medium">{formatCurrency(row.amount)}</p></div>) : <p className="p-6 text-sm text-[var(--color-muted)]">{empty}</p>}</section>;
}
