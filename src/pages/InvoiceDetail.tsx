import { ArrowLeft, Banknote, ExternalLink, Printer, ReceiptText } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LedgerPageHeader } from '../components/payouts/PayoutLedgerUI';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { useToast } from '../contexts/ToastContext';
import { getInvoiceWorkspace, recordInvoicePayment } from '../hooks/usePayouts';
import { formatCurrency } from '../lib/utils';
import type { InvoiceWorkspaceData } from '../types/payouts';

const today = () => new Date().toISOString().slice(0, 10);

export function InvoiceDetail() {
    const { invoiceId = '' } = useParams();
    const toast = useToast();
    const [data, setData] = useState<InvoiceWorkspaceData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [amount, setAmount] = useState('');
    const [paidDate, setPaidDate] = useState(today);
    const [reference, setReference] = useState('');
    const [notes, setNotes] = useState('');
    const [isRecording, setIsRecording] = useState(false);

    const load = useCallback(async () => {
        setIsLoading(true);
        try {
            const workspace = await getInvoiceWorkspace(invoiceId);
            setData(workspace);
            setAmount(Math.max(0, Number(workspace.invoice.total) - Number(workspace.invoice.amount_paid)).toFixed(2));
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'Unable to load invoice');
        } finally { setIsLoading(false); }
    }, [invoiceId]);
    useEffect(() => { void load(); }, [load]);

    const submit = async () => {
        if (!data) return;
        const value = Number(amount);
        const balance = Number(data.invoice.total) - Number(data.invoice.amount_paid);
        if (!Number.isFinite(value) || value <= 0 || value > balance + 0.009) {
            toast.warning('Check payment amount', `Enter an amount from $0.01 to ${formatCurrency(balance)}.`);
            return;
        }
        setIsRecording(true);
        try {
            await recordInvoicePayment({ invoiceId, amount: value, paidDate, reference, notes });
            toast.success('Payment recorded', 'The append-only invoice payment timeline was updated.');
            setReference(''); setNotes('');
            await load();
        } catch (reason) { toast.error('Payment was not recorded', reason instanceof Error ? reason.message : 'Please try again.'); }
        finally { setIsRecording(false); }
    };

    if (isLoading) return <div className="flex min-h-72 items-center justify-center"><LoadingSpinner size={30} /></div>;
    if (!data || error) return <div className="border border-[var(--color-danger)] bg-[var(--color-danger-bg)] p-6 text-sm text-[var(--color-danger)]">{error || 'Invoice not found.'}</div>;

    const invoice = data.invoice;
    const balance = Math.max(0, Number(invoice.total) - Number(invoice.amount_paid));
    return (
        <div className="mx-auto w-full max-w-[1350px] pb-24">
            <LedgerPageHeader
                breadcrumb={<Link className="inline-flex items-center gap-1 hover:text-[var(--color-foreground)]" to="/admin/finances/invoices"><ArrowLeft className="h-3.5 w-3.5" /> Invoices</Link>}
                title={`Invoice #${invoiceId.slice(0, 8).toUpperCase()}`}
                description={`${invoice.recipient_name} · ${invoice.recipient_type} · created ${new Date(invoice.created_at).toLocaleDateString()}`}
                actions={<Button variant="secondary" leftIcon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>Print</Button>}
            />

            <section className="grid border border-[var(--color-border)] bg-[var(--color-card)] sm:grid-cols-2 lg:grid-cols-4">
                <Metric label="Invoice total" value={formatCurrency(Number(invoice.total))} />
                <Metric label="Paid to date" value={formatCurrency(Number(invoice.amount_paid))} />
                <Metric label="Balance due" value={formatCurrency(balance)} emphasize />
                <Metric label="Status" value={invoice.status.replace('_', ' ')} />
            </section>

            {data.vendor ? <Link to={`/admin/payouts/vendor/${data.vendor.id}`} className="mt-5 flex min-h-14 items-center border border-[var(--color-border)] bg-[var(--color-card)] px-4 text-sm hover:bg-[var(--color-surface-hover)]"><span><strong>{data.vendor.business_name || data.vendor.name}</strong><span className="ml-2 text-[var(--color-muted)]">{data.vendor.consignor_number}</span></span><span className="ml-auto text-[var(--color-muted)]">Current payable {formatCurrency(data.vendor.current_payable)}</span><ExternalLink className="ml-3 h-4 w-4" /></Link> : null}

            <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
                <main className="space-y-6">
                    <section className="border border-[var(--color-border)] bg-[var(--color-card)]"><div className="flex items-center border-b border-[var(--color-border)] px-4 py-3"><ReceiptText className="mr-2 h-4 w-4 text-[var(--color-muted)]" /><h2 className="font-display text-xl">Invoice items</h2></div><div className="overflow-x-auto"><table className="w-full min-w-[650px] text-sm"><thead className="bg-[var(--color-surface)] text-xs text-[var(--color-muted)]"><tr><th className="px-4 py-2 text-left">Item</th><th className="px-4 py-2 text-right">Price</th><th className="px-4 py-2 text-right">Qty</th><th className="px-4 py-2 text-right">Line total</th></tr></thead><tbody>{data.items.map((item) => <tr key={item.id} className="border-t border-[var(--color-border)]"><td className="px-4 py-3"><p className="font-medium">{item.name}</p><p className="font-mono text-xs text-[var(--color-muted)]">{item.sku || 'No SKU'}</p></td><td className="px-4 py-3 text-right">{formatCurrency(item.price)}</td><td className="px-4 py-3 text-right">{item.quantity}</td><td className="px-4 py-3 text-right font-medium">{formatCurrency(item.line_total)}</td></tr>)}</tbody></table></div></section>

                    <section className="border border-[var(--color-border)] bg-[var(--color-card)]"><div className="flex items-center border-b border-[var(--color-border)] px-4 py-3"><Banknote className="mr-2 h-4 w-4 text-[var(--color-muted)]" /><h2 className="font-display text-xl">Payment timeline</h2><span className="ml-auto text-xs text-[var(--color-muted)]">Append-only</span></div>{data.payments.length === 0 ? <div className="p-10 text-center"><p className="text-sm font-medium">No payments recorded</p><p className="mt-1 text-xs text-[var(--color-muted)]">The first payment will appear here with its actual date and evidence.</p></div> : <ol>{data.payments.map((payment) => <li key={payment.id} className="relative flex gap-4 border-b border-[var(--color-border)] px-4 py-4 last:border-b-0"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--color-success)]" /><div><p className="text-sm font-medium capitalize">{payment.payment_type.replace(/_/g, ' ')} payment</p><p className="mt-0.5 text-xs text-[var(--color-muted)]">{new Date(`${payment.paid_date}T12:00:00`).toLocaleDateString()}{payment.reference ? ` · Ref ${payment.reference}` : ''}</p>{payment.notes ? <p className="mt-1 text-xs text-[var(--color-muted)]">{payment.notes}</p> : null}{payment.payout_id ? <Link className="mt-1 inline-block text-xs text-[var(--color-primary)] hover:underline" to={`/admin/payouts/history/${payment.payout_id}`}>Payout #{payment.payout_id.slice(0, 8).toUpperCase()}</Link> : null}</div><p className="ml-auto font-display text-xl">{formatCurrency(payment.amount)}</p></li>)}</ol>}</section>
                </main>

                <aside className="h-fit border border-[var(--color-border)] bg-[var(--color-card)] xl:sticky xl:top-4"><div className="border-b border-[var(--color-border)] p-5"><p className="text-xs uppercase tracking-wide text-[var(--color-muted)]">Record direct payment</p><p className="mt-1 font-display text-3xl">{formatCurrency(balance)}</p><p className="text-xs text-[var(--color-muted)]">remaining balance</p></div>{balance > 0 ? <div className="space-y-4 p-5"><Input label="Amount" type="number" min="0.01" max={balance} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /><Input label="Payment date" type="date" value={paidDate} onChange={(event) => setPaidDate(event.target.value)} /><Input label="Reference" value={reference} onChange={(event) => setReference(event.target.value)} /><label className="block text-sm font-medium">Notes<textarea className="mt-1.5 min-h-20 w-full rounded-lg border border-[var(--color-input)] bg-[var(--color-surface-elevated)] p-3 text-sm text-[var(--color-foreground)]" value={notes} onChange={(event) => setNotes(event.target.value)} /></label><Button fullWidth variant="success" isLoading={isRecording} onClick={submit}>Record payment</Button><p className="text-xs text-[var(--color-muted)]">Payments cannot be overwritten. Corrections require a separate reversal record.</p></div> : <div className="p-5 text-sm text-[var(--color-success)]">This invoice is fully paid.</div>}</aside>
            </div>
        </div>
    );
}

function Metric({ label, value, emphasize = false }: { label: string; value: string; emphasize?: boolean }) { return <div className="border-b border-[var(--color-border)] p-5 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"><p className="text-xs text-[var(--color-muted)]">{label}</p><p className={`${emphasize ? 'text-[var(--color-success)]' : ''} mt-1 font-display text-2xl capitalize`}>{value}</p></div>; }
