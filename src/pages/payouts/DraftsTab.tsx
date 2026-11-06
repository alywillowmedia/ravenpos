import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DraftPanel } from '../../components/payouts/DraftPanel';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { payRunTotal } from '../../lib/payoutRun';
import { formatCurrency } from '../../lib/utils';
import type { PayoutRunData, PayoutRunRow } from '../../types/payouts';

export interface DraftsTabProps {
    data: PayoutRunData;
    onDiscard: (row: PayoutRunRow) => void;
    onMarkPaid: (row: PayoutRunRow) => void;
}

export function DraftsTab({ data, onDiscard, onMarkPaid }: DraftsTabProps) {
    const navigate = useNavigate();
    const drafts = useMemo(() => data.rows.filter((row) => row.status === 'draft' && row.draft_id), [data.rows]);
    const run = useMemo(
        () => payRunTotal(drafts, new Set(drafts.map((row) => row.consignor_id))),
        [drafts],
    );

    if (drafts.length === 0) {
        return (
            <EmptyState
                title="No drafts in progress"
                description="Prepare a payout from the Queue tab and it will appear here."
            />
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-end">
                <Link to="/admin/payouts/pay-run" tabIndex={-1}>
                    <Button type="button">
                        Pay run · {run.count} {run.count === 1 ? 'draft' : 'drafts'} · {formatCurrency(run.total)}
                    </Button>
                </Link>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
                {drafts.map((row) => (
                    <DraftPanel
                        key={row.consignor_id}
                        row={row}
                        onOpen={() => navigate(`/admin/payouts/drafts/${row.draft_id}`)}
                        onDiscard={() => onDiscard(row)}
                        onMarkPaid={() => onMarkPaid(row)}
                    />
                ))}
            </div>
        </div>
    );
}
