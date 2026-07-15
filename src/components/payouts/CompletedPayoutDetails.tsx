import { Badge } from '../ui/Badge';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { formatCurrency } from '../../lib/utils';
import type { CompletedPayoutDetails as CompletedPayoutDetailsData } from '../../lib/consignorReports';
import type { Payout } from '../../types';

function BreakdownRow({
    label,
    value,
    deduction = false,
    strong = false,
}: {
    label: string;
    value: number;
    deduction?: boolean;
    strong?: boolean;
}) {
    return (
        <div className={`flex justify-between gap-4 ${strong ? 'font-semibold pt-2 border-t border-[var(--color-border)]' : 'text-sm'}`}>
            <span className={deduction ? 'text-[var(--color-muted)]' : undefined}>{label}</span>
            <span className={deduction ? 'text-[var(--color-muted)]' : undefined}>
                {deduction ? '-' : ''}{formatCurrency(value)}
            </span>
        </div>
    );
}

export function CompletedPayoutDetails({
    payout,
    details,
    isLoading,
    error,
}: {
    payout: Payout;
    details: CompletedPayoutDetailsData | null;
    isLoading: boolean;
    error: string | null;
}) {
    return (
        <div className="space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-lg bg-[var(--color-success-bg)] border border-[var(--color-success)] p-3">
                    <p className="text-xs text-[var(--color-success)]">Recorded Payout</p>
                    <p className="text-xl font-bold text-[var(--color-success)]">{formatCurrency(payout.amount)}</p>
                </div>
                <div className="rounded-lg bg-[var(--color-surface)] p-3">
                    <p className="text-xs text-[var(--color-muted)]">Paid At</p>
                    <p className="text-sm font-medium">{new Date(payout.paid_at).toLocaleString()}</p>
                </div>
                <div className="rounded-lg bg-[var(--color-surface)] p-3">
                    <p className="text-xs text-[var(--color-muted)]">Period</p>
                    <p className="text-sm font-medium">
                        {new Date(payout.period_start).toLocaleDateString()} - {new Date(payout.period_end).toLocaleDateString()}
                    </p>
                </div>
                <div className="rounded-lg bg-[var(--color-surface)] p-3">
                    <p className="text-xs text-[var(--color-muted)]">Payout ID</p>
                    <p className="text-xs font-mono break-all">{payout.id}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-lg bg-[var(--color-surface)] p-3">
                    <p className="text-xs text-[var(--color-muted)]">Gross Sales</p>
                    <p className="font-semibold">{formatCurrency(payout.gross_sales)}</p>
                </div>
                <div className="rounded-lg bg-[var(--color-surface)] p-3">
                    <p className="text-xs text-[var(--color-muted)]">Tax Collected</p>
                    <p className="font-semibold">{formatCurrency(payout.tax_collected)}</p>
                </div>
                <div className="rounded-lg bg-[var(--color-surface)] p-3">
                    <p className="text-xs text-[var(--color-muted)]">Sales / Items</p>
                    <p className="font-semibold">{payout.sales_count} / {payout.items_sold}</p>
                </div>
            </div>

            <div className="rounded-lg border border-[var(--color-border)] p-4 space-y-2">
                <BreakdownRow label="Gross Sales" value={Number(payout.gross_sales || 0)} />
                <BreakdownRow label="Store Share" value={Number(payout.store_share || 0)} deduction />
                {Number(payout.credit_card_fees || 0) > 0 && (
                    <BreakdownRow label="Card Fees" value={Number(payout.credit_card_fees || 0)} deduction />
                )}
                {Number(payout.booth_rent_deduction || 0) > 0 && (
                    <BreakdownRow label="Booth Rent" value={Number(payout.booth_rent_deduction || 0)} deduction />
                )}
                {Number(payout.marketing_fee_deduction || 0) > 0 && (
                    <BreakdownRow label="Marketing Fees" value={Number(payout.marketing_fee_deduction || 0)} deduction />
                )}
                {Number(payout.ledger_deduction || 0) > 0 && (
                    <BreakdownRow label="Ledger Deductions" value={Number(payout.ledger_deduction || 0)} deduction />
                )}
                {Number(payout.invoice_deduction || 0) > 0 && (
                    <BreakdownRow label="Invoice Deductions" value={Number(payout.invoice_deduction || 0)} deduction />
                )}
                {payout.original_amount_due !== null && payout.original_amount_due !== undefined && (
                    <BreakdownRow label="Original Amount Due" value={Number(payout.original_amount_due)} />
                )}
                <BreakdownRow label="Recorded Payout" value={Number(payout.amount || 0)} strong />
            </div>

            {payout.is_partial && (
                <div className="rounded-lg border border-[var(--color-warning)] bg-[var(--color-warning-bg)] p-3 text-sm space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="warning">Partial Payout</Badge>
                        {payout.balance_disposition === 'forgiven' && <Badge variant="danger">Balance Forgiven</Badge>}
                        {payout.balance_disposition === 'deferred' && <Badge variant="default">Balance Deferred</Badge>}
                    </div>
                    {payout.partial_reason && <p>Reason: {payout.partial_reason}</p>}
                </div>
            )}

            {payout.notes && (
                <div className="rounded-lg bg-[var(--color-surface)] p-3">
                    <p className="text-xs text-[var(--color-muted)] mb-1">Notes</p>
                    <p className="text-sm">{payout.notes}</p>
                </div>
            )}

            {isLoading ? (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-[var(--color-muted)]">
                    <LoadingSpinner />
                    Loading completed payout report...
                </div>
            ) : error ? (
                <div className="rounded-lg border border-[var(--color-danger)] bg-[var(--color-danger-bg)] p-3 text-sm text-[var(--color-danger)]">
                    {error}
                </div>
            ) : details && (
                <>
                    {details.deductions.length > 0 && (
                        <div>
                            <h3 className="font-medium text-sm mb-2">Deduction Details</h3>
                            <div className="rounded-lg border border-[var(--color-border)] divide-y divide-[var(--color-border)]">
                                {details.deductions.map((deduction) => (
                                    <div key={`${deduction.type}-${deduction.id}`} className="flex items-start justify-between gap-4 p-3 text-sm">
                                        <div>
                                            <p className="font-medium">{deduction.label}</p>
                                            {deduction.description && <p className="text-xs text-[var(--color-muted)]">{deduction.description}</p>}
                                        </div>
                                        <p className="font-medium text-[var(--color-warning)]">-{formatCurrency(deduction.amount)}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div>
                        <div className="mb-2">
                            <h3 className="font-medium text-sm">Sales Included ({details.saleLines.length} line items)</h3>
                            <p className="text-xs text-[var(--color-muted)]">
                                Saved payout totals and lines come from the immutable payout allocation and adjustment snapshots.
                            </p>
                        </div>
                        {details.saleLines.length > 0 ? (
                            <div className="rounded-lg border border-[var(--color-border)] overflow-auto max-h-80">
                                <table className="w-full text-sm">
                                    <thead className="sticky top-0 bg-[var(--color-surface)]">
                                        <tr>
                                            <th className="text-left px-3 py-2 font-medium">Date</th>
                                            <th className="text-left px-3 py-2 font-medium">Item</th>
                                            <th className="text-center px-3 py-2 font-medium">Qty</th>
                                            <th className="text-right px-3 py-2 font-medium">Net Total</th>
                                            <th className="text-right px-3 py-2 font-medium">Split</th>
                                            <th className="text-right px-3 py-2 font-medium">Vendor Earnings</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {details.saleLines.map((line) => {
                                            const effectiveQuantity = Math.max(0, line.quantity - line.refundedQuantity);
                                            return (
                                                <tr key={line.saleItemId} className="border-t border-[var(--color-border)]">
                                                    <td className="px-3 py-2 text-[var(--color-muted)] whitespace-nowrap">
                                                        {new Date(line.saleDate).toLocaleDateString()}
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <p className="font-medium">{line.itemName}</p>
                                                        <p className="text-xs text-[var(--color-muted)] font-mono">{line.sku}</p>
                                                    </td>
                                                    <td className="px-3 py-2 text-center">
                                                        {effectiveQuantity}
                                                        {line.refundedQuantity > 0 && (
                                                            <span className="block text-xs text-[var(--color-danger)]">-{line.refundedQuantity} refunded</span>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-2 text-right">{formatCurrency(line.lineTotal)}</td>
                                                    <td className="px-3 py-2 text-right">{Math.round(line.commissionSplit * 100)}%</td>
                                                    <td className="px-3 py-2 text-right font-medium text-[var(--color-success)]">
                                                        {formatCurrency(line.consignorShare)}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <p className="rounded-lg border border-[var(--color-border)] p-3 text-sm text-[var(--color-muted)]">
                                No sale line items were found for this payout period.
                            </p>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
