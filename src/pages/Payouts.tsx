import { useState, useMemo } from 'react';
import { Header } from '../components/layout/Header';
import { Modal, ModalFooter } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { EmptyState } from '../components/ui/EmptyState';
import { usePayouts } from '../hooks/usePayouts';
import { formatCurrency } from '../lib/utils';
import type { ConsignorPayoutSummary, Payout, BalanceDisposition } from '../types';

type ViewMode = 'pending' | 'history';

export function Payouts() {
    const {
        consignorSummaries,
        payouts,
        isLoading,
        markAsPaid,
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

    // Custom amount payout state
    const [useCustomAmount, setUseCustomAmount] = useState(false);
    const [customAmount, setCustomAmount] = useState('');
    const [partialReason, setPartialReason] = useState('');
    const [balanceDisposition, setBalanceDisposition] = useState<BalanceDisposition>('deferred');

    const totals = getTotals();

    // Filter consignors by search
    const filteredSummaries = useMemo(() => {
        if (!searchQuery) return consignorSummaries;
        const query = searchQuery.toLowerCase();
        return consignorSummaries.filter(
            (s) =>
                s.consignor.name.toLowerCase().includes(query) ||
                s.consignor.consignor_number.toLowerCase().includes(query)
        );
    }, [consignorSummaries, searchQuery]);

    // Summaries with pending payouts
    const pendingSummaries = useMemo(
        () => filteredSummaries.filter((s) => s.pendingAmount > 0),
        [filteredSummaries]
    );

    const handleMarkAsPaid = async () => {
        if (!selectedConsignor) return;

        setIsProcessing(true);

        const amountToPay = useCustomAmount && customAmount
            ? parseFloat(customAmount)
            : undefined;

        const result = await markAsPaid(
            selectedConsignor.consignor.id,
            selectedConsignor,
            payoutNotes || undefined,
            amountToPay,
            useCustomAmount ? partialReason : undefined,
            useCustomAmount ? balanceDisposition : undefined
        );

        if (result.success) {
            setShowPayModal(false);
            setSelectedConsignor(null);
            setPayoutNotes('');
            setUseCustomAmount(false);
            setCustomAmount('');
            setPartialReason('');
            setBalanceDisposition('deferred');
        }
        setIsProcessing(false);
    };

    const openPayModal = (summary: ConsignorPayoutSummary) => {
        setSelectedConsignor(summary);
        setShowPayModal(true);
    };

    const printPayoutReport = (summary: ConsignorPayoutSummary) => {
        const { consignor, pendingAmount, grossSales, storeShare, creditCardFees, salesSinceLastPayout, lastPayout } = summary;
        const periodStart = lastPayout ? new Date(lastPayout.paid_at).toLocaleDateString() : 'Start';
        const periodEnd = new Date().toLocaleDateString();

        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Payout Report - ${consignor.name}</title>
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
                    <strong>${consignor.name}</strong><br>
                    ${consignor.email || ''}<br>
                    ${consignor.address || ''}<br>
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
                        ${salesSinceLastPayout.filter(i => !i.isRefunded).map(item => `
                            <tr>
                                <td>${new Date(item.saleDate).toLocaleDateString()}</td>
                                <td>${item.sku}</td>
                                <td>${item.itemName}</td>
                                <td class="text-right">$${item.price.toFixed(2)}</td>
                                <td class="text-center">${item.quantity}</td>
                                <td class="text-right">$${item.lineTotal.toFixed(2)}</td>
                                <td class="text-center">${Math.round(item.commissionSplit * 100)}%</td>
                                <td class="text-right">$${(item.consignorShare - item.creditCardFee).toFixed(2)}</td>
                                ${creditCardFees > 0 ? `<td class="text-right">${item.creditCardFee > 0 ? '-$' + item.creditCardFee.toFixed(2) : '-'}</td>` : ''}
                            </tr>
                        `).join('')}
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
                    <div class="summary-row total">
                        <span>Amount Due to Consignor:</span>
                        <span>$${pendingAmount.toFixed(2)}</span>
                    </div>
                </div>
                <div class="footer">
                    <p>Generated: ${new Date().toLocaleString()}</p>
                    <p>Items: ${salesSinceLastPayout.filter(i => !i.isRefunded).length} | Total Qty: ${salesSinceLastPayout.filter(i => !i.isRefunded).reduce((s, i) => s + i.quantity, 0)}</p>
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

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
                <SummaryCard
                    label="Total Pending"
                    value={formatCurrency(totals.totalPending)}
                    variant="warning"
                />
                <SummaryCard
                    label="Consignors Due"
                    value={totals.consignorsWithPending.toString()}
                />
                <SummaryCard
                    label="Gross Sales"
                    value={formatCurrency(totals.totalGrossSales)}
                />
                <SummaryCard
                    label="Store Revenue"
                    value={formatCurrency(totals.totalStoreShare)}
                    variant="primary"
                />
                <SummaryCard
                    label="Tax Collected"
                    value={formatCurrency(totals.totalTaxCollected)}
                />
                <SummaryCard
                    label="Items Sold"
                    value={totals.totalItemsSold.toString()}
                />
            </div>

            {/* View Toggle & Search */}
            <div className="flex flex-wrap items-center gap-4 mb-6">
                <div className="flex rounded-lg border border-[var(--color-border)] overflow-hidden">
                    <button
                        onClick={() => setViewMode('pending')}
                        className={`px-4 py-2 text-sm font-medium transition-colors ${viewMode === 'pending'
                            ? 'bg-[var(--color-primary)] text-white'
                            : 'bg-white text-[var(--color-muted)] hover:bg-[var(--color-surface)]'
                            }`}
                    >
                        Pending Payouts
                    </button>
                    <button
                        onClick={() => setViewMode('history')}
                        className={`px-4 py-2 text-sm font-medium transition-colors ${viewMode === 'history'
                            ? 'bg-[var(--color-primary)] text-white'
                            : 'bg-white text-[var(--color-muted)] hover:bg-[var(--color-surface)]'
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

                <Button variant="secondary" size="sm" onClick={() => refetch()}>
                    <RefreshIcon />
                    Refresh
                </Button>
            </div>

            {/* Content */}
            {isLoading ? (
                <div className="flex justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--color-primary)]" />
                </div>
            ) : viewMode === 'pending' ? (
                pendingSummaries.length === 0 ? (
                    <EmptyState
                        icon={<CheckCircleIcon />}
                        title="All caught up!"
                        description={
                            searchQuery
                                ? 'No consignors match your search.'
                                : 'No pending payouts at this time.'
                        }
                    />
                ) : (
                    <div className="space-y-3">
                        {pendingSummaries.map((summary) => (
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
                    payouts={payouts}
                    searchQuery={searchQuery}
                />
            )}

            {/* Consignor Detail Modal */}
            <Modal
                isOpen={!!selectedConsignor && !showPayModal}
                onClose={() => setSelectedConsignor(null)}
                title={`Payout Details: ${selectedConsignor?.consignor.name}`}
                size="3xl"
            >
                {selectedConsignor && (
                    <ConsignorPayoutDetail
                        summary={selectedConsignor}
                        payoutHistory={getConsignorPayoutHistory(selectedConsignor.consignor.id)}
                    />
                )}
                <ModalFooter>
                    <Button variant="secondary" onClick={() => setSelectedConsignor(null)}>
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
                                {selectedConsignor.consignor.name}
                            </p>
                            <p className="text-sm text-[var(--color-muted)]">
                                {selectedConsignor.consignor.consignor_number}
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
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[var(--color-primary)]/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--color-primary)]"></div>
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
                                        <label className="flex items-start gap-3 p-3 rounded-lg border border-[var(--color-border)] cursor-pointer hover:bg-white transition-colors">
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
                                        <label className="flex items-start gap-3 p-3 rounded-lg border border-[var(--color-border)] cursor-pointer hover:bg-white transition-colors">
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
                                {useCustomAmount && balanceDisposition === 'forgiven'
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
        <div className="bg-white rounded-xl border border-[var(--color-border)] p-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
                {/* Consignor Info */}
                <div className="flex items-center gap-4 min-w-[200px]">
                    <div className="w-10 h-10 rounded-full bg-[var(--color-primary)] text-white flex items-center justify-center font-semibold">
                        {consignor.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <p className="font-semibold">{consignor.name}</p>
                        <p className="text-sm text-[var(--color-muted)]">
                            {consignor.consignor_number}
                            {consignor.booth_location && ` - ${consignor.booth_location}`}
                        </p>
                    </div>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-6 text-sm">
                    <div className="text-center">
                        <p className="text-[var(--color-muted)]">Sales</p>
                        <p className="font-medium">{salesCount}</p>
                    </div>
                    <div className="text-center">
                        <p className="text-[var(--color-muted)]">Items</p>
                        <p className="font-medium">{itemsSold}</p>
                    </div>
                    <div className="text-center">
                        <p className="text-[var(--color-muted)]">Gross</p>
                        <p className="font-medium">{formatCurrency(grossSales)}</p>
                    </div>
                    <div className="text-center">
                        <p className="text-[var(--color-muted)]">Store</p>
                        <p className="font-medium">{formatCurrency(storeShare)}</p>
                    </div>
                    <div className="text-center">
                        <p className="text-[var(--color-muted)]">Last Paid</p>
                        <p className="font-medium">
                            {lastPayout
                                ? new Date(lastPayout.paid_at).toLocaleDateString()
                                : 'Never'}
                        </p>
                    </div>
                </div>

                {/* Amount Due & Actions */}
                <div className="flex items-center gap-4">
                    <div className="text-right">
                        <p className="text-xs text-[var(--color-muted)]">Amount Due</p>
                        <p className="text-xl font-bold text-[var(--color-success)]">
                            {formatCurrency(pendingAmount)}
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="secondary" size="sm" onClick={onViewDetails}>
                            Details
                        </Button>
                        <Button variant="success" size="sm" onClick={onMarkAsPaid}>
                            <DollarIcon />
                            Pay
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// Consignor Payout Detail View
function ConsignorPayoutDetail({
    summary,
    payoutHistory,
}: {
    summary: ConsignorPayoutSummary;
    payoutHistory: Payout[];
}) {
    const { consignor, pendingAmount, grossSales, taxCollected, storeShare, creditCardFees, salesCount, itemsSold, salesSinceLastPayout } = summary;

    return (
        <div className="space-y-4">
            {/* Consignor Info - More compact header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[var(--color-primary)] text-white flex items-center justify-center text-lg font-semibold flex-shrink-0">
                        {consignor.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <h3 className="font-semibold">{consignor.name}</h3>
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
            {(consignor.email || consignor.address) && (
                <div className="text-xs text-[var(--color-muted)]">
                    {consignor.email && <span>{consignor.email}</span>}
                    {consignor.email && consignor.address && <span> • </span>}
                    {consignor.address && <span>{consignor.address}</span>}
                </div>
            )}

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

            {/* Sales Details Table */}
            {salesSinceLastPayout.length > 0 && (
                <div>
                    <h4 className="font-medium text-sm mb-2">
                        Sales Since Last Payout ({salesSinceLastPayout.length} items)
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
                                {salesSinceLastPayout.map((item, idx) => (
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
                                            {formatCurrency(item.isRefunded ? 0 : item.consignorShare - (item.price * item.refundedQuantity * item.commissionSplit))}
                                        </td>
                                    </tr>
                                ))}
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
                                {payout.notes && (
                                    <p className="text-xs text-[var(--color-muted)] mt-1">
                                        Note: {payout.notes}
                                    </p>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
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
                <div
                    key={payout.id}
                    className="bg-white rounded-xl border border-[var(--color-border)] p-4"
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
                    {payout.notes && (
                        <p className="mt-2 text-sm text-[var(--color-muted)] pl-14">
                            Note: {payout.notes}
                        </p>
                    )}
                </div>
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
        <div className="bg-white rounded-xl border border-[var(--color-border)] p-4">
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

