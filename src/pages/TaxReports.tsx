import { useMemo, useState } from 'react';
import { Header } from '../components/layout/Header';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Input } from '../components/ui/Input';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { Select } from '../components/ui/Select';
import { useToast } from '../contexts/ToastContext';
import {
    buildConsignorTaxDetailCsvRows,
    buildConsignorTaxDetailFilename,
    buildConsignorTaxSummaryCsvRows,
    buildConsignorTaxSummaryFilename,
    getDefaultConsignorTaxReviewThreshold,
    loadConsignorTaxReport,
    printConsignorTaxStatements,
    type ConsignorTaxReport,
    type ConsignorTaxReportRow,
} from '../lib/consignorReports';
import { downloadCsv } from '../lib/csvExport';
import { getConsignorDisplayName, getConsignorPayToName } from '../lib/consignors';
import { formatCurrency } from '../lib/utils';

type ReportMode = 'year' | 'custom';

function getYearRange(year: number): { startDate: string; endDate: string } {
    return {
        startDate: `${year}-01-01`,
        endDate: `${year}-12-31`,
    };
}

function getYearOptions(): Array<{ value: string; label: string }> {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 8 }, (_, index) => {
        const year = currentYear - index;
        return { value: String(year), label: String(year) };
    });
}

function filterRows(rows: ConsignorTaxReportRow[], query: string): ConsignorTaxReportRow[] {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return rows;

    return rows.filter((row) => {
        const consignor = row.consignor;
        return [
            consignor.consignor_number,
            getConsignorDisplayName(consignor),
            getConsignorPayToName(consignor),
            consignor.business_name,
            consignor.first_name,
            consignor.last_name,
            consignor.email,
            consignor.phone,
            consignor.booth_location,
        ].some((value) => String(value || '').toLowerCase().includes(normalized));
    });
}

export function TaxReports() {
    const toast = useToast();
    const [mode, setMode] = useState<ReportMode>('year');
    const [selectedYear, setSelectedYear] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [reviewThreshold, setReviewThreshold] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [report, setReport] = useState<ConsignorTaxReport | null>(null);
    const [selectedConsignorIds, setSelectedConsignorIds] = useState<Set<string>>(new Set());
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const visibleRows = useMemo(
        () => (report ? filterRows(report.rows, searchQuery) : []),
        [report, searchQuery]
    );
    const selectedRows = useMemo(
        () => (report ? report.rows.filter((row) => selectedConsignorIds.has(row.consignor.id)) : []),
        [report, selectedConsignorIds]
    );
    const selectedReport = useMemo<ConsignorTaxReport | null>(
        () => report ? { ...report, rows: selectedRows } : null,
        [report, selectedRows]
    );
    const visibleSelectedCount = visibleRows.filter((row) => selectedConsignorIds.has(row.consignor.id)).length;
    const allVisibleRowsSelected = visibleRows.length > 0 && visibleSelectedCount === visibleRows.length;
    const canGenerate = (mode === 'year'
        ? Boolean(selectedYear)
        : Boolean(startDate && endDate))
        && Boolean(reviewThreshold);

    const loadReport = async () => {
        if (mode === 'year' && !selectedYear) {
            setError('Choose a tax year before generating the report.');
            return;
        }
        if (!startDate || !endDate) {
            setError('Choose a valid report date range.');
            return;
        }
        if (!reviewThreshold) {
            setError('Enter a 1099 review amount before generating the report.');
            return;
        }
        const threshold = Number(reviewThreshold);
        if (new Date(startDate) > new Date(endDate)) {
            setError('Report start date must be before the end date.');
            return;
        }
        if (!Number.isFinite(threshold) || threshold < 0) {
            setError('1099 review amount must be a positive number.');
            return;
        }

        setIsLoading(true);
        setError(null);
        try {
            const nextReport = await loadConsignorTaxReport({
                startDate,
                endDate,
                reviewThreshold: threshold,
            });
            setReport(nextReport);
            setSelectedConsignorIds(new Set(nextReport.rows.map((row) => row.consignor.id)));
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unable to load tax reports.';
            setError(message);
            toast.error('Unable to load tax reports', message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleModeChange = (nextMode: ReportMode) => {
        setMode(nextMode);
        setReport(null);
        setSelectedConsignorIds(new Set());
        setSearchQuery('');
        setError(null);
        if (nextMode === 'year') {
            setSelectedYear('');
            setStartDate('');
            setEndDate('');
            setReviewThreshold('');
        } else {
            setSelectedYear('');
            setStartDate('');
            setEndDate('');
            setReviewThreshold('');
        }
    };

    const handleYearChange = (value: string) => {
        const year = Number(value);
        const range = getYearRange(year);
        setSelectedYear(value);
        setStartDate(range.startDate);
        setEndDate(range.endDate);
        setReviewThreshold(String(getDefaultConsignorTaxReviewThreshold(year)));
        setReport(null);
        setSelectedConsignorIds(new Set());
        setSearchQuery('');
        setError(null);
    };

    const handleSelectAll = () => {
        if (!report) return;
        setSelectedConsignorIds(new Set(report.rows.map((row) => row.consignor.id)));
    };

    const handleDeselectAll = () => {
        setSelectedConsignorIds(new Set());
    };

    const handleToggleConsignor = (consignorId: string) => {
        setSelectedConsignorIds((current) => {
            const next = new Set(current);
            if (next.has(consignorId)) {
                next.delete(consignorId);
            } else {
                next.add(consignorId);
            }
            return next;
        });
    };

    const handleToggleVisibleRows = () => {
        setSelectedConsignorIds((current) => {
            const next = new Set(current);
            if (allVisibleRowsSelected) {
                visibleRows.forEach((row) => next.delete(row.consignor.id));
            } else {
                visibleRows.forEach((row) => next.add(row.consignor.id));
            }
            return next;
        });
    };

    const handleExportSummary = () => {
        if (!selectedReport || selectedReport.rows.length === 0) return;
        downloadCsv(buildConsignorTaxSummaryFilename(selectedReport), buildConsignorTaxSummaryCsvRows(selectedReport));
        toast.success('Tax summary exported', `${selectedReport.rows.length} consignor row${selectedReport.rows.length === 1 ? '' : 's'} included.`);
    };

    const handleExportDetail = () => {
        if (!selectedReport || selectedReport.rows.length === 0) return;
        downloadCsv(buildConsignorTaxDetailFilename(selectedReport), buildConsignorTaxDetailCsvRows(selectedReport));
        toast.success('Tax detail exported', `${selectedReport.rows.length} consignor row${selectedReport.rows.length === 1 ? '' : 's'} included.`);
    };

    const handlePrintStatements = () => {
        if (!report || selectedRows.length === 0) return;
        const printed = printConsignorTaxStatements(report, selectedRows.map((row) => row.consignor.id));
        if (!printed) {
            toast.error('Unable to print statements', 'Allow pop-ups for RavenPOS, then try again.');
        }
    };

    return (
        <div className="animate-fadeIn">
            <Header
                title="Tax Reports"
                description="Year-end consignor sales, payout, and W-9 review exports."
                actions={
                    <>
                        <Button
                            variant="secondary"
                            onClick={handlePrintStatements}
                            disabled={!report || selectedRows.length === 0 || isLoading}
                        >
                            <PrintIcon />
                            Print Statements
                        </Button>
                        <Button
                            variant="secondary"
                            onClick={handleExportDetail}
                            disabled={!report || selectedRows.length === 0 || isLoading}
                        >
                            <DownloadIcon />
                            Export Detail CSV
                        </Button>
                        <Button
                            onClick={handleExportSummary}
                            disabled={!report || selectedRows.length === 0 || isLoading}
                        >
                            <DownloadIcon />
                            Export Summary CSV
                        </Button>
                    </>
                }
            />

            <Card variant="outlined" padding="sm" className="mb-4">
                <CardContent>
                    <div className="grid items-start gap-3 lg:grid-cols-[140px_130px_160px_160px_170px_auto]">
                        <Select
                            label="Mode"
                            selectSize="sm"
                            value={mode}
                            onChange={(event) => handleModeChange(event.target.value as ReportMode)}
                            options={[
                                { value: 'year', label: 'Tax Year' },
                                { value: 'custom', label: 'Custom Range' },
                            ]}
                        />
                        <Select
                            label="Year"
                            selectSize="sm"
                            value={selectedYear}
                            onChange={(event) => handleYearChange(event.target.value)}
                            options={getYearOptions()}
                            placeholder="Select year..."
                            disabled={mode !== 'year'}
                        />
                        <Input
                            label="Start Date"
                            type="date"
                            inputSize="sm"
                            value={startDate}
                            onChange={(event) => setStartDate(event.target.value)}
                            disabled={mode !== 'custom'}
                        />
                        <Input
                            label="End Date"
                            type="date"
                            inputSize="sm"
                            value={endDate}
                            onChange={(event) => setEndDate(event.target.value)}
                            disabled={mode !== 'custom'}
                        />
                        <Input
                            label="1099 Review Amount"
                            type="number"
                            inputSize="sm"
                            min="0"
                            step="0.01"
                            value={reviewThreshold}
                            onChange={(event) => setReviewThreshold(event.target.value)}
                        />
                        <div className="flex items-end">
                            <Button
                                onClick={loadReport}
                                isLoading={isLoading}
                                disabled={!canGenerate}
                                size="sm"
                                className="w-full"
                            >
                                Generate
                            </Button>
                        </div>
                    </div>

                    {error && (
                        <div className="mt-4 rounded-lg bg-[var(--color-danger-bg)] p-3 text-sm text-[var(--color-danger)]">
                            {error}
                        </div>
                    )}
                </CardContent>
            </Card>

            {isLoading && !report ? (
                <div className="flex h-96 items-center justify-center">
                    <LoadingSpinner size={32} />
                </div>
            ) : report ? (
                <>
                    <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                        <SummaryCard title="Consignors" value={String(report.totals.consignorCount)} />
                        <SummaryCard title="Gross Sales" value={formatCurrency(report.totals.sales.grossSales)} />
                        <SummaryCard title="Consignor Earnings" value={formatCurrency(report.totals.sales.consignorEarnings)} />
                        <SummaryCard title="Payouts Paid" value={formatCurrency(report.totals.payouts.totalPaid)} />
                        <SummaryCard title="Needs Review" value={`${report.totals.reviewCount} / W-9 ${report.totals.missingW9Count}`} />
                    </div>

                    <div className="mb-3 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                        <div className="max-w-xl flex-1">
                            <Input
                                aria-label="Search consignors"
                                inputSize="sm"
                                placeholder="Search by name, ID, email, or booth..."
                                value={searchQuery}
                                onChange={(event) => setSearchQuery(event.target.value)}
                            />
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm text-[var(--color-muted)]">
                                {selectedRows.length} of {report.rows.length} selected
                            </span>
                            <Button type="button" variant="secondary" size="sm" onClick={handleSelectAll}>
                                Select All
                            </Button>
                            <Button type="button" variant="secondary" size="sm" onClick={handleDeselectAll}>
                                Deselect All
                            </Button>
                        </div>
                    </div>

                    <div className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)]">
                        <div className="max-h-[calc(100vh-290px)] min-h-[420px] overflow-auto">
                            <table className="w-full min-w-[1180px] text-sm">
                                <thead className="sticky top-0 z-20 border-b border-[var(--color-border)] bg-[var(--color-surface)] text-left text-xs uppercase text-[var(--color-muted)] shadow-sm">
                                    <tr>
                                        <th className="w-12 bg-[var(--color-surface)] px-4 py-3 font-semibold">
                                            <input
                                                type="checkbox"
                                                checked={allVisibleRowsSelected}
                                                onChange={handleToggleVisibleRows}
                                                disabled={visibleRows.length === 0}
                                                aria-label="Select visible consignors"
                                                className="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-primary)]"
                                            />
                                        </th>
                                        <th className="bg-[var(--color-surface)] px-4 py-3 font-semibold">Consignor</th>
                                        <th className="bg-[var(--color-surface)] px-4 py-3 font-semibold">W-9</th>
                                        <th className="bg-[var(--color-surface)] px-4 py-3 text-right font-semibold">Sales</th>
                                        <th className="bg-[var(--color-surface)] px-4 py-3 text-right font-semibold">Gross</th>
                                        <th className="bg-[var(--color-surface)] px-4 py-3 text-right font-semibold">Earnings</th>
                                        <th className="bg-[var(--color-surface)] px-4 py-3 text-right font-semibold">Payouts</th>
                                        <th className="bg-[var(--color-surface)] px-4 py-3 text-right font-semibold">Paid</th>
                                        <th className="bg-[var(--color-surface)] px-4 py-3 text-right font-semibold">Deductions</th>
                                        <th className="bg-[var(--color-surface)] px-4 py-3 font-semibold">Review Reason</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--color-border)]">
                                    {visibleRows.map((row) => (
                                        <tr key={row.consignor.id} className="hover:bg-[var(--color-surface-hover)]">
                                            <td className="px-4 py-3">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedConsignorIds.has(row.consignor.id)}
                                                    onChange={() => handleToggleConsignor(row.consignor.id)}
                                                    aria-label={`Select ${getConsignorDisplayName(row.consignor)}`}
                                                    className="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-primary)]"
                                                />
                                            </td>
                                            <td className="px-4 py-3">
                                                <p className="font-medium text-[var(--color-foreground)]">
                                                    {getConsignorDisplayName(row.consignor)}
                                                </p>
                                                <p className="text-xs text-[var(--color-muted)]">
                                                    {row.consignor.consignor_number} · Pay To: {getConsignorPayToName(row.consignor)}
                                                </p>
                                            </td>
                                            <td className="px-4 py-3">
                                                <Badge variant={row.missingW9 ? 'warning' : 'success'}>
                                                    {row.missingW9 ? 'Missing' : 'On File'}
                                                </Badge>
                                            </td>
                                            <td className="px-4 py-3 text-right">{row.salesTotals.salesCount}</td>
                                            <td className="px-4 py-3 text-right">{formatCurrency(row.salesTotals.grossSales)}</td>
                                            <td className="px-4 py-3 text-right">{formatCurrency(row.salesTotals.consignorEarnings)}</td>
                                            <td className="px-4 py-3 text-right">{row.payoutTotals.payoutCount}</td>
                                            <td className="px-4 py-3 text-right">{formatCurrency(row.payoutTotals.totalPaid)}</td>
                                            <td className="px-4 py-3 text-right">{formatCurrency(row.payoutTotals.totalDeductions)}</td>
                                            <td className="px-4 py-3">
                                                {row.thresholdReview ? (
                                                    <Badge variant="warning">{row.thresholdBasis}</Badge>
                                                ) : (
                                                    <Badge variant="secondary">Below threshold</Badge>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {visibleRows.length === 0 && (
                            <div className="p-8">
                                <EmptyState
                                    title="No consignors found"
                                    description="Adjust the search field to show matching tax report rows."
                                />
                            </div>
                        )}
                    </div>
                </>
            ) : (
                <EmptyState
                    title="No tax report loaded"
                    description="Choose a tax year, then generate a report to review consignor sales and payouts."
                />
            )}
        </div>
    );
}

function SummaryCard({ title, value }: { title: string; value: string }) {
    return (
        <Card variant="outlined" padding="sm">
            <CardHeader className="mb-1">
                <CardTitle className="text-xs font-semibold uppercase text-[var(--color-muted)]">{title}</CardTitle>
            </CardHeader>
            <CardContent>
                <p className="text-xl font-semibold text-[var(--color-foreground)]">{value}</p>
            </CardContent>
        </Card>
    );
}

function DownloadIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <path d="M7 10l5 5 5-5" />
            <path d="M12 15V3" />
        </svg>
    );
}

function PrintIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9V2h12v7" />
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
            <path d="M6 14h12v8H6z" />
        </svg>
    );
}
