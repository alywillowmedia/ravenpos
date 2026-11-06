import { ChevronDown, ChevronRight, LockKeyhole } from 'lucide-react';
import { memo, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { Badge } from '../ui/Badge';
import { Money } from '../ui/Money';
import type {
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

export function PayToName({ name, className }: { name: string; className?: string }) {
    return (
        <span className={className}>
            Pay to <strong className="font-medium text-[var(--color-foreground)]">{name}</strong>
        </span>
    );
}

export interface EquationLine {
    label: string;
    amount: number;
    sign?: '+' | '−' | '=';
    strong?: boolean;
}

export function PayoutEquation({ lines, className }: { lines: EquationLine[]; className?: string }) {
    const firstStrong = lines.findIndex((line) => line.strong);
    return (
        <dl className={cn('text-sm', className)}>
            {lines.map((line, index) => (
                <div
                    key={`${line.label}-${index}`}
                    className={cn(
                        'flex items-baseline justify-between gap-4 py-1.5',
                        index === firstStrong && 'mt-1.5 border-t border-[var(--color-border)] pt-3',
                        line.strong ? 'font-semibold text-[var(--color-foreground)]' : 'text-[var(--color-muted)]',
                    )}
                >
                    <dt>
                        {line.sign ? <span className="mr-2 inline-block w-3 text-center" aria-hidden="true">{line.sign}</span> : null}
                        {line.label}
                    </dt>
                    <dd className={cn(line.strong && 'text-base')}>
                        <Money amount={line.amount} />
                    </dd>
                </div>
            ))}
        </dl>
    );
}

const READINESS_BADGES: Record<PayoutReadiness, { label: string; variant: 'success' | 'warning' | 'info' | 'default' }> = {
    ready: { label: 'Ready to pay', variant: 'success' },
    accruing: { label: 'Accruing', variant: 'warning' },
    draft: { label: 'Draft', variant: 'info' },
    paid_up: { label: 'Paid up', variant: 'default' },
};

export function ReadinessBadge({ status }: { status: PayoutReadiness }) {
    const { label, variant } = READINESS_BADGES[status];
    return <Badge variant={variant} dot>{label}</Badge>;
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
    dimmedAfter,
}: {
    items: PayoutSaleFinancial[];
    statementHref: (payoutId: string) => string;
    emptyMessage?: string;
    /** Cutoff instant. Sales after it are dimmed and marked as not in the payout. */
    dimmedAfter?: string;
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
    const cutoff = dimmedAfter ? Date.parse(dimmedAfter) : Number.NaN;

    if (grouped.length === 0) {
        return <div className="rounded-xl bg-[var(--color-surface)] py-10 text-center text-sm text-[var(--color-muted)]">{emptyMessage}</div>;
    }

    return (
        <div className="divide-y divide-[var(--color-border)] overflow-hidden rounded-2xl bg-[var(--color-card)] shadow-[var(--shadow-surface)]">
            {grouped.map(([saleId, saleItems]) => {
                const isExpanded = expanded.has(saleId);
                const earnings = saleItems.reduce((sum, item) => sum + item.final_vendor_cut, 0);
                const isDimmed = !Number.isNaN(cutoff) && Date.parse(saleItems[0].sale_timestamp) > cutoff;
                return (
                    <div key={saleId} className={cn(isDimmed && 'opacity-60')}>
                        <button
                            type="button"
                            className="flex min-h-12 w-full items-center gap-3 px-4 text-left text-sm hover:bg-[var(--color-surface-hover)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-ring)]"
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
                            {isDimmed ? <Badge size="sm">Not in this payout</Badge> : null}
                            <Money amount={earnings} className="ml-auto text-lg font-semibold" />
                        </button>
                        {isExpanded ? (
                            <div className="bg-[var(--color-surface)] sm:hidden">
                                {saleItems.map((item) => {
                                    const linked = item.linked_payouts[item.linked_payouts.length - 1];
                                    return (
                                        <article key={item.sale_item_id} className="p-4">
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
                                                <div><dt className="text-[var(--color-muted)]">Gross</dt><dd className="mt-0.5 font-medium"><Money amount={item.gross_line_amount} /></dd></div>
                                                <div><dt className="text-[var(--color-muted)]">Discounts</dt><dd className="mt-0.5 font-medium">−<Money amount={item.item_discount + item.allocated_order_discount} /></dd></div>
                                                <div><dt className="text-[var(--color-muted)]">Net sale</dt><dd className="mt-0.5 font-medium"><Money amount={item.net_line_amount} /></dd></div>
                                                <div><dt className="text-[var(--color-muted)]">Vendor cut</dt><dd className="mt-0.5 font-medium"><Money amount={item.final_vendor_cut} /></dd></div>
                                                <div><dt className="text-[var(--color-muted)]">Paid</dt><dd className="mt-0.5 font-medium"><Money amount={item.paid_amount} /></dd></div>
                                                <div><dt className="text-[var(--color-muted)]">Remaining</dt><dd className="mt-0.5 font-medium"><Money amount={item.remaining_amount} /></dd></div>
                                            </dl>
                                            <div className="mt-3 flex items-center text-[11px] text-[var(--color-muted)]">
                                                <span>{item.commission_percentage.toFixed(0)}% share · <Money amount={item.vendor_earnings_before_fees} /> before fees · −<Money amount={item.allocated_card_fee} /> fee</span>
                                                {linked ? <Link className="ml-auto shrink-0 text-[var(--color-primary)] hover:underline" to={statementHref(linked.payout_id)}>#{linked.payout_id.slice(0, 8).toUpperCase()}</Link> : null}
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                        ) : null}
                        {isExpanded ? (
                            <div className="hidden overflow-x-auto bg-[var(--color-surface)] sm:block">
                                <table className="w-full min-w-[1120px] text-xs">
                                    <thead className="text-[var(--color-muted)]">
                                        <tr>
                                            <th className="px-4 py-2 text-left font-medium">Item</th>
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
                                            <th className="px-4 py-2 text-left font-medium">Payout</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {saleItems.map((item) => {
                                            const linked = item.linked_payouts[item.linked_payouts.length - 1];
                                            return (
                                                <tr key={item.sale_item_id}>
                                                    <td className="px-4 py-2.5">
                                                        <p className="font-medium text-sm">{item.item_name}</p>
                                                        <p className="font-mono text-[11px] text-[var(--color-muted)]">{item.sku}</p>
                                                    </td>
                                                    <td className="px-3 py-2.5 text-right"><Money amount={item.gross_line_amount} /></td>
                                                    <td className="px-3 py-2.5 text-right">−<Money amount={item.item_discount + item.allocated_order_discount} /></td>
                                                    <td className="px-3 py-2.5 text-right"><Money amount={item.net_line_amount} /></td>
                                                    <td className="px-3 py-2.5 text-right">{item.commission_percentage.toFixed(0)}%</td>
                                                    <td className="px-3 py-2.5 text-right"><Money amount={item.vendor_earnings_before_fees} /></td>
                                                    <td className="px-3 py-2.5 text-right">−<Money amount={item.allocated_card_fee} /></td>
                                                    <td className="px-3 py-2.5 text-right font-medium"><Money amount={item.final_vendor_cut} /></td>
                                                    <td className="px-3 py-2.5 text-right"><Money amount={item.paid_amount} /></td>
                                                    <td className="px-3 py-2.5 text-right font-medium"><Money amount={item.remaining_amount} /></td>
                                                    <td className="px-3 py-2.5">
                                                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                                                            <span className="h-1.5 w-1.5 rounded-full" style={{ background: allocationColor(item.allocation_status) }} />
                                                            {allocationLabel(item.allocation_status)}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-2.5">
                                                        {linked ? (
                                                            <Link className="whitespace-nowrap text-[var(--color-primary)] underline-offset-2 hover:underline" to={statementHref(linked.payout_id)}>
                                                                #{linked.payout_id.slice(0, 8).toUpperCase()}
                                                            </Link>
                                                        ) : '—'}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        ) : null}
                    </div>
                );
            })}
        </div>
    );
});
