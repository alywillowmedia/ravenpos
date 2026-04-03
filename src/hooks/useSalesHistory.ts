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

interface UseSalesHistoryOptions {
    page?: number;
    pageSize?: number;
    dateStart?: string | null;
    dateEnd?: string | null;
    consignorId?: string;
}

export function useSalesHistory(options: UseSalesHistoryOptions = {}) {
    const {
        page = 1,
        pageSize = 50,
        dateStart = null,
        dateEnd = null,
        consignorId = '',
    } = options;

    const [sales, setSales] = useState<SaleWithItems[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [totalCount, setTotalCount] = useState(0);

    const fetchSales = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);

            // Fetch one page of sales with customer data, ordered by date descending
            let salesQuery = supabase
                .from('sales')
                .select('*,customer:customers(*)', { count: 'exact' })
                .order('completed_at', { ascending: false })
                .order('id', { ascending: false });

            if (dateStart) {
                salesQuery = salesQuery.gte('completed_at', dateStart);
            }

            if (dateEnd) {
                salesQuery = salesQuery.lte('completed_at', dateEnd);
            }

            if (consignorId) {
                const { data: saleIdRows, error: saleIdError } = await supabase
                    .from('sale_items')
                    .select('sale_id')
                    .eq('consignor_id', consignorId);

                if (saleIdError) throw saleIdError;

                const saleIdsForConsignor = Array.from(
                    new Set((saleIdRows || []).map((row) => row.sale_id).filter(Boolean))
                );

                if (saleIdsForConsignor.length === 0) {
                    setSales([]);
                    setTotalCount(0);
                    return;
                }

                salesQuery = salesQuery.in('id', saleIdsForConsignor);
            }

            const from = (page - 1) * pageSize;
            const to = from + pageSize - 1;

            const { data: salesData, error: salesError, count } = await salesQuery.range(from, to);

            if (salesError) throw salesError;
            setTotalCount(count || 0);

            const salesRows = (salesData || []) as (Sale & { customer?: Customer })[];
            const saleIds = salesRows.map((sale) => sale.id);

            if (saleIds.length === 0) {
                setSales([]);
                return;
            }

            // Fetch sale items only for the current page sales
            const { data: itemsData, error: itemsError } = await supabase
                .from('sale_items')
                .select(`
                    *,
                    consignor:consignors(*)
                `)
                .in('sale_id', saleIds);

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
            const salesWithItems: SaleWithItems[] = salesRows.map((sale) => ({
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
    }, [consignorId, dateEnd, dateStart, page, pageSize]);

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
        totalCount,
        isLoading,
        error,
        refetch: fetchSales,
        calculateSalesSummary,
        filterByDateRange,
        filterByConsignor,
    };
}
