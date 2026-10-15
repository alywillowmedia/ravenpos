import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { calculateSaleItemDiscountBreakdown } from '../lib/saleDiscounts';
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

type SaleItemWithConsignor = SaleItem & { consignor?: Consignor };

// Long id lists overflow the URL length the API gateway accepts (414), so
// sale items are fetched in batches.
const SALE_ID_BATCH_SIZE = 150;

async function fetchSaleItemsForSales(saleIds: string[]): Promise<SaleItemWithConsignor[]> {
    const items: SaleItemWithConsignor[] = [];
    for (let start = 0; start < saleIds.length; start += SALE_ID_BATCH_SIZE) {
        const { data, error } = await supabase
            .from('sale_items')
            .select(`
                *,
                consignor:consignors(*)
            `)
            .in('sale_id', saleIds.slice(start, start + SALE_ID_BATCH_SIZE));

        if (error) throw error;
        items.push(...((data || []) as SaleItemWithConsignor[]));
    }
    return items;
}

function stripConsignorMatch(rows: unknown[] | null): (Sale & { customer?: Customer })[] {
    return (rows || []).map((row) => {
        const sale = { ...(row as Sale & { customer?: Customer; consignor_match?: unknown }) };
        delete sale.consignor_match;
        return sale;
    });
}

export function useSalesHistory(options: UseSalesHistoryOptions = {}) {
    const FULL_SALES_FETCH_BATCH_SIZE = 1000;
    const {
        page = 1,
        pageSize = 50,
        dateStart = null,
        dateEnd = null,
        consignorId = '',
    } = options;

    const [sales, setSales] = useState<SaleWithItems[]>([]);
    const [allFilteredSales, setAllFilteredSales] = useState<SaleWithItems[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingAllFiltered, setIsLoadingAllFiltered] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [totalCount, setTotalCount] = useState(0);

    // Vendor filter as a join on the server: an id list of a busy vendor's sales
    // is too long for the request URL.
    const salesSelect = consignorId
        ? '*,customer:customers(*),consignor_match:sale_items!inner(consignor_id)'
        : '*,customer:customers(*)';

    const fetchSales = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);

            // Fetch one page of sales with customer data, ordered by date descending
            let salesQuery = supabase
                .from('sales')
                .select(salesSelect, { count: 'exact' })
                .order('completed_at', { ascending: false })
                .order('id', { ascending: false });

            if (dateStart) {
                salesQuery = salesQuery.gte('completed_at', dateStart);
            }

            if (dateEnd) {
                salesQuery = salesQuery.lte('completed_at', dateEnd);
            }

            if (consignorId) {
                salesQuery = salesQuery.eq('consignor_match.consignor_id', consignorId);
            }

            const from = (page - 1) * pageSize;
            const to = from + pageSize - 1;

            const { data: salesData, error: salesError, count } = await salesQuery.range(from, to);

            if (salesError) throw salesError;
            setTotalCount(count || 0);

            const salesRows = stripConsignorMatch(salesData);
            const saleIds = salesRows.map((sale) => sale.id);

            if (saleIds.length === 0) {
                setSales([]);
                return;
            }

            // Fetch sale items only for the current page sales
            const itemsData = await fetchSaleItemsForSales(saleIds);

            // Group items by sale_id
            const itemsBySale: Record<string, (SaleItem & { consignor?: Consignor })[]> = {};
            for (const item of itemsData) {
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
    }, [consignorId, dateEnd, dateStart, page, pageSize, salesSelect]);

    const fetchAllFilteredSales = useCallback(async () => {
        try {
            setIsLoadingAllFiltered(true);

            const allSalesRows: (Sale & { customer?: Customer })[] = [];
            let from = 0;

            while (true) {
                let salesQuery = supabase
                    .from('sales')
                    .select(salesSelect)
                    .order('completed_at', { ascending: false })
                    .order('id', { ascending: false });

                if (dateStart) {
                    salesQuery = salesQuery.gte('completed_at', dateStart);
                }

                if (dateEnd) {
                    salesQuery = salesQuery.lte('completed_at', dateEnd);
                }

                if (consignorId) {
                    salesQuery = salesQuery.eq('consignor_match.consignor_id', consignorId);
                }

                const to = from + FULL_SALES_FETCH_BATCH_SIZE - 1;
                const { data: salesData, error: salesError } = await salesQuery.range(from, to);
                if (salesError) throw salesError;

                const batch = stripConsignorMatch(salesData);
                allSalesRows.push(...batch);

                if (batch.length < FULL_SALES_FETCH_BATCH_SIZE) {
                    break;
                }

                from += FULL_SALES_FETCH_BATCH_SIZE;
            }

            const saleIds = allSalesRows.map((sale) => sale.id);

            if (saleIds.length === 0) {
                setAllFilteredSales([]);
                return;
            }

            const itemsData = await fetchSaleItemsForSales(saleIds);

            const itemsBySale: Record<string, (SaleItem & { consignor?: Consignor })[]> = {};
            for (const item of itemsData) {
                if (!itemsBySale[item.sale_id]) {
                    itemsBySale[item.sale_id] = [];
                }
                itemsBySale[item.sale_id].push(item);
            }

            const salesWithItems: SaleWithItems[] = allSalesRows.map((sale) => ({
                ...sale,
                items: itemsBySale[sale.id] || [],
                customer: sale.customer || undefined,
            }));

            setAllFilteredSales(salesWithItems);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to fetch full filtered sales';
            setError(message);
        } finally {
            setIsLoadingAllFiltered(false);
        }
    }, [consignorId, dateEnd, dateStart, salesSelect]);

    useEffect(() => {
        fetchSales();
    }, [fetchSales]);

    useEffect(() => {
        fetchAllFilteredSales();
    }, [fetchAllFilteredSales]);

    const refetch = useCallback(async () => {
        await Promise.all([fetchSales(), fetchAllFilteredSales()]);
    }, [fetchSales, fetchAllFilteredSales]);

    // Calculate commission split for a sale
    const calculateSalesSummary = useCallback((sale: SaleWithItems): SalesSummary => {
        const consignorSet = new Set<string>();
        let consignorShare = 0;
        const discountBreakdown = calculateSaleItemDiscountBreakdown(
            sale.items,
            Number(sale.discount_total || 0)
        );

        for (const [index, item] of sale.items.entries()) {
            // Add consignor name
            if (item.consignor?.name) {
                consignorSet.add(item.consignor.name);
            }
            // Calculate consignor's portion
            const netLineTotal = discountBreakdown.items[index]?.netLineTotal
                ?? Number(item.price) * item.quantity;
            consignorShare += netLineTotal * item.commission_split;
        }

        const storeShare = discountBreakdown.netSubtotal - consignorShare;

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
        allFilteredSales,
        totalCount,
        isLoading,
        isLoadingAllFiltered,
        error,
        refetch,
        calculateSalesSummary,
        filterByDateRange,
        filterByConsignor,
    };
}
