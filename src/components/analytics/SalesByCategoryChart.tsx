import { useMemo } from 'react';
import { formatCurrency } from '../../lib/utils';
import type { SalesByCategoryData } from '../../hooks/useAnalytics';

interface SalesByCategoryChartProps {
    data: SalesByCategoryData[];
}

interface CategoryRow extends SalesByCategoryData {
    isOther?: boolean;
}

const MAX_VISIBLE_CATEGORIES = 6;

function getVisibleCategories(data: SalesByCategoryData[]): CategoryRow[] {
    const sorted = [...data]
        .filter((item) => Number.isFinite(item.amount) && item.amount > 0)
        .sort((a, b) => b.amount - a.amount);

    if (sorted.length <= MAX_VISIBLE_CATEGORIES) return sorted;

    const visible = sorted.slice(0, MAX_VISIBLE_CATEGORIES - 1);
    const remaining = sorted.slice(MAX_VISIBLE_CATEGORIES - 1).reduce(
        (total, item) => ({
            category: 'Other categories',
            amount: total.amount + item.amount,
            count: total.count + item.count,
            isOther: true,
        }),
        { category: 'Other categories', amount: 0, count: 0, isOther: true } as CategoryRow,
    );

    return [...visible, remaining].sort((a, b) => b.amount - a.amount);
}

export function SalesByCategoryChart({ data }: SalesByCategoryChartProps) {
    const summary = useMemo(() => {
        const validData = data.filter((item) => Number.isFinite(item.amount) && item.amount > 0);
        const totalRevenue = validData.reduce((total, item) => total + item.amount, 0);
        const totalItems = validData.reduce((total, item) => total + item.count, 0);
        const rows = getVisibleCategories(validData);

        return {
            rows,
            totalRevenue,
            totalItems,
            categoryCount: validData.length,
            maxAmount: rows.reduce((max, item) => Math.max(max, item.amount), 0),
        };
    }, [data]);

    if (summary.rows.length === 0) {
        return (
            <div className="flex h-full min-h-[260px] flex-col items-center justify-center text-center">
                <div className="mb-3 flex h-10 w-10 items-end justify-center gap-1 rounded-lg bg-[var(--color-surface)] p-2" aria-hidden="true">
                    <span className="h-2 w-1.5 rounded-sm bg-[var(--color-border-strong)]" />
                    <span className="h-4 w-1.5 rounded-sm bg-[var(--color-border-strong)]" />
                    <span className="h-3 w-1.5 rounded-sm bg-[var(--color-border-strong)]" />
                </div>
                <p className="text-sm font-medium text-[var(--color-foreground)]">No category sales yet</p>
                <p className="mt-1 text-xs text-[var(--color-muted)]">Sales will appear here once they are recorded.</p>
            </div>
        );
    }

    const categoryLabel = `${summary.categoryCount} ${summary.categoryCount === 1 ? 'category' : 'categories'}`;
    const itemLabel = `${summary.totalItems.toLocaleString()} ${summary.totalItems === 1 ? 'item' : 'items'}`;

    return (
        <div className="flex h-full min-h-[300px] flex-col" aria-label="Sales by category ranking">
            <div className="mb-5 flex items-end justify-between gap-4 border-b border-[var(--color-border)] pb-4">
                <div>
                    <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-muted)]">
                        Category revenue
                    </p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-[var(--color-foreground)]">
                        {formatCurrency(summary.totalRevenue)}
                    </p>
                </div>
                <p className="pb-0.5 text-right text-xs leading-5 text-[var(--color-muted)]">
                    {itemLabel}<br />{categoryLabel}
                </p>
            </div>

            <ol className="flex flex-1 flex-col justify-between gap-3">
                {summary.rows.map((item, index) => {
                    const share = summary.totalRevenue > 0 ? (item.amount / summary.totalRevenue) * 100 : 0;
                    const relativeWidth = summary.maxAmount > 0 ? (item.amount / summary.maxAmount) * 100 : 0;
                    const isLeader = index === 0 && !item.isOther;

                    return (
                        <li key={item.category}>
                            <div className="mb-1.5 flex min-w-0 items-baseline justify-between gap-3 text-sm">
                                <span className={`truncate font-medium ${isLeader ? 'text-[var(--color-foreground)]' : 'text-[var(--color-muted)]'}`}>
                                    {item.category}
                                </span>
                                <span className="flex shrink-0 items-baseline gap-2 tabular-nums">
                                    <span className="font-medium text-[var(--color-foreground)]">{formatCurrency(item.amount)}</span>
                                    <span className="w-10 text-right text-xs text-[var(--color-muted)]">{share.toFixed(1)}%</span>
                                </span>
                            </div>
                            <div
                                className="h-1.5 overflow-hidden rounded-full bg-[var(--color-surface)]"
                                role="progressbar"
                                aria-label={`${item.category}: ${formatCurrency(item.amount)}, ${share.toFixed(1)}% of category revenue`}
                                aria-valuemin={0}
                                aria-valuemax={summary.maxAmount}
                                aria-valuenow={item.amount}
                            >
                                <div
                                    className={`h-full rounded-full transition-[width] duration-500 ease-out ${
                                        isLeader
                                            ? 'bg-[var(--color-primary)]'
                                            : 'bg-[var(--color-border-strong)]'
                                    }`}
                                    style={{ width: `${relativeWidth}%` }}
                                />
                            </div>
                        </li>
                    );
                })}
            </ol>
        </div>
    );
}
