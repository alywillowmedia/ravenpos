import { useState, useMemo, useEffect } from 'react';
import { Header } from '../components/layout/Header';
import { Modal, ModalFooter } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { EmptyState } from '../components/ui/EmptyState';
import { usePayouts } from '../hooks/usePayouts';
import { formatCurrency } from '../lib/utils';
import { getConsignorDisplayName, getConsignorPayToName } from '../lib/consignors';
import type { ConsignorPayoutSummary, Payout, BalanceDisposition, VendorLedgerEntry } from '../types';

type ViewMode = 'pending' | 'history';
type DatePreset = 'all' | 'today' | 'yesterday' | 'last7' | 'last30' | 'thisMonth' | 'lastMonth' | 'custom';

function toLocalDateInput(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function parseLocalDateInput(value: string, endOfDay = false): Date {
    const [year, month, day] = value.split('-').map(Number);
    const parsed = new Date(year, month - 1, day);
    if (endOfDay) {
        parsed.setHours(23, 59, 59, 999);
    } else {
        parsed.setHours(0, 0, 0, 0);
    }
    return parsed;
}

export function Payouts() {
    const {
        consignorSummaries,
        payouts,
        unattributedSales,
        isLoading,
        markAsPaid,
        createLedgerEntry,
        getConsignorPayoutHistory,
        getTotals,
        refetch,
    } = usePayouts();

    const [viewMode, setViewMode] = useState<ViewMode>('pending');
    const [selectedConsignor, setSelectedConsignor] = useState<ConsignorPayoutSummary | null>(null);
    const [showPayModal, setShowPayModal] = useState(false);
    const [payoutNotes, setPayoutNotes] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [datePreset, setDatePreset] = useState<DatePreset>('all');
    const [customDateFrom, setCustomDateFrom] = useState(() => toLocalDateInput(new Date()));
    const [customDateTo, setCustomDateTo] = useState(() => toLocalDateInput(new Date()));

    // Custom amount payout state
    const [useCustomAmount, setUseCustomAmount] = useState(false);
    const [customAmount, setCustomAmount] = useState('');
    const [partialReason, setPartialReason] = useState('');
    const [balanceDisposition, setBalanceDisposition] = useState<BalanceDisposition>('deferred');
    const [ledgerDescription, setLedgerDescription] = useState('');
    const [ledgerAmount, setLedgerAmount] = useState('');
    const [ledgerError, setLedgerError] = useState<string | null>(null);
    const [isAddingLedgerItem, setIsAddingLedgerItem] = useState(false);

    const totals = getTotals();
    const dateRange = useMemo(() => {
        const now = new Date();
        switch (datePreset) {
            case 'today': {
                const start = new Date(now);
                start.setHours(0, 0, 0, 0);
                const end = new Date(now);
                end.setHours(23, 59, 59, 999);
                return { start, end };
            }
            case 'yesterday': {
                const start = new Date(now);
                start.setDate(start.getDate() - 1);
                start.setHours(0, 0, 0, 0);
                const end = new Date(start);
                end.setHours(23, 59, 59, 999);
                return { start, end };
            }
            case 'last7': {
                const end = new Date(now);
                end.setHours(23, 59, 59, 999);
                const start = new Date(end);
                start.setDate(end.getDate() - 6);
                start.setHours(0, 0, 0, 0);
                return { start, end };
            }
            case 'last30': {
                const end = new Date(now);
                end.setHours(23, 59, 59, 999);
                const start = new Date(end);
                start.setDate(end.getDate() - 29);
                start.setHours(0, 0, 0, 0);
                return { start, end };
            }
            case 'thisMonth': {
                const start = new Date(now.getFullYear(), now.getMonth(), 1);
                start.setHours(0, 0, 0, 0);
                const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                end.setHours(23, 59, 59, 999);
                return { start, end };
            }
            case 'lastMonth': {
                const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                start.setHours(0, 0, 0, 0);
                const end = new Date(now.getFullYear(), now.getMonth(), 0);
                end.setHours(23, 59, 59, 999);
                return { start, end };
            }
            case 'custom': {
                if (!customDateFrom || !customDateTo) return { start: null, end: null };
                const start = parseLocalDateInput(customDateFrom);
                const end = parseLocalDateInput(customDateTo, true);
                if (start > end) return { start: null, end: null };
                return { start, end };
            }
            case 'all':
            default:
                return { start: null, end: null };
        }
    }, [datePreset, customDateFrom, customDateTo]);

    const matchesDateRange = (dateValue: string) => {
        const targetDate = new Date(dateValue);
        if (dateRange.start && targetDate < dateRange.start) return false;
        if (dateRange.end && targetDate > dateRange.end) return false;
        return true;
    };

    const roundCurrency = (value: number) => Number(value.toFixed(2));
    const isDateScopedPendingView = Boolean(dateRange.start || dateRange.end);
    const selectedRangeLabel = (dateRange.start && dateRange.end)
        ? `${dateRange.start.toLocaleDateString()} - ${dateRange.end.toLocaleDateString()}`
        : 'All Time';

    // Filter consignors by search
    const filteredSummaries = useMemo(() => {
        if (!searchQuery) return consignorSummaries;
        const query = searchQuery.toLowerCase();
        return consignorSummaries.filter(
            (s) =>
                s.consignor.name.toLowerCase().includes(query) ||
                getConsignorDisplayName(s.consignor).toLowerCase().includes(query) ||
                s.consignor.consignor_number.toLowerCase().includes(query)
        );
    }, [consignorSummaries, searchQuery]);

    // Summaries to display in pending view:
    // include vendors that are owed money OR had sales activity (even if amount due is $0.00).
    const pendingDisplaySummaries = useMemo(
        () => filteredSummaries.filter((s) => s.pendingAmount > 0 || s.salesCount > 0),
        [filteredSummaries]
    );

    const pendingSummariesInRange = useMemo(() => {
        if (!isDateScopedPendingView) return pendingDisplaySummaries;
        const scopedSummaries: ConsignorPayoutSummary[] = [];

        for (const summary of pendingDisplaySummaries) {
            const salesInRange = summary.salesSinceLastPayout.filter((sale) => matchesDateRange(sale.saleDate));
            if (salesInRange.length === 0) continue;

            const salesSet = new Set<string>();
            const deferredBalanceCarryover = Number(summary.deferredBalanceCarryover || 0);
            let pendingFromSales = deferredBalanceCarryover;
            let pendingAmount = deferredBalanceCarryover;
            let grossSales = 0;
            let taxCollected = 0;
            let storeShare = 0;
            let creditCardFees = 0;
            let itemsSold = 0;

            for (const item of salesInRange) {
                const effectiveQuantity = Math.max(0, item.quantity - item.refundedQuantity);
                const effectiveRatio = item.quantity > 0 ? effectiveQuantity / item.quantity : 0;
                const effectiveLineTotal = item.lineTotal * effectiveRatio;
                const effectiveConsignorShare = item.consignorShare * effectiveRatio;
                const effectiveStoreShare = item.storeShare * effectiveRatio;
                const effectiveTax = item.taxAmount * effectiveRatio;
                const effectiveCardFee = item.creditCardFee * effectiveRatio;

                salesSet.add(item.saleId);
                pendingFromSales += effectiveConsignorShare;
                pendingAmount += effectiveConsignorShare;
                grossSales += effectiveLineTotal;
                taxCollected += effectiveTax;
                storeShare += effectiveStoreShare;
                creditCardFees += effectiveCardFee;
                itemsSold += effectiveQuantity;
            }

            const scopedSummary: ConsignorPayoutSummary = {
                ...summary,
                deferredBalanceCarryover: roundCurrency(deferredBalanceCarryover),
                pendingFromSales: roundCurrency(pendingFromSales),
                pendingAmount: roundCurrency(pendingAmount),
                grossSales: roundCurrency(grossSales),
                taxCollected: roundCurrency(taxCollected),
                storeShare: roundCurrency(storeShare),
                creditCardFees: roundCurrency(creditCardFees),
                boothRentDeduction: 0,
                marketingFeeDeduction: 0,
                ledgerDeduction: 0,
                salesCount: salesSet.size,
                itemsSold,
                salesSinceLastPayout: salesInRange,
                boothRentMonthsToDeduct: [] as Array<{ period_month: number; period_year: number }>,
                marketingAllocationIdsToDeduct: [] as string[],
                ledgerEntryIdsToDeduct: [] as string[],
                pendingLedgerEntries: [] as VendorLedgerEntry[],
            };

            scopedSummaries.push(scopedSummary);
        }

        return scopedSummaries;
    }, [isDateScopedPendingView, pendingDisplaySummaries, dateRange.start, dateRange.end]);

    const scopedTotals = useMemo(
        () =>
            pendingSummariesInRange.reduce(
                (acc, summary) => ({
                    totalPending: acc.totalPending + summary.pendingAmount,
                    totalGrossSales: acc.totalGrossSales + summary.grossSales,
                    totalStoreShare: acc.totalStoreShare + summary.storeShare,
                    totalTaxCollected: acc.totalTaxCollected + summary.taxCollected,
                    totalSalesCount: acc.totalSalesCount + summary.salesCount,
                    totalItemsSold: acc.totalItemsSold + summary.itemsSold,
                    consignorsWithPending: acc.consignorsWithPending + (summary.pendingAmount > 0 ? 1 : 0),
                }),
                {
                    totalPending: 0,
                    totalGrossSales: 0,
                    totalStoreShare: 0,
                    totalTaxCollected: 0,
                    totalSalesCount: 0,
                    totalItemsSold: 0,
                    consignorsWithPending: 0,
                }
            ),
        [pendingSummariesInRange]
    );

    const filteredPayoutHistory = useMemo(
        () => payouts.filter((payout) => matchesDateRange(payout.paid_at)),
        [payouts, dateRange.start, dateRange.end]
    );

    const unattributedSalesInRange = useMemo(
        () => unattributedSales.filter((sale) => matchesDateRange(sale.completed_at)),
        [unattributedSales, dateRange.start, dateRange.end]
    );

    useEffect(() => {
        if (!selectedConsignor) return;
        const source = isDateScopedPendingView ? pendingSummariesInRange : pendingDisplaySummaries;
        const refreshed = source.find(
            (summary) => summary.consignor.id === selectedConsignor.consignor.id
        );
        if (refreshed) {
            setSelectedConsignor(refreshed);
        }
    }, [pendingDisplaySummaries, pendingSummariesInRange, isDateScopedPendingView, selectedConsignor]);

    const handleMarkAsPaid = async () => {
        if (!selectedConsignor) return;

        setIsProcessing(true);

        const amountToPay = useCustomAmount && customAmount
            ? parseFloat(customAmount)
            : undefined;
        const includesDeferredCarryover = Number(selectedConsignor.deferredBalanceCarryover || 0) > 0;
        const payoutNotesForRecord = isDateScopedPendingView && dateRange.start && dateRange.end
            ? [
                `[Range Payout: ${selectedRangeLabel}]`,
                includesDeferredCarryover ? '[Deferred Carryover Included]' : '',
                payoutNotes,
            ].filter(Boolean).join(' ')
            : (payoutNotes || undefined);

        const result = await markAsPaid(
            selectedConsignor.consignor.id,
            selectedConsignor,
            payoutNotesForRecord,
            amountToPay,
            useCustomAmount ? partialReason : undefined,
            useCustomAmount ? balanceDisposition : undefined,
            isDateScopedPendingView && dateRange.start && dateRange.end
                ? {
                    periodStartOverride: dateRange.start.toISOString(),
                    periodEndOverride: dateRange.end.toISOString(),
                }
                : undefined
        );

        if (result.success) {
            setShowPayModal(false);
            setSelectedConsignor(null);
            setPayoutNotes('');
            setUseCustomAmount(false);
            setCustomAmount('');
            setPartialReason('');
            setBalanceDisposition('deferred');
            setLedgerDescription('');
            setLedgerAmount('');
            setLedgerError(null);
        }
        setIsProcessing(false);
    };

    const handleAddLedgerItem = async () => {
        if (!selectedConsignor || isAddingLedgerItem) return;

        const amount = Number(ledgerAmount);
        if (!ledgerDescription.trim()) {
            setLedgerError('Please enter a description.');
            return;
        }
        if (!Number.isFinite(amount) || amount <= 0) {
            setLedgerError('Please enter a valid amount greater than 0.');
            return;
        }

        setIsAddingLedgerItem(true);
        setLedgerError(null);

        const result = await createLedgerEntry(
            selectedConsignor.consignor.id,
            ledgerDescription.trim(),
            amount
        );

        if (!result.success) {
            setLedgerError(result.error || 'Failed to add ledger item.');
        } else {
            setLedgerDescription('');
            setLedgerAmount('');
        }

        setIsAddingLedgerItem(false);
    };

    const openPayModal = (summary: ConsignorPayoutSummary) => {
        if (summary.pendingAmount <= 0) return;
        setSelectedConsignor(summary);
        setShowPayModal(true);
    };

    const printPayoutReport = (summary: ConsignorPayoutSummary) => {
        const { consignor, deferredBalanceCarryover, pendingAmount, pendingFromSales, grossSales, storeShare, creditCardFees, boothRentDeduction, marketingFeeDeduction, ledgerDeduction, salesSinceLastPayout, lastPayout } = summary;
        const saleDates = salesSinceLastPayout.map((item) => new Date(item.saleDate).getTime()).filter((value) => Number.isFinite(value));
        const periodStart = saleDates.length > 0
            ? new Date(Math.min(...saleDates)).toLocaleDateString()
            : (lastPayout ? new Date(lastPayout.period_end || lastPayout.paid_at).toLocaleDateString() : 'Start');
        const periodEnd = saleDates.length > 0
            ? new Date(Math.max(...saleDates)).toLocaleDateString()
            : new Date().toLocaleDateString();
        const consignorAddress = [
            consignor.address,
            consignor.address_line_2,
            [consignor.city, consignor.state, consignor.postal_code].filter(Boolean).join(' '),
            consignor.country,
        ].filter(Boolean).join(', ');

        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Payout Report - ${getConsignorDisplayName(consignor)}</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { font-family: 'Courier New', monospace; font-size: 10px; padding: 20px; }
                    .header { margin-bottom: 15px; }
                    .header h1 { font-size: 12px; font-weight: bold; margin-bottom: 5px; }
                    .header p { font-size: 10px; }
                    .store-info { margin-bottom: 10px; }
                    table { width: 100%; border-collapse: collapse; font-size: 9px; }
                    th, td { padding: 3px 5px; text-align: left; border-bottom: 1px solid #ddd; }
                    th { background: #f5f5f5; font-weight: bold; }
                    .text-right { text-align: right; }
                    .text-center { text-align: center; }
                    .summary { margin-top: 15px; border-top: 2px solid #000; padding-top: 10px; }
                    .summary-row { display: flex; justify-content: space-between; padding: 2px 0; }
                    .summary-row.total { font-weight: bold; border-top: 1px solid #000; margin-top: 5px; padding-top: 5px; }
                    .summary-row.deduction { color: #666; }
                    .footer { margin-top: 20px; font-size: 8px; color: #666; }
                    @media print {
                        body { padding: 10px; }
                        @page { margin: 0.5in; }
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>Sales Summary for Consignor ${consignor.consignor_number} for Period ${periodStart} - ${periodEnd}</h1>
                </div>
                <div class="store-info">
                    <strong>${getConsignorDisplayName(consignor)}</strong><br>
                    Pay To: ${getConsignorPayToName(consignor)}<br>
                    ${consignor.email || ''}<br>
                    ${consignorAddress || ''}<br>
                    Commission: ${Math.round(consignor.commission_split * 100)}%
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>SKU</th>
                            <th>Item Description</th>
                            <th class="text-right">Unit Price</th>
                            <th class="text-center">Qty</th>
                            <th class="text-right">Extnd Price</th>
                            <th class="text-center">Com%</th>
                            <th class="text-right">Consignor</th>
                            ${creditCardFees > 0 ? '<th class="text-right">CC Fee</th>' : ''}
                        </tr>
                    </thead>
                    <tbody>
                        ${salesSinceLastPayout.map(item => {
                            const effectiveQuantity = Math.max(0, item.quantity - item.refundedQuantity);
                            if (effectiveQuantity <= 0) return '';
                            const effectiveRatio = item.quantity > 0 ? effectiveQuantity / item.quantity : 0;
                            const effectiveLineTotal = item.lineTotal * effectiveRatio;
                            const effectiveConsignorShare = item.consignorShare * effectiveRatio;
                            const effectiveCreditCardFee = item.creditCardFee * effectiveRatio;

                            return `
                                <tr>
                                    <td>${new Date(item.saleDate).toLocaleDateString()}</td>
                                    <td>${item.sku}</td>
                                    <td>${item.itemName}</td>
                                    <td class="text-right">$${item.price.toFixed(2)}</td>
                                    <td class="text-center">${effectiveQuantity}</td>
                                    <td class="text-right">$${effectiveLineTotal.toFixed(2)}</td>
                                    <td class="text-center">${Math.round(item.commissionSplit * 100)}%</td>
                                    <td class="text-right">$${effectiveConsignorShare.toFixed(2)}</td>
                                    ${creditCardFees > 0 ? `<td class="text-right">${effectiveCreditCardFee > 0 ? '-$' + effectiveCreditCardFee.toFixed(2) : '-'}</td>` : ''}
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
                <div class="summary">
                    <div class="summary-row">
                        <span>Gross Sales:</span>
                        <span>$${grossSales.toFixed(2)}</span>
                    </div>
                    <div class="summary-row deduction">
                        <span>Store Share (${Math.round((1 - consignor.commission_split) * 100)}%):</span>
                        <span>-$${storeShare.toFixed(2)}</span>
                    </div>
                    ${creditCardFees > 0 ? `
                    <div class="summary-row deduction">
                        <span>Credit Card Fees:</span>
                        <span>-$${creditCardFees.toFixed(2)}</span>
                    </div>
                    ` : ''}
                    ${deferredBalanceCarryover > 0 ? `
                    <div class="summary-row">
                        <span>Deferred Balance Carryover:</span>
                        <span>$${deferredBalanceCarryover.toFixed(2)}</span>
                    </div>
                    ` : ''}
                    ${boothRentDeduction > 0 ? `
                    <div class="summary-row deduction">
                        <span>Booth Rent:</span>
                        <span>-$${boothRentDeduction.toFixed(2)}</span>
                    </div>
                    ` : ''}
                    ${marketingFeeDeduction > 0 ? `
                    <div class="summary-row deduction">
                        <span>Marketing Fees:</span>
                        <span>-$${marketingFeeDeduction.toFixed(2)}</span>
                    </div>
                    ` : ''}
                    ${ledgerDeduction > 0 ? `
                    <div class="summary-row deduction">
                        <span>Ledger Deductions:</span>
                        <span>-$${ledgerDeduction.toFixed(2)}</span>
                    </div>
                    ` : ''}
                    <div class="summary-row total">
                        <span>Amount Due to Consignor (${pendingFromSales.toFixed(2)} - deductions):</span>
                        <span>$${pendingAmount.toFixed(2)}</span>
                    </div>
                </div>
                <div class="footer">
                    <p>Generated: ${new Date().toLocaleString()}</p>
                    <p>Items: ${salesSinceLastPayout.filter(i => (i.quantity - i.refundedQuantity) > 0).length} | Total Qty: ${salesSinceLastPayout.reduce((s, i) => s + Math.max(0, i.quantity - i.refundedQuantity), 0)}</p>
                </div>
            </body>
            </html>
        `;

        const printWindow = window.open('', '_blank');
        if (printWindow) {
            printWindow.document.write(html);
            printWindow.document.close();
            printWindow.onload = () => {
                printWindow.print();
            };
        }
    };

    return (
        <div className="animate-fadeIn">
            <Header
                title="Payouts"
                description="Manage consignor payments and view financial summaries"
            />

            {/* View Toggle & Search */}
            <div className="flex flex-wrap items-center gap-4 mb-6">
                <div className="flex rounded-lg border border-[var(--color-border)] overflow-hidden">
                    <button
                        onClick={() => setViewMode('pending')}
                        className={`px-4 py-2 text-sm font-medium transition-colors ${viewMode === 'pending'
                            ? 'bg-[var(--color-primary)] text-white'
                            : 'bg-[var(--color-surface-elevated)] text-[var(--color-muted)] hover:bg-[var(--color-surface)]'
                            }`}
                    >
                        Pending Payouts
                    </button>
                    <button
                        onClick={() => setViewMode('history')}
                        className={`px-4 py-2 text-sm font-medium transition-colors ${viewMode === 'history'
                            ? 'bg-[var(--color-primary)] text-white'
                            : 'bg-[var(--color-surface-elevated)] text-[var(--color-muted)] hover:bg-[var(--color-surface)]'
                            }`}
                    >
                        Payout History
                    </button>
                </div>

                <div className="flex-1 max-w-xs">
                    <Input
                        placeholder="Search consignors..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        inputSize="sm"
                        leftIcon={<SearchIcon />}
                    />
                </div>

                <select
                    value={datePreset}
                    onChange={(e) => setDatePreset(e.target.value as DatePreset)}
                    className="h-9 min-w-[170px] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 text-sm"
                >
                    <option value="all">All Time</option>
                    <option value="today">Today</option>
                    <option value="yesterday">Yesterday</option>
                    <option value="last7">Last 7 Days</option>
                    <option value="last30">Last 30 Days</option>
                    <option value="thisMonth">This Month</option>
                    <option value="lastMonth">Last Month</option>
                    <option value="custom">Custom Range</option>
                </select>

                {datePreset === 'custom' && (
                    <>
                        <input
                            type="date"
                            value={customDateFrom}
                            onChange={(e) => setCustomDateFrom(e.target.value)}
                            max={customDateTo || undefined}
                            className="h-9 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 text-sm"
                        />
                        <input
                            type="date"
                            value={customDateTo}
                            onChange={(e) => setCustomDateTo(e.target.value)}
                            min={customDateFrom || undefined}
                            className="h-9 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 text-sm"
                        />
                    </>
                )}

                {datePreset !== 'all' && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                            setDatePreset('all');
                            const today = toLocalDateInput(new Date());
                            setCustomDateFrom(today);
                            setCustomDateTo(today);
                        }}
                    >
                        Clear Dates
                    </Button>
                )}
                {selectedRangeLabel !== 'All Time' && (
                    <p className="w-full text-xs text-[var(--color-muted)]">
                        Selected range: {selectedRangeLabel}
                    </p>
                )}
                {isDateScopedPendingView && viewMode === 'pending' && (
                    <p className="text-xs text-[var(--color-muted)]">
                        Range mode: amounts and payouts apply only to {selectedRangeLabel}.
                    </p>
                )}

                <Button variant="secondary" size="sm" onClick={() => refetch()}>
                    <RefreshIcon />
                    Refresh
                </Button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
                <SummaryCard
                    label={isDateScopedPendingView ? 'Total Pending (Range)' : 'Total Pending'}
                    value={formatCurrency(isDateScopedPendingView ? scopedTotals.totalPending : totals.totalPending)}
                    variant="warning"
                />
                <SummaryCard
                    label="Consignors Due"
                    value={(isDateScopedPendingView ? scopedTotals.consignorsWithPending : totals.consignorsWithPending).toString()}
                />
                <SummaryCard
                    label="Gross Sales"
                    value={formatCurrency(isDateScopedPendingView ? scopedTotals.totalGrossSales : totals.totalGrossSales)}
                />
                <SummaryCard
                    label="Store Revenue"
                    value={formatCurrency(isDateScopedPendingView ? scopedTotals.totalStoreShare : totals.totalStoreShare)}
                    variant="primary"
                />
                <SummaryCard
                    label="Tax Collected"
                    value={formatCurrency(isDateScopedPendingView ? scopedTotals.totalTaxCollected : totals.totalTaxCollected)}
                />
                <SummaryCard
                    label="Items Sold"
                    value={(isDateScopedPendingView ? scopedTotals.totalItemsSold : totals.totalItemsSold).toString()}
                />
            </div>

            {unattributedSalesInRange.length > 0 && (
                <div className="mb-6 rounded-xl border border-[var(--color-warning)] bg-[var(--color-warning-bg)] p-4">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div>
                            <p className="font-semibold text-[var(--color-warning)]">
                                {unattributedSalesInRange.length} recent sale{unattributedSalesInRange.length === 1 ? '' : 's'} cannot be included in payouts
                            </p>
                            <p className="text-sm text-[var(--color-muted)]">
                                These transactions do not have sale item rows attached, so there is no consignor to pay yet.
                            </p>
                        </div>
                        <div className="text-sm text-[var(--color-warning)] font-semibold">
                            {formatCurrency(unattributedSalesInRange.reduce((sum, sale) => sum + Number(sale.subtotal || 0), 0))}
                        </div>
                    </div>
                    <div className="mt-3 max-h-80 overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-card)]/70">
                        <table className="w-full text-sm">
                            <thead className="sticky top-0 bg-[var(--color-card)]">
                                <tr>
                                    <th className="px-3 py-2 text-left font-medium text-[var(--color-muted)]">Sale ID</th>
                                    <th className="px-3 py-2 text-left font-medium text-[var(--color-muted)]">Completed</th>
                                    <th className="px-3 py-2 text-left font-medium text-[var(--color-muted)]">Method</th>
                                    <th className="px-3 py-2 text-right font-medium text-[var(--color-muted)]">Subtotal</th>
                                    <th className="px-3 py-2 text-right font-medium text-[var(--color-muted)]">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {unattributedSalesInRange.map((sale) => (
                                    <tr key={sale.id} className="border-t border-[var(--color-border)]">
                                        <td className="px-3 py-2 font-mono text-xs text-[var(--color-muted)]">
                                            {sale.id}
                                        </td>
                                        <td className="px-3 py-2 whitespace-nowrap">
                                            {new Date(sale.completed_at).toLocaleString()}
                                        </td>
                                        <td className="px-3 py-2 capitalize">
                                            {sale.payment_method}
                                        </td>
                                        <td className="px-3 py-2 text-right font-semibold">
                                            {formatCurrency(Number(sale.subtotal || 0))}
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                            {formatCurrency(Number(sale.total || 0))}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Content */}
            {isLoading ? (
                <div className="flex justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--color-primary)]" />
                </div>
            ) : viewMode === 'pending' ? (
                pendingSummariesInRange.length === 0 ? (
                    <EmptyState
                        icon={<CheckCircleIcon />}
                        title="All caught up!"
                        description={
                            searchQuery
                                ? 'No consignors match your search.'
                                : datePreset !== 'all'
                                    ? 'No consignors had sales activity in this date range.'
                                    : 'No consignors currently have recent sales activity.'
                        }
                    />
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {pendingSummariesInRange.map((summary) => (
                            <ConsignorPayoutRow
                                key={summary.consignor.id}
                                summary={summary}
                                onViewDetails={() => setSelectedConsignor(summary)}
                                onMarkAsPaid={() => openPayModal(summary)}
                            />
                        ))}
                    </div>
                )
            ) : (
                <PayoutHistoryList
                    payouts={filteredPayoutHistory}
                    searchQuery={searchQuery}
                />
            )}

            {/* Consignor Detail Modal */}
            <Modal
                isOpen={!!selectedConsignor && !showPayModal}
                onClose={() => {
                    setSelectedConsignor(null);
                    setLedgerDescription('');
                    setLedgerAmount('');
                    setLedgerError(null);
                }}
                title={`Payout Details: ${selectedConsignor ? getConsignorDisplayName(selectedConsignor.consignor) : ''}`}
                size="3xl"
            >
                {selectedConsignor && (
                    <div className="space-y-4">
                        <ConsignorPayoutDetail
                            summary={selectedConsignor}
                            payoutHistory={getConsignorPayoutHistory(selectedConsignor.consignor.id)}
                            isDateScoped={isDateScopedPendingView}
                            selectedRangeLabel={selectedRangeLabel}
                        />
                        <LedgerManager
                            pendingEntries={selectedConsignor.pendingLedgerEntries}
                            description={ledgerDescription}
                            amount={ledgerAmount}
                            error={ledgerError}
                            isSubmitting={isAddingLedgerItem}
                            totalPendingDeduction={selectedConsignor.ledgerDeduction}
                            onDescriptionChange={setLedgerDescription}
                            onAmountChange={setLedgerAmount}
                            onSubmit={handleAddLedgerItem}
                        />
                    </div>
                )}
                <ModalFooter>
                    <Button
                        variant="secondary"
                        onClick={() => {
                            setSelectedConsignor(null);
                            setLedgerDescription('');
                            setLedgerAmount('');
                            setLedgerError(null);
                        }}
                    >
                        Close
                    </Button>
                    {selectedConsignor && (
                        <Button variant="secondary" onClick={() => printPayoutReport(selectedConsignor)}>
                            <PrintIcon />
                            Print Report
                        </Button>
                    )}
                    {selectedConsignor && selectedConsignor.pendingAmount > 0 && (
                        <Button variant="success" onClick={() => setShowPayModal(true)}>
                            <DollarIcon />
                            Mark as Paid
                        </Button>
                    )}
                </ModalFooter>
            </Modal>

            {/* Mark as Paid Confirmation Modal */}
            <Modal
                isOpen={showPayModal}
                onClose={() => {
                    setShowPayModal(false);
                    setPayoutNotes('');
                    setUseCustomAmount(false);
                    setCustomAmount('');
                    setPartialReason('');
                    setBalanceDisposition('deferred');
                }}
                title="Confirm Payout"
                size="md"
            >
                {selectedConsignor && (
                    <div className="space-y-6">
                        <div className="bg-[var(--color-surface)] rounded-lg p-4">
                            <p className="text-sm text-[var(--color-muted)] mb-1">
                                Paying out to
                            </p>
                            <p className="font-semibold text-lg">
                                {getConsignorDisplayName(selectedConsignor.consignor)}
                            </p>
                            <p className="text-sm text-[var(--color-muted)]">
                                {selectedConsignor.consignor.consignor_number}
                            </p>
                            <p className="text-sm text-[var(--color-muted)]">
                                Check Payable To: {getConsignorPayToName(selectedConsignor.consignor)}
                            </p>
                            <p className="text-sm text-[var(--color-muted)]">
                                W-9 On File: {selectedConsignor.consignor.has_w9_filled_out ? 'Yes' : 'No'}
                            </p>
                            <p className="text-sm text-[var(--color-muted)]">
                                Payout Period: <span className="font-medium text-[var(--color-foreground)]">{selectedRangeLabel}</span>
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className={`rounded-lg p-4 border ${useCustomAmount ? 'bg-[var(--color-surface)] border-[var(--color-border)]' : 'bg-[var(--color-success-bg)] border-[var(--color-success)]'}`}>
                                <p className={`text-sm mb-1 ${useCustomAmount ? 'text-[var(--color-muted)]' : 'text-[var(--color-success)]'}`}>
                                    Amount Due
                                </p>
                                <p className={`text-2xl font-bold ${useCustomAmount ? 'text-[var(--color-muted)] line-through' : 'text-[var(--color-success)]'}`}>
                                    {formatCurrency(selectedConsignor.pendingAmount)}
                                </p>
                            </div>
                            <div className="bg-[var(--color-surface)] rounded-lg p-4">
                                <p className="text-sm text-[var(--color-muted)] mb-1">
                                    Items Sold
                                </p>
                                <p className="text-2xl font-bold">
                                    {selectedConsignor.itemsSold}
                                </p>
                            </div>
                        </div>
                        {(selectedConsignor.boothRentDeduction > 0 || selectedConsignor.marketingFeeDeduction > 0 || selectedConsignor.ledgerDeduction > 0) && (
                            <div className="rounded-lg p-3 bg-[var(--color-surface)] border border-[var(--color-border)] text-sm space-y-1">
                                <div className="flex justify-between">
                                    <span className="text-[var(--color-muted)]">Before Deductions</span>
                                    <span>{formatCurrency(selectedConsignor.pendingFromSales)}</span>
                                </div>
                                {selectedConsignor.boothRentDeduction > 0 && (
                                    <div className="flex justify-between text-[var(--color-warning)]">
                                        <span>Booth Rent</span>
                                        <span>-{formatCurrency(selectedConsignor.boothRentDeduction)}</span>
                                    </div>
                                )}
                                {selectedConsignor.marketingFeeDeduction > 0 && (
                                    <div className="flex justify-between text-[var(--color-warning)]">
                                        <span>Marketing Fees</span>
                                        <span>-{formatCurrency(selectedConsignor.marketingFeeDeduction)}</span>
                                    </div>
                                )}
                                {selectedConsignor.ledgerDeduction > 0 && (
                                    <div className="flex justify-between text-[var(--color-warning)]">
                                        <span>Ledger Deductions</span>
                                        <span>-{formatCurrency(selectedConsignor.ledgerDeduction)}</span>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Custom Amount Toggle */}
                        <div className="flex items-center gap-3">
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={useCustomAmount}
                                    onChange={(e) => {
                                        setUseCustomAmount(e.target.checked);
                                        if (!e.target.checked) {
                                            setCustomAmount('');
                                            setPartialReason('');
                                            setBalanceDisposition('deferred');
                                        }
                                    }}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-[var(--color-border)] peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[var(--color-primary)]/20 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[var(--color-card)] after:border-[var(--color-border)] after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--color-primary)]"></div>
                            </label>
                            <span className="text-sm font-medium">Pay a custom amount</span>
                        </div>

                        {/* Custom Amount Fields */}
                        {useCustomAmount && (
                            <div className="space-y-4 p-4 bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)]">
                                <div>
                                    <label className="block text-sm font-medium mb-1">
                                        Custom Payout Amount
                                    </label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]">$</span>
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            max={selectedConsignor.pendingAmount}
                                            value={customAmount}
                                            onChange={(e) => setCustomAmount(e.target.value)}
                                            placeholder={selectedConsignor.pendingAmount.toFixed(2)}
                                            className="w-full pl-7 pr-3 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)]"
                                        />
                                    </div>
                                    {customAmount && parseFloat(customAmount) < selectedConsignor.pendingAmount && (
                                        <p className="text-xs text-[var(--color-muted)] mt-1">
                                            Remaining balance: {formatCurrency(selectedConsignor.pendingAmount - parseFloat(customAmount))}
                                        </p>
                                    )}
                                </div>

                                <div>
                                    <label className="block text-sm font-medium mb-1">
                                        Reason for Partial Payment
                                    </label>
                                    <textarea
                                        value={partialReason}
                                        onChange={(e) => setPartialReason(e.target.value)}
                                        placeholder="Explain why only this amount is being paid..."
                                        rows={2}
                                        className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)] resize-none"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium mb-2">
                                        What happens to the remaining balance?
                                    </label>
                                    <div className="space-y-2">
                                        <label className="flex items-start gap-3 p-3 rounded-lg border border-[var(--color-border)] cursor-pointer hover:bg-[var(--color-surface-hover)] transition-colors">
                                            <input
                                                type="radio"
                                                name="balanceDisposition"
                                                value="deferred"
                                                checked={balanceDisposition === 'deferred'}
                                                onChange={() => setBalanceDisposition('deferred')}
                                                className="mt-0.5"
                                            />
                                            <div>
                                                <p className="font-medium text-sm">Deferred to future payout</p>
                                                <p className="text-xs text-[var(--color-muted)]">
                                                    The remaining balance will still be owed and included in the next payout
                                                </p>
                                            </div>
                                        </label>
                                        <label className="flex items-start gap-3 p-3 rounded-lg border border-[var(--color-border)] cursor-pointer hover:bg-[var(--color-surface-hover)] transition-colors">
                                            <input
                                                type="radio"
                                                name="balanceDisposition"
                                                value="forgiven"
                                                checked={balanceDisposition === 'forgiven'}
                                                onChange={() => setBalanceDisposition('forgiven')}
                                                className="mt-0.5"
                                            />
                                            <div>
                                                <p className="font-medium text-sm">Forgiven / Removed</p>
                                                <p className="text-xs text-[var(--color-muted)]">
                                                    The remaining balance is written off and won't be owed
                                                </p>
                                            </div>
                                        </label>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div>
                            <Input
                                label="Notes (optional)"
                                placeholder="Check #, payment method, etc."
                                value={payoutNotes}
                                onChange={(e) => setPayoutNotes(e.target.value)}
                            />
                        </div>

                        <div className="bg-[var(--color-warning-bg)] rounded-lg p-4 border border-[var(--color-warning)]">
                            <p className="text-sm text-[var(--color-warning)] font-medium">
                                {isDateScopedPendingView
                                    ? `This payout is scoped to ${selectedRangeLabel}. If the range extends past right now, the recorded coverage will stop at the current time so later sales can still appear.`
                                    : useCustomAmount && balanceDisposition === 'forgiven'
                                    ? 'This will record a partial payout and forgive the remaining balance. The forgiven amount will not be owed to the consignor.'
                                    : useCustomAmount && balanceDisposition === 'deferred'
                                    ? 'This will record a partial payout. The remaining balance will still be owed and appear in the next payout period.'
                                    : 'This will record the payout and reset this consignor\'s pending balance. Make sure you have issued payment before confirming.'}
                            </p>
                        </div>
                    </div>
                )}
                <ModalFooter>
                    <Button
                        variant="secondary"
                        onClick={() => {
                            setShowPayModal(false);
                            setPayoutNotes('');
                            setUseCustomAmount(false);
                            setCustomAmount('');
                            setPartialReason('');
                            setBalanceDisposition('deferred');
                        }}
                        disabled={isProcessing}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="success"
                        onClick={handleMarkAsPaid}
                        disabled={isProcessing || (useCustomAmount && (!customAmount || parseFloat(customAmount) <= 0))}
                    >
                        {isProcessing ? 'Processing...' : `Confirm Payout${useCustomAmount && customAmount ? ` (${formatCurrency(parseFloat(customAmount))})` : ''}`}
                    </Button>
                </ModalFooter>
            </Modal>
        </div>
    );
}

// Individual Consignor Payout Row
function ConsignorPayoutRow({
    summary,
    onViewDetails,
    onMarkAsPaid,
}: {
    summary: ConsignorPayoutSummary;
    onViewDetails: () => void;
    onMarkAsPaid: () => void;
}) {
    const { consignor, pendingAmount, grossSales, storeShare, salesCount, itemsSold, lastPayout } = summary;

    return (
        <div className="bg-[var(--color-card)] rounded-xl border border-[var(--color-border)] p-4 h-full flex flex-col">
            <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-[var(--color-primary)] text-white flex items-center justify-center font-semibold">
                    {getConsignorDisplayName(consignor).charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                    <p className="font-semibold truncate">{getConsignorDisplayName(consignor)}</p>
                    <p className="text-sm text-[var(--color-muted)] truncate">
                        {consignor.consignor_number}
                        {consignor.booth_location && ` - ${consignor.booth_location}`}
                    </p>
                    <p className="text-xs text-[var(--color-muted)] truncate">
                        Check Payable To: {getConsignorPayToName(consignor)}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm mb-4">
                <div className="rounded-lg bg-[var(--color-surface)] p-2">
                    <p className="text-[var(--color-muted)] text-xs">Sales</p>
                    <p className="font-medium">{salesCount}</p>
                </div>
                <div className="rounded-lg bg-[var(--color-surface)] p-2">
                    <p className="text-[var(--color-muted)] text-xs">Items</p>
                    <p className="font-medium">{itemsSold}</p>
                </div>
                <div className="rounded-lg bg-[var(--color-surface)] p-2">
                    <p className="text-[var(--color-muted)] text-xs">Gross</p>
                    <p className="font-medium">{formatCurrency(grossSales)}</p>
                </div>
                <div className="rounded-lg bg-[var(--color-surface)] p-2">
                    <p className="text-[var(--color-muted)] text-xs">Store</p>
                    <p className="font-medium">{formatCurrency(storeShare)}</p>
                </div>
            </div>

            <div className="mt-auto">
                <div className="flex items-end justify-between mb-3">
                    <div>
                        <p className="text-xs text-[var(--color-muted)]">Last Paid</p>
                        <p className="text-sm font-medium">
                            {lastPayout
                                ? new Date(lastPayout.paid_at).toLocaleDateString()
                                : 'Never'}
                        </p>
                    </div>
                    <div className="text-right">
                        <p className="text-xs text-[var(--color-muted)]">Amount Due</p>
                        <p className={`text-xl font-bold ${pendingAmount > 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-muted)]'}`}>
                            {formatCurrency(pendingAmount)}
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <Button variant="secondary" size="sm" onClick={onViewDetails} className="w-full justify-center">
                        Details
                    </Button>
                    <Button
                        variant={pendingAmount > 0 ? 'success' : 'secondary'}
                        size="sm"
                        onClick={onMarkAsPaid}
                        disabled={pendingAmount <= 0}
                        className="w-full justify-center"
                    >
                        <DollarIcon />
                        {pendingAmount > 0 ? 'Pay' : 'Paid Up'}
                    </Button>
                </div>
            </div>
        </div>
    );
}

// Consignor Payout Detail View
function ConsignorPayoutDetail({
    summary,
    payoutHistory,
    isDateScoped,
    selectedRangeLabel,
}: {
    summary: ConsignorPayoutSummary;
    payoutHistory: Payout[];
    isDateScoped: boolean;
    selectedRangeLabel: string;
}) {
    const { consignor, deferredBalanceCarryover, pendingAmount, pendingFromSales, grossSales, taxCollected, storeShare, creditCardFees, boothRentDeduction, marketingFeeDeduction, ledgerDeduction, salesCount, itemsSold, salesSinceLastPayout } = summary;
    const consignorAddress = [
        consignor.address,
        consignor.address_line_2,
        [consignor.city, consignor.state, consignor.postal_code].filter(Boolean).join(' '),
        consignor.country,
    ].filter(Boolean).join(', ');

    return (
        <div className="space-y-4">
            {/* Consignor Info - More compact header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[var(--color-primary)] text-white flex items-center justify-center text-lg font-semibold flex-shrink-0">
                        {getConsignorDisplayName(consignor).charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <h3 className="font-semibold">{getConsignorDisplayName(consignor)}</h3>
                        <p className="text-xs text-[var(--color-muted)]">
                            {consignor.consignor_number}
                        </p>
                    </div>
                </div>
                <Badge variant={pendingAmount > 0 ? 'warning' : 'success'}>
                    {pendingAmount > 0 ? 'Payment Due' : 'Paid Up'}
                </Badge>
            </div>

            {/* Contact info - inline */}
            <div className="text-xs text-[var(--color-muted)] space-y-1">
                <p>Check Payable To: {getConsignorPayToName(consignor)}</p>
                <p>W-9 On File: {consignor.has_w9_filled_out ? 'Yes' : 'No'}</p>
                {(consignor.email || consignorAddress) && (
                    <p>
                        {consignor.email && <span>{consignor.email}</span>}
                        {consignor.email && consignorAddress && <span> • </span>}
                        {consignorAddress && <span>{consignorAddress}</span>}
                    </p>
                )}
            </div>

            {/* Financial Summary - More compact grid */}
            <div className="grid grid-cols-3 gap-3">
                <div className="bg-[var(--color-success-bg)] rounded-lg p-3 border border-[var(--color-success)]">
                    <p className="text-xs text-[var(--color-success)]">Consignor Payout</p>
                    <p className="text-xl font-bold text-[var(--color-success)]">
                        {formatCurrency(pendingAmount)}
                    </p>
                </div>
                <div className="bg-[var(--color-surface)] rounded-lg p-3">
                    <p className="text-xs text-[var(--color-muted)]">Gross Sales</p>
                    <p className="text-xl font-bold">{formatCurrency(grossSales)}</p>
                </div>
                <div className="bg-[var(--color-surface)] rounded-lg p-3">
                    <p className="text-xs text-[var(--color-muted)]">Store Revenue</p>
                    <p className="text-xl font-bold text-[var(--color-primary)]">
                        {formatCurrency(storeShare)}
                    </p>
                </div>
            </div>
            {deferredBalanceCarryover > 0 && (
                <div className="rounded-lg border border-[var(--color-warning)] bg-[var(--color-warning-bg)] p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                        <span className="font-medium text-[var(--color-warning)]">
                            Deferred balance from earlier partial payout
                        </span>
                        <span className="font-semibold text-[var(--color-warning)]">
                            {formatCurrency(deferredBalanceCarryover)}
                        </span>
                    </div>
                    {isDateScoped && (
                        <p className="mt-1 text-xs text-[var(--color-muted)]">
                            Included with this scoped payout so the earlier unpaid balance is not dropped.
                        </p>
                    )}
                </div>
            )}
            {(boothRentDeduction > 0 || marketingFeeDeduction > 0 || ledgerDeduction > 0) && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-[var(--color-surface)] rounded-lg p-3">
                        <p className="text-xs text-[var(--color-muted)]">Before Deductions</p>
                        <p className="text-xl font-bold">{formatCurrency(pendingFromSales)}</p>
                    </div>
                    {boothRentDeduction > 0 && (
                        <div className="bg-[var(--color-warning-bg)] rounded-lg p-3 border border-[var(--color-warning)]">
                            <p className="text-xs text-[var(--color-warning)]">Booth Rent Deducted</p>
                            <p className="text-xl font-bold text-[var(--color-warning)]">
                                -{formatCurrency(boothRentDeduction)}
                            </p>
                        </div>
                    )}
                    {marketingFeeDeduction > 0 && (
                        <div className="bg-[var(--color-warning-bg)] rounded-lg p-3 border border-[var(--color-warning)]">
                            <p className="text-xs text-[var(--color-warning)]">Marketing Deducted</p>
                            <p className="text-xl font-bold text-[var(--color-warning)]">
                                -{formatCurrency(marketingFeeDeduction)}
                            </p>
                        </div>
                    )}
                    {ledgerDeduction > 0 && (
                        <div className="bg-[var(--color-warning-bg)] rounded-lg p-3 border border-[var(--color-warning)]">
                            <p className="text-xs text-[var(--color-warning)]">Ledger Deducted</p>
                            <p className="text-xl font-bold text-[var(--color-warning)]">
                                -{formatCurrency(ledgerDeduction)}
                            </p>
                        </div>
                    )}
                </div>
            )}
            <div className="grid grid-cols-4 gap-3">
                <div className="bg-[var(--color-surface)] rounded-lg p-3">
                    <p className="text-xs text-[var(--color-muted)]">Tax Collected</p>
                    <p className="text-xl font-bold">{formatCurrency(taxCollected)}</p>
                </div>
                <div className="bg-[var(--color-surface)] rounded-lg p-3">
                    <p className="text-xs text-[var(--color-muted)]">Transactions</p>
                    <p className="text-xl font-bold">{salesCount}</p>
                </div>
                <div className="bg-[var(--color-surface)] rounded-lg p-3">
                    <p className="text-xs text-[var(--color-muted)]">Items Sold</p>
                    <p className="text-xl font-bold">{itemsSold}</p>
                </div>
                {creditCardFees > 0 && (
                    <div className="bg-[var(--color-warning-bg)] rounded-lg p-3 border border-[var(--color-warning)]">
                        <p className="text-xs text-[var(--color-warning)]">Card Fees</p>
                        <p className="text-xl font-bold text-[var(--color-warning)]">
                            -{formatCurrency(creditCardFees)}
                        </p>
                    </div>
                )}
            </div>

            {/* Commission Info - Compact inline */}
            <div className="bg-[var(--color-surface)] rounded-lg px-3 py-2 flex items-center justify-between">
                <p className="text-xs text-[var(--color-muted)]">Commission Split</p>
                <p className="text-sm font-medium">
                    {Math.round(consignor.commission_split * 100)}% to consignor, {Math.round((1 - consignor.commission_split) * 100)}% to store
                </p>
            </div>
            <div className="bg-[var(--color-surface)] rounded-lg px-3 py-2 flex items-center justify-between">
                <p className="text-xs text-[var(--color-muted)]">Payout Period</p>
                <p className="text-sm font-medium">{selectedRangeLabel}</p>
            </div>

            {/* Sales Details Table */}
            {salesSinceLastPayout.length > 0 && (
                <div>
                    <h4 className="font-medium text-sm mb-2">
                        {isDateScoped ? 'Sales In Selected Range' : 'Sales Since Last Payout'} ({salesSinceLastPayout.length} items)
                    </h4>
                    <div className="rounded-lg border border-[var(--color-border)] overflow-hidden max-h-64 overflow-y-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-[var(--color-surface)] sticky top-0">
                                <tr>
                                    <th className="text-left px-3 py-2 font-medium">Date</th>
                                    <th className="text-left px-3 py-2 font-medium">Item</th>
                                    <th className="text-center px-3 py-2 font-medium">Qty</th>
                                    <th className="text-right px-3 py-2 font-medium">Price</th>
                                    <th className="text-right px-3 py-2 font-medium">Total</th>
                                    <th className="text-right px-3 py-2 font-medium">Split</th>
                                    <th className="text-right px-3 py-2 font-medium">Payout</th>
                                </tr>
                            </thead>
                            <tbody>
                                {salesSinceLastPayout.map((item, idx) => {
                                    const effectiveQuantity = Math.max(0, item.quantity - item.refundedQuantity);
                                    const effectiveRatio = item.quantity > 0 ? effectiveQuantity / item.quantity : 0;
                                    const effectivePayout = item.consignorShare * effectiveRatio;

                                    return (
                                        <tr
                                            key={`${item.saleId}-${idx}`}
                                            className={`border-t border-[var(--color-border)] ${item.isRefunded ? 'bg-[var(--color-danger)]/5' : ''}`}
                                        >
                                        <td className="px-3 py-2 text-[var(--color-muted)]">
                                            {new Date(item.saleDate).toLocaleDateString()}
                                        </td>
                                        <td className="px-3 py-2">
                                            <div className="flex items-center gap-2">
                                                <div>
                                                    <p className={`font-medium ${item.isRefunded ? 'line-through text-[var(--color-muted)]' : ''}`}>
                                                        {item.itemName}
                                                    </p>
                                                    <p className="text-xs text-[var(--color-muted)] font-mono">
                                                        {item.sku}
                                                    </p>
                                                </div>
                                                {item.isRefunded && (
                                                    <Badge variant="danger">Refunded</Badge>
                                                )}
                                                {item.refundedQuantity > 0 && !item.isRefunded && (
                                                    <Badge variant="warning">Partial</Badge>
                                                )}
                                            </div>
                                        </td>
                                        <td className={`px-3 py-2 text-center ${item.isRefunded ? 'line-through text-[var(--color-muted)]' : ''}`}>
                                            {item.quantity}
                                            {item.refundedQuantity > 0 && !item.isRefunded && (
                                                <span className="text-xs text-[var(--color-danger)] block">
                                                    (-{item.refundedQuantity})
                                                </span>
                                            )}
                                        </td>
                                        <td className={`px-3 py-2 text-right ${item.isRefunded ? 'line-through text-[var(--color-muted)]' : ''}`}>
                                            {formatCurrency(item.price)}
                                        </td>
                                        <td className={`px-3 py-2 text-right ${item.isRefunded ? 'line-through text-[var(--color-muted)]' : ''}`}>
                                            {formatCurrency(item.lineTotal)}
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                            <Badge variant="default">
                                                {Math.round(item.commissionSplit * 100)}%
                                            </Badge>
                                        </td>
                                        <td className={`px-3 py-2 text-right font-medium ${item.isRefunded ? 'line-through text-[var(--color-muted)]' : 'text-[var(--color-success)]'}`}>
                                            {formatCurrency(effectivePayout)}
                                        </td>
                                    </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Payout History */}
            {payoutHistory.length > 0 && (
                <div>
                    <h4 className="font-medium text-sm mb-2">Previous Payouts</h4>
                    <div className="space-y-2">
                        {payoutHistory.slice(0, 5).map((payout) => (
                            (() => {
                                const rangeMatch = payout.notes?.match(/^\[Range Payout: ([^\]]+)\]/);
                                const rangeLabel = rangeMatch?.[1] || null;
                                const cleanedNotes = payout.notes
                                    ?.replace(/^\[Range Payout: [^\]]+\]\s*/, '')
                                    .replace(/^\[Deferred Carryover Included\]\s*/, '') || '';
                                return (
                            <div
                                key={payout.id}
                                className="p-3 bg-[var(--color-surface)] rounded-lg"
                            >
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="font-medium">
                                            {formatCurrency(payout.amount)}
                                            {payout.is_partial && payout.original_amount_due && (
                                                <span className="text-xs text-[var(--color-muted)] ml-2 line-through">
                                                    {formatCurrency(payout.original_amount_due)}
                                                </span>
                                            )}
                                        </p>
                                        <p className="text-xs text-[var(--color-muted)]">
                                            {new Date(payout.paid_at).toLocaleDateString()} -{' '}
                                            {payout.items_sold} items, {payout.sales_count} sales
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {rangeLabel && <Badge variant="info">Range Payout</Badge>}
                                        {payout.is_partial && (
                                            <Badge variant={payout.balance_disposition === 'forgiven' ? 'danger' : 'warning'}>
                                                {payout.balance_disposition === 'forgiven' ? 'Partial (Forgiven)' : 'Partial'}
                                            </Badge>
                                        )}
                                        <Badge variant="success">Paid</Badge>
                                    </div>
                                </div>
                                {payout.is_partial && payout.partial_reason && (
                                    <p className="text-xs text-[var(--color-muted)] mt-1">
                                        Reason: {payout.partial_reason}
                                    </p>
                                )}
                                {rangeLabel && (
                                    <p className="text-xs text-[var(--color-muted)] mt-1">
                                        Recorded Range: {rangeLabel}
                                    </p>
                                )}
                                {cleanedNotes && (
                                    <p className="text-xs text-[var(--color-muted)] mt-1">
                                        Note: {cleanedNotes}
                                    </p>
                                )}
                                {((payout.booth_rent_deduction || 0) > 0 || (payout.marketing_fee_deduction || 0) > 0 || (payout.ledger_deduction || 0) > 0) && (
                                    <div className="text-xs text-[var(--color-muted)] mt-1 space-y-1">
                                        {(payout.booth_rent_deduction || 0) > 0 && (
                                            <p>Booth rent deducted: -{formatCurrency(Number(payout.booth_rent_deduction || 0))}</p>
                                        )}
                                        {(payout.marketing_fee_deduction || 0) > 0 && (
                                            <p>Marketing deducted: -{formatCurrency(Number(payout.marketing_fee_deduction || 0))}</p>
                                        )}
                                        {(payout.ledger_deduction || 0) > 0 && (
                                            <p>Ledger deducted: -{formatCurrency(Number(payout.ledger_deduction || 0))}</p>
                                        )}
                                    </div>
                                )}
                            </div>
                                );
                            })()
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function LedgerManager({
    pendingEntries,
    description,
    amount,
    error,
    isSubmitting,
    totalPendingDeduction,
    onDescriptionChange,
    onAmountChange,
    onSubmit,
}: {
    pendingEntries: VendorLedgerEntry[];
    description: string;
    amount: string;
    error: string | null;
    isSubmitting: boolean;
    totalPendingDeduction: number;
    onDescriptionChange: (value: string) => void;
    onAmountChange: (value: string) => void;
    onSubmit: () => void;
}) {
    return (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 space-y-3">
            <div className="flex items-center justify-between">
                <div>
                    <h4 className="font-semibold text-sm">Ledger Deductions</h4>
                    <p className="text-xs text-[var(--color-muted)]">
                        Add one-off items that reduce this vendor&apos;s payout.
                    </p>
                </div>
                <div className="text-right">
                    <p className="text-xs text-[var(--color-muted)]">Pending This Payout</p>
                    <p className="text-sm font-semibold text-[var(--color-warning)]">
                        -{formatCurrency(totalPendingDeduction)}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[1fr_160px_auto] gap-2">
                <input
                    type="text"
                    value={description}
                    onChange={(event) => onDescriptionChange(event.target.value)}
                    placeholder="Ledger item description"
                    className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)]"
                />
                <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]">$</span>
                    <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={amount}
                        onChange={(event) => onAmountChange(event.target.value)}
                        placeholder="0.00"
                        className="w-full pl-7 pr-3 py-2 border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)]"
                    />
                </div>
                <Button variant="secondary" onClick={onSubmit} disabled={isSubmitting}>
                    {isSubmitting ? 'Adding...' : 'Add'}
                </Button>
            </div>

            {error && (
                <p className="text-xs text-[var(--color-danger)]">{error}</p>
            )}

            {pendingEntries.length > 0 ? (
                <div className="rounded-lg border border-[var(--color-border)] overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-[var(--color-surface)]">
                            <tr>
                                <th className="text-left px-3 py-2 font-medium">Description</th>
                                <th className="text-left px-3 py-2 font-medium">Created</th>
                                <th className="text-right px-3 py-2 font-medium">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {pendingEntries.map((entry) => (
                                <tr key={entry.id} className="border-t border-[var(--color-border)]">
                                    <td className="px-3 py-2">{entry.description}</td>
                                    <td className="px-3 py-2 text-[var(--color-muted)]">
                                        {new Date(entry.created_at).toLocaleDateString()}
                                    </td>
                                    <td className="px-3 py-2 text-right text-[var(--color-warning)]">
                                        -{formatCurrency(Number(entry.amount))}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <p className="text-xs text-[var(--color-muted)]">No pending ledger deductions.</p>
            )}
        </div>
    );
}

// Payout History List
function PayoutHistoryList({
    payouts,
    searchQuery,
}: {
    payouts: Payout[];
    searchQuery: string;
}) {
    const filteredPayouts = useMemo(() => {
        if (!searchQuery) return payouts;
        const query = searchQuery.toLowerCase();
        return payouts.filter(
            (p) =>
                p.consignor?.name.toLowerCase().includes(query) ||
                p.consignor?.consignor_number.toLowerCase().includes(query)
        );
    }, [payouts, searchQuery]);

    if (filteredPayouts.length === 0) {
        return (
            <EmptyState
                icon={<HistoryIcon />}
                title="No payout history"
                description={
                    searchQuery
                        ? 'No payouts match your search.'
                        : 'Payouts will appear here once you start marking consignors as paid.'
                }
            />
        );
    }

    return (
        <div className="space-y-3">
            {filteredPayouts.map((payout) => (
                (() => {
                    const rangeMatch = payout.notes?.match(/^\[Range Payout: ([^\]]+)\]/);
                    const rangeLabel = rangeMatch?.[1] || null;
                    const cleanedNotes = payout.notes
                        ?.replace(/^\[Range Payout: [^\]]+\]\s*/, '')
                        .replace(/^\[Deferred Carryover Included\]\s*/, '') || '';
                    return (
                <div
                    key={payout.id}
                    className="bg-[var(--color-card)] rounded-xl border border-[var(--color-border)] p-4"
                >
                    <div className="flex items-center justify-between flex-wrap gap-4">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-[var(--color-success)] text-white flex items-center justify-center">
                                <CheckIcon />
                            </div>
                            <div>
                                <p className="font-semibold">
                                    {payout.consignor?.name || 'Unknown'}
                                </p>
                                <p className="text-sm text-[var(--color-muted)]">
                                    {payout.consignor?.consignor_number} - Paid{' '}
                                    {new Date(payout.paid_at).toLocaleDateString()}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-6 text-sm">
                            <div className="text-center">
                                <p className="text-[var(--color-muted)]">Period</p>
                                <p className="font-medium">
                                    {new Date(payout.period_start).toLocaleDateString()} -{' '}
                                    {new Date(payout.period_end).toLocaleDateString()}
                                </p>
                                {rangeLabel && (
                                    <p className="text-xs text-[var(--color-primary)]">Range Payout</p>
                                )}
                            </div>
                            <div className="text-center">
                                <p className="text-[var(--color-muted)]">Sales</p>
                                <p className="font-medium">{payout.sales_count}</p>
                            </div>
                            <div className="text-center">
                                <p className="text-[var(--color-muted)]">Items</p>
                                <p className="font-medium">{payout.items_sold}</p>
                            </div>
                            <div className="text-center">
                                <p className="text-[var(--color-muted)]">Gross</p>
                                <p className="font-medium">{formatCurrency(payout.gross_sales)}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-xs text-[var(--color-muted)]">Payout</p>
                                <p className="text-lg font-bold text-[var(--color-success)]">
                                    {formatCurrency(payout.amount)}
                                </p>
                            </div>
                        </div>
                    </div>
                    {payout.is_partial && (
                        <div className="mt-2 pl-14 space-y-1">
                            <div className="flex items-center gap-2">
                                <Badge variant="warning">Partial Payout</Badge>
                                {rangeLabel && <Badge variant="info">Range Payout</Badge>}
                                {payout.balance_disposition === 'forgiven' && (
                                    <Badge variant="danger">Balance Forgiven</Badge>
                                )}
                                {payout.balance_disposition === 'deferred' && (
                                    <Badge variant="default">Balance Deferred</Badge>
                                )}
                            </div>
                            {payout.original_amount_due && (
                                <p className="text-xs text-[var(--color-muted)]">
                                    Original amount due: {formatCurrency(payout.original_amount_due)}
                                    {payout.balance_disposition === 'forgiven' && (
                                        <span className="text-[var(--color-danger)]">
                                            {' '}({formatCurrency(payout.original_amount_due - payout.amount)} forgiven)
                                        </span>
                                    )}
                                </p>
                            )}
                            {payout.partial_reason && (
                                <p className="text-xs text-[var(--color-muted)]">
                                    Reason: {payout.partial_reason}
                                </p>
                            )}
                        </div>
                    )}
                    {rangeLabel && (
                        <p className="mt-2 text-xs text-[var(--color-primary)] pl-14">
                            Recorded Range: {rangeLabel}
                        </p>
                    )}
                    {cleanedNotes && (
                        <p className="mt-2 text-sm text-[var(--color-muted)] pl-14">
                            Note: {cleanedNotes}
                        </p>
                    )}
                    {((payout.booth_rent_deduction || 0) > 0 || (payout.marketing_fee_deduction || 0) > 0 || (payout.ledger_deduction || 0) > 0) && (
                        <div className="mt-2 pl-14 text-xs text-[var(--color-muted)] space-y-1">
                            {(payout.booth_rent_deduction || 0) > 0 && (
                                <p>Booth rent deducted: -{formatCurrency(Number(payout.booth_rent_deduction || 0))}</p>
                            )}
                            {(payout.marketing_fee_deduction || 0) > 0 && (
                                <p>Marketing fees deducted: -{formatCurrency(Number(payout.marketing_fee_deduction || 0))}</p>
                            )}
                            {(payout.ledger_deduction || 0) > 0 && (
                                <p>Ledger deducted: -{formatCurrency(Number(payout.ledger_deduction || 0))}</p>
                            )}
                        </div>
                    )}
                </div>
                    );
                })()
            ))}
        </div>
    );
}

// Summary Card Component
function SummaryCard({
    label,
    value,
    variant = 'default',
}: {
    label: string;
    value: string;
    variant?: 'default' | 'success' | 'primary' | 'warning';
}) {
    const valueColor =
        variant === 'success'
            ? 'text-[var(--color-success)]'
            : variant === 'primary'
                ? 'text-[var(--color-primary)]'
                : variant === 'warning'
                    ? 'text-[var(--color-warning)]'
                    : 'text-[var(--color-foreground)]';

    return (
        <div className="bg-[var(--color-card)] rounded-xl border border-[var(--color-border)] p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{label}</p>
            <p className={`text-lg font-semibold ${valueColor}`}>{value}</p>
        </div>
    );
}

// Icons
function SearchIcon() {
    return (
        <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
        </svg>
    );
}

function RefreshIcon() {
    return (
        <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
            <path d="M8 16H3v5" />
        </svg>
    );
}

function DollarIcon() {
    return (
        <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <line x1="12" x2="12" y1="2" y2="22" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
    );
}

function CheckCircleIcon() {
    return (
        <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
    );
}

function CheckIcon() {
    return (
        <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <polyline points="20 6 9 17 4 12" />
        </svg>
    );
}

function HistoryIcon() {
    return (
        <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
            <path d="M12 7v5l4 2" />
        </svg>
    );
}

function PrintIcon() {
    return (
        <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <polyline points="6 9 6 2 18 2 18 9" />
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
            <rect width="12" height="8" x="6" y="14" />
        </svg>
    );
}
