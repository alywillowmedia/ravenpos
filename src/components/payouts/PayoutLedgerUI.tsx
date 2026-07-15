import { ChevronDown, ChevronRight, LockKeyhole, TriangleAlert } from 'lucide-react';
import { Fragment, memo, useMemo, useState, type ReactNode } from 'react';
import { formatCurrency } from '../../lib/utils';
import type {
    HistoricalConfidence,
    PayoutReadiness,
    PayoutSaleFinancial,
} from '../../types/payouts';

export function LedgerPageHeader({
    breadcrumb,
    title,
    description,
    actions,
    locked,
}: {
    breadcrumb?: ReactNode;
    title: string;
    description?: ReactNode;
    actions?: ReactNode;
    locked?: boolean;
}) {
    return (
        <header className="mb-5 border-b border-[var(--color-border)] pb-5">
            {breadcrumb ? <div className="mb-2 text-xs text-[var(--color-muted)]">{breadcrumb}</div> : null}
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                        <h1 className="font-display text-3xl font-normal tracking-[-0.025em] text-[var(--color-foreground)]">
                            {title}
                        </h1>
                        {locked ? (
                            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-success)]">
                                <LockKeyhole className="h-4 w-4" /> Read-only
                            </span>
                        ) : null}
                    </div>
                    {description ? <div className="mt-1 text-sm text-[var(--color-muted)]">{description}</div> : null}
                </div>
                {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
            </div>
        </header>
    );
}

export function ReadinessStatus({
    readiness,
    confidence,
    compact = false,
}: {
    readiness: PayoutReadiness;
    confidence?: HistoricalConfidence;
    compact?: boolean;
}) {
    const config: Record<PayoutReadiness, { label: string; color: string }> = {
        ready: { label: 'Ready to pay', color: 'var(--color-success)' },
        accruing: { label: 'Accruing', color: 'var(--color-warning)' },
        draft: { label: 'Draft', color: 'var(--color-info)' },
        paid_up: { label: 'Paid up', color: 'var(--color-muted)' },
    };
    const current = config[readiness];

    return (
        <div className={compact ? 'space-y-0.5' : 'space-y-1'}>
            <span className="inline-flex items-center gap-2 text-sm font-medium">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: current.color }} aria-hidden="true" />
                {current.label}
            </span>
            {confidence === 'legacy_unverified' ? (
                <span className="flex items-center gap-1 text-xs text-[var(--color-warning)]">
                    <TriangleAlert className="h-3.5 w-3.5" /> Legacy balance
                </span>
            ) : null}
        </div>
    );
}

export function ThresholdProgress({ current, threshold }: { current: number; threshold: number }) {
    const progress = threshold <= 0 ? 100 : Math.min(100, Math.max(0, (current / threshold) * 100));
    return (
        <div className="min-w-24">
            <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                <span>{formatCurrency(threshold)}</span>
                <span className="text-[var(--color-muted)]">{Math.round(progress)}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-surface)]">
                <div
                    className="h-full rounded-full bg-[var(--color-success)] transition-[width]"
                    style={{ width: `${progress}%` }}
                />
            </div>
        </div>
    );
}

export interface EquationTerm {
    label: string;
    amount: number;
    operator?: '+' | '−' | '=';
    emphasize?: boolean;
}

export function FinancialEquation({ terms, note }: { terms: EquationTerm[]; note?: ReactNode }) {
    return (
        <section className="border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-4 sm:px-5">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[repeat(auto-fit,minmax(120px,1fr))]">
                {terms.map((term, index) => (
                    <div key={`${term.label}-${index}`} className="flex min-w-0 items-start gap-3">
                        {term.operator ? <span className="pt-2 text-lg text-[var(--color-muted)]">{term.operator}</span> : null}
                        <div>
                            <p className={term.emphasize ? 'font-display text-3xl' : 'font-display text-2xl'}>
                                {formatCurrency(term.amount)}
                            </p>
                            <p className="mt-1 text-xs text-[var(--color-muted)]">{term.label}</p>
                        </div>
                    </div>
                ))}
            </div>
            {note ? <div className="mt-4 border-t border-[var(--color-border)] pt-3 text-xs text-[var(--color-muted)]">{note}</div> : null}
        </section>
    );
}

function allocationLabel(status: PayoutSaleFinancial['allocation_status']): string {
    switch (status) {
        case 'partially_paid': return 'Partially paid';
        case 'legacy_uncertain': return 'Legacy uncertain';
        case 'refunded': return 'Refunded';
        case 'paid': return 'Paid';
        default: return 'Unpaid';
    }
}

function allocationColor(status: PayoutSaleFinancial['allocation_status']): string {
    switch (status) {
        case 'paid': return 'var(--color-success)';
        case 'partially_paid':
        case 'legacy_uncertain': return 'var(--color-warning)';
        case 'refunded': return 'var(--color-danger)';
        default: return 'var(--color-muted)';
    }
}

export const TransactionLedger = memo(function TransactionLedger({
    items,
    statementHref,
    emptyMessage = 'No sale activity in this view.',
}: {
    items: PayoutSaleFinancial[];
    statementHref: (payoutId: string) => string;
    emptyMessage?: string;
}) {
    const grouped = useMemo(() => {
        const groups = new Map<string, PayoutSaleFinancial[]>();
        for (const item of items) {
            const current = groups.get(item.sale_id) || [];
            current.push(item);
            groups.set(item.sale_id, current);
        }
        return [...groups.entries()].sort(([, left], [, right]) => (
            new Date(right[0].sale_timestamp).getTime() - new Date(left[0].sale_timestamp).getTime()
        ));
    }, [items]);
    const [expanded, setExpanded] = useState<Set<string>>(() => new Set(grouped[0] ? [grouped[0][0]] : []));

    if (grouped.length === 0) {
        return <div className="border-y border-[var(--color-border)] py-10 text-center text-sm text-[var(--color-muted)]">{emptyMessage}</div>;
    }

    return (
        <div className="overflow-hidden border border-[var(--color-border)] bg-[var(--color-card)]">
            {grouped.map(([saleId, saleItems]) => {
                const isExpanded = expanded.has(saleId);
                const earnings = saleItems.reduce((sum, item) => sum + item.final_vendor_cut, 0);
                return (
                    <Fragment key={saleId}>
                        <button
                            type="button"
                            className="flex min-h-12 w-full items-center gap-3 border-b border-[var(--color-border)] px-3 text-left text-sm hover:bg-[var(--color-surface-hover)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-ring)]"
                            onClick={() => setExpanded((current) => {
                                const next = new Set(current);
                                if (next.has(saleId)) next.delete(saleId); else next.add(saleId);
                                return next;
                            })}
                            aria-expanded={isExpanded}
                        >
                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            <span className="font-medium">{new Date(saleItems[0].sale_timestamp).toLocaleDateString()}</span>
                            <span className="font-mono text-xs text-[var(--color-muted)]">Sale #{saleId.slice(0, 8).toUpperCase()}</span>
                            <span className="hidden text-xs text-[var(--color-muted)] sm:inline">{saleItems.length} item{saleItems.length === 1 ? '' : 's'}</span>
                            <span className="ml-auto font-display text-lg">{formatCurrency(earnings)}</span>
                        </button>
                        {isExpanded ? (
                            <div className="border-b border-[var(--color-border)] sm:hidden">
                                {saleItems.map((item) => {
                                    const linked = item.linked_payouts[item.linked_payouts.length - 1];
                                    return (
                                        <article key={item.sale_item_id} className="border-b border-[var(--color-border)] p-3 last:border-b-0">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-medium">{item.item_name}</p>
                                                    <p className="font-mono text-[11px] text-[var(--color-muted)]">{item.sku}</p>
                                                </div>
                                                <span className="inline-flex shrink-0 items-center gap-1.5 text-xs">
                                                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: allocationColor(item.allocation_status) }} />
                                                    {allocationLabel(item.allocation_status)}
                                                </span>
                                            </div>
                                            <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-3 text-xs">
                                                <div><dt className="text-[var(--color-muted)]">Gross</dt><dd className="mt-0.5 font-medium">{formatCurrency(item.gross_line_amount)}</dd></div>
                                                <div><dt className="text-[var(--color-muted)]">Discounts</dt><dd className="mt-0.5 font-medium">−{formatCurrency(item.item_discount + item.allocated_order_discount)}</dd></div>
                                                <div><dt className="text-[var(--color-muted)]">Net sale</dt><dd className="mt-0.5 font-medium">{formatCurrency(item.net_line_amount)}</dd></div>
                                                <div><dt className="text-[var(--color-muted)]">Vendor cut</dt><dd className="mt-0.5 font-medium">{formatCurrency(item.final_vendor_cut)}</dd></div>
                                                <div><dt className="text-[var(--color-muted)]">Paid</dt><dd className="mt-0.5 font-medium">{formatCurrency(item.paid_amount)}</dd></div>
                                                <div><dt className="text-[var(--color-muted)]">Remaining</dt><dd className="mt-0.5 font-medium">{formatCurrency(item.remaining_amount)}</dd></div>
                                            </dl>
                                            <div className="mt-3 flex items-center border-t border-[var(--color-border)] pt-2 text-[11px] text-[var(--color-muted)]">
                                                <span>{item.commission_percentage.toFixed(0)}% share · {formatCurrency(item.vendor_earnings_before_fees)} before fees · −{formatCurrency(item.allocated_card_fee)} fee</span>
                                                {linked ? <a className="ml-auto shrink-0 text-[var(--color-primary)] hover:underline" href={statementHref(linked.payout_id)}>#{linked.payout_id.slice(0, 8).toUpperCase()}</a> : null}
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                        ) : null}
                        {isExpanded ? (
                            <div className="hidden overflow-x-auto border-b border-[var(--color-border)] sm:block">
                                <table className="w-full min-w-[1120px] text-xs">
                                    <thead className="bg-[var(--color-surface)] text-[var(--color-muted)]">
                                        <tr>
                                            <th className="px-3 py-2 text-left font-medium">Item</th>
                                            <th className="px-3 py-2 text-right font-medium">Gross</th>
                                            <th className="px-3 py-2 text-right font-medium">Discounts</th>
                                            <th className="px-3 py-2 text-right font-medium">Net sale</th>
                                            <th className="px-3 py-2 text-right font-medium">Vendor %</th>
                                            <th className="px-3 py-2 text-right font-medium">Before fees</th>
                                            <th className="px-3 py-2 text-right font-medium">Card fee</th>
                                            <th className="px-3 py-2 text-right font-medium">Vendor cut</th>
                                            <th className="px-3 py-2 text-right font-medium">Paid</th>
                                            <th className="px-3 py-2 text-right font-medium">Remaining</th>
                                            <th className="px-3 py-2 text-left font-medium">Status</th>
                                            <th className="px-3 py-2 text-left font-medium">Payout</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {saleItems.map((item) => {
                                            const linked = item.linked_payouts[item.linked_payouts.length - 1];
                                            return (
                                                <tr key={item.sale_item_id} className="border-t border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]">
                                                    <td className="px-3 py-2.5">
                                                        <p className="font-medium text-sm">{item.item_name}</p>
                                                        <p className="font-mono text-[11px] text-[var(--color-muted)]">{item.sku}</p>
                                                    </td>
                                                    <td className="px-3 py-2.5 text-right">{formatCurrency(item.gross_line_amount)}</td>
                                                    <td className="px-3 py-2.5 text-right">−{formatCurrency(item.item_discount + item.allocated_order_discount)}</td>
                                                    <td className="px-3 py-2.5 text-right">{formatCurrency(item.net_line_amount)}</td>
                                                    <td className="px-3 py-2.5 text-right">{item.commission_percentage.toFixed(0)}%</td>
                                                    <td className="px-3 py-2.5 text-right">{formatCurrency(item.vendor_earnings_before_fees)}</td>
                                                    <td className="px-3 py-2.5 text-right">−{formatCurrency(item.allocated_card_fee)}</td>
                                                    <td className="px-3 py-2.5 text-right font-medium">{formatCurrency(item.final_vendor_cut)}</td>
                                                    <td className="px-3 py-2.5 text-right">{formatCurrency(item.paid_amount)}</td>
                                                    <td className="px-3 py-2.5 text-right font-medium">{formatCurrency(item.remaining_amount)}</td>
                                                    <td className="px-3 py-2.5">
                                                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                                                            <span className="h-1.5 w-1.5 rounded-full" style={{ background: allocationColor(item.allocation_status) }} />
                                                            {allocationLabel(item.allocation_status)}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-2.5">
                                                        {linked ? (
                                                            <a className="whitespace-nowrap text-[var(--color-primary)] underline-offset-2 hover:underline" href={statementHref(linked.payout_id)}>
                                                                #{linked.payout_id.slice(0, 8).toUpperCase()}
                                                            </a>
                                                        ) : '—'}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        ) : null}
                    </Fragment>
                );
            })}
        </div>
    );
});
