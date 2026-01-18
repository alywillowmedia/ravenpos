import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Sale, SaleItem, Consignor, Customer } from '../types';

export interface SaleWithItems extends Sale {
    items: (SaleItem & { consignor?: Consignor })[];
    customer?: Customer;
}

export interface SalesSummary {
    consignorNames: string[];
    consignorShare: number;
    storeShare: number;
}

export function useSalesHistory() {
    const [sales, setSales] = useState<SaleWithItems[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchSales = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);

            // Fetch all sales with customer data, ordered by date descending
            const { data: salesData, error: salesError } = await supabase
                .from('sales')
                .select(`
                    *,
                    customer:customers(*)
                `)
                .order('completed_at', { ascending: false });

            if (salesError) throw salesError;

            // Fetch all sale items with consignor data
            const { data: itemsData, error: itemsError } = await supabase
                .from('sale_items')
                .select(`
                    *,
                    consignor:consignors(*)
                `);

            if (itemsError) throw itemsError;

            // Group items by sale_id
            const itemsBySale: Record<string, (SaleItem & { consignor?: Consignor })[]> = {};
            for (const item of itemsData || []) {
                if (!itemsBySale[item.sale_id]) {
                    itemsBySale[item.sale_id] = [];
                }
                itemsBySale[item.sale_id].push(item);
            }

            // Combine sales with their items and customer
            const salesWithItems: SaleWithItems[] = (salesData || []).map((sale) => ({
                ...sale,
                items: itemsBySale[sale.id] || [],
                customer: sale.customer || undefined,
            }));

            setSales(salesWithItems);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to fetch sales';
            setError(message);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchSales();
    }, [fetchSales]);

    // Calculate commission split for a sale
    const calculateSalesSummary = useCallback((sale: SaleWithItems): SalesSummary => {
        const consignorSet = new Set<string>();
        let consignorShare = 0;

        for (const item of sale.items) {
            // Add consignor name
            if (item.consignor?.name) {
                consignorSet.add(item.consignor.name);
            }
            // Calculate consignor's portion
            const itemTotal = Number(item.price) * item.quantity;
            consignorShare += itemTotal * item.commission_split;
        }

        const storeShare = sale.subtotal - consignorShare;

        return {
            consignorNames: Array.from(consignorSet),
            consignorShare,
            storeShare,
        };
    }, []);

    // Filter sales by date range
    const filterByDateRange = useCallback(
        (startDate: Date | null, endDate: Date | null) => {
            if (!startDate && !endDate) return sales;

            return sales.filter((sale) => {
                const saleDate = new Date(sale.completed_at);
                if (startDate && saleDate < startDate) return false;
                if (endDate) {
                    const endOfDay = new Date(endDate);
                    endOfDay.setHours(23, 59, 59, 999);
                    if (saleDate > endOfDay) return false;
                }
                return true;
            });
        },
        [sales]
    );

    // Filter sales by consignor
    const filterByConsignor = useCallback(
        (consignorId: string) => {
            if (!consignorId) return sales;

            return sales.filter((sale) =>
                sale.items.some((item) => item.consignor_id === consignorId)
            );
        },
        [sales]
    );

    return {
        sales,
        isLoading,
        error,
        refetch: fetchSales,
        calculateSalesSummary,
        filterByDateRange,
        filterByConsignor,
    };
}
