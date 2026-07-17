import { AlertTriangle, ArrowLeft, CalendarRange, CheckCircle2, FileLock2, Save } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LedgerPageHeader } from '../../components/payouts/PayoutLedgerUI';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { useToast } from '../../contexts/ToastContext';
import {
    finalizePayout,
    getPayoutStatement,
    getVendorPayoutWorkspace,
    savePayoutDraft,
} from '../../hooks/usePayouts';
import { formatCurrency } from '../../lib/utils';
import type { PayoutRangeMode, PayoutStatementData, VendorPayoutWorkspaceData } from '../../types/payouts';

const today = () => new Date().toISOString().slice(0, 10);

function firstDayOfMonth(value: string): string {
    const [year, month] = value.split('-');
    return year && month ? `${year}-${month}-01` : today();
}

function dateValue(value: unknown): string {
    const normalized = String(value || '');
    return normalized.length >= 10 ? normalized.slice(0, 10) : '';
}

export function PayoutDraftReview() {
    const { payoutId = '' } = useParams();
    const navigate = useNavigate();
    const toast = useToast();
    const [statement, setStatement] = useState<PayoutStatementData | null>(null);
    const [workspace, setWorkspace] = useState<VendorPayoutWorkspaceData | null>(null);
    const [paymentAmount, setPaymentAmount] = useState('');
    const [invoiceAmounts, setInvoiceAmounts] = useState<Record<string, string>>({});
    const [notes, setNotes] = useState('');
    const [overrideReason, setOverrideReason] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('check');
    const [paymentDate, setPaymentDate] = useState(today);
    const [paymentReference, setPaymentReference] = useState('');
    const [rangeMode, setRangeMode] = useState<PayoutRangeMode>('all_outstanding');
    const [sourceRangeStart, setSourceRangeStart] = useState(() => firstDayOfMonth(today()));
    const [sourceRangeEnd, setSourceRangeEnd] = useState(today);
    const [includePriorBalance, setIncludePriorBalance] = useState(true);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isFinalizing, setIsFinalizing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setIsLoading(true);
        try {
            const draft = await getPayoutStatement(payoutId);
            if (draft.payout.status !== 'draft') {
                navigate(`/admin/payouts/history/${payoutId}`, { replace: true });
                return;
            }
            const vendorWorkspace = await getVendorPayoutWorkspace(draft.payout.consignor_id);
            setStatement(draft);
            setWorkspace(vendorWorkspace);
            setPaymentAmount(Number(draft.payout.amount).toFixed(2));
            setNotes(draft.payout.notes || '');
            setOverrideReason(String(draft.payout.below_threshold_override_reason || ''));
            setRangeMode(draft.payout.range_mode);
            setSourceRangeStart(dateValue(draft.payout.source_range_start) || firstDayOfMonth(dateValue(draft.payout.cutoff_at) || today()));
            setSourceRangeEnd(dateValue(draft.payout.source_range_end) || dateValue(draft.payout.cutoff_at) || today());
            setIncludePriorBalance(Boolean(draft.payout.include_prior_balance));
            const selected: Record<string, string> = {};
            for (const adjustment of draft.adjustments) {
                if (adjustment.adjustment_type === 'invoice_deduction' && adjustment.source_reference) {
                    selected[adjustment.source_reference] = Math.abs(Number(adjustment.amount)).toFixed(2);
                }
            }
            setInvoiceAmounts(selected);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'Failed to load payout draft');
        } finally {
            setIsLoading(false);
        }
    }, [navigate, payoutId]);

    useEffect(() => { void load(); }, [load]);

    const invoiceApplications = useMemo(() => Object.entries(invoiceAmounts)
        .map(([invoice_id, value]) => ({ invoice_id, amount: Number(value) }))
        .filter((entry) => Number.isFinite(entry.amount) && entry.amount > 0), [invoiceAmounts]);

    const requiredAdjustments = statement?.adjustments.filter((row) => row.adjustment_type !== 'invoice_deduction' && row.adjustment_type !== 'legacy_carryover') || [];
    const invoiceTotal = invoiceApplications.reduce((sum, row) => sum + row.amount, 0);
    const sourceTotal = statement?.allocations.reduce((sum, row) => sum + Number(row.amount_settled), 0) || 0;
    const carriedTotal = statement?.adjustments.filter((row) => row.adjustment_type === 'legacy_carryover').reduce((sum, row) => sum + Number(row.amount), 0) || 0;
    const requiredTotal = requiredAdjustments.reduce((sum, row) => sum + Math.abs(Math.min(0, Number(row.amount))), 0);
    const balanceAfter = Math.max(0, sourceTotal + carriedTotal - requiredTotal - invoiceTotal - Number(paymentAmount || 0));
    const belowThreshold = Boolean(statement && Number(statement.payout.payable_before_invoices_snapshot || 0) < Number(statement.payout.threshold_snapshot || 0));
    const effectiveIncludePriorBalance = rangeMode === 'all_outstanding' ? true : includePriorBalance;
    const scopeIsValid = rangeMode === 'all_outstanding'
        || Boolean(sourceRangeStart && sourceRangeEnd && sourceRangeStart <= sourceRangeEnd);
    const scopeIsDirty = Boolean(statement && (
        statement.payout.range_mode !== rangeMode
        || dateValue(statement.payout.source_range_start) !== (rangeMode === 'selected_range' ? sourceRangeStart : '')
        || dateValue(statement.payout.source_range_end) !== (rangeMode === 'selected_range' ? sourceRangeEnd : '')
        || Boolean(statement.payout.include_prior_balance) !== effectiveIncludePriorBalance
    ));

    const persistDraft = async (quiet = false, refreshScope = scopeIsDirty) => {
        if (!statement) return null;
        if (!scopeIsValid) {
            toast.warning('Valid payout range required', 'Choose a start date on or before the payout-through date.');
            return null;
        }
        setIsSaving(true);
        try {
            const id = await savePayoutDraft({
                consignorId: statement.payout.consignor_id,
                payoutId,
                rangeMode,
                sourceRangeStart: rangeMode === 'selected_range' ? sourceRangeStart : null,
                sourceRangeEnd: rangeMode === 'selected_range' ? sourceRangeEnd : null,
                includePriorBalance: effectiveIncludePriorBalance,
                paymentAmount: refreshScope ? null : Number(paymentAmount),
                invoiceApplications: refreshScope ? null : invoiceApplications,
                notes,
                belowThresholdOverrideReason: overrideReason || null,
            });
            if (!quiet) toast.success(
                refreshScope ? 'Payout range applied' : 'Draft saved',
                refreshScope
                    ? 'Sale allocations, deductions, invoices, and the payment amount were recalculated.'
                    : 'Exact sale and adjustment snapshots were refreshed.',
            );
            await load();
            return id;
        } catch (reason) {
            toast.error('Unable to save draft', reason instanceof Error ? reason.message : 'Please check the amounts.');
            return null;
        } finally {
            setIsSaving(false);
        }
    };

    const markPaid = async () => {
        if (!statement) return;
        if (scopeIsDirty) {
            toast.warning('Apply payout range changes', 'Refresh the draft and review the recalculated payment before marking it paid.');
            return;
        }
        if (!paymentMethod.trim() || !paymentDate) {
            toast.warning('Payment details required', 'Choose a payment method and payment date.');
            return;
        }
        if (belowThreshold && !overrideReason.trim()) {
            toast.warning('Override reason required', 'Explain why this below-threshold payout should be released.');
            return;
        }
        setIsFinalizing(true);
        try {
            const saved = await persistDraft(true, false);
            if (!saved) return;
            await finalizePayout({ payoutId, paymentMethod, paymentDate, paymentReference, notes, belowThresholdOverrideReason: overrideReason || null });
            toast.success('Payout marked paid', 'The immutable statement and payment evidence are now locked.');
            navigate(`/admin/payouts/history/${payoutId}`, { replace: true });
        } catch (reason) {
            toast.error('Payout was not finalized', reason instanceof Error ? reason.message : 'No financial changes were applied.');
        } finally {
            setIsFinalizing(false);
        }
    };

    if (isLoading) return <div className="flex min-h-72 items-center justify-center"><LoadingSpinner size={30} /></div>;
    if (!statement || !workspace || error) return <div className="border border-[var(--color-danger)] bg-[var(--color-danger-bg)] p-6 text-sm text-[var(--color-danger)]">{error || 'Draft not found.'}</div>;

    return (
        <div className="mx-auto w-full max-w-[1500px] pb-40">
            <LedgerPageHeader
                breadcrumb={<Link className="inline-flex items-center gap-1 hover:text-[var(--color-foreground)]" to={`/admin/payouts/vendor/${statement.vendor.id}`}><ArrowLeft className="h-3.5 w-3.5" /> Vendor workspace</Link>}
                title={`Review payout · ${statement.vendor.business_name || statement.vendor.name}`}
                description={`Draft #${payoutId.slice(0, 8).toUpperCase()} · ${statement.payout.range_mode === 'selected_range' ? 'Selected activity range' : 'All outstanding activity'} · Prior balance ${statement.payout.include_prior_balance ? 'included' : 'excluded'}`}
                actions={<Button variant="secondary" leftIcon={<Save className="h-4 w-4" />} isLoading={isSaving} onClick={() => void persistDraft()}>Save draft</Button>}
            />

            <section className="mb-5 border border-[var(--color-border)] bg-[var(--color-card)]">
                <div className="flex flex-col gap-3 border-b border-[var(--color-border)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <p className="flex items-center gap-2 text-sm font-medium"><CalendarRange className="h-4 w-4 text-[var(--color-primary)]" /> Payout scope</p>
                        <p className="mt-1 text-xs text-[var(--color-muted)]">Choose the sales this payout is allowed to settle. Applying a change refreshes the draft before payment.</p>
                    </div>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => void persistDraft(false, true)}
                        isLoading={isSaving}
                        disabled={!scopeIsDirty || !scopeIsValid}
                    >
                        Apply range &amp; refresh
                    </Button>
                </div>
                <div className="grid gap-4 p-5 lg:grid-cols-[220px_minmax(0,1fr)]">
                    <label className="text-sm font-medium">
                        Payout basis
                        <select
                            className="mt-1.5 h-11 w-full rounded-lg border border-[var(--color-input)] bg-[var(--color-surface-elevated)] px-3 text-sm text-[var(--color-foreground)]"
                            value={rangeMode}
                            onChange={(event) => {
                                const nextMode = event.target.value as PayoutRangeMode;
                                setRangeMode(nextMode);
                                if (nextMode === 'all_outstanding') setIncludePriorBalance(true);
                            }}
                        >
                            <option value="all_outstanding">All outstanding through now</option>
                            <option value="selected_range">Specific date range</option>
                        </select>
                    </label>
                    {rangeMode === 'selected_range' ? (
                        <div className="grid gap-3 sm:grid-cols-2">
                            <Input
                                label="From"
                                type="date"
                                value={sourceRangeStart}
                                max={sourceRangeEnd || undefined}
                                onChange={(event) => setSourceRangeStart(event.target.value)}
                            />
                            <Input
                                label="Pay sales through"
                                type="date"
                                value={sourceRangeEnd}
                                min={sourceRangeStart || undefined}
                                onChange={(event) => setSourceRangeEnd(event.target.value)}
                            />
                        </div>
                    ) : (
                        <div className="flex items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm text-[var(--color-muted)]">
                            Includes every eligible unpaid sale through the moment the draft is refreshed.
                        </div>
                    )}
                </div>
                {rangeMode === 'selected_range' ? (
                    <label className="flex cursor-pointer items-start gap-3 border-t border-[var(--color-border)] px-5 py-4 text-sm">
                        <input
                            type="checkbox"
                            className="mt-0.5 h-4 w-4 accent-[var(--color-primary)]"
                            checked={includePriorBalance}
                            onChange={(event) => setIncludePriorBalance(event.target.checked)}
                        />
                        <span>
                            <span className="font-medium">Include older unpaid balance</span>
                            <span className="mt-0.5 block text-xs text-[var(--color-muted)]">When off, activity before the “From” date stays unpaid and rolls into a future payout.</span>
                        </span>
                    </label>
                ) : null}
                {scopeIsDirty ? <p className="border-t border-[var(--color-info)] bg-[var(--color-info-bg)] px-5 py-3 text-xs text-[var(--color-info)]">Range changes have not been applied yet. Refresh the draft before marking it paid.</p> : null}
            </section>

            {!effectiveIncludePriorBalance ? (
                <div className="mb-5 flex gap-3 border border-[var(--color-warning)] bg-[var(--color-warning-bg)] p-4 text-sm text-[var(--color-warning)]"><AlertTriangle className="h-5 w-5 shrink-0" /><div><p className="font-medium">Prior carryover excluded</p><p className="mt-1 text-xs">Older activity remains visibly unpaid and will roll forward automatically.</p></div></div>
            ) : null}

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
                <main className="min-w-0 space-y-6">
                    <section>
                        <div className="mb-3 flex items-end justify-between"><div><p className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">Included source activity</p><h2 className="font-display text-2xl">Exact FIFO allocations</h2></div><p className="font-display text-2xl">{formatCurrency(sourceTotal + carriedTotal)}</p></div>
                        <div className="overflow-x-auto border border-[var(--color-border)] bg-[var(--color-card)]">
                            <table className="w-full min-w-[920px] text-sm">
                                <thead className="bg-[var(--color-surface)] text-xs text-[var(--color-muted)]"><tr><th className="px-3 py-2 text-left">Sale / item</th><th className="px-3 py-2 text-right">Net sale</th><th className="px-3 py-2 text-right">Vendor cut</th><th className="px-3 py-2 text-right">Settle now</th><th className="px-3 py-2 text-right">Remainder</th></tr></thead>
                                <tbody>{statement.allocations.map((row) => <tr key={row.id} className="border-t border-[var(--color-border)]"><td className="px-3 py-3"><p className="font-medium">{row.item_name}</p><p className="font-mono text-xs text-[var(--color-muted)]">{new Date(row.sale_timestamp).toLocaleDateString()} · {row.sku || 'No SKU'} · #{row.sale_id.slice(0, 8).toUpperCase()}</p></td><td className="px-3 py-3 text-right">{formatCurrency(row.net_line_amount)}</td><td className="px-3 py-3 text-right">{formatCurrency(row.final_vendor_cut)}</td><td className="px-3 py-3 text-right font-medium">{formatCurrency(row.amount_settled)}</td><td className="px-3 py-3 text-right">{formatCurrency(row.remaining_amount_after)}</td></tr>)}</tbody>
                            </table>
                            {statement.allocations.length === 0 ? <p className="p-8 text-center text-sm text-[var(--color-muted)]">No exact sale allocations in this draft.</p> : null}
                        </div>
                    </section>

                    <section className="grid gap-4 lg:grid-cols-2">
                        <div className="border border-[var(--color-border)] bg-[var(--color-card)]"><h2 className="border-b border-[var(--color-border)] px-4 py-3 font-display text-xl">Applied deductions</h2>{requiredAdjustments.length ? requiredAdjustments.map((row) => <div key={row.id} className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-3 last:border-b-0"><div><p className="text-sm font-medium">{row.description}</p><p className="text-xs capitalize text-[var(--color-muted)]">{row.adjustment_type.replace(/_/g, ' ')}</p></div><p className="ml-auto font-medium">{formatCurrency(row.amount)}</p></div>) : <p className="p-6 text-sm text-[var(--color-muted)]">No required deductions.</p>}</div>
                        <div className="border border-[var(--color-border)] bg-[var(--color-card)]"><h2 className="border-b border-[var(--color-border)] px-4 py-3 font-display text-xl">Invoice applications</h2>{workspace.invoices.length ? workspace.invoices.map((invoice) => <div key={invoice.id} className="grid grid-cols-[1fr_120px] items-end gap-3 border-b border-[var(--color-border)] px-4 py-3 last:border-b-0"><div><p className="font-mono text-sm">#{invoice.invoice_number}</p><p className="text-xs text-[var(--color-muted)]">{formatCurrency(invoice.balance_due)} due · oldest first</p></div><Input aria-label={`Amount applied to invoice ${invoice.invoice_number}`} type="number" step="0.01" min="0" max={invoice.balance_due} value={invoiceAmounts[invoice.id] || ''} onChange={(event) => setInvoiceAmounts((current) => ({ ...current, [invoice.id]: event.target.value }))} /></div>) : <p className="p-6 text-sm text-[var(--color-muted)]">No unpaid invoices.</p>}</div>
                    </section>
                </main>

                <aside className="h-fit border border-[var(--color-border)] bg-[var(--color-card)] xl:sticky xl:top-4">
                    <div className="border-b border-[var(--color-border)] p-5"><p className="text-xs uppercase tracking-wide text-[var(--color-muted)]">Reconciliation summary</p><p className="mt-1 font-display text-3xl">{formatCurrency(Number(paymentAmount || 0))}</p><p className="text-xs text-[var(--color-muted)]">Payment to vendor</p></div>
                    <dl className="space-y-2 border-b border-[var(--color-border)] p-5 text-sm">
                        <div className="flex justify-between"><dt>Sale allocations</dt><dd>{formatCurrency(sourceTotal)}</dd></div>
                        <div className="flex justify-between"><dt>Carried balance</dt><dd>{formatCurrency(carriedTotal)}</dd></div>
                        <div className="flex justify-between"><dt>Required deductions</dt><dd>−{formatCurrency(requiredTotal)}</dd></div>
                        <div className="flex justify-between"><dt>Invoice applications</dt><dd>−{formatCurrency(invoiceTotal)}</dd></div>
                        <div className="flex justify-between border-t border-[var(--color-border)] pt-2 font-medium"><dt>Remains unpaid</dt><dd>{formatCurrency(balanceAfter)}</dd></div>
                    </dl>
                    <div className="space-y-4 p-5">
                        <Input label="Payment amount" type="number" min="0" step="0.01" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} />
                        {belowThreshold ? <Input label="Below-threshold override reason" value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} required hint="Required because this payout is below the saved threshold." /> : null}
                        <label className="block text-sm font-medium">Payment method<select className="mt-1.5 h-11 w-full rounded-lg border border-[var(--color-input)] bg-[var(--color-surface-elevated)] px-3 text-sm text-[var(--color-foreground)]" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option value="check">Check</option><option value="ach">ACH</option><option value="cash">Cash</option><option value="other">Other</option></select></label>
                        <Input label="Payment date" type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} />
                        <Input label="Reference / check number" value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} />
                        <label className="block text-sm font-medium">Notes<textarea className="mt-1.5 min-h-20 w-full rounded-lg border border-[var(--color-input)] bg-[var(--color-surface-elevated)] p-3 text-sm text-[var(--color-foreground)]" value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
                        <Button fullWidth variant="success" leftIcon={<CheckCircle2 className="h-4 w-4" />} isLoading={isFinalizing} disabled={scopeIsDirty || !scopeIsValid} onClick={markPaid}>Mark paid and lock</Button>
                        <p className="flex items-start gap-2 text-xs text-[var(--color-muted)]"><FileLock2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />Finalization revalidates every balance atomically. Failures apply no partial changes.</p>
                    </div>
                </aside>
            </div>
        </div>
    );
}
