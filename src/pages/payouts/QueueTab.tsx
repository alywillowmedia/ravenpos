import { useMemo, useState, type MouseEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DraftPanel } from '../../components/payouts/DraftPanel';
import { LegacyNote } from '../../components/payouts/LegacyNote';
import { ReadinessBadge } from '../../components/payouts/PayoutLedgerUI';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Money } from '../../components/ui/Money';
import { SplitBar } from '../../components/ui/SplitBar';
import { Table, type Column } from '../../components/ui/Table';
import { Tabs } from '../../components/ui/Tabs';
import {
    draftPath,
    filterRows,
    formatDay,
    runTotals,
    splitBarParts,
    statusLine,
    type RunFilter,
} from '../../lib/payoutRun';
import type { PayoutRunData, PayoutRunRow } from '../../types/payouts';

const STATUS_TABS: Array<{ id: RunFilter; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'ready', label: 'Ready' },
    { id: 'draft', label: 'Drafts' },
    { id: 'accruing', label: 'Accruing' },
    { id: 'paid_up', label: 'Paid up' },
];

const MAX_DRAFT_PANELS = 2;

function vendorName(row: PayoutRunRow): string {
    return row.business_name || row.name;
}

function deductions(row: PayoutRunRow): number {
    return row.booth_rent + row.other_deductions + row.invoices_applied;
}

export interface QueueTabProps {
    data: PayoutRunData;
    through: string;
    onPrepareVendor: (id: string) => void;
    onDiscard: (row: PayoutRunRow) => void;
    onMarkPaid: (row: PayoutRunRow) => void;
    onDownloadCsv: () => void;
}

export function QueueTab({ data, through, onPrepareVendor, onDiscard, onMarkPaid, onDownloadCsv }: QueueTabProps) {
    const navigate = useNavigate();
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState<RunFilter>('all');

    const totals = useMemo(() => runTotals(data.rows), [data.rows]);
    const barParts = useMemo(() => splitBarParts(totals), [totals]);
    const drafts = useMemo(() => data.rows.filter((row) => row.status === 'draft' && row.draft_id), [data.rows]);
    const visibleRows = useMemo(() => filterRows(data.rows, { search, status }), [data.rows, search, status]);

    const openVendor = (row: PayoutRunRow) => {
        navigate(`/admin/payouts/vendor/${row.consignor_id}?through=${through}&tab=queue`);
    };
    const openDraft = (row: PayoutRunRow) => {
        if (row.draft_id) navigate(draftPath(row.draft_id, through));
    };

    const renderAction = (row: PayoutRunRow) => {
        const stop = (action: () => void) => (event: MouseEvent) => {
            event.stopPropagation();
            action();
        };
        if (row.status === 'ready') {
            return <Button type="button" size="sm" onClick={stop(() => onPrepareVendor(row.consignor_id))}>Prepare</Button>;
        }
        if (row.status === 'draft' && row.draft_id) {
            return <Button type="button" size="sm" variant="secondary" onClick={stop(() => openDraft(row))}>Open</Button>;
        }
        return <Button type="button" size="sm" variant="ghost" onClick={stop(() => openVendor(row))}>View</Button>;
    };

    const renderStatus = (row: PayoutRunRow) => {
        const line = statusLine(row);
        return (
            <div className="flex flex-col items-start gap-1">
                <ReadinessBadge status={row.status} />
                {line ? <span className="text-xs text-[var(--color-muted)]">{line}</span> : null}
            </div>
        );
    };

    const columns: Column<PayoutRunRow>[] = [
        {
            key: 'name',
            header: 'Vendor',
            minWidth: '9rem',
            render: (row) => (
                <div className="min-w-0">
                    <p className="font-medium">{vendorName(row)}</p>
                    <p className="truncate text-xs text-[var(--color-muted)]">#{row.consignor_number}</p>
                </div>
            ),
        },
        { key: 'carried_in', header: 'Carried in', hideBelow: 'xl', render: (row) => <Money amount={row.carried_in} /> },
        { key: 'earned', header: 'Earned', render: (row) => <Money amount={row.earned} /> },
        { key: 'deductions', header: 'Deductions', render: (row) => <Money amount={deductions(row)} /> },
        { key: 'payable', header: 'Payable', render: (row) => <Money amount={row.payable} className="font-semibold" /> },
        { key: 'status', header: 'Status', render: renderStatus },
        {
            key: 'last_paid_at',
            header: 'Last paid',
            hideBelow: 'xl',
            render: (row) => (
                <span className="text-[var(--color-muted)]">{row.last_paid_at ? formatDay(row.last_paid_at) : '—'}</span>
            ),
        },
        { key: 'action', header: '', render: renderAction },
    ];

    return (
        <div className="space-y-6">
            {barParts ? (
                <Card className="space-y-3">
                    <p className="text-sm font-medium text-[var(--color-foreground)]">
                        Earned by the {totals.run.vendors} vendors in this run
                    </p>
                    <SplitBar parts={barParts} label={`Earned by the ${totals.run.vendors} vendors in this run`} />
                </Card>
            ) : null}

            {drafts.length > 0 ? (
                <section className="space-y-3" aria-label="Drafts in progress">
                    <div className="flex items-baseline justify-between gap-3">
                        <h2 className="text-base font-semibold text-[var(--color-foreground)]">Drafts in progress</h2>
                        {drafts.length > MAX_DRAFT_PANELS ? (
                            <Link
                                to={`/admin/payouts?through=${through}&tab=drafts`}
                                className="text-sm text-[var(--color-primary)] hover:underline"
                            >
                                See all {drafts.length} drafts
                            </Link>
                        ) : null}
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                        {drafts.slice(0, MAX_DRAFT_PANELS).map((row) => (
                            <DraftPanel
                                key={row.consignor_id}
                                row={row}
                                onOpen={() => openDraft(row)}
                                onDiscard={() => onDiscard(row)}
                                onMarkPaid={() => onMarkPaid(row)}
                            />
                        ))}
                    </div>
                </section>
            ) : null}

            <section className="space-y-3" aria-label="Vendors">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <Tabs
                        size="sm"
                        ariaLabel="Filter vendors by status"
                        tabs={STATUS_TABS}
                        activeTab={status}
                        onChange={(id) => setStatus(id as RunFilter)}
                        className="lg:w-auto"
                    />
                    <div className="lg:w-72">
                        <Input
                            type="search"
                            inputSize="sm"
                            aria-label="Search vendors"
                            placeholder="Search vendors"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                        />
                    </div>
                </div>

                <div className="hidden sm:block">
                    <Table
                        flat
                        paginated
                        ariaLabel="Vendor payouts"
                        data={visibleRows}
                        columns={columns}
                        keyExtractor={(row) => row.consignor_id}
                        onRowClick={openVendor}
                        defaultPageSize={25}
                        emptyMessage={data.rows.length === 0 ? 'No vendors have unpaid earnings.' : 'No vendors match.'}
                    />
                </div>

                <div className="space-y-3 sm:hidden">
                    {visibleRows.length === 0 ? (
                        <p className="py-8 text-center text-sm text-[var(--color-muted)]">
                            {data.rows.length === 0 ? 'No vendors have unpaid earnings.' : 'No vendors match.'}
                        </p>
                    ) : visibleRows.map((row) => (
                        <Card key={row.consignor_id} padding="sm" className="space-y-3">
                            <button
                                type="button"
                                onClick={() => openVendor(row)}
                                className="flex w-full items-start justify-between gap-3 text-left"
                            >
                                <span className="min-w-0">
                                    <span className="block truncate font-medium text-[var(--color-foreground)]">{vendorName(row)}</span>
                                    <span className="block text-xs text-[var(--color-muted)]">#{row.consignor_number}</span>
                                </span>
                                <Money amount={row.payable} className="shrink-0 text-lg font-semibold text-[var(--color-foreground)]" />
                            </button>
                            <div className="flex items-center justify-between gap-3">
                                {renderStatus(row)}
                                {renderAction(row)}
                            </div>
                        </Card>
                    ))}
                </div>
            </section>

            <LegacyNote items={data.legacy.items} payouts={data.legacy.payouts} onDownload={onDownloadCsv} />
        </div>
    );
}
