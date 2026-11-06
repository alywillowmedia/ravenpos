import { AlertTriangle, ArrowLeft, Download, Mail, Printer, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Header } from '../../components/layout/Header';
import { PayoutEquation } from '../../components/payouts/PayoutLedgerUI';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { Modal, ModalFooter } from '../../components/ui/Modal';
import { Money } from '../../components/ui/Money';
import { Table, type Column } from '../../components/ui/Table';
import { useToast } from '../../contexts/ToastContext';
import { getPayoutStatement, sendPayoutStatement, voidPayout } from '../../hooks/usePayouts';
import { printPayoutStatementReport } from '../../lib/completedPayoutReport';
import {
    draftPayable,
    formatStatementCutoff,
    rollsForward,
    statementEmailLine,
    statementFigures,
    statementScopeLabel,
} from '../../lib/payoutDraft';
import { formatPayoutDate, shortId } from '../../lib/payoutRun';
import { formatDate, formatDateTime } from '../../lib/utils';
import type { PayoutAllocationSnapshot, PayoutStatementData } from '../../types/payouts';

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
    const [voidInput, setVoidInput] = useState('');
    const [isVoiding, setIsVoiding] = useState(false);
    const [isEmailing, setIsEmailing] = useState(false);

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
            ['Pay to', statement.vendor.pay_to_name],
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
        if (!voidInput.trim()) return;
        setIsVoiding(true);
        try {
            await voidPayout(payoutId, voidInput);
            setShowVoid(false);
            toast.success('Payout voided', 'Reversal records were created; original evidence remains preserved.');
            await load();
        } catch (reason) {
            toast.error('Unable to void payout', reason instanceof Error ? reason.message : 'Please try again.');
        } finally { setIsVoiding(false); }
    };

    const sendEmail = async () => {
        setIsEmailing(true);
        try {
            const outcome = await sendPayoutStatement(payoutId);
            if (outcome === 'sent') toast.success('Statement emailed');
            else if (outcome === 'no_email') toast.warning('No email on file', 'Add an email to this vendor, then send again.');
            else toast.error('Statement email failed', 'The payout is unchanged. Try again.');
            await load();
        } finally { setIsEmailing(false); }
    };

    if (isLoading) return <div className="flex min-h-72 items-center justify-center"><LoadingSpinner size={30} /></div>;
    if (!statement || error) {
        return (
            <Card className="text-sm text-[var(--color-danger)]">
                <p role="alert">{error || 'Statement not found.'}</p>
            </Card>
        );
    }

    const payout = statement.payout;
    const vendorName = statement.vendor.business_name || statement.vendor.name;
    const allocationTotal = statement.allocations.reduce((sum, row) => sum + Number(row.amount_settled), 0);
    const adjustmentTotal = statement.adjustments.reduce((sum, row) => sum + Number(row.amount), 0);
    const invoiceTotal = statement.invoice_payments.reduce((sum, row) => sum + Number(row.amount), 0);
    const backHref = isVendor
        ? '/vendor/payouts'
        : statement.vendor.id ? `/admin/payouts/vendor/${statement.vendor.id}` : '/admin/payouts?tab=history';
    const figures = statementFigures(payout, statement.adjustments);
    const payable = draftPayable(figures);
    const rolls = rollsForward(payable, Number(payout.amount));
    const emailLine = isVendor ? '' : statementEmailLine(statement.latest_email);
    const actors = isVendor ? null : statement.actors;
    const actorLine = actors
        ? [
            actors.prepared_by_name ? `Prepared by ${actors.prepared_by_name}` : null,
            actors.paid_by_name ? `Paid by ${actors.paid_by_name}` : null,
        ].filter(Boolean).join(' · ')
        : '';
    const reversal = statement.reversal;
    const voidReason = reversal && typeof reversal.reason === 'string' ? reversal.reason : '';
    const voidedAt = reversal && typeof reversal.reversed_at === 'string' ? reversal.reversed_at : '';
    const voidedBy = actors?.reversed_by_name ?? null;
    const statusVariant = payout.status === 'paid' ? 'success' : payout.status === 'voided' ? 'danger' : 'info';

    const allocationColumns: Column<PayoutAllocationSnapshot>[] = [
        {
            key: 'item_name',
            header: 'Sale / item',
            minWidth: '220px',
            render: (row) => (
                <div>
                    <p className="font-medium">{row.item_name}</p>
                    <p className="text-xs text-[var(--color-muted)]">{formatDate(row.sale_timestamp)} · {row.sku || 'No SKU'} · #{shortId(row.sale_id)}</p>
                </div>
            ),
        },
        { key: 'gross_line_amount', header: 'Gross', render: (row) => <Money amount={Number(row.gross_line_amount)} /> },
        { key: 'discounts', header: 'Discounts', render: (row) => <Money amount={Number(row.item_discount) + Number(row.allocated_order_discount)} /> },
        { key: 'net_line_amount', header: 'Net', render: (row) => <Money amount={Number(row.net_line_amount)} /> },
        { key: 'commission_percentage', header: 'Vendor %', render: (row) => `${Number(row.commission_percentage).toFixed(0)}%` },
        { key: 'vendor_earnings_before_fees', header: 'Before fees', render: (row) => <Money amount={Number(row.vendor_earnings_before_fees)} /> },
        { key: 'allocated_card_fee', header: 'Card fee', render: (row) => <Money amount={Number(row.allocated_card_fee)} /> },
        { key: 'final_vendor_cut', header: 'Vendor cut', render: (row) => <Money amount={Number(row.final_vendor_cut)} /> },
        { key: 'amount_settled', header: 'Settled', render: (row) => <span className="font-medium"><Money amount={Number(row.amount_settled)} /></span> },
        { key: 'remaining_amount_after', header: 'Remaining', render: (row) => <Money amount={Number(row.remaining_amount_after)} /> },
    ];

    return (
        <div className="mx-auto w-full min-w-0 max-w-[1400px] space-y-6 pb-24 print:max-w-none">
            <div className="print:hidden">
                <Link className="mb-3 inline-flex items-center gap-1 text-sm text-[var(--color-muted)] hover:text-[var(--color-foreground)]" to={backHref}>
                    <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> {isVendor ? 'Payouts' : 'Vendor workspace'}
                </Link>
                <Header
                    className="!mb-0"
                    title={`Payout statement #${shortId(payoutId)}`}
                    description={`${vendorName} · Pay to ${statement.vendor.pay_to_name}`}
                    actions={(
                        <>
                            {!isVendor && payout.status === 'paid' ? (
                                <Button variant="secondary" leftIcon={<Mail className="h-4 w-4" />} onClick={() => void sendEmail()} isLoading={isEmailing}>Email statement</Button>
                            ) : null}
                            <Button variant="secondary" leftIcon={<Printer className="h-4 w-4" />} onClick={print}>Print</Button>
                            <Button variant="secondary" leftIcon={<Download className="h-4 w-4" />} onClick={download}>Export</Button>
                            {!isVendor && payout.status === 'paid' ? <Button variant="danger" leftIcon={<RotateCcw className="h-4 w-4" />} onClick={() => setShowVoid(true)}>Void</Button> : null}
                        </>
                    )}
                />
            </div>

            <header className="hidden border-b-2 border-black pb-5 print:block"><h1 className="text-3xl font-semibold">Payout statement</h1><p>#{payoutId.toUpperCase()} · {vendorName}</p><p>Pay to: {statement.vendor.pay_to_name}</p></header>

            {payout.status === 'voided' ? (
                <div role="status" className="rounded-xl bg-[var(--color-danger-bg)] p-4 text-sm text-[var(--color-danger)]">
                    <p className="font-semibold">This payout was voided</p>
                    <p className="mt-1">
                        {[
                            voidReason ? `Reason: ${voidReason}` : null,
                            voidedAt ? formatDate(voidedAt) : null,
                            voidedBy ? `Voided by ${voidedBy}` : null,
                        ].filter(Boolean).join(' · ') || 'The original statement stays here with a separate reversal record.'}
                    </p>
                </div>
            ) : null}
            {!statement.is_exact ? (
                <div className="flex gap-3 rounded-xl bg-[var(--color-warning-bg)] p-4 text-sm text-[var(--color-warning)]">
                    <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
                    <div>
                        <p className="font-medium">Exact sales aren't available for this older payout</p>
                        <p className="mt-1 text-xs">The saved totals are kept. Sale lines rebuilt from dates are not shown as proof. {payout.reconciliation_explanation || ''}</p>
                    </div>
                </div>
            ) : null}

            <div className="grid gap-6 lg:grid-cols-2">
                <Card className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 className="text-sm font-semibold">Payout</h2>
                        <Badge variant={statusVariant} dot>{payout.status === 'paid' && payout.is_partial ? 'Paid, partial' : payout.status}</Badge>
                    </div>
                    {figures.hasSnapshots ? (
                        <div>
                            <PayoutEquation
                                lines={[
                                    { label: 'Carried in', amount: figures.carriedIn },
                                    { label: 'Earned', amount: figures.earned, sign: '+' },
                                    { label: 'Deductions', amount: figures.required, sign: '−' },
                                    { label: 'Invoices', amount: figures.invoices, sign: '−' },
                                    { label: 'Payable', amount: payable, sign: '=', strong: true },
                                ]}
                            />
                            <PayoutEquation
                                lines={[
                                    { label: 'Paying now', amount: Number(payout.amount), strong: true },
                                    ...(rolls > 0 ? [{ label: 'Rolls forward', amount: rolls }] : []),
                                ]}
                            />
                        </div>
                    ) : (
                        <PayoutEquation
                            lines={[
                                ...(payout.payable_before_invoices_snapshot !== null ? [{ label: 'Payable before invoices', amount: Number(payout.payable_before_invoices_snapshot) }] : []),
                                { label: 'Paid', amount: Number(payout.amount), strong: true },
                            ]}
                        />
                    )}
                </Card>

                <Card>
                    <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                        <Fact label="Payment date" value={formatPayoutDate(payout)} />
                        <Fact label="Method" value={payout.payment_method || 'Legacy / unspecified'} capitalize />
                        <Fact label="Reference" value={payout.payment_reference || '—'} />
                        <Fact label="Covers" value={statementScopeLabel(payout)} />
                        {payout.cutoff_at ? <Fact label="Cutoff" value={formatStatementCutoff(payout.cutoff_at)} /> : null}
                        {payout.prepared_at ? <Fact label="Prepared" value={formatDateTime(payout.prepared_at)} /> : null}
                    </dl>
                    {actorLine || emailLine ? (
                        <div className="mt-4 space-y-1 border-t border-[var(--color-border)] pt-4 text-sm text-[var(--color-muted)] print:hidden">
                            {actorLine ? <p>{actorLine}</p> : null}
                            {emailLine ? <p>{emailLine}</p> : null}
                        </div>
                    ) : null}
                </Card>
            </div>

            {statement.is_exact || statement.allocations.length > 0 ? (
                <Section title="Sale allocations" aside={<Money amount={allocationTotal} />}>
                    <Table
                        flat
                        data={statement.allocations}
                        columns={allocationColumns.map((column, index) => (index === 0 ? column : { ...column, minWidth: '96px' }))}
                        keyExtractor={(row) => row.id}
                        emptyMessage="No exact sale allocations are available for this record."
                        ariaLabel="Sale allocations"
                        stickyHeader={false}
                    />
                </Section>
            ) : null}

            <div className="grid gap-6 lg:grid-cols-2">
                <StatementList title="Adjustments" total={adjustmentTotal} empty="No adjustments on this payout." rows={statement.adjustments.map((row) => ({ id: row.id, label: row.description, meta: row.adjustment_type.replace(/_/g, ' '), amount: Number(row.amount), href: !isVendor && row.source_table === 'invoices' && row.source_reference ? `/admin/finances/invoices/${row.source_reference}` : undefined }))} />
                <StatementList title="Invoice payments" total={invoiceTotal} empty="No invoice payments on this payout." rows={statement.invoice_payments.map((row) => ({ id: row.id, label: `Invoice #${row.invoice_number}`, meta: `${row.payment_type.replace(/_/g, ' ')} · ${formatDate(`${row.paid_date}T12:00:00`)}`, amount: Number(row.amount), href: isVendor ? undefined : `/admin/finances/invoices/${row.invoice_id}` }))} />
            </div>

            <Card>
                <h2 className="text-sm font-semibold">Audit details</h2>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                    <Fact label="Confidence" value={payout.historical_confidence.replace(/_/g, ' ')} capitalize />
                    <Fact label="Range mode" value={payout.range_mode.replace(/_/g, ' ')} capitalize />
                    <Fact label="Prior balance" value={payout.include_prior_balance ? 'Included' : 'Excluded'} />
                    <Fact label="Threshold snapshot" value={payout.threshold_snapshot == null ? '—' : `$${Number(payout.threshold_snapshot).toFixed(2)}`} />
                </dl>
                {payout.notes ? <p className="mt-4 border-t border-[var(--color-border)] pt-4 text-sm text-[var(--color-muted)]">{payout.notes}</p> : null}
            </Card>

            <Modal isOpen={showVoid} onClose={() => setShowVoid(false)} title="Void this payout?" description={`Payout to ${statement.vendor.pay_to_name}. This creates reversal records. The original statement cannot be edited or deleted.`} size="sm">
                <Input label="Reason" value={voidInput} onChange={(event) => setVoidInput(event.target.value)} required autoFocus />
                <ModalFooter><Button variant="secondary" onClick={() => setShowVoid(false)}>Cancel</Button><Button variant="danger" isLoading={isVoiding} disabled={!voidInput.trim()} onClick={confirmVoid}>Void payout</Button></ModalFooter>
            </Modal>
        </div>
    );
}

function Fact({ label, value, capitalize }: { label: string; value: string; capitalize?: boolean }) {
    return (
        <div className="min-w-0">
            <dt className="text-xs text-[var(--color-muted)]">{label}</dt>
            <dd className={capitalize ? 'mt-0.5 break-words capitalize' : 'mt-0.5 break-words'}>{value}</dd>
        </div>
    );
}

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
    return (
        <Card padding="none" className="min-w-0 overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
                <h2 className="text-sm font-semibold">{title}</h2>
                {aside ? <span className="text-sm font-semibold">{aside}</span> : null}
            </div>
            {children}
        </Card>
    );
}

function StatementList({ title, total, rows, empty }: { title: string; total: number; rows: Array<{ id: string; label: string; meta: string; amount: number; href?: string }>; empty: string }) {
    return (
        <Section title={title} aside={<Money amount={total} />}>
            {rows.length ? rows.map((row) => (
                <div key={row.id} className="flex items-center gap-3 border-t border-[var(--color-border)] px-4 py-3">
                    <div className="min-w-0">
                        {row.href ? <Link className="text-sm font-medium text-[var(--color-primary)] hover:underline" to={row.href}>{row.label}</Link> : <p className="text-sm font-medium">{row.label}</p>}
                        <p className="text-xs capitalize text-[var(--color-muted)]">{row.meta}</p>
                    </div>
                    <p className="ml-auto shrink-0 text-sm font-medium"><Money amount={row.amount} /></p>
                </div>
            )) : <p className="border-t border-[var(--color-border)] p-6 text-sm text-[var(--color-muted)]">{empty}</p>}
        </Section>
    );
}
