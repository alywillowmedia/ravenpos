import { useState, useEffect, useMemo } from 'react';
import { Header } from '../../components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { supabase } from '../../lib/supabase';
import {
    calculateSaleItemDiscountAllocations,
    getJoinedSaleDiscountData,
    type SaleItemDiscountAllocationInput,
} from '../../lib/saleDiscounts';
import { formatCurrency, formatDate } from '../../lib/utils';
import type { Consignor } from '../../types';

const DISCOUNT_CONTEXT_FETCH_BATCH_SIZE = 1000;

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
    quantity: number;
    commission_split: number;
    original_line_total: number;
    net_line_total: number;
    total_discount_amount: number;
    completed_at: string;
}

interface VendorSaleNotification {
    id: string;
    saleItemId: string;
    title: string;
    message: string;
    createdAt: string;
    read: boolean;
}

interface SaleItemInsertRow {
    id: string;
    sale_id: string;
    name: string;
    price: number | string;
    quantity: number;
    commission_split: number | string;
    discount_amount?: number | string | null;
    created_at: string;
}

interface SaleItemWithSaleRow {
    id: string;
    sale_id: string;
    name: string;
    price: number | string;
    quantity: number;
    commission_split: number | string;
    discount_amount?: number | string | null;
    sales: unknown;
}

async function loadSaleItemDiscountAllocations(
    saleItems: SaleItemWithSaleRow[]
): Promise<ReturnType<typeof calculateSaleItemDiscountAllocations>> {
    const saleIds = Array.from(new Set(saleItems.map((item) => item.sale_id).filter(Boolean)));
    const saleDiscountTotals = new Map<string, number>();

    for (const item of saleItems) {
        saleDiscountTotals.set(item.sale_id, getJoinedSaleDiscountData(item.sales).discount_total);
    }

    if (saleIds.length === 0) {
        return new Map();
    }

    const allItemsForSales: SaleItemDiscountAllocationInput[] = [];
    let from = 0;

    while (true) {
        const { data, error } = await supabase
            .from('sale_items')
            .select('id, sale_id, price, quantity, discount_amount')
            .in('sale_id', saleIds)
            .order('sale_id', { ascending: true })
            .order('id', { ascending: true })
            .range(from, from + DISCOUNT_CONTEXT_FETCH_BATCH_SIZE - 1);

        if (error) throw error;

        const batch = (data || []) as SaleItemDiscountAllocationInput[];
        allItemsForSales.push(...batch);

        if (batch.length < DISCOUNT_CONTEXT_FETCH_BATCH_SIZE) break;
        from += DISCOUNT_CONTEXT_FETCH_BATCH_SIZE;
    }

    return calculateSaleItemDiscountAllocations(
        allItemsForSales,
        saleDiscountTotals
    );
}

function buildRecentSale(row: SaleItemWithSaleRow, completedAt: string, fallbackDiscountAmount = 0): RecentSale {
    const price = Number(row.price || 0);
    const quantity = Number(row.quantity || 0);
    const originalLineTotal = price * quantity;
    const netLineTotal = Math.max(0, originalLineTotal - fallbackDiscountAmount);

    return {
        id: row.id,
        name: row.name,
        price,
        quantity,
        commission_split: Number(row.commission_split || 0),
        original_line_total: originalLineTotal,
        net_line_total: netLineTotal,
        total_discount_amount: Math.max(0, originalLineTotal - netLineTotal),
        completed_at: completedAt,
    };
}

const DASHBOARD_FETCH_BATCH_SIZE = 1000;

export function VendorDashboard() {
    const { userRecord } = useAuth();
    const toast = useToast();
    const [consignor, setConsignor] = useState<Consignor | null>(null);
    const [stats, setStats] = useState<VendorStats | null>(null);
    const [recentSales, setRecentSales] = useState<RecentSale[]>([]);
    const [saleNotifications, setSaleNotifications] = useState<VendorSaleNotification[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const consignorId = userRecord?.consignor_id ?? null;

    const notificationsStorageKey = useMemo(
        () => (consignorId ? `vendor-sale-notifications:${consignorId}` : null),
        [consignorId]
    );

    useEffect(() => {
        if (!notificationsStorageKey) {
            setSaleNotifications([]);
            return;
        }

        const raw = localStorage.getItem(notificationsStorageKey);
        if (!raw) {
            setSaleNotifications([]);
            return;
        }

        try {
            const parsed = JSON.parse(raw) as VendorSaleNotification[];
            setSaleNotifications(Array.isArray(parsed) ? parsed.slice(0, 20) : []);
        } catch {
            setSaleNotifications([]);
        }
    }, [notificationsStorageKey]);

    useEffect(() => {
        if (!notificationsStorageKey) return;
        localStorage.setItem(notificationsStorageKey, JSON.stringify(saleNotifications.slice(0, 20)));
    }, [saleNotifications, notificationsStorageKey]);

    useEffect(() => {
        const fetchData = async () => {
            if (!consignorId) return;

            try {
            // Fetch consignor info
            const { data: consignorData } = await supabase
                .from('consignors')
                .select('*')
                .eq('id', consignorId)
                .single();

            setConsignor(consignorData);

            // Fetch active inventory stats in batches to avoid API row caps.
            const itemQuantities: Array<{ quantity: number | null }> = [];
            let itemsOffset = 0;
            let hasMoreItems = consignorData?.is_active !== false;

            while (hasMoreItems) {
                const { data: itemsBatch, error: itemsError } = await supabase
                    .from('items')
                    .select('quantity')
                    .eq('consignor_id', consignorId)
                    .order('id', { ascending: true })
                    .range(itemsOffset, itemsOffset + DASHBOARD_FETCH_BATCH_SIZE - 1);

                if (itemsError) throw itemsError;

                const batch = (itemsBatch || []) as Array<{ quantity: number | null }>;
                itemQuantities.push(...batch);

                if (batch.length < DASHBOARD_FETCH_BATCH_SIZE) {
                    hasMoreItems = false;
                } else {
                    itemsOffset += DASHBOARD_FETCH_BATCH_SIZE;
                }
            }

            const totalItems = itemQuantities.length;
            const totalQuantity = itemQuantities.reduce((sum, i) => sum + Number(i.quantity || 0), 0);

            // Fetch sold items in batches to keep all-time/monthly tallies accurate.
            const allSaleItems: Array<{
                id: string;
                sale_id: string;
                name: string;
                quantity: number;
                price: number | string;
                commission_split: number | string;
                discount_amount?: number | string | null;
                sales: unknown;
            }> = [];
            let salesOffset = 0;
            let hasMoreSales = true;

            while (hasMoreSales) {
                const { data: salesBatch, error: salesError } = await supabase
                    .from('sale_items')
                    .select('id, sale_id, name, quantity, price, commission_split, discount_amount, sales!inner(completed_at, discount_total)')
                    .eq('consignor_id', consignorId)
                    .order('id', { ascending: true })
                    .range(salesOffset, salesOffset + DASHBOARD_FETCH_BATCH_SIZE - 1);

                if (salesError) throw salesError;

                const batch = (salesBatch || []) as Array<{
                    id: string;
                    sale_id: string;
                    name: string;
                    quantity: number;
                    price: number | string;
                    commission_split: number | string;
                    discount_amount?: number | string | null;
                    sales: unknown;
                }>;
                allSaleItems.push(...batch);

                if (batch.length < DASHBOARD_FETCH_BATCH_SIZE) {
                    hasMoreSales = false;
                } else {
                    salesOffset += DASHBOARD_FETCH_BATCH_SIZE;
                }
            }

            const discountAllocations = await loadSaleItemDiscountAllocations(allSaleItems);
            const soldAllTime = allSaleItems?.reduce((sum, si) => sum + si.quantity, 0) || 0;

            // This month's sales
            const startOfMonth = new Date();
            startOfMonth.setDate(1);
            startOfMonth.setHours(0, 0, 0, 0);

            const thisMonthSales = allSaleItems?.filter(si => {
                const completedAt = getJoinedSaleDiscountData(si.sales).completed_at;
                if (!completedAt) return false;
                const saleDate = new Date(completedAt);
                return saleDate >= startOfMonth;
            }) || [];

            const soldThisMonth = thisMonthSales.reduce((sum, si) => sum + si.quantity, 0);
            const earningsThisMonth = thisMonthSales.reduce(
                (sum, si) => {
                    const allocation = discountAllocations.get(si.id);
                    const rawLineTotal = Number(si.price || 0) * Number(si.quantity || 0);
                    const netLineTotal = allocation?.netLineTotal
                        ?? Math.max(0, rawLineTotal - Number(si.discount_amount || 0));
                    return sum + (netLineTotal * Number(si.commission_split));
                },
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
            const { data: recent, error: recentError } = await supabase
                .from('sale_items')
                .select('id, sale_id, name, price, quantity, commission_split, discount_amount, sales!inner(completed_at, discount_total)')
                .eq('consignor_id', consignorId)
                .order('sales(completed_at)', { ascending: false })
                .limit(10);
            if (recentError) throw recentError;

            const recentRows = (recent || []) as SaleItemWithSaleRow[];
            const recentDiscountAllocations = await loadSaleItemDiscountAllocations(recentRows);
            setRecentSales(
                recentRows.map((row) => {
                    const sale = getJoinedSaleDiscountData(row.sales);
                    const allocation = recentDiscountAllocations.get(row.id);
                    const fallback = buildRecentSale(
                        row,
                        sale.completed_at,
                        Number(row.discount_amount || 0)
                    );
                    return {
                        ...fallback,
                        original_line_total: allocation?.originalLineTotal ?? fallback.original_line_total,
                        net_line_total: allocation?.netLineTotal ?? fallback.net_line_total,
                        total_discount_amount: allocation?.totalDiscountAmount ?? fallback.total_discount_amount,
                    };
                })
            );
            } catch (err) {
                console.error('Failed to fetch vendor dashboard:', err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [consignorId]);

    useEffect(() => {
        if (!consignorId) return;

        const channel = supabase
            .channel(`vendor-sale-notifications-${consignorId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'sale_items',
                    filter: `consignor_id=eq.${consignorId}`,
                },
                async (payload) => {
                    try {
                        const row = payload.new as SaleItemInsertRow;
                        if (!row?.id || !row?.sale_id) return;

                        const quantity = Number(row.quantity) || 0;
                        const price = Number(row.price) || 0;
                        const commissionSplit = Number(row.commission_split) || 0;

                        const { data: saleData, error: saleError } = await supabase
                            .from('sales')
                            .select('completed_at, discount_total')
                            .eq('id', row.sale_id)
                            .maybeSingle();

                        if (saleError) throw saleError;

                        const completedAt = saleData?.completed_at || row.created_at || new Date().toISOString();
                        const saleRows: SaleItemWithSaleRow[] = [{
                            id: row.id,
                            sale_id: row.sale_id,
                            name: row.name,
                            price,
                            quantity,
                            commission_split: commissionSplit,
                            discount_amount: row.discount_amount,
                            sales: saleData ? { completed_at: completedAt, discount_total: saleData.discount_total } : null,
                        }];
                        const allocations = await loadSaleItemDiscountAllocations(saleRows);
                        const allocation = allocations.get(row.id);
                        const fallback = buildRecentSale(saleRows[0], completedAt, Number(row.discount_amount || 0));
                        const netLineTotal = allocation?.netLineTotal ?? fallback.net_line_total;
                        const earned = netLineTotal * commissionSplit;
                        const saleDate = new Date(completedAt);
                        const startOfMonth = new Date();
                        startOfMonth.setDate(1);
                        startOfMonth.setHours(0, 0, 0, 0);

                        setRecentSales((prev) => [
                            {
                                ...fallback,
                                original_line_total: allocation?.originalLineTotal ?? fallback.original_line_total,
                                net_line_total: netLineTotal,
                                total_discount_amount: allocation?.totalDiscountAmount ?? fallback.total_discount_amount,
                            },
                            ...prev,
                        ].slice(0, 10));

                        setStats((prev) => {
                            if (!prev) return prev;
                            return {
                                ...prev,
                                soldAllTime: prev.soldAllTime + quantity,
                                soldThisMonth: saleDate >= startOfMonth ? prev.soldThisMonth + quantity : prev.soldThisMonth,
                                earningsThisMonth: saleDate >= startOfMonth ? prev.earningsThisMonth + earned : prev.earningsThisMonth,
                            };
                        });

                        const notification: VendorSaleNotification = {
                            id: `sale-note-${row.id}`,
                            saleItemId: row.id,
                            title: `New sale: ${row.name}`,
                            message: `${quantity} sold • ${formatCurrency(earned)} earned`,
                            createdAt: completedAt,
                            read: false,
                        };

                        setSaleNotifications((prev) => [notification, ...prev].slice(0, 20));
                        toast.success(notification.title, notification.message);
                    } catch (err) {
                        console.error('Failed to process vendor sale notification:', err);
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [consignorId, toast]);

    const unreadCount = useMemo(
        () => saleNotifications.filter((note) => !note.read).length,
        [saleNotifications]
    );

    const markAllNotificationsRead = () => {
        setSaleNotifications((prev) => prev.map((note) => ({ ...note, read: true })));
        toast.info('Notifications cleared', 'All sale notifications marked as read.');
    };

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
                    <div className="flex items-center justify-between gap-3">
                        <CardTitle>Live Sale Notifications</CardTitle>
                        <div className="flex items-center gap-2">
                            {unreadCount > 0 ? (
                                <span className="rounded-full bg-[var(--color-success-bg)] px-2 py-0.5 text-xs font-semibold text-[var(--color-success)]">
                                    {unreadCount} new
                                </span>
                            ) : null}
                            <Button size="sm" variant="secondary" onClick={markAllNotificationsRead} disabled={saleNotifications.length === 0}>
                                Mark all read
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {saleNotifications.length === 0 ? (
                        <p className="text-[var(--color-muted)] text-sm py-8 text-center">
                            Sale notifications will appear here in real time.
                        </p>
                    ) : (
                        <div className="divide-y divide-[var(--color-border)]">
                            {saleNotifications.slice(0, 6).map((notification) => (
                                <div key={notification.id} className="py-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <p className="font-medium text-[var(--color-foreground)]">{notification.title}</p>
                                        {!notification.read ? (
                                            <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-success)]" />
                                        ) : null}
                                    </div>
                                    <p className="text-xs text-[var(--color-primary)] mt-1">{notification.message}</p>
                                    <p className="text-xs text-[var(--color-muted)] mt-1">{formatDate(notification.createdAt)}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Recent Sales */}
            <Card variant="outlined" className="mt-6">
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
                                            {sale.quantity > 1 ? ` • Qty ${sale.quantity}` : ''}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-medium text-[var(--color-foreground)]">
                                            {formatCurrency(sale.net_line_total)}
                                        </p>
                                        {sale.total_discount_amount > 0.009 ? (
                                            <p className="text-xs text-[var(--color-muted)]">
                                                <span className="line-through">{formatCurrency(sale.original_line_total)}</span>
                                                {' '}- {formatCurrency(sale.total_discount_amount)}
                                            </p>
                                        ) : null}
                                        <p className="text-xs text-[var(--color-primary)]">
                                            +{formatCurrency(sale.net_line_total * sale.commission_split)} earned
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
