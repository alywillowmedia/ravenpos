import { useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

export interface SalesTrendData {
    date: string;
    amount: number;
    count: number;
}

export interface SalesByCategoryData {
    category: string;
    amount: number;
    count: number;
}

export interface CustomerGrowthData {
    date: string;
    count: number;
    cumulative: number;
}

export interface InventoryStatsData {
    totalItems: number;
    totalValue: number;
    lowStock: number;
    outOfStock: number;
}

export function useAnalytics() {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const loadingCount = useRef(0);

    const startLoading = () => {
        loadingCount.current += 1;
        setIsLoading(true);
    };

    const stopLoading = () => {
        loadingCount.current -= 1;
        if (loadingCount.current <= 0) {
            loadingCount.current = 0;
            setIsLoading(false);
        }
    };

    const getSalesTrend = useCallback(async (days: number = 30, hourly: boolean = false) => {
        try {
            startLoading();
            const endDate = new Date();
            const startDate = new Date();

            if (hourly) {
                // Last 24 hours
                startDate.setHours(endDate.getHours() - 24);
            } else {
                startDate.setDate(endDate.getDate() - days);
            }

            const { data, error } = await supabase
                .from('sales')
                .select('completed_at, total')
                .gte('completed_at', startDate.toISOString())
                .lte('completed_at', endDate.toISOString())
                .order('completed_at', { ascending: true });

            if (error) throw error;

            if (hourly) {
                // Group by hour for last 24 hours
                const grouped = (data || []).reduce((acc: Record<string, SalesTrendData>, sale) => {
                    const saleDate = new Date(sale.completed_at);
                    const hourKey = saleDate.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });
                    const dateKey = `${saleDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${hourKey}`;
                    if (!acc[dateKey]) {
                        acc[dateKey] = { date: hourKey, amount: 0, count: 0 };
                    }
                    acc[dateKey].amount += Number(sale.total) || 0;
                    acc[dateKey].count += 1;
                    return acc;
                }, {});

                // Fill in all 25 hours (24 hours ago through current hour)
                const result: SalesTrendData[] = [];
                for (let i = 0; i <= 24; i++) {
                    const d = new Date(startDate);
                    d.setHours(d.getHours() + i);
                    const hourKey = d.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });
                    const dateKey = `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${hourKey}`;
                    result.push(grouped[dateKey] || { date: hourKey, amount: 0, count: 0 });
                }

                return { data: result, error: null };
            } else {
                // Group by date
                const grouped = (data || []).reduce((acc: Record<string, SalesTrendData>, sale) => {
                    const date = new Date(sale.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    if (!acc[date]) {
                        acc[date] = { date, amount: 0, count: 0 };
                    }
                    acc[date].amount += Number(sale.total) || 0;
                    acc[date].count += 1;
                    return acc;
                }, {});

                // Fill in missing dates (include today, so days + 1)
                const result: SalesTrendData[] = [];
                for (let i = 0; i <= days; i++) {
                    const d = new Date(startDate);
                    d.setDate(d.getDate() + i);
                    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    result.push(grouped[dateStr] || { date: dateStr, amount: 0, count: 0 });
                }

                return { data: result, error: null };
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to fetch sales trend';
            setError(message);
            return { data: [], error: message };
        } finally {
            stopLoading();
        }
    }, []);

    const getSalesByCategory = useCallback(async () => {
        try {
            startLoading();
            const { data, error } = await supabase
                .from('sale_items')
                .select(`
                    id,
                    price,
                    quantity,
                    item:items (
                        category
                    )
                `);

            if (error) throw error;

            const grouped = (data || []).reduce((acc: Record<string, SalesByCategoryData>, item: any) => {
                const category = item.item?.category || 'Uncategorized';
                if (!acc[category]) {
                    acc[category] = { category, amount: 0, count: 0 };
                }
                const price = Number(item.price) || 0;
                const quantity = Number(item.quantity) || 0;
                acc[category].amount += price * quantity;
                acc[category].count += quantity;
                return acc;
            }, {});

            const result = Object.values(grouped).sort((a, b) => b.amount - a.amount);
            return { data: result, error: null };
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to fetch sales by category';
            setError(message);
            return { data: [], error: message };
        } finally {
            stopLoading();
        }
    }, []);

    const getCustomerGrowth = useCallback(async (days: number = 30, hourly: boolean = false) => {
        try {
            startLoading();
            const endDate = new Date();
            const startDate = new Date();

            if (hourly) {
                startDate.setHours(endDate.getHours() - 24);
            } else {
                startDate.setDate(endDate.getDate() - days);
            }

            // First, get the count of customers created before the start date
            const { count: previousCount, error: countError } = await supabase
                .from('customers')
                .select('*', { count: 'exact', head: true })
                .lt('created_at', startDate.toISOString());

            if (countError) throw countError;

            const { data, error } = await supabase
                .from('customers')
                .select('created_at')
                .gte('created_at', startDate.toISOString())
                .order('created_at', { ascending: true });

            if (error) throw error;

            if (hourly) {
                // Group by hour
                const grouped = (data || []).reduce((acc: Record<string, number>, customer) => {
                    const custDate = new Date(customer.created_at);
                    const hourKey = custDate.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });
                    const dateKey = `${custDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${hourKey}`;
                    acc[dateKey] = (acc[dateKey] || 0) + 1;
                    return acc;
                }, {});

                // Fill in all 25 hours (24 hours ago through current hour)
                const result: CustomerGrowthData[] = [];
                let runningTotal = previousCount || 0;

                for (let i = 0; i <= 24; i++) {
                    const d = new Date(startDate);
                    d.setHours(d.getHours() + i);
                    const hourKey = d.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });
                    const dateKey = `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${hourKey}`;
                    const count = grouped[dateKey] || 0;
                    runningTotal += count;
                    result.push({ date: hourKey, count, cumulative: runningTotal });
                }

                return { data: result, error: null };
            } else {
                // Group by date
                const grouped = (data || []).reduce((acc: Record<string, number>, customer) => {
                    const date = new Date(customer.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    acc[date] = (acc[date] || 0) + 1;
                    return acc;
                }, {});

                // Fill in missing dates and calculate cumulative (include today, so days + 1)
                const result: CustomerGrowthData[] = [];
                let runningTotal = previousCount || 0;

                for (let i = 0; i <= days; i++) {
                    const d = new Date(startDate);
                    d.setDate(d.getDate() + i);
                    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    const count = grouped[dateStr] || 0;
                    runningTotal += count;
                    result.push({ date: dateStr, count, cumulative: runningTotal });
                }

                return { data: result, error: null };
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to fetch customer growth';
            setError(message);
            return { data: [], error: message };
        } finally {
            stopLoading();
        }
    }, []);

    return {
        isLoading,
        error,
        getSalesTrend,
        getSalesByCategory,
        getCustomerGrowth
    };
}
