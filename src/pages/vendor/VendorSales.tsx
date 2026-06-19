import { useState, useEffect } from 'react';
import { Header } from '../../components/layout/Header';
import { Card, CardContent } from '../../components/ui/Card';
import { Table, type Column } from '../../components/ui/Table';
import { Input } from '../../components/ui/Input';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import {
    calculateSaleItemDiscountAllocations,
    getJoinedSaleDiscountData,
    type SaleItemDiscountAllocationInput,
} from '../../lib/saleDiscounts';
import { formatCurrency, formatDate } from '../../lib/utils';

const DISCOUNT_CONTEXT_FETCH_BATCH_SIZE = 1000;

interface SaleItemWithDate {
    id: string;
    sale_id: string;
    name: string;
    sku: string;
    price: number;
    quantity: number;
    commission_split: number;
    discount_amount: number;
    discount_reason?: string | null;
    original_line_total: number;
    net_line_total: number;
    total_discount_amount: number;
    discounted_unit_price: number;
    completed_at: string;
}

async function fetchSaleItemDiscountContextRows(
    saleIds: string[]
): Promise<SaleItemDiscountAllocationInput[]> {
    const rows: SaleItemDiscountAllocationInput[] = [];
    let from = 0;

    while (saleIds.length > 0) {
        const { data, error } = await supabase
            .from('sale_items')
            .select('id, sale_id, price, quantity, discount_amount')
            .in('sale_id', saleIds)
            .order('sale_id', { ascending: true })
            .order('id', { ascending: true })
            .range(from, from + DISCOUNT_CONTEXT_FETCH_BATCH_SIZE - 1);

        if (error) throw error;

        const batch = (data || []) as SaleItemDiscountAllocationInput[];
        rows.push(...batch);

        if (batch.length < DISCOUNT_CONTEXT_FETCH_BATCH_SIZE) break;
        from += DISCOUNT_CONTEXT_FETCH_BATCH_SIZE;
    }

    return rows;
}

export function VendorSales() {
    const { userRecord } = useAuth();
    const [sales, setSales] = useState<SaleItemWithDate[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    useEffect(() => {
        const fetchSales = async () => {
            if (!userRecord?.consignor_id) return;

            try {
                const query = supabase
                    .from('sale_items')
                    .select('id, sale_id, name, sku, price, quantity, commission_split, discount_amount, discount_reason, sales!inner(completed_at, discount_total)')
                    .eq('consignor_id', userRecord.consignor_id)
                    .order('sales(completed_at)', { ascending: false });

                const { data, error } = await query;
                if (error) throw error;

                if (data) {
                const saleIds = Array.from(new Set(data.map((item) => item.sale_id).filter(Boolean)));
                const saleDiscountTotals = new Map<string, number>();
                for (const item of data) {
                    const sale = getJoinedSaleDiscountData(item.sales);
                    saleDiscountTotals.set(item.sale_id, sale.discount_total);
                }

                const discountContextRows = await fetchSaleItemDiscountContextRows(saleIds);

                const discountAllocations = calculateSaleItemDiscountAllocations(
                    discountContextRows,
                    saleDiscountTotals
                );

                setSales(
                    data.map((item) => {
                        const sale = getJoinedSaleDiscountData(item.sales);
                        const price = Number(item.price);
                        const quantity = Number(item.quantity || 0);
                        const originalLineTotal = price * quantity;
                        const allocation = discountAllocations.get(item.id);
                        const netLineTotal = allocation?.netLineTotal ?? Math.max(0, originalLineTotal - Number(item.discount_amount || 0));
                        const totalDiscountAmount = allocation?.totalDiscountAmount ?? Math.max(0, originalLineTotal - netLineTotal);

                        return {
                            id: item.id,
                            sale_id: item.sale_id,
                            name: item.name,
                            sku: item.sku,
                            price,
                            quantity,
                            commission_split: Number(item.commission_split),
                            discount_amount: Number(item.discount_amount || 0),
                            discount_reason: item.discount_reason,
                            original_line_total: allocation?.originalLineTotal ?? originalLineTotal,
                            net_line_total: netLineTotal,
                            total_discount_amount: totalDiscountAmount,
                            discounted_unit_price: allocation?.discountedUnitPrice ?? (quantity > 0 ? netLineTotal / quantity : price),
                            completed_at: sale.completed_at,
                        };
                    })
                );
                }
            } catch (err) {
                console.error('Failed to fetch vendor sales:', err);
                setSales([]);
            } finally {
                setIsLoading(false);
            }
        };

        fetchSales();
    }, [userRecord?.consignor_id]);

    // Filter by date range
    const filteredSales = sales.filter((sale) => {
        const saleDate = new Date(sale.completed_at);
        if (dateFrom && saleDate < new Date(dateFrom)) return false;
        if (dateTo) {
            const toDate = new Date(dateTo);
            toDate.setHours(23, 59, 59, 999);
            if (saleDate > toDate) return false;
        }
        return true;
    });

    // Calculate totals
    const totalSales = filteredSales.reduce((sum, s) => sum + s.net_line_total, 0);
    const totalDiscounts = filteredSales.reduce((sum, s) => sum + s.total_discount_amount, 0);
    const totalEarnings = filteredSales.reduce(
        (sum, s) => sum + s.net_line_total * s.commission_split,
        0
    );
    const totalItemsSold = filteredSales.reduce((sum, s) => sum + s.quantity, 0);

    const columns: Column<SaleItemWithDate>[] = [
        {
            key: 'name',
            header: 'Item',
            render: (item) => (
                <div>
                    <p className="font-medium">{item.name}</p>
                    <p className="text-xs text-[var(--color-muted)] font-mono">{item.sku}</p>
                </div>
            ),
        },
        {
            key: 'quantity',
            header: 'Qty',
            width: '60px',
        },
        {
            key: 'price',
            header: 'Sale Price',
            width: '130px',
            render: (item) => {
                const hasDiscount = item.total_discount_amount > 0.009;

                return (
                    <div className="text-right">
                        {hasDiscount ? (
                            <>
                                <p className="text-xs text-[var(--color-muted)] line-through">
                                    {formatCurrency(item.original_line_total)}
                                </p>
                                <p className="font-medium">{formatCurrency(item.net_line_total)}</p>
                            </>
                        ) : (
                            <p>{formatCurrency(item.original_line_total)}</p>
                        )}
                    </div>
                );
            },
        },
        {
            key: 'discount_amount',
            header: 'Discount',
            width: '120px',
            render: (item) => item.total_discount_amount > 0.009 ? (
                <div>
                    <p className="font-medium text-[var(--color-success)]">
                        -{formatCurrency(item.total_discount_amount)}
                    </p>
                    {item.discount_reason ? (
                        <p className="text-xs text-[var(--color-muted)]">{item.discount_reason}</p>
                    ) : null}
                </div>
            ) : (
                <span className="text-[var(--color-muted)]">-</span>
            ),
        },
        {
            key: 'commission_split',
            header: 'Your Cut',
            width: '100px',
            render: (item) => (
                <span className="text-[var(--color-primary)] font-medium">
                    {formatCurrency(item.net_line_total * item.commission_split)}
                </span>
            ),
        },
        {
            key: 'completed_at',
            header: 'Date',
            width: '120px',
            render: (item) => formatDate(item.completed_at),
        },
    ];

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-96">
                <LoadingSpinner size={32} />
            </div>
        );
    }

    return (
        <div className="animate-fadeIn">
            <Header
                title="My Sales"
                description="View your sold items and earnings"
            />

            {/* Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <Card variant="outlined">
                    <CardContent className="p-4 text-center">
                        <p className="text-xs text-[var(--color-muted)] uppercase">Items Sold</p>
                        <p className="text-2xl font-bold">{totalItemsSold}</p>
                    </CardContent>
                </Card>
                <Card variant="outlined">
                    <CardContent className="p-4 text-center">
                        <p className="text-xs text-[var(--color-muted)] uppercase">Net Sales</p>
                        <p className="text-2xl font-bold">{formatCurrency(totalSales)}</p>
                    </CardContent>
                </Card>
                <Card variant="outlined">
                    <CardContent className="p-4 text-center">
                        <p className="text-xs text-[var(--color-muted)] uppercase">Discounts</p>
                        <p className="text-2xl font-bold text-[var(--color-success)]">
                            -{formatCurrency(totalDiscounts)}
                        </p>
                    </CardContent>
                </Card>
                <Card variant="elevated" className="bg-gradient-to-br from-[var(--color-primary)]/10 to-transparent">
                    <CardContent className="p-4 text-center">
                        <p className="text-xs text-[var(--color-muted)] uppercase">Your Earnings</p>
                        <p className="text-2xl font-bold text-[var(--color-primary)]">
                            {formatCurrency(totalEarnings)}
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Date Filter */}
            <Card variant="outlined" className="mb-6">
                <CardContent className="p-4">
                    <div className="flex gap-4 items-end">
                        <Input
                            label="From"
                            type="date"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                        />
                        <Input
                            label="To"
                            type="date"
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                        />
                        {(dateFrom || dateTo) && (
                            <button
                                onClick={() => {
                                    setDateFrom('');
                                    setDateTo('');
                                }}
                                className="text-sm text-[var(--color-primary)] hover:underline pb-2"
                            >
                                Clear
                            </button>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Sales Table */}
            {filteredSales.length === 0 ? (
                <Card variant="outlined" padding="lg">
                    <EmptyState
                        title="No sales found"
                        description={
                            dateFrom || dateTo
                                ? 'Try adjusting your date filters'
                                : 'Your sold items will appear here'
                        }
                    />
                </Card>
            ) : (
                <Table
                    data={filteredSales}
                    columns={columns}
                    keyExtractor={(item) => item.id}
                    searchable
                    searchPlaceholder="Search sales..."
                    searchKeys={['name', 'sku']}
                />
            )}
        </div>
    );
}
