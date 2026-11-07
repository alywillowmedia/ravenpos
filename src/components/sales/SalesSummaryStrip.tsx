import { Card } from '../ui/Card';
import { Money } from '../ui/Money';
import { Button } from '../ui/Button';
import { cn } from '../../lib/utils';
import type { SalesSummary } from '../../lib/salesSummary';

export interface SalesSummaryStripProps {
    summary: SalesSummary;
    onCountDrawer: () => void;
    onSeeSummary: () => void;
}

function Dot() {
    return <span className="text-[var(--color-muted)]" aria-hidden="true">{'·'}</span>;
}

/** One quiet line for the Sales tab: collected, sales, balance, drawer. */
export function SalesSummaryStrip({ summary, onCountDrawer, onSeeSummary }: SalesSummaryStripProps) {
    const { balance, headline } = summary;

    if (summary.loading) {
        return (
            <Card className="mb-6 text-sm text-[var(--color-muted)]" padding="sm">Loading{'\u2026'}</Card>
        );
    }

    if (summary.vendorNote) {
        return (
            <Card className="mb-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3" padding="sm">
                <div className="min-w-0 text-sm text-[var(--color-foreground)]">
                    <div>{headline.transactionCount} sale{headline.transactionCount === 1 ? '' : 's'} include this vendor</div>
                    <div className="text-[12.5px] text-[var(--color-muted)]">Pick All consignors to see the drawer and the balance check.</div>
                </div>
                <Button variant="secondary" size="sm" onClick={onSeeSummary}>See summary</Button>
            </Card>
        );
    }

    return (
        <Card className="mb-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3" padding="sm">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-[var(--color-foreground)]">
                <span><Money amount={balance.collected} className="font-semibold" /> collected</span>
                <Dot />
                <span>{headline.transactionCount} sale{headline.transactionCount === 1 ? '' : 's'}</span>
                <Dot />
                <span className={cn('font-medium', balance.balanced ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]')}>
                    {balance.balanced ? 'Balanced' : <>Off by <Money amount={balance.difference} /></>}
                </span>
                <Dot />
                <span>Drawer should hold <Money amount={balance.drawer.expected} /></span>
            </div>
            <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={onCountDrawer}>Count drawer</Button>
                <Button variant="secondary" size="sm" onClick={onSeeSummary}>See summary</Button>
            </div>
        </Card>
    );
}
