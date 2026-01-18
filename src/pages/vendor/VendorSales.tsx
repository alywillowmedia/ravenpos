import { useState, useEffect } from 'react';
import { Header } from '../../components/layout/Header';
import { Card, CardContent } from '../../components/ui/Card';
import { Table, type Column } from '../../components/ui/Table';
import { Input } from '../../components/ui/Input';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { formatCurrency, formatDate } from '../../lib/utils';

interface SaleItemWithDate {
    id: string;
    name: string;
    sku: string;
    price: number;
    quantity: number;
    commission_split: number;
    completed_at: string;
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

            let query = supabase
                .from('sale_items')
                .select('id, name, sku, price, quantity, commission_split, sales!inner(completed_at)')
                .eq('consignor_id', userRecord.consignor_id)
                .order('sales(completed_at)', { ascending: false });

            const { data, error } = await query;

            if (!error && data) {
                setSales(
                    data.map((item) => {
                        // Supabase returns joined relations - could be array or single object
                        const salesData = item.sales as unknown;
                        let completedAt = '';
                        if (Array.isArray(salesData) && salesData.length > 0) {
                            completedAt = (salesData[0] as { completed_at: string }).completed_at;
                        } else if (salesData && typeof salesData === 'object' && 'completed_at' in salesData) {
                            completedAt = (salesData as { completed_at: string }).completed_at;
                        }
                        return {
                            id: item.id,
                            name: item.name,
                            sku: item.sku,
                            price: Number(item.price),
                            quantity: item.quantity,
                            commission_split: Number(item.commission_split),
                            completed_at: completedAt,
                        };
                    })
                );
            }

            setIsLoading(false);
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
    const totalSales = filteredSales.reduce((sum, s) => sum + s.price * s.quantity, 0);
    const totalEarnings = filteredSales.reduce(
        (sum, s) => sum + s.price * s.quantity * s.commission_split,
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
            header: 'Price',
            width: '100px',
            render: (item) => formatCurrency(item.price),
        },
        {
            key: 'commission_split',
            header: 'Your Cut',
            width: '100px',
            render: (item) => (
                <span className="text-[var(--color-primary)] font-medium">
                    {formatCurrency(item.price * item.quantity * item.commission_split)}
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
            <div className="grid grid-cols-3 gap-4 mb-6">
                <Card variant="outlined">
                    <CardContent className="p-4 text-center">
                        <p className="text-xs text-[var(--color-muted)] uppercase">Items Sold</p>
                        <p className="text-2xl font-bold">{totalItemsSold}</p>
                    </CardContent>
                </Card>
                <Card variant="outlined">
                    <CardContent className="p-4 text-center">
                        <p className="text-xs text-[var(--color-muted)] uppercase">Total Sales</p>
                        <p className="text-2xl font-bold">{formatCurrency(totalSales)}</p>
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
