import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Money } from '../../components/ui/Money';
import { Select } from '../../components/ui/Select';
import { Table, type Column } from '../../components/ui/Table';
import { getPayoutHistory } from '../../hooks/usePayouts';
import { historyMonthOptions } from '../../lib/payoutRun';
import { formatDate } from '../../lib/utils';
import type { PayoutHistoryRow } from '../../types/payouts';

const PAGE_SIZE = 25;

type HistoryStatus = 'all' | 'paid' | 'voided';

const STATUS_OPTIONS: Array<{ value: HistoryStatus; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'paid', label: 'Paid' },
    { value: 'voided', label: 'Voided' },
];

const METHOD_LABELS: Record<string, string> = { check: 'Check', ach: 'ACH', cash: 'Cash', other: 'Other' };

function StatusBadge({ row }: { row: PayoutHistoryRow }) {
    if (row.status === 'voided') return <Badge variant="danger" size="sm">Voided</Badge>;
    if (row.historical_confidence === 'legacy_unverified') return <Badge variant="secondary" size="sm">Legacy</Badge>;
    return <Badge variant="success" size="sm">Paid</Badge>;
}

export function HistoryTab() {
    const navigate = useNavigate();
    const monthOptions = useMemo(() => historyMonthOptions(new Date()), []);
    const [month, setMonth] = useState('');
    const [status, setStatus] = useState<HistoryStatus>('all');
    const [page, setPage] = useState(0);
    const [result, setResult] = useState<{ rows: PayoutHistoryRow[]; total: number } | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const latestRequest = useRef(0);

    const load = useCallback(async () => {
        // A slow reply for older filters must never overwrite a newer one.
        const request = ++latestRequest.current;
        setIsLoading(true);
        setError(null);
        try {
            const next = await getPayoutHistory({ month: month || null, status, page, pageSize: PAGE_SIZE });
            if (request === latestRequest.current) setResult(next);
        } catch (err) {
            if (request === latestRequest.current) {
                setError(err instanceof Error ? err.message : 'Failed to load payout history');
            }
        } finally {
            if (request === latestRequest.current) setIsLoading(false);
        }
    }, [month, status, page]);

    useEffect(() => {
        void load();
    }, [load]);

    const total = result?.total ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    const columns: Column<PayoutHistoryRow>[] = [
        {
            key: 'paid_at',
            header: 'Paid date',
            minWidth: '7rem',
            render: (row) => (
                <span className="text-[var(--color-muted)]">{row.paid_at ? formatDate(row.paid_at) : '—'}</span>
            ),
        },
        {
            key: 'vendor',
            header: 'Vendor',
            minWidth: '9rem',
            render: (row) => (
                <div className="min-w-0">
                    <p className="font-medium">{row.consignor.business_name || row.consignor.name}</p>
                    <p className="truncate text-xs text-[var(--color-muted)]">#{row.consignor.consignor_number}</p>
                </div>
            ),
        },
        { key: 'amount', header: 'Amount', render: (row) => <Money amount={row.amount} className="font-semibold" /> },
        {
            key: 'method',
            header: 'Method',
            hideBelow: 'xl',
            render: (row) => (row.payment_method ? METHOD_LABELS[row.payment_method] ?? row.payment_method : '—'),
        },
        {
            key: 'reference',
            header: 'Reference',
            hideBelow: 'xl',
            render: (row) => <span className="text-[var(--color-muted)]">{row.payment_reference || '—'}</span>,
        },
        { key: 'status', header: 'Status', render: (row) => <StatusBadge row={row} /> },
    ];

    return (
        <section className="space-y-3" aria-label="Payout history">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-3 sm:flex-row">
                    <Select
                        selectSize="sm"
                        aria-label="Month"
                        options={monthOptions}
                        value={month}
                        onChange={(event) => {
                            setMonth(event.target.value);
                            setPage(0);
                        }}
                        className="sm:w-48"
                    />
                    <Select
                        selectSize="sm"
                        aria-label="Status"
                        options={STATUS_OPTIONS}
                        value={status}
                        onChange={(event) => {
                            setStatus(event.target.value as HistoryStatus);
                            setPage(0);
                        }}
                        className="sm:w-36"
                    />
                </div>
                {result && !error ? (
                    <p className="text-sm text-[var(--color-muted)]">
                        {total} {total === 1 ? 'payout' : 'payouts'}
                    </p>
                ) : null}
            </div>

            {error ? (
                <Card className="flex flex-col items-center gap-3 py-10 text-center">
                    <p role="alert" className="font-medium text-[var(--color-foreground)]">Payout history could not be loaded.</p>
                    <p className="text-sm text-[var(--color-muted)]">{error}</p>
                    <Button type="button" variant="secondary" onClick={() => void load()}>Retry</Button>
                </Card>
            ) : (
                <>
                    <Table
                        flat
                        ariaLabel="Payout history"
                        data={result?.rows ?? []}
                        columns={columns}
                        keyExtractor={(row) => row.id}
                        isLoading={isLoading && !result}
                        onRowClick={(row) => navigate(`/admin/payouts/history/${row.id}`)}
                        emptyMessage="No payouts match."
                    />
                    {total > 0 ? (
                        <div className="flex items-center justify-between gap-3">
                            <p className="text-xs text-[var(--color-muted)]">
                                Showing {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
                            </p>
                            <div className="flex items-center gap-2">
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="secondary"
                                    disabled={page === 0 || isLoading}
                                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                                >
                                    Previous
                                </Button>
                                <span className="text-xs text-[var(--color-muted)]">Page {page + 1} of {totalPages}</span>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="secondary"
                                    disabled={page + 1 >= totalPages || isLoading}
                                    onClick={() => setPage((p) => p + 1)}
                                >
                                    Next
                                </Button>
                            </div>
                        </div>
                    ) : null}
                </>
            )}
        </section>
    );
}
