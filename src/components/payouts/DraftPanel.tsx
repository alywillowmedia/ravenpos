import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { formatDay, shortId } from '../../lib/payoutRun';
import { formatCurrency } from '../../lib/utils';
import type { PayoutRunRow } from '../../types/payouts';
import { PayoutEquation, type EquationLine } from './PayoutLedgerUI';

export function DraftPanel({
    row,
    onOpen,
    onDiscard,
    onMarkPaid,
}: {
    row: PayoutRunRow;
    onOpen: () => void;
    onDiscard: () => void;
    onMarkPaid: () => void;
}) {
    const deductions = row.booth_rent + row.other_deductions + row.invoices_applied;
    const rollsForward = Math.round((row.payable - row.paying_now) * 100) / 100;
    const lines: EquationLine[] = [
        { label: 'Carried in', amount: row.carried_in },
        { label: 'Earned', amount: row.earned, sign: '+' },
        { label: 'Deductions', amount: deductions, sign: '−' },
        { label: 'Payable', amount: row.payable, sign: '=', strong: true },
        { label: 'Paying now', amount: row.paying_now, strong: true },
    ];
    if (rollsForward > 0) lines.push({ label: 'Rolls forward', amount: rollsForward });

    return (
        <Card variant="outlined" className="flex flex-col gap-4">
            <div>
                <p className="font-semibold text-[var(--color-foreground)]">{row.business_name || row.name}</p>
                <p className="text-xs text-[var(--color-muted)]">
                    {row.draft_through ? `Through ${formatDay(row.draft_through)}` : 'Draft'}
                    {row.draft_id ? ` · #${shortId(row.draft_id)}` : ''}
                </p>
            </div>
            <PayoutEquation lines={lines} />
            <div className="mt-auto flex flex-wrap items-center gap-2">
                <Button type="button" variant="dangerQuiet" size="sm" onClick={onDiscard}>Discard</Button>
                <Button type="button" variant="secondary" size="sm" onClick={onOpen}>Open</Button>
                <Button type="button" size="sm" className="ml-auto" onClick={onMarkPaid}>
                    Mark paid · {formatCurrency(row.paying_now)}
                </Button>
            </div>
        </Card>
    );
}
