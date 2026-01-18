import { useState, useEffect } from 'react';
import { Header } from '../../components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { formatCurrency, formatDate } from '../../lib/utils';
import type { Consignor } from '../../types';

interface VendorStats {
    totalItems: number;
    totalQuantity: number;
    soldAllTime: number;
    soldThisMonth: number;
    earningsThisMonth: number;
}

interface RecentSale {
    id: string;
    name: string;
    price: number;
    commission_split: number;
    completed_at: string;
}

export function VendorDashboard() {
    const { userRecord } = useAuth();
    const [consignor, setConsignor] = useState<Consignor | null>(null);
    const [stats, setStats] = useState<VendorStats | null>(null);
    const [recentSales, setRecentSales] = useState<RecentSale[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            if (!userRecord?.consignor_id) return;

            // Fetch consignor info
            const { data: consignorData } = await supabase
                .from('consignors')
                .select('*')
                .eq('id', userRecord.consignor_id)
                .single();

            setConsignor(consignorData);

            // Fetch items stats
            const { data: items } = await supabase
                .from('items')
                .select('quantity')
                .eq('consignor_id', userRecord.consignor_id);

            const totalItems = items?.length || 0;
            const totalQuantity = items?.reduce((sum, i) => sum + i.quantity, 0) || 0;

            // Fetch sold items
            const { data: allSaleItems } = await supabase
                .from('sale_items')
                .select('*, sales!inner(completed_at)')
                .eq('consignor_id', userRecord.consignor_id);

            const soldAllTime = allSaleItems?.reduce((sum, si) => sum + si.quantity, 0) || 0;

            // This month's sales
            const startOfMonth = new Date();
            startOfMonth.setDate(1);
            startOfMonth.setHours(0, 0, 0, 0);

            const thisMonthSales = allSaleItems?.filter(si => {
                // Supabase returns joined relations - could be array or single object
                const salesData = si.sales as unknown;
                let completedAt = '';
                if (Array.isArray(salesData) && salesData.length > 0) {
                    completedAt = (salesData[0] as { completed_at: string }).completed_at;
                } else if (salesData && typeof salesData === 'object' && 'completed_at' in salesData) {
                    completedAt = (salesData as { completed_at: string }).completed_at;
                }
                if (!completedAt) return false;
                const saleDate = new Date(completedAt);
                return saleDate >= startOfMonth;
            }) || [];

            const soldThisMonth = thisMonthSales.reduce((sum, si) => sum + si.quantity, 0);
            const earningsThisMonth = thisMonthSales.reduce(
                (sum, si) => sum + (Number(si.price) * si.quantity * Number(si.commission_split)),
                0
            );

            setStats({
                totalItems,
                totalQuantity,
                soldAllTime,
                soldThisMonth,
                earningsThisMonth,
            });

            // Recent sales (last 10)
            const { data: recent } = await supabase
                .from('sale_items')
                .select('id, name, price, commission_split, sales!inner(completed_at)')
                .eq('consignor_id', userRecord.consignor_id)
                .order('sales(completed_at)', { ascending: false })
                .limit(10);

            setRecentSales(
                recent?.map(r => {
                    // Supabase returns joined relations - could be array or single object
                    const salesData = r.sales as unknown;
                    let completedAt = '';
                    if (Array.isArray(salesData) && salesData.length > 0) {
                        completedAt = (salesData[0] as { completed_at: string }).completed_at;
                    } else if (salesData && typeof salesData === 'object' && 'completed_at' in salesData) {
                        completedAt = (salesData as { completed_at: string }).completed_at;
                    }
                    return {
                        id: r.id,
                        name: r.name,
                        price: Number(r.price),
                        commission_split: Number(r.commission_split),
                        completed_at: completedAt,
                    };
                }) || []
            );

            setIsLoading(false);
        };

        fetchData();
    }, [userRecord?.consignor_id]);

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
                title={`Welcome, ${consignor?.name || 'Vendor'}!`}
                description={consignor?.booth_location ? `Booth: ${consignor.booth_location}` : undefined}
            />

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <Card variant="outlined">
                    <CardContent className="p-4">
                        <p className="text-xs text-[var(--color-muted)] uppercase tracking-wider">Items Listed</p>
                        <p className="text-2xl font-bold text-[var(--color-foreground)]">{stats?.totalItems}</p>
                        <p className="text-xs text-[var(--color-muted)]">{stats?.totalQuantity} total qty</p>
                    </CardContent>
                </Card>

                <Card variant="outlined">
                    <CardContent className="p-4">
                        <p className="text-xs text-[var(--color-muted)] uppercase tracking-wider">Items Sold</p>
                        <p className="text-2xl font-bold text-[var(--color-foreground)]">{stats?.soldAllTime}</p>
                        <p className="text-xs text-[var(--color-muted)]">all time</p>
                    </CardContent>
                </Card>

                <Card variant="outlined">
                    <CardContent className="p-4">
                        <p className="text-xs text-[var(--color-muted)] uppercase tracking-wider">Sold This Month</p>
                        <p className="text-2xl font-bold text-[var(--color-foreground)]">{stats?.soldThisMonth}</p>
                        <p className="text-xs text-[var(--color-muted)]">items</p>
                    </CardContent>
                </Card>

                <Card variant="elevated" className="bg-gradient-to-br from-[var(--color-primary)]/10 to-transparent">
                    <CardContent className="p-4">
                        <p className="text-xs text-[var(--color-muted)] uppercase tracking-wider">Earnings This Month</p>
                        <p className="text-2xl font-bold text-[var(--color-primary)]">
                            {formatCurrency(stats?.earningsThisMonth || 0)}
                        </p>
                        <p className="text-xs text-[var(--color-muted)]">your cut</p>
                    </CardContent>
                </Card>
            </div>

            {/* Recent Sales */}
            <Card variant="outlined">
                <CardHeader>
                    <CardTitle>Recent Sales</CardTitle>
                </CardHeader>
                <CardContent>
                    {recentSales.length === 0 ? (
                        <p className="text-[var(--color-muted)] text-sm py-8 text-center">
                            No sales yet. Your sold items will appear here.
                        </p>
                    ) : (
                        <div className="divide-y divide-[var(--color-border)]">
                            {recentSales.map((sale) => (
                                <div key={sale.id} className="py-3 flex items-center justify-between">
                                    <div>
                                        <p className="font-medium text-[var(--color-foreground)]">{sale.name}</p>
                                        <p className="text-xs text-[var(--color-muted)]">
                                            {formatDate(sale.completed_at)}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-medium text-[var(--color-foreground)]">
                                            {formatCurrency(sale.price)}
                                        </p>
                                        <p className="text-xs text-[var(--color-primary)]">
                                            +{formatCurrency(sale.price * sale.commission_split)} earned
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
