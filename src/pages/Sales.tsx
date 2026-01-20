import { useState, useMemo } from 'react';
import { Header } from '../components/layout/Header';
import { Modal, ModalFooter } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { Select } from '../components/ui/Select';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Tabs } from '../components/ui/Tabs';
import { useSalesHistory, type SaleWithItems } from '../hooks/useSalesHistory';
import { useRefundHistory, type RefundWithDetails } from '../hooks/useRefundHistory';
import { useConsignors } from '../hooks/useConsignors';
import { formatCurrency } from '../lib/utils';

export function Sales() {
    const { sales, isLoading, calculateSalesSummary } = useSalesHistory();
    const { refunds, isLoading: isLoadingRefunds } = useRefundHistory();
    const { consignors } = useConsignors();

    const [activeTab, setActiveTab] = useState<'sales' | 'refunds'>('sales');
    const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null);
    const [selectedSale, setSelectedSale] = useState<SaleWithItems | null>(null);
    const [filterConsignor, setFilterConsignor] = useState('');
    const [filterDateRange, setFilterDateRange] = useState<'all' | 'today' | 'week' | 'month'>('all');

    // Filter sales
    const filteredSales = useMemo(() => {
        let result = sales;

        // Filter by consignor
        if (filterConsignor) {
            result = result.filter((sale) =>
                sale.items.some((item) => item.consignor_id === filterConsignor)
            );
        }

        // Filter by date range
        if (filterDateRange !== 'all') {
            const now = new Date();
            let startDate: Date;

            switch (filterDateRange) {
                case 'today':
                    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                    break;
                case 'week':
                    startDate = new Date(now);
                    startDate.setDate(now.getDate() - 7);
                    break;
                case 'month':
                    startDate = new Date(now);
                    startDate.setMonth(now.getMonth() - 1);
                    break;
                default:
                    startDate = new Date(0);
            }

            result = result.filter((sale) => new Date(sale.completed_at) >= startDate);
        }

        return result;
    }, [sales, filterConsignor, filterDateRange]);

    // Calculate totals (subtracting refunds)
    const totals = useMemo(() => {
        // Sum up all refunds
        const totalRefunded = refunds.reduce((sum, refund) => sum + Number(refund.refund_amount), 0);

        // Calculate raw sales totals
        const rawTotals = filteredSales.reduce(
            (acc, sale) => {
                const summary = calculateSalesSummary(sale);
                return {
                    subtotal: acc.subtotal + sale.subtotal,
                    tax: acc.tax + sale.tax_amount,
                    total: acc.total + sale.total,
                    consignorShare: acc.consignorShare + summary.consignorShare,
                    storeShare: acc.storeShare + summary.storeShare,
                };
            },
            { subtotal: 0, tax: 0, total: 0, consignorShare: 0, storeShare: 0 }
        );

        // Calculate refund proportions for consignor/store split
        // Assume refunds are split the same as sales (proportionally)
        const totalRevenueRatio = rawTotals.total > 0 ? totalRefunded / rawTotals.total : 0;
        const refundedConsignorShare = rawTotals.consignorShare * totalRevenueRatio;
        const refundedStoreShare = rawTotals.storeShare * totalRevenueRatio;

        return {
            subtotal: rawTotals.subtotal,
            tax: rawTotals.tax,
            total: rawTotals.total - totalRefunded,
            consignorShare: rawTotals.consignorShare - refundedConsignorShare,
            storeShare: rawTotals.storeShare - refundedStoreShare,
            totalRefunded,
        };
    }, [filteredSales, refunds, calculateSalesSummary]);

    const consignorOptions = [
        { value: '', label: 'All Consignors' },
        ...consignors.map((c) => ({ value: c.id, label: `${c.consignor_number} - ${c.name}` })),
    ];

    const dateRangeOptions = [
        { value: 'all', label: 'All Time' },
        { value: 'today', label: 'Today' },
        { value: 'week', label: 'Last 7 Days' },
        { value: 'month', label: 'Last 30 Days' },
    ];

    const toggleExpand = (saleId: string) => {
        setExpandedSaleId(expandedSaleId === saleId ? null : saleId);
    };

    return (
        <div className="animate-fadeIn">
            <Header
                title="Sales History"
                description={`${filteredSales.length} transaction${filteredSales.length !== 1 ? 's' : ''}${activeTab === 'refunds' ? ` | ${refunds.length} refund${refunds.length !== 1 ? 's' : ''}` : ''}`}
            />

            {/* Tabs */}
            <div className="mb-6">
                <Tabs
                    tabs={[
                        { id: 'sales', label: 'Sales', icon: <ReceiptSmallIcon /> },
                        { id: 'refunds', label: 'Refunds', icon: <RefundTabIcon /> },
                    ]}
                    activeTab={activeTab}
                    onChange={(id) => setActiveTab(id as 'sales' | 'refunds')}
                    className="max-w-xs"
                />
            </div>

            {/* Summary Cards - Only show for sales tab */}
            {activeTab === 'sales' && (
                <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
                    <SummaryCard label="Net Sales" value={formatCurrency(totals.total)} />
                    <SummaryCard label="Refunded" value={`-${formatCurrency(totals.totalRefunded)}`} variant="danger" />
                    <SummaryCard label="Tax Collected" value={formatCurrency(totals.tax)} />
                    <SummaryCard label="Consignor Payouts" value={formatCurrency(totals.consignorShare)} variant="success" />
                    <SummaryCard label="Store Revenue" value={formatCurrency(totals.storeShare)} variant="primary" />
                    <SummaryCard label="Gross Sales" value={formatCurrency(totals.subtotal)} />
                </div>
            )}

            {/* Filters - Only for sales tab */}
            {activeTab === 'sales' && (
                <div className="flex flex-wrap gap-4 mb-6">
                    <div className="w-48">
                        <Select
                            options={dateRangeOptions}
                            value={filterDateRange}
                            onChange={(e) => setFilterDateRange(e.target.value as typeof filterDateRange)}
                            selectSize="sm"
                        />
                    </div>
                    <div className="w-48">
                        <Select
                            options={consignorOptions}
                            value={filterConsignor}
                            onChange={(e) => setFilterConsignor(e.target.value)}
                            selectSize="sm"
                        />
                    </div>
                    {(filterConsignor || filterDateRange !== 'all') && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                setFilterConsignor('');
                                setFilterDateRange('all');
                            }}
                        >
                            Clear Filters
                        </Button>
                    )}
                </div>
            )}

            {/* Sales Tab Content */}
            {activeTab === 'sales' && (
                <>
                    {sales.length === 0 && !isLoading ? (
                        <EmptyState
                            icon={<ReceiptIcon />}
                            title="No sales yet"
                            description="Complete your first sale in the Point of Sale to see it here."
                        />
                    ) : isLoading ? (
                        <div className="flex justify-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--color-primary)]" />
                        </div>
                    ) : filteredSales.length === 0 ? (
                        <div className="text-center py-12 text-[var(--color-muted)]">
                            No sales match your filters
                        </div>
                    ) : (
                        <div>
                            {/* Header Row */}
                            <div className="bg-[var(--color-surface)] rounded-t-xl border border-[var(--color-border)] px-4 py-2 flex items-center gap-4">
                                <div className="flex items-center gap-4 flex-1">
                                    <div className="w-[16px]" /> {/* Expand icon spacer */}
                                    <div className="w-[90px] text-xs font-medium text-[var(--color-muted)]">Date</div>
                                    <div className="w-[140px] text-xs font-medium text-[var(--color-muted)]">Receipt #</div>
                                    <div className="w-[120px] text-xs font-medium text-[var(--color-muted)]">Consignor</div>
                                    <div className="w-[100px] text-xs font-medium text-[var(--color-muted)]">Customer</div>
                                    <div className="w-[70px] text-xs font-medium text-[var(--color-muted)]">Status</div>
                                </div>
                                <div className="flex items-center gap-3 flex-shrink-0">
                                    <div className="w-[70px] text-right text-xs font-medium text-[var(--color-muted)]">Subtotal</div>
                                    <div className="w-[50px] text-right text-xs font-medium text-[var(--color-muted)]">Tax</div>
                                    <div className="w-[100px] text-right text-xs font-medium text-[var(--color-muted)]">Commission</div>
                                    <div className="w-[70px] text-right text-xs font-medium text-[var(--color-muted)]">Total</div>
                                </div>
                            </div>
                            {/* Sales List */}
                            <div className="space-y-2 mt-2">
                                {filteredSales.map((sale) => (
                                    <SaleRow
                                        key={sale.id}
                                        sale={sale}
                                        isExpanded={expandedSaleId === sale.id}
                                        onToggle={() => toggleExpand(sale.id)}
                                        onViewReceipt={() => setSelectedSale(sale)}
                                        calculateSalesSummary={calculateSalesSummary}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Refunds Tab Content */}
            {activeTab === 'refunds' && (
                <>
                    {refunds.length === 0 && !isLoadingRefunds ? (
                        <EmptyState
                            icon={<RefundTabIcon />}
                            title="No refunds yet"
                            description="Refunds processed from the POS will appear here."
                        />
                    ) : isLoadingRefunds ? (
                        <div className="flex justify-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--color-primary)]" />
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {refunds.map((refund) => (
                                <RefundRow key={refund.id} refund={refund} />
                            ))}
                        </div>
                    )}
                </>
            )}

            {/* Receipt Preview Modal */}
            <Modal
                isOpen={!!selectedSale}
                onClose={() => setSelectedSale(null)}
                title="Receipt Preview"
                size="3xl"
            >
                {selectedSale && (() => {
                    // Calculate refund amounts for this sale
                    const saleRefunds = refunds.filter(r => r.sale_id === selectedSale.id);
                    const refundedItemQty: Record<string, number> = {};
                    let totalRefundedAmount = 0;

                    for (const refund of saleRefunds) {
                        totalRefundedAmount += Number(refund.refund_amount);
                        const items = refund.items as Array<{ sale_item_id: string; quantity: number }>;
                        for (const item of items) {
                            refundedItemQty[item.sale_item_id] = (refundedItemQty[item.sale_item_id] || 0) + item.quantity;
                        }
                    }

                    const hasRefunds = totalRefundedAmount > 0;
                    const summary = calculateSalesSummary(selectedSale);

                    // Calculate adjusted commission split
                    const refundRatio = selectedSale.subtotal > 0 ? totalRefundedAmount / selectedSale.subtotal : 0;
                    const adjustedConsignorShare = summary.consignorShare * (1 - refundRatio);
                    const adjustedStoreShare = summary.storeShare * (1 - refundRatio);

                    return (
                        <div className="space-y-4">
                            {/* Sale Header */}
                            <div className="flex justify-between items-start">
                                <div className="flex items-center gap-3">
                                    <div>
                                        <p className="text-xs text-[var(--color-muted)]">Receipt #</p>
                                        <p className="font-mono text-sm">{selectedSale.id.slice(0, 8)}</p>
                                    </div>
                                    {selectedSale.refund_status === 'full' && (
                                        <Badge variant="danger">Fully Refunded</Badge>
                                    )}
                                    {selectedSale.refund_status === 'partial' && (
                                        <Badge variant="warning">Partial Refund</Badge>
                                    )}
                                </div>
                                <div className="text-right">
                                    <p className="text-xs text-[var(--color-muted)]">Date</p>
                                    <p className="text-sm">
                                        {new Date(selectedSale.completed_at).toLocaleString()}
                                    </p>
                                </div>
                            </div>

                            {/* Customer Info */}
                            {selectedSale.customer && (
                                <div className="bg-[var(--color-primary)]/5 rounded-lg p-3 border border-[var(--color-primary)]/20">
                                    <p className="text-xs text-[var(--color-muted)] mb-1">Customer</p>
                                    <p className="font-medium">{selectedSale.customer.name}</p>
                                    {(selectedSale.customer.phone || selectedSale.customer.email) && (
                                        <p className="text-sm text-[var(--color-muted)]">
                                            {selectedSale.customer.phone}
                                            {selectedSale.customer.phone && selectedSale.customer.email && ' • '}
                                            {selectedSale.customer.email}
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Line Items */}
                            <div>
                                <h4 className="text-sm font-semibold mb-2">Items</h4>
                                <div className="rounded-lg border border-[var(--color-border)] overflow-hidden">
                                    <table className="w-full text-sm">
                                        <thead className="bg-[var(--color-surface)]">
                                            <tr>
                                                <th className="text-left px-3 py-2 font-medium">Item</th>
                                                <th className="text-left px-3 py-2 font-medium">Consignor</th>
                                                <th className="text-center px-3 py-2 font-medium">Qty</th>
                                                <th className="text-right px-3 py-2 font-medium">Price</th>
                                                <th className="text-right px-3 py-2 font-medium">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {selectedSale.items.map((item, idx) => {
                                                const refundedQty = refundedItemQty[item.id] || 0;
                                                const isFullyRefunded = refundedQty >= item.quantity;
                                                const isPartiallyRefunded = refundedQty > 0 && refundedQty < item.quantity;

                                                return (
                                                    <tr
                                                        key={idx}
                                                        className={`border-t border-[var(--color-border)] ${isFullyRefunded ? 'bg-[var(--color-danger)]/5' : ''}`}
                                                    >
                                                        <td className={`px-3 py-2 ${isFullyRefunded ? 'line-through text-[var(--color-muted)]' : ''}`}>
                                                            {item.name}
                                                        </td>
                                                        <td className={`px-3 py-2 text-[var(--color-muted)] ${isFullyRefunded ? 'line-through' : ''}`}>
                                                            {item.consignor?.name || '—'}
                                                        </td>
                                                        <td className={`px-3 py-2 text-center ${isFullyRefunded ? 'line-through text-[var(--color-muted)]' : ''}`}>
                                                            {item.quantity}
                                                            {isPartiallyRefunded && (
                                                                <span className="text-xs text-[var(--color-danger)] block">
                                                                    (-{refundedQty})
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className={`px-3 py-2 text-right ${isFullyRefunded ? 'line-through text-[var(--color-muted)]' : ''}`}>
                                                            {formatCurrency(Number(item.price))}
                                                        </td>
                                                        <td className="px-3 py-2 text-right">
                                                            {isFullyRefunded ? (
                                                                <Badge variant="danger">Refunded</Badge>
                                                            ) : isPartiallyRefunded ? (
                                                                <Badge variant="warning">Partial</Badge>
                                                            ) : (
                                                                <Badge variant="success">Paid</Badge>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Totals - Side by Side for Original vs Adjusted */}
                            <div className={`grid ${hasRefunds ? 'grid-cols-2' : 'grid-cols-1'} gap-4`}>
                                {/* Original Totals */}
                                <div className={`border border-[var(--color-border)] rounded-lg p-3 ${hasRefunds ? 'opacity-60' : ''}`}>
                                    <p className="text-xs font-medium text-[var(--color-muted)] mb-2">
                                        {hasRefunds ? 'Original' : 'Totals'}
                                    </p>
                                    <div className="space-y-1 text-sm">
                                        <div className="flex justify-between">
                                            <span className="text-[var(--color-muted)]">Subtotal</span>
                                            <span className={hasRefunds ? 'line-through' : ''}>{formatCurrency(selectedSale.subtotal)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-[var(--color-muted)]">Tax</span>
                                            <span className={hasRefunds ? 'line-through' : ''}>{formatCurrency(selectedSale.tax_amount)}</span>
                                        </div>
                                        <div className="flex justify-between font-semibold pt-1 border-t border-[var(--color-border)]">
                                            <span>Total</span>
                                            <span className={hasRefunds ? 'line-through' : ''}>{formatCurrency(selectedSale.total)}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Adjusted Totals (only show if refunds exist) */}
                                {hasRefunds && (
                                    <div className="border-2 border-[var(--color-primary)] rounded-lg p-3 bg-[var(--color-primary)]/5">
                                        <p className="text-xs font-medium text-[var(--color-primary)] mb-2">After Refunds</p>
                                        <div className="space-y-1 text-sm">
                                            <div className="flex justify-between">
                                                <span className="text-[var(--color-muted)]">Subtotal</span>
                                                <span>{formatCurrency(selectedSale.subtotal - totalRefundedAmount)}</span>
                                            </div>
                                            <div className="flex justify-between text-[var(--color-danger)]">
                                                <span>Refunded</span>
                                                <span>-{formatCurrency(totalRefundedAmount)}</span>
                                            </div>
                                            <div className="flex justify-between font-semibold pt-1 border-t border-[var(--color-primary)]/30">
                                                <span>Net Total</span>
                                                <span className="text-[var(--color-primary)]">
                                                    {formatCurrency(selectedSale.total - totalRefundedAmount)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Commission Breakdown - Side by Side */}
                            <div className="bg-[var(--color-surface)] rounded-lg p-3">
                                <h4 className="text-sm font-semibold mb-2">Commission Split</h4>
                                <div className={`grid ${hasRefunds ? 'grid-cols-2' : 'grid-cols-1'} gap-4`}>
                                    {/* Original Commission */}
                                    <div className={hasRefunds ? 'opacity-60' : ''}>
                                        {hasRefunds && <p className="text-xs text-[var(--color-muted)] mb-1">Original</p>}
                                        <div className="space-y-1 text-sm">
                                            <div className="flex justify-between">
                                                <span className="text-[var(--color-muted)]">Consignor</span>
                                                <span className={`font-medium ${hasRefunds ? 'line-through' : 'text-[var(--color-success)]'}`}>
                                                    {formatCurrency(summary.consignorShare)}
                                                </span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-[var(--color-muted)]">Store</span>
                                                <span className={`font-medium ${hasRefunds ? 'line-through' : ''}`}>
                                                    {formatCurrency(summary.storeShare)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Adjusted Commission */}
                                    {hasRefunds && (
                                        <div>
                                            <p className="text-xs text-[var(--color-primary)] mb-1">After Refunds</p>
                                            <div className="space-y-1 text-sm">
                                                <div className="flex justify-between">
                                                    <span className="text-[var(--color-muted)]">Consignor</span>
                                                    <span className="font-medium text-[var(--color-success)]">
                                                        {formatCurrency(adjustedConsignorShare)}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-[var(--color-muted)]">Store</span>
                                                    <span className="font-medium">
                                                        {formatCurrency(adjustedStoreShare)}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Payment Info */}
                            {selectedSale.cash_tendered !== null && (
                                <div className="text-sm text-[var(--color-muted)] flex gap-4">
                                    <span>Cash Tendered: {formatCurrency(selectedSale.cash_tendered)}</span>
                                    <span>Change Given: {formatCurrency(selectedSale.change_given || 0)}</span>
                                </div>
                            )}
                        </div>
                    );
                })()}
                <ModalFooter>
                    <Button variant="secondary" onClick={() => setSelectedSale(null)}>
                        Close
                    </Button>
                </ModalFooter>
            </Modal>
        </div>
    );
}

// Individual Sale Row Component with expandable details
function SaleRow({
    sale,
    isExpanded,
    onToggle,
    onViewReceipt,
    calculateSalesSummary,
}: {
    sale: SaleWithItems;
    isExpanded: boolean;
    onToggle: () => void;
    onViewReceipt: () => void;
    calculateSalesSummary: (sale: SaleWithItems) => { consignorNames: string[]; consignorShare: number; storeShare: number };
}) {
    const summary = calculateSalesSummary(sale);
    const consignorDisplay = summary.consignorNames.length > 1
        ? 'Multiple'
        : summary.consignorNames[0] || '—';

    return (
        <div className="bg-white rounded-xl border border-[var(--color-border)] overflow-hidden">
            {/* Main Row - Clickable Header */}
            <button
                onClick={onToggle}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-[var(--color-surface-hover)] transition-colors text-left gap-4"
            >
                <div className="flex items-center gap-4 flex-1 min-w-0">
                    {/* Expand Icon */}
                    <div className={`w-[16px] flex-shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>
                        <ChevronIcon />
                    </div>

                    {/* Date & Time */}
                    <div className="w-[90px] flex-shrink-0">
                        <p className="font-medium text-[var(--color-foreground)] text-sm">
                            {new Date(sale.completed_at).toLocaleDateString()}
                        </p>
                        <p className="text-xs text-[var(--color-muted)]">
                            {new Date(sale.completed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                    </div>

                    {/* Receipt # & Items Count */}
                    <div className="w-[140px] flex-shrink-0 flex items-center gap-2">
                        <span className="font-mono text-xs bg-[var(--color-surface)] px-2 py-1 rounded">
                            {sale.id.slice(0, 8)}
                        </span>
                        <span className="text-xs text-[var(--color-muted)]">
                            {sale.items.length} item{sale.items.length !== 1 ? 's' : ''}
                        </span>
                    </div>

                    {/* Consignor */}
                    <div className="w-[120px] flex-shrink-0 truncate">
                        {summary.consignorNames.length > 1 ? (
                            <Badge variant="warning">Multiple</Badge>
                        ) : (
                            <span className="text-sm truncate">{consignorDisplay}</span>
                        )}
                    </div>

                    {/* Customer */}
                    <div className="w-[100px] flex-shrink-0 truncate">
                        {sale.customer ? (
                            <span className="text-sm text-[var(--color-primary)] truncate">
                                {sale.customer.name}
                            </span>
                        ) : (
                            <span className="text-xs text-[var(--color-muted)]">Walk-in</span>
                        )}
                    </div>

                    {/* Status Badge */}
                    <div className="w-[70px] flex-shrink-0">
                        {sale.refund_status === 'full' ? (
                            <Badge variant="danger">Refunded</Badge>
                        ) : sale.refund_status === 'partial' ? (
                            <Badge variant="warning">Partial</Badge>
                        ) : (
                            <Badge variant="success">Paid</Badge>
                        )}
                    </div>
                </div>

                {/* Right Side - Totals */}
                <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-right w-[70px]">
                        <p className="text-sm">{formatCurrency(sale.subtotal)}</p>
                    </div>
                    <div className="text-right w-[50px]">
                        <p className="text-sm">{formatCurrency(sale.tax_amount)}</p>
                    </div>
                    <div className="text-right w-[100px]">
                        <p className="text-sm">
                            <span className="text-[var(--color-success)]">{formatCurrency(summary.consignorShare)}</span>
                            <span className="text-[var(--color-muted)]"> / </span>
                            <span>{formatCurrency(summary.storeShare)}</span>
                        </p>
                    </div>
                    <div className="text-right w-[70px]">
                        <p className="font-semibold">{formatCurrency(sale.total)}</p>
                    </div>
                </div>
            </button>

            {/* Expanded Content - Item Details */}
            {isExpanded && (
                <div className="border-t border-[var(--color-border)] bg-[var(--color-surface)]">
                    <div className="px-4 py-3">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-[var(--color-muted)] text-xs">
                                    <th className="text-left py-2 font-medium">Item</th>
                                    <th className="text-left py-2 font-medium">SKU</th>
                                    <th className="text-left py-2 font-medium">Consignor</th>
                                    <th className="text-center py-2 font-medium">Qty</th>
                                    <th className="text-right py-2 font-medium">Price</th>
                                    <th className="text-right py-2 font-medium">Split</th>
                                    <th className="text-right py-2 font-medium">Consignor $</th>
                                    <th className="text-right py-2 font-medium">Store $</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sale.items.map((item, idx) => {
                                    const itemTotal = Number(item.price) * item.quantity;
                                    const consignorAmount = itemTotal * item.commission_split;
                                    const storeAmount = itemTotal - consignorAmount;

                                    return (
                                        <tr key={idx} className="border-t border-[var(--color-border)]">
                                            <td className="py-2 font-medium">{item.name}</td>
                                            <td className="py-2">
                                                <span className="font-mono text-xs bg-white px-1.5 py-0.5 rounded">
                                                    {item.sku}
                                                </span>
                                            </td>
                                            <td className="py-2 text-[var(--color-muted)]">
                                                {item.consignor?.name || '—'}
                                            </td>
                                            <td className="py-2 text-center">{item.quantity}</td>
                                            <td className="py-2 text-right">{formatCurrency(Number(item.price))}</td>
                                            <td className="py-2 text-right">
                                                <Badge variant="default">
                                                    {Math.round(item.commission_split * 100)}%
                                                </Badge>
                                            </td>
                                            <td className="py-2 text-right text-[var(--color-success)]">
                                                {formatCurrency(consignorAmount)}
                                            </td>
                                            <td className="py-2 text-right">
                                                {formatCurrency(storeAmount)}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>

                        {/* Payment Info */}
                        {sale.cash_tendered !== null && (
                            <div className="mt-3 pt-3 border-t border-[var(--color-border)] text-sm text-[var(--color-muted)] flex gap-4">
                                <span>Cash Tendered: {formatCurrency(sale.cash_tendered)}</span>
                                <span>Change Given: {formatCurrency(sale.change_given || 0)}</span>
                            </div>
                        )}

                        {/* View Receipt Button */}
                        <div className="mt-4 pt-3 border-t border-[var(--color-border)] flex justify-end">
                            <Button size="sm" variant="secondary" onClick={onViewReceipt}>
                                <ReceiptSmallIcon />
                                View Receipt
                            </Button>
                        </div>
                    </div>
                </div>
            )}
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
    variant?: 'default' | 'success' | 'primary' | 'danger';
}) {
    const valueColor =
        variant === 'success'
            ? 'text-[var(--color-success)]'
            : variant === 'primary'
                ? 'text-[var(--color-primary)]'
                : variant === 'danger'
                    ? 'text-[var(--color-danger)]'
                    : 'text-[var(--color-foreground)]';

    return (
        <div className="bg-white rounded-xl border border-[var(--color-border)] p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{label}</p>
            <p className={`text-lg font-semibold ${valueColor}`}>{value}</p>
        </div>
    );
}

// Icons
function ReceiptIcon() {
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
            <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1Z" />
            <path d="M8 10h8M8 14h4" />
        </svg>
    );
}

// RefundRow Component for refunds tab
function RefundRow({ refund }: { refund: RefundWithDetails }) {
    const items = refund.items as Array<{ name: string; quantity: number; restocked: boolean }>;

    return (
        <div className="bg-white rounded-xl border border-[var(--color-border)] p-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-6">
                    {/* Date & Time */}
                    <div className="min-w-[120px]">
                        <p className="font-medium text-[var(--color-foreground)]">
                            {new Date(refund.created_at).toLocaleDateString()}
                        </p>
                        <p className="text-xs text-[var(--color-muted)]">
                            {new Date(refund.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                    </div>

                    {/* Refund # */}
                    <div className="min-w-[100px]">
                        <span className="font-mono text-xs bg-[var(--color-danger)]/10 text-[var(--color-danger)] px-2 py-1 rounded">
                            {refund.id.slice(0, 8)}
                        </span>
                    </div>

                    {/* Original Sale # */}
                    <div className="text-sm">
                        <span className="text-[var(--color-muted)]">Original: </span>
                        <span className="font-mono text-xs">{refund.sale_id.slice(0, 8)}</span>
                    </div>

                    {/* Customer */}
                    <div className="min-w-[100px]">
                        {refund.customer ? (
                            <span className="text-sm text-[var(--color-primary)]">
                                {refund.customer.name}
                            </span>
                        ) : (
                            <span className="text-xs text-[var(--color-muted)]">Walk-in</span>
                        )}
                    </div>

                    {/* Items Count */}
                    <div className="text-sm text-[var(--color-muted)]">
                        {items.length} item{items.length !== 1 ? 's' : ''}
                    </div>
                </div>

                {/* Right Side - Total & Method */}
                <div className="flex items-center gap-6">
                    <div className="text-right">
                        <p className="text-xs text-[var(--color-muted)]">Method</p>
                        <Badge variant={refund.payment_method === 'card' ? 'info' : 'default'}>
                            {refund.payment_method.toUpperCase()}
                        </Badge>
                    </div>
                    <div className="text-right min-w-[100px]">
                        <p className="text-xs text-[var(--color-muted)]">Refund Amount</p>
                        <p className="font-semibold text-[var(--color-danger)]">
                            -{formatCurrency(Number(refund.refund_amount))}
                        </p>
                    </div>
                </div>
            </div>

            {/* Items Preview */}
            <div className="mt-3 pt-3 border-t border-[var(--color-border)] flex flex-wrap gap-2">
                {items.map((item, idx) => (
                    <span key={idx} className="text-xs bg-[var(--color-surface)] px-2 py-1 rounded">
                        {item.quantity}× {item.name}
                        {item.restocked && <span className="text-[var(--color-success)] ml-1">↻</span>}
                    </span>
                ))}
            </div>
        </div>
    );
}

function ChevronIcon() {
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
            <path d="m9 18 6-6-6-6" />
        </svg>
    );
}

function ReceiptSmallIcon() {
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
            <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1Z" />
            <path d="M8 10h8M8 14h4" />
        </svg>
    );
}

function RefundTabIcon() {
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
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
            <path d="M12 7v5l4 2" />
        </svg>
    );
}
