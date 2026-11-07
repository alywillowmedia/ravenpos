import type { ReactNode } from 'react';
import { Card, CardTitle } from '../ui/Card';
import { StatCard } from '../ui/StatCard';
import { Money } from '../ui/Money';
import { Button } from '../ui/Button';
import { SalesTrendChart } from '../analytics/SalesTrendChart';
import { cn } from '../../lib/utils';
import { isZeroAmount, type BusiestSlot, type SalesSummary as SalesSummaryData, type SummaryLine } from '../../lib/salesSummary';

export interface SalesSummaryProps {
    summary: SalesSummaryData;
    trend: Array<{ date: string; amount: number; count: number }>;
    busiest: BusiestSlot | null;
    categories: Array<{ category: string; amount: number }>;
    onCountDrawer: () => void;
    onExportCsv: () => void;
    onPrint: () => void;
}

/** A zero is quiet. Red and green are kept for bad and good news only. */
function AmountText({ line }: { line: Pick<SummaryLine, 'amount' | 'deduct' | 'muted' | 'tone'> }) {
    const zero = isZeroAmount(line.amount);
    return (
        <span className={cn('shrink-0 tabular-nums', line.tone === 'warning' ? 'text-[var(--color-warning)]' : zero || line.muted ? 'text-[var(--color-muted)]' : 'text-[var(--color-foreground)]')}>
            {line.deduct && !zero ? '−' : ''}
            <Money amount={line.amount} />
        </span>
    );
}

function Row({ line }: { line: SummaryLine }) {
    return (
        <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
            <span className={cn('min-w-0', line.tone === 'warning' ? 'text-[var(--color-warning)]' : line.muted ? 'text-[var(--color-muted)]' : 'text-[var(--color-foreground)]')}>{line.label}</span>
            <AmountText line={line} />
        </div>
    );
}

function TotalRow({ label, amount }: { label: string; amount: number }) {
    return (
        <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-[var(--color-border)] pt-2.5 text-sm font-semibold text-[var(--color-foreground)]">
            <span className="min-w-0">{label}</span>
            <span className="shrink-0 tabular-nums"><Money amount={amount} /></span>
        </div>
    );
}

function CheckIcon() {
    return (
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="10" cy="10" r="8" />
            <path d="M6.5 10.5l2.5 2.5 4.5-5" />
        </svg>
    );
}

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
    return (
        <Card className="min-w-0">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <CardTitle>{title}</CardTitle>
                {aside}
            </div>
            {children}
        </Card>
    );
}

export function SalesSummary({ summary, trend, busiest, categories, onCountDrawer, onExportCsv, onPrint }: SalesSummaryProps) {
    const { headline, balance, split, books } = summary;
    const hasTrend = trend.some((day) => day.amount !== 0);
    const vendorScoped = summary.vendorNote !== null;

    if (summary.loading) {
        return (
            <Card className="flex items-center justify-center gap-3 py-16 text-sm text-[var(--color-muted)]">
                <div className="h-5 w-5 animate-spin rounded-full border-b-2 border-[var(--color-primary)]" />
                <span>Loading{'\u2026'}</span>
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            {summary.vendorNote && <p className="text-sm text-[var(--color-muted)]">{summary.vendorNote}</p>}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <StatCard
                    label="Net sales"
                    value={<Money amount={headline.netSales} />}
                    subtext={<>{headline.transactionCount} sale{headline.transactionCount === 1 ? '' : 's'} {'·'} <Money amount={headline.averageSale} /> average</>}
                />
                <StatCard
                    label="Store keeps"
                    value={<Money amount={headline.storeKeeps} />}
                    subtext={`${headline.storeKeepsPercent}% of net sales`}
                />
                <StatCard
                    label="Items sold"
                    value={<span className="tabular-nums">{headline.itemsSold}</span>}
                    subtext={headline.topCategory ? `Most in ${headline.topCategory}` : undefined}
                />
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {vendorScoped ? (
                    <Section title="Does it balance">
                        <p className="text-sm text-[var(--color-muted)]">
                            The drawer and the balance check cover the whole store. Pick All consignors to see them.
                        </p>
                    </Section>
                ) : (
                <Section title="Does it balance">
                    <div
                        className={cn(
                            'mb-3 flex items-start gap-2 text-sm font-medium',
                            balance.balanced ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'
                        )}
                    >
                        {balance.balanced ? <CheckIcon /> : null}
                        <div className="min-w-0">
                            {balance.balanced ? (
                                <span>Balanced to the cent</span>
                            ) : (
                                <>
                                    <span>Off by <Money amount={balance.difference} /></span>
                                    {balance.hint && <p className="mt-0.5 text-[13px] font-normal">{balance.hint}</p>}
                                </>
                            )}
                        </div>
                    </div>
                    {balance.rows.map((line) => <Row key={line.key} line={line} />)}
                    <TotalRow label="Received" amount={balance.received} />

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[var(--color-surface)] px-3 py-2.5">
                        <div className="min-w-0 text-sm">
                            <div className="font-medium text-[var(--color-foreground)]">
                                Drawer should hold <Money amount={balance.drawer.expected} />
                            </div>
                            {balance.drawer.notes.map((note) => (
                                <div key={note.key} className="text-[12.5px] text-[var(--color-muted)]">{note.text}</div>
                            ))}
                        </div>
                        <Button variant="secondary" size="sm" onClick={onCountDrawer}>Count drawer</Button>
                    </div>
                </Section>
                )}


                <Section title="Who gets what">
                    {split.rows.map((line) => <Row key={line.key} line={line} />)}
                    <TotalRow label="Collected" amount={split.total} />
                    {split.hint && <p className="mt-3 text-[12.5px] text-[var(--color-warning)]">{split.hint}</p>}
                    <p className="mt-3 text-[12.5px] text-[var(--color-muted)]">{split.footnote}</p>
                </Section>
            </div>

            <Section
                title="For the books"
                aside={(
                    <div className="flex gap-2">
                        <Button variant="secondary" size="sm" onClick={onExportCsv}>Export CSV</Button>
                        <Button variant="secondary" size="sm" onClick={onPrint}>Print</Button>
                    </div>
                )}
            >
                <div className="grid grid-cols-1 gap-x-10 gap-y-4 md:grid-cols-2">
                    <div className="min-w-0">
                        {books.left.lines.map((line) => <Row key={line.key} line={line} />)}
                        <TotalRow label={books.left.total.label} amount={books.left.total.amount} />
                    </div>
                    <div className="min-w-0">
                        {books.right.lines.map((line) => <Row key={line.key} line={line} />)}
                        <TotalRow label={books.right.total.label} amount={books.right.total.amount} />
                    </div>
                </div>
            </Section>

            <Section
                title="Net sales by day"
                aside={busiest ? <span className="text-[13px] text-[var(--color-muted)]">Busiest: {busiest.text}</span> : undefined}
            >
                <div className="h-56 w-full min-w-0">
                    {hasTrend ? (
                        <SalesTrendChart data={trend} variant="line" valueLabel="Net sales" />
                    ) : (
                        <div className="flex h-full items-center justify-center text-sm text-[var(--color-muted)]">No sales in this range</div>
                    )}
                </div>
                {categories.length > 0 && (
                    <div className="mt-4 border-t border-[var(--color-border)] pt-3">
                        <p className="mb-1 text-[12.5px] text-[var(--color-muted)]">Top categories, before discounts and returns</p>
                        <div className="grid grid-cols-1 gap-x-10 sm:grid-cols-2">
                        {categories.map((row) => (
                            <div key={row.category} className="flex items-baseline justify-between gap-4 py-1 text-sm">
                                <span className="min-w-0 truncate text-[var(--color-foreground)]">{row.category}</span>
                                <span className="shrink-0 tabular-nums text-[var(--color-foreground)]"><Money amount={row.amount} /></span>
                            </div>
                        ))}
                        </div>
                    </div>
                )}
            </Section>
        </div>
    );
}
