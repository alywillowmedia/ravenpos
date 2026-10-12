import {
    CalendarDays,
    Download,
    FileWarning,
    Plus,
    RefreshCw,
    Search,
} from 'lucide-react';
import { useDeferredValue, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LedgerPageHeader, PayToName, ReadinessStatus, ThresholdProgress } from '../components/payouts/PayoutLedgerUI';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { useToast } from '../contexts/ToastContext';
import {
    getPayoutRangePreview,
    getPayoutReconciliationReport,
    savePayoutDraft,
    usePayouts,
    type PayoutQueueRange,
} from '../hooks/usePayouts';
import { formatCurrency } from '../lib/utils';
import type { PayoutRangePreview, PayoutReadiness, VendorPayoutWorkspaceData } from '../types/payouts';

type QueueMode = 'report' | 'selected_range';
type StatusFilter = 'all' | PayoutReadiness | 'exceptions';

interface QueueRow {
    workspace: VendorPayoutWorkspaceData;
    preview: PayoutRangePreview | null;
    readiness: PayoutReadiness;
}

const RANGE_STATUS_LABELS: Partial<Record<PayoutReadiness, string>> = {
    accruing: 'Below threshold',
    paid_up: 'Nothing to pay',
};

function localDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function initialRange() {
    const now = new Date();
    return {
        start: localDate(new Date(now.getFullYear(), now.getMonth(), 1)),
        end: localDate(now),
    };
}

function rangeKey(range: PayoutQueueRange): string {
    return `${range.start ?? ''}|${range.end ?? ''}`;
}

function formatRangeDate(value: string | null): string {
    if (!value) return '—';
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function sumPayable(rows: VendorPayoutWorkspaceData[], readiness: PayoutReadiness): number {
    return rows.reduce((sum, row) => (
        row.summary.readiness === readiness ? sum + Number(row.summary.current_payable) : sum
    ), 0);
}

function rangeReadiness(workspace: VendorPayoutWorkspaceData, preview: PayoutRangePreview | null): PayoutReadiness {
    if (workspace.summary.draft_id) return 'draft';
    const payout = Number(preview?.estimated_payout || 0);
    if (payout <= 0) return 'paid_up';
    return payout >= Number(workspace.summary.threshold) ? 'ready' : 'accruing';
}

function rangeDeductions(preview: PayoutRangePreview | null): number {
    return preview ? Number(preview.deductions) + Number(preview.invoices_applied) : 0;
}

function QueueMetric({ label, value, tone }: { label: string; value: string; tone?: 'success' | 'warning' | 'info' | 'danger' }) {
    const color = tone ? `var(--color-${tone})` : 'var(--color-foreground)';
    return (
        <div className="min-w-0 border-r border-[var(--color-border)] px-4 py-3 last:border-r-0">
            <p className="text-xs text-[var(--color-muted)]">{label}</p>
            <p className="font-display text-2xl" style={{ color }}>{value}</p>
        </div>
    );
}

export function Payouts() {
    const navigate = useNavigate();
    const toast = useToast();
    const [mode, setMode] = useState<QueueMode>('report');
    const [dates, setDates] = useState(initialRange);
    const { queue, range, isLoading, error, refetch } = usePayouts(dates);
    const [search, setSearch] = useState('');
    const deferredSearch = useDeferredValue(search.trim().toLowerCase());
    const [status, setStatus] = useState<StatusFilter>('all');
    const [isExporting, setIsExporting] = useState(false);
    const [preview, setPreview] = useState<Map<string, PayoutRangePreview> | null>(null);
    const [isPreviewLoading, setIsPreviewLoading] = useState(false);
    const [previewError, setPreviewError] = useState<string | null>(null);
    const [buildingVendorId, setBuildingVendorId] = useState<string | null>(null);
    const previewRequest = useRef(0);
    const requestedPreviewKey = useRef<string | null>(null);
    const isRangeMode = mode === 'selected_range';

    const loadPreview = async (nextRange: PayoutQueueRange) => {
        const requestId = ++previewRequest.current;
        requestedPreviewKey.current = rangeKey(nextRange);
        setPreviewError(null);
        if (!nextRange.start || !nextRange.end || nextRange.start > nextRange.end) {
            setPreview(null);
            setPreviewError('Choose a start date on or before the end date.');
            setIsPreviewLoading(false);
            return;
        }
        setIsPreviewLoading(true);
        try {
            const rows = await getPayoutRangePreview({ start: nextRange.start, end: nextRange.end });
            if (requestId === previewRequest.current) {
                setPreview(new Map(rows.map((row) => [row.consignor_id, row])));
            }
        } catch (err) {
            if (requestId === previewRequest.current) {
                setPreview(null);
                setPreviewError(err instanceof Error ? err.message : 'Failed to load the range payout preview');
            }
        } finally {
            if (requestId === previewRequest.current) setIsPreviewLoading(false);
        }
    };

    const reload = () => {
        void refetch(dates);
        if (isRangeMode) void loadPreview(dates);
    };

    const selectMode = (nextMode: QueueMode) => {
        setMode(nextMode);
        setStatus('all');
        // Switching modes uses the dates on screen, even if Apply was not pressed.
        const datesChanged = rangeKey(dates) !== rangeKey(range);
        if (datesChanged) void refetch(dates);
        if (nextMode === 'selected_range' && (datesChanged || requestedPreviewKey.current !== rangeKey(range))) {
            void loadPreview(dates);
        }
    };

    const rows = useMemo<QueueRow[]>(() => {
        const mapped = queue.map((workspace) => {
            const vendorPreview = isRangeMode ? preview?.get(workspace.vendor.id) ?? null : null;
            return {
                workspace,
                preview: vendorPreview,
                readiness: isRangeMode ? rangeReadiness(workspace, vendorPreview) : workspace.summary.readiness,
            };
        });
        if (!isRangeMode) return mapped;
        return mapped.sort((a, b) => Number(b.preview?.estimated_payout || 0) - Number(a.preview?.estimated_payout || 0));
    }, [isRangeMode, preview, queue]);

    const filtered = useMemo(() => rows.filter(({ workspace, readiness }) => {
        const vendor = workspace.vendor;
        const matchesSearch = !deferredSearch || [vendor.name, vendor.business_name, vendor.pay_to_name, vendor.consignor_number]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(deferredSearch));
        const matchesStatus = status === 'all'
            || (status === 'exceptions' && workspace.summary.legacy_exception_count > 0)
            || readiness === status;
        return matchesSearch && matchesStatus;
    }), [deferredSearch, rows, status]);

    const readyCount = queue.filter((row) => row.summary.readiness === 'ready').length;
    const accruingCount = queue.filter((row) => row.summary.readiness === 'accruing').length;
    const draftCount = queue.filter((row) => row.summary.readiness === 'draft').length;
    const exceptionCount = queue.reduce((sum, row) => sum + Number(row.summary.legacy_exception_count || 0), 0);

    const rangeTotals = useMemo(() => {
        const totals = { payout: 0, payoutVendors: 0, earnings: 0, items: 0, deductions: 0, alreadyPaid: 0 };
        for (const row of rows) {
            if (!row.preview) continue;
            const payout = Number(row.preview.estimated_payout);
            totals.payout += payout;
            if (payout > 0) totals.payoutVendors += 1;
            totals.earnings += Number(row.preview.range_earnings);
            totals.items += Number(row.preview.items_count);
            totals.deductions += rangeDeductions(row.preview);
            totals.alreadyPaid += Number(row.preview.already_paid);
        }
        return totals;
    }, [rows]);

    const openVendor = (workspace: VendorPayoutWorkspaceData) => {
        if (workspace.summary.draft_id) {
            navigate(`/admin/payouts/drafts/${workspace.summary.draft_id}`);
            return;
        }
        const params = new URLSearchParams();
        if (isRangeMode) params.set('mode', 'selected_range');
        params.set('start', range.start ?? dates.start);
        params.set('end', range.end ?? dates.end);
        navigate(`/admin/payouts/vendor/${workspace.vendor.id}?${params.toString()}`);
    };

    const buildRangePayout = async (workspace: VendorPayoutWorkspaceData) => {
        if (!range.start || !range.end) return;
        setBuildingVendorId(workspace.vendor.id);
        try {
            const payoutId = await savePayoutDraft({
                consignorId: workspace.vendor.id,
                rangeMode: 'selected_range',
                sourceRangeStart: range.start,
                sourceRangeEnd: range.end,
                includePriorBalance: false,
                invoiceApplications: null,
            });
            navigate(`/admin/payouts/drafts/${payoutId}`);
        } catch (reason) {
            toast.error('Unable to build payout', reason instanceof Error ? reason.message : 'Please try again.');
            setBuildingVendorId(null);
        }
    };

    const rangeAction = (row: QueueRow) => {
        if (row.workspace.summary.draft_id || Number(row.preview?.estimated_payout || 0) <= 0) {
            openVendor(row.workspace);
            return;
        }
        void buildRangePayout(row.workspace);
    };

    const rangeActionLabel = (row: QueueRow) => {
        if (row.workspace.summary.draft_id) return 'Continue draft';
        return Number(row.preview?.estimated_payout || 0) > 0 ? 'Build payout' : 'View activity';
    };

    const exportReconciliation = async () => {
        setIsExporting(true);
        try {
            const report = await getPayoutReconciliationReport();
            const lines = [
                ['Payout ID', 'Vendor', 'Paid at', 'Amount', 'Explanation'],
                ...report.unresolved.map((row) => [
                    String(row.payout_id || ''),
                    String(row.vendor_name || ''),
                    String(row.paid_at || ''),
                    String(row.amount || ''),
                    String(row.explanation || ''),
                ]),
            ];
            const csv = lines.map((line) => line.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');
            const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `payout-reconciliation-${localDate(new Date())}.csv`;
            anchor.click();
            URL.revokeObjectURL(url);
        } finally {
            setIsExporting(false);
        }
    };

    const tableLoading = isLoading || (isRangeMode && isPreviewLoading);
    const listError = error || (isRangeMode ? previewError : null);

    return (
        <div className="animate-fadeIn">
            <LedgerPageHeader
                title="Payouts"
                description="Review balances, prepare drafts, and record verified payments."
                actions={(
                    <>
                        <Button variant="secondary" size="sm" onClick={() => void exportReconciliation()} isLoading={isExporting}>
                            <Download className="h-4 w-4" /> Reconciliation report
                        </Button>
                        <Button size="sm" onClick={() => document.getElementById('payout-search')?.focus()}>
                            <Plus className="h-4 w-4" /> Create payout
                        </Button>
                    </>
                )}
            />

            {isRangeMode ? (
                <section className="mb-5 grid overflow-hidden border border-[var(--color-border)] bg-[var(--color-card)] sm:grid-cols-2 xl:grid-cols-4">
                    <QueueMetric label="Range payouts" value={`${rangeTotals.payoutVendors} · ${formatCurrency(rangeTotals.payout)}`} tone="success" />
                    <QueueMetric label={`Unpaid earnings · ${rangeTotals.items} items`} value={formatCurrency(rangeTotals.earnings)} />
                    <QueueMetric label="Deductions & invoices" value={formatCurrency(rangeTotals.deductions)} tone="warning" />
                    <QueueMetric label="Already paid from range" value={formatCurrency(rangeTotals.alreadyPaid)} tone="info" />
                </section>
            ) : (
                <section className="mb-5 grid overflow-hidden border border-[var(--color-border)] bg-[var(--color-card)] sm:grid-cols-2 xl:grid-cols-4">
                    <QueueMetric label="Ready to pay" value={`${readyCount} · ${formatCurrency(sumPayable(queue, 'ready'))}`} tone="success" />
                    <QueueMetric label="Accruing" value={`${accruingCount} · ${formatCurrency(sumPayable(queue, 'accruing'))}`} tone="warning" />
                    <QueueMetric label="Drafts" value={`${draftCount} · ${formatCurrency(sumPayable(queue, 'draft'))}`} tone="info" />
                    <QueueMetric label="Integrity exceptions" value={String(exceptionCount)} tone="danger" />
                </section>
            )}

            <section className="mb-5 border-y border-[var(--color-border)] py-4">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex flex-wrap items-center gap-3">
                        <span className="text-sm font-medium">View mode</span>
                        <div className="inline-flex overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)]">
                            <button
                                type="button"
                                onClick={() => selectMode('report')}
                                aria-pressed={!isRangeMode}
                                className={`min-h-10 px-4 text-sm font-medium ${!isRangeMode ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]' : 'hover:bg-[var(--color-surface-hover)]'}`}
                            >
                                Report
                            </button>
                            <button
                                type="button"
                                onClick={() => selectMode('selected_range')}
                                aria-pressed={isRangeMode}
                                className={`min-h-10 border-l border-[var(--color-border)] px-4 text-sm font-medium ${isRangeMode ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]' : 'hover:bg-[var(--color-surface-hover)]'}`}
                            >
                                Build payout from range
                            </button>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-end gap-2">
                        <label className="text-xs text-[var(--color-muted)]">
                            From
                            <input
                                type="date"
                                value={dates.start}
                                onChange={(event) => setDates((current) => ({ ...current, start: event.target.value }))}
                                className="mt-1 block h-10 rounded-lg border border-[var(--color-input)] bg-[var(--color-surface-elevated)] px-3 text-sm text-[var(--color-foreground)]"
                            />
                        </label>
                        <label className="text-xs text-[var(--color-muted)]">
                            To
                            <input
                                type="date"
                                value={dates.end}
                                min={dates.start}
                                onChange={(event) => setDates((current) => ({ ...current, end: event.target.value }))}
                                className="mt-1 block h-10 rounded-lg border border-[var(--color-input)] bg-[var(--color-surface-elevated)] px-3 text-sm text-[var(--color-foreground)]"
                            />
                        </label>
                        <Button variant="secondary" size="sm" onClick={() => reload()}>
                            <CalendarDays className="h-4 w-4" /> Apply
                        </Button>
                    </div>
                </div>
                <p className="mt-3 text-xs text-[var(--color-info)]">
                    {isRangeMode
                        ? `Showing only unpaid items sold ${formatRangeDate(range.start)} – ${formatRangeDate(range.end)}. Older unpaid balances are left out; required deductions and open invoices still apply.`
                        : 'Dates change the activity lens. Older unpaid balances remain included.'}
                </p>
            </section>

            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
                <div className="max-w-md flex-1">
                    <Input
                        id="payout-search"
                        inputSize="sm"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search vendor or ID"
                        leftIcon={<Search className="h-4 w-4" />}
                    />
                </div>
                <select
                    value={status}
                    onChange={(event) => setStatus(event.target.value as StatusFilter)}
                    className="h-9 rounded-lg border border-[var(--color-input)] bg-[var(--color-surface-elevated)] px-3 text-sm text-[var(--color-foreground)]"
                    aria-label="Filter payout status"
                >
                    <option value="all">All statuses</option>
                    <option value="ready">Ready to pay</option>
                    <option value="accruing">{isRangeMode ? RANGE_STATUS_LABELS.accruing : 'Accruing'}</option>
                    <option value="draft">Draft</option>
                    <option value="paid_up">{isRangeMode ? RANGE_STATUS_LABELS.paid_up : 'Paid up'}</option>
                    <option value="exceptions">Integrity exceptions</option>
                </select>
                <Button variant="ghost" size="sm" onClick={() => reload()}>
                    <RefreshCw className="h-4 w-4" /> Refresh
                </Button>
            </div>

            {listError ? (
                <div className="mb-4 border border-[var(--color-danger)] bg-[var(--color-danger-bg)] p-4 text-sm text-[var(--color-danger)]">
                    {listError}
                </div>
            ) : null}

            <section aria-labelledby="vendor-balances-heading">
                <h2 id="vendor-balances-heading" className="mb-2 text-lg font-semibold">
                    {isRangeMode ? 'Range payouts' : 'Vendor balances'}
                </h2>
                {tableLoading ? (
                    <div className="flex min-h-72 items-center justify-center border-y border-[var(--color-border)]">
                        <LoadingSpinner size={28} />
                    </div>
                ) : isRangeMode ? (
                    <>
                        <div className="hidden overflow-x-auto border-y border-[var(--color-border)] bg-[var(--color-card)] lg:block">
                            <table className="w-full min-w-[1180px] text-sm">
                                <thead className="bg-[var(--color-surface)] text-xs text-[var(--color-muted)]">
                                    <tr>
                                        <th className="px-3 py-3 text-left font-medium">Vendor</th>
                                        <th className="px-3 py-3 text-right font-medium">Items sold</th>
                                        <th className="px-3 py-3 text-right font-medium">Unpaid earnings</th>
                                        <th className="px-3 py-3 text-right font-medium">Deductions & invoices</th>
                                        <th className="px-3 py-3 text-right font-medium">Range payout</th>
                                        <th className="px-3 py-3 text-left font-medium">Threshold</th>
                                        <th className="px-3 py-3 text-left font-medium">Status</th>
                                        <th className="px-3 py-3 text-right font-medium">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map((row) => {
                                        const { workspace, preview: vendorPreview } = row;
                                        const deductions = rangeDeductions(vendorPreview);
                                        const payout = Number(vendorPreview?.estimated_payout || 0);
                                        return (
                                            <tr key={workspace.vendor.id} className="border-t border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]">
                                                <td className="px-3 py-3">
                                                    <p className="font-medium">{workspace.vendor.business_name || workspace.vendor.name}</p>
                                                    <p className="text-xs text-[var(--color-muted)]">{workspace.vendor.consignor_number}</p>
                                                    <PayToName name={workspace.vendor.pay_to_name} className="text-xs text-[var(--color-muted)]" />
                                                </td>
                                                <td className="px-3 py-3 text-right">
                                                    <p>{vendorPreview?.items_count ?? 0}</p>
                                                    <p className="text-xs text-[var(--color-muted)]">{vendorPreview?.sales_count ?? 0} {vendorPreview?.sales_count === 1 ? 'sale' : 'sales'}</p>
                                                </td>
                                                <td className="px-3 py-3 text-right">
                                                    <p>{formatCurrency(vendorPreview?.range_earnings ?? 0)}</p>
                                                    {Number(vendorPreview?.already_paid || 0) > 0 ? (
                                                        <p className="text-xs text-[var(--color-muted)]">{formatCurrency(vendorPreview?.already_paid ?? 0)} already paid</p>
                                                    ) : null}
                                                </td>
                                                <td
                                                    className="px-3 py-3 text-right"
                                                    title={vendorPreview ? `Deductions ${formatCurrency(vendorPreview.deductions)} · Invoices ${formatCurrency(vendorPreview.invoices_applied)}` : undefined}
                                                >
                                                    {deductions > 0 ? `−${formatCurrency(deductions)}` : '—'}
                                                </td>
                                                <td className="px-3 py-3 text-right font-display text-xl">{formatCurrency(payout)}</td>
                                                <td className="px-3 py-3"><ThresholdProgress current={payout} threshold={workspace.summary.threshold} /></td>
                                                <td className="px-3 py-3"><ReadinessStatus readiness={row.readiness} label={RANGE_STATUS_LABELS[row.readiness]} compact /></td>
                                                <td className="px-3 py-3 text-right">
                                                    <Button
                                                        size="sm"
                                                        variant={row.readiness === 'ready' ? 'primary' : 'secondary'}
                                                        onClick={() => rangeAction(row)}
                                                        isLoading={buildingVendorId === workspace.vendor.id}
                                                        disabled={buildingVendorId !== null && buildingVendorId !== workspace.vendor.id}
                                                    >
                                                        {rangeActionLabel(row)}
                                                    </Button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <div className="border-y border-[var(--color-border)] bg-[var(--color-card)] lg:hidden">
                            {filtered.map((row) => {
                                const { workspace, preview: vendorPreview } = row;
                                const payout = Number(vendorPreview?.estimated_payout || 0);
                                return (
                                    <button
                                        key={workspace.vendor.id}
                                        type="button"
                                        onClick={() => rangeAction(row)}
                                        disabled={buildingVendorId !== null}
                                        className="block w-full border-b border-[var(--color-border)] px-3 py-4 text-left last:border-b-0 hover:bg-[var(--color-surface-hover)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-ring)] disabled:opacity-60"
                                    >
                                        <div className="flex items-start justify-between gap-4">
                                            <div>
                                                <p className="font-medium">{workspace.vendor.business_name || workspace.vendor.name}</p>
                                                <p className="text-xs text-[var(--color-muted)]">{workspace.vendor.consignor_number}</p>
                                                <PayToName name={workspace.vendor.pay_to_name} className="text-xs text-[var(--color-muted)]" />
                                            </div>
                                            <p className="font-display text-2xl">{formatCurrency(payout)}</p>
                                        </div>
                                        <div className="mt-3 flex items-end justify-between gap-4">
                                            <ThresholdProgress current={payout} threshold={workspace.summary.threshold} />
                                            <ReadinessStatus readiness={row.readiness} label={RANGE_STATUS_LABELS[row.readiness]} compact />
                                        </div>
                                        <p className="mt-3 text-xs text-[var(--color-muted)]">
                                            {vendorPreview?.items_count ?? 0} items · Earnings {formatCurrency(vendorPreview?.range_earnings ?? 0)} · Deductions & invoices {formatCurrency(rangeDeductions(vendorPreview))}
                                        </p>
                                        <p className="mt-2 text-right text-sm font-medium text-[var(--color-primary)]">
                                            {buildingVendorId === workspace.vendor.id ? 'Building…' : rangeActionLabel(row)}
                                        </p>
                                    </button>
                                );
                            })}
                        </div>
                    </>
                ) : (
                    <>
                        <div className="hidden overflow-x-auto border-y border-[var(--color-border)] bg-[var(--color-card)] lg:block">
                            <table className="w-full min-w-[1180px] text-sm">
                                <thead className="bg-[var(--color-surface)] text-xs text-[var(--color-muted)]">
                                    <tr>
                                        <th className="px-3 py-3 text-left font-medium">Vendor</th>
                                        <th className="px-3 py-3 text-right font-medium">Opening balance</th>
                                        <th className="px-3 py-3 text-right font-medium">Range earnings</th>
                                        <th className="px-3 py-3 text-right font-medium">Adjustments</th>
                                        <th className="px-3 py-3 text-right font-medium">Current payable</th>
                                        <th className="px-3 py-3 text-left font-medium">Threshold</th>
                                        <th className="px-3 py-3 text-left font-medium">Status</th>
                                        <th className="px-3 py-3 text-right font-medium">Last payment</th>
                                        <th className="px-3 py-3 text-right font-medium">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map(({ workspace }) => {
                                        const last = workspace.payout_history.find((payout) => payout.status === 'paid');
                                        return (
                                            <tr key={workspace.vendor.id} className="border-t border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]">
                                                <td className="px-3 py-3">
                                                    <p className="font-medium">{workspace.vendor.business_name || workspace.vendor.name}</p>
                                                    <p className="text-xs text-[var(--color-muted)]">{workspace.vendor.consignor_number}</p>
                                                    <PayToName name={workspace.vendor.pay_to_name} className="text-xs text-[var(--color-muted)]" />
                                                </td>
                                                <td className="px-3 py-3 text-right">{formatCurrency(workspace.summary.opening_balance)}</td>
                                                <td className="px-3 py-3 text-right">{formatCurrency(workspace.summary.range_activity)}</td>
                                                <td className="px-3 py-3 text-right">{formatCurrency(workspace.summary.applied_adjustments)}</td>
                                                <td className="px-3 py-3 text-right font-display text-xl">{formatCurrency(workspace.summary.current_payable)}</td>
                                                <td className="px-3 py-3"><ThresholdProgress current={workspace.summary.current_payable} threshold={workspace.summary.threshold} /></td>
                                                <td className="px-3 py-3"><ReadinessStatus readiness={workspace.summary.readiness} confidence={workspace.summary.legacy_exception_count > 0 ? 'legacy_unverified' : undefined} compact /></td>
                                                <td className="px-3 py-3 text-right text-xs text-[var(--color-muted)]">
                                                    {last?.paid_at ? new Date(last.paid_at).toLocaleDateString() : '—'}
                                                </td>
                                                <td className="px-3 py-3 text-right">
                                                    <Button size="sm" variant={workspace.summary.readiness === 'ready' ? 'primary' : 'secondary'} onClick={() => openVendor(workspace)}>
                                                        {workspace.summary.readiness === 'draft' ? 'Continue draft' : workspace.summary.readiness === 'ready' ? 'Review payout' : 'View activity'}
                                                    </Button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <div className="border-y border-[var(--color-border)] bg-[var(--color-card)] lg:hidden">
                            {filtered.map(({ workspace }) => (
                                <button
                                    key={workspace.vendor.id}
                                    type="button"
                                    onClick={() => openVendor(workspace)}
                                    className="block w-full border-b border-[var(--color-border)] px-3 py-4 text-left last:border-b-0 hover:bg-[var(--color-surface-hover)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-ring)]"
                                >
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <p className="font-medium">{workspace.vendor.business_name || workspace.vendor.name}</p>
                                            <p className="text-xs text-[var(--color-muted)]">{workspace.vendor.consignor_number}</p>
                                            <PayToName name={workspace.vendor.pay_to_name} className="text-xs text-[var(--color-muted)]" />
                                        </div>
                                        <p className="font-display text-2xl">{formatCurrency(workspace.summary.current_payable)}</p>
                                    </div>
                                    <div className="mt-3 flex items-end justify-between gap-4">
                                        <ThresholdProgress current={workspace.summary.current_payable} threshold={workspace.summary.threshold} />
                                        <ReadinessStatus readiness={workspace.summary.readiness} compact />
                                    </div>
                                    <p className="mt-3 text-xs text-[var(--color-muted)]">
                                        Opening {formatCurrency(workspace.summary.opening_balance)} · Range {formatCurrency(workspace.summary.range_activity)} · Adjustments {formatCurrency(workspace.summary.applied_adjustments)}
                                    </p>
                                </button>
                            ))}
                        </div>
                    </>
                )}
            </section>

            {exceptionCount > 0 ? (
                <button
                    type="button"
                    onClick={() => setStatus('exceptions')}
                    className="mt-5 flex min-h-12 w-full items-center gap-3 border border-[var(--color-warning)] bg-[var(--color-warning-bg)] px-4 text-left text-sm text-[var(--color-warning)]"
                >
                    <FileWarning className="h-5 w-5" />
                    <span className="font-medium">{exceptionCount} records need reconciliation review</span>
                    <span className="ml-auto underline underline-offset-2">Review exceptions</span>
                </button>
            ) : null}
        </div>
    );
}
