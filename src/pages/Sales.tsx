import { useState, useMemo } from 'react';
import { Header } from '../components/layout/Header';
import { Modal, ModalFooter } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { Select } from '../components/ui/Select';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { useSalesHistory, type SaleWithItems } from '../hooks/useSalesHistory';
import { useConsignors } from '../hooks/useConsignors';
import { formatCurrency } from '../lib/utils';

export function Sales() {
    const { sales, isLoading, calculateSalesSummary } = useSalesHistory();
    const { consignors } = useConsignors();

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

    // Calculate totals
    const totals = useMemo(() => {
        return filteredSales.reduce(
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
    }, [filteredSales, calculateSalesSummary]);

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
                description={`${filteredSales.length} transaction${filteredSales.length !== 1 ? 's' : ''}`}
            />

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                <SummaryCard label="Total Sales" value={formatCurrency(totals.total)} />
                <SummaryCard label="Subtotal" value={formatCurrency(totals.subtotal)} />
                <SummaryCard label="Tax Collected" value={formatCurrency(totals.tax)} />
                <SummaryCard label="Consignor Payouts" value={formatCurrency(totals.consignorShare)} variant="success" />
                <SummaryCard label="Store Revenue" value={formatCurrency(totals.storeShare)} variant="primary" />
            </div>

            {/* Filters */}
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
                <div className="space-y-3">
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
            )}

            {/* Receipt Preview Modal */}
            <Modal
                isOpen={!!selectedSale}
                onClose={() => setSelectedSale(null)}
                title="Receipt Preview"
                size="lg"
            >
                {selectedSale && (
                    <div className="space-y-6">
                        {/* Sale Header */}
                        <div className="flex justify-between items-start">
                            <div>
                                <p className="text-sm text-[var(--color-muted)]">Receipt #</p>
                                <p className="font-mono text-sm">{selectedSale.id.slice(0, 8)}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-sm text-[var(--color-muted)]">Date</p>
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
                            <h4 className="text-sm font-semibold mb-3">Items</h4>
                            <div className="rounded-lg border border-[var(--color-border)] overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead className="bg-[var(--color-surface)]">
                                        <tr>
                                            <th className="text-left px-3 py-2 font-medium">Item</th>
                                            <th className="text-left px-3 py-2 font-medium">Consignor</th>
                                            <th className="text-center px-3 py-2 font-medium">Qty</th>
                                            <th className="text-right px-3 py-2 font-medium">Price</th>
                                            <th className="text-right px-3 py-2 font-medium">Split</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {selectedSale.items.map((item, idx) => (
                                            <tr key={idx} className="border-t border-[var(--color-border)]">
                                                <td className="px-3 py-2">{item.name}</td>
                                                <td className="px-3 py-2 text-[var(--color-muted)]">
                                                    {item.consignor?.name || '—'}
                                                </td>
                                                <td className="px-3 py-2 text-center">{item.quantity}</td>
                                                <td className="px-3 py-2 text-right">
                                                    {formatCurrency(Number(item.price))}
                                                </td>
                                                <td className="px-3 py-2 text-right">
                                                    <Badge variant="default">
                                                        {Math.round(item.commission_split * 100)}%
                                                    </Badge>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Totals */}
                        <div className="border-t border-[var(--color-border)] pt-4 space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-[var(--color-muted)]">Subtotal</span>
                                <span>{formatCurrency(selectedSale.subtotal)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-[var(--color-muted)]">Tax</span>
                                <span>{formatCurrency(selectedSale.tax_amount)}</span>
                            </div>
                            <div className="flex justify-between font-semibold">
                                <span>Total</span>
                                <span>{formatCurrency(selectedSale.total)}</span>
                            </div>
                        </div>

                        {/* Commission Breakdown */}
                        <div className="bg-[var(--color-surface)] rounded-lg p-4 space-y-2">
                            <h4 className="text-sm font-semibold mb-2">Commission Split</h4>
                            <div className="flex justify-between text-sm">
                                <span className="text-[var(--color-muted)]">Consignor Payout</span>
                                <span className="font-medium text-[var(--color-success)]">
                                    {formatCurrency(calculateSalesSummary(selectedSale).consignorShare)}
                                </span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-[var(--color-muted)]">Store Revenue</span>
                                <span className="font-medium">
                                    {formatCurrency(calculateSalesSummary(selectedSale).storeShare)}
                                </span>
                            </div>
                        </div>

                        {/* Payment Info */}
                        {selectedSale.cash_tendered !== null && (
                            <div className="text-sm text-[var(--color-muted)]">
                                <p>Cash Tendered: {formatCurrency(selectedSale.cash_tendered)}</p>
                                <p>Change Given: {formatCurrency(selectedSale.change_given || 0)}</p>
                            </div>
                        )}
                    </div>
                )}
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
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-[var(--color-surface-hover)] transition-colors text-left"
            >
                <div className="flex items-center gap-6 flex-1">
                    {/* Expand Icon */}
                    <div className={`transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>
                        <ChevronIcon />
                    </div>

                    {/* Date & Time */}
                    <div className="min-w-[120px]">
                        <p className="font-medium text-[var(--color-foreground)]">
                            {new Date(sale.completed_at).toLocaleDateString()}
                        </p>
                        <p className="text-xs text-[var(--color-muted)]">
                            {new Date(sale.completed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                    </div>

                    {/* Receipt # */}
                    <div className="min-w-[100px]">
                        <span className="font-mono text-xs bg-[var(--color-surface)] px-2 py-1 rounded">
                            {sale.id.slice(0, 8)}
                        </span>
                    </div>

                    {/* Consignor */}
                    <div className="min-w-[100px]">
                        {summary.consignorNames.length > 1 ? (
                            <Badge variant="warning">Multiple</Badge>
                        ) : (
                            <span className="text-sm">{consignorDisplay}</span>
                        )}
                    </div>

                    {/* Customer */}
                    <div className="min-w-[100px]">
                        {sale.customer ? (
                            <span className="text-sm text-[var(--color-primary)]">
                                {sale.customer.name}
                            </span>
                        ) : (
                            <span className="text-xs text-[var(--color-muted)]">Walk-in</span>
                        )}
                    </div>

                    {/* Items Count */}
                    <div className="text-sm text-[var(--color-muted)]">
                        {sale.items.length} item{sale.items.length !== 1 ? 's' : ''}
                    </div>
                </div>

                {/* Right Side - Totals */}
                <div className="flex items-center gap-6">
                    <div className="text-right min-w-[80px]">
                        <p className="text-xs text-[var(--color-muted)]">Subtotal</p>
                        <p className="text-sm">{formatCurrency(sale.subtotal)}</p>
                    </div>
                    <div className="text-right min-w-[60px]">
                        <p className="text-xs text-[var(--color-muted)]">Tax</p>
                        <p className="text-sm">{formatCurrency(sale.tax_amount)}</p>
                    </div>
                    <div className="text-right min-w-[100px]">
                        <p className="text-xs text-[var(--color-muted)]">Commission</p>
                        <p className="text-sm">
                            <span className="text-[var(--color-success)]">{formatCurrency(summary.consignorShare)}</span>
                            <span className="text-[var(--color-muted)]"> / </span>
                            <span>{formatCurrency(summary.storeShare)}</span>
                        </p>
                    </div>
                    <div className="text-right min-w-[80px]">
                        <p className="text-xs text-[var(--color-muted)]">Total</p>
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
    variant?: 'default' | 'success' | 'primary';
}) {
    const valueColor =
        variant === 'success'
            ? 'text-[var(--color-success)]'
            : variant === 'primary'
                ? 'text-[var(--color-primary)]'
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

