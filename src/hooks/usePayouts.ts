import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Payout, PayoutInput, ConsignorPayoutSummary, SaleItemDetail, Consignor } from '../types';

interface SaleItemWithJoins {
    id: string;
    sale_id: string;
    item_id: string;
    consignor_id: string;
    sku: string;
    name: string;
    price: number;
    quantity: number;
    commission_split: number;
    sale: {
        id: string;
        completed_at: string;
        tax_amount: number;
        subtotal: number;
    };
    consignor: Consignor;
}

export function usePayouts() {
    const [payouts, setPayouts] = useState<Payout[]>([]);
    const [consignorSummaries, setConsignorSummaries] = useState<ConsignorPayoutSummary[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Calculate pending payouts for all consignors
    const calculateConsignorSummaries = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);

            // Fetch all active consignors
            const { data: consignors, error: consignorError } = await supabase
                .from('consignors')
                .select('*')
                .eq('is_active', true)
                .order('consignor_number');

            if (consignorError) throw consignorError;

            // Fetch all payouts to get last payout dates
            const { data: allPayouts, error: payoutError } = await supabase
                .from('payouts')
                .select(`
                    *,
                    consignor:consignors(*)
                `)
                .order('paid_at', { ascending: false });

            if (payoutError) throw payoutError;

            // Fetch all sale items with sale data
            const { data: saleItems, error: saleItemsError } = await supabase
                .from('sale_items')
                .select(`
                    *,
                    sale:sales(id, completed_at, tax_amount, subtotal)
                `);

            if (saleItemsError) throw saleItemsError;

            // Calculate summaries for each consignor
            const summaries: ConsignorPayoutSummary[] = [];

            for (const consignor of consignors || []) {
                // Get last payout for this consignor
                const lastPayout = (allPayouts || []).find(p => p.consignor_id === consignor.id) || null;
                const lastPayoutDate = lastPayout ? new Date(lastPayout.paid_at) : new Date(0);

                // Filter sale items for this consignor since last payout
                const consignorSaleItems = (saleItems || [])
                    .filter((item: SaleItemWithJoins) => {
                        if (item.consignor_id !== consignor.id) return false;
                        if (!item.sale) return false;
                        const saleDate = new Date(item.sale.completed_at);
                        return saleDate > lastPayoutDate;
                    });

                // Calculate totals
                let pendingAmount = 0;
                let grossSales = 0;
                let storeShare = 0;
                let itemsSold = 0;
                const salesSet = new Set<string>();
                const salesDetails: SaleItemDetail[] = [];

                for (const item of consignorSaleItems as SaleItemWithJoins[]) {
                    const lineTotal = Number(item.price) * item.quantity;
                    const consignorShare = lineTotal * item.commission_split;
                    const itemStoreShare = lineTotal - consignorShare;

                    // Calculate proportional tax for this item
                    const saleSubtotal = item.sale.subtotal || lineTotal;
                    const saleTax = item.sale.tax_amount || 0;
                    const itemTaxPortion = saleSubtotal > 0 ? (lineTotal / saleSubtotal) * saleTax : 0;

                    pendingAmount += consignorShare;
                    grossSales += lineTotal;
                    storeShare += itemStoreShare;
                    itemsSold += item.quantity;
                    salesSet.add(item.sale_id);

                    salesDetails.push({
                        saleId: item.sale_id,
                        saleDate: item.sale.completed_at,
                        itemName: item.name,
                        sku: item.sku,
                        quantity: item.quantity,
                        price: Number(item.price),
                        lineTotal,
                        commissionSplit: item.commission_split,
                        consignorShare,
                        storeShare: itemStoreShare,
                        taxAmount: itemTaxPortion,
                    });
                }

                // Calculate total tax collected for this consignor's items
                const taxCollected = salesDetails.reduce((sum, s) => sum + s.taxAmount, 0);

                summaries.push({
                    consignor,
                    pendingAmount,
                    grossSales,
                    taxCollected,
                    storeShare,
                    salesCount: salesSet.size,
                    itemsSold,
                    lastPayout,
                    salesSinceLastPayout: salesDetails.sort(
                        (a, b) => new Date(b.saleDate).getTime() - new Date(a.saleDate).getTime()
                    ),
                });
            }

            // Sort by pending amount descending (highest payouts first)
            summaries.sort((a, b) => b.pendingAmount - a.pendingAmount);

            setConsignorSummaries(summaries);
            setPayouts(allPayouts || []);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to calculate payouts';
            setError(message);
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Mark a consignor as paid
    const markAsPaid = useCallback(async (
        consignorId: string,
        summary: ConsignorPayoutSummary,
        notes?: string
    ): Promise<{ success: boolean; error?: string }> => {
        try {
            // Determine period dates
            const periodStart = summary.lastPayout
                ? summary.lastPayout.paid_at
                : summary.salesSinceLastPayout.length > 0
                    ? summary.salesSinceLastPayout[summary.salesSinceLastPayout.length - 1].saleDate
                    : new Date().toISOString();
            const periodEnd = new Date().toISOString();

            const payoutData: PayoutInput = {
                consignor_id: consignorId,
                amount: summary.pendingAmount,
                period_start: periodStart,
                period_end: periodEnd,
                sales_count: summary.salesCount,
                items_sold: summary.itemsSold,
                gross_sales: summary.grossSales,
                tax_collected: summary.taxCollected,
                store_share: summary.storeShare,
                notes: notes || null,
                paid_at: new Date().toISOString(),
            };

            const { error: insertError } = await supabase
                .from('payouts')
                .insert(payoutData);

            if (insertError) throw insertError;

            // Refresh data
            await calculateConsignorSummaries();

            return { success: true };
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to record payout';
            return { success: false, error: message };
        }
    }, [calculateConsignorSummaries]);

    // Get payout history for a specific consignor
    const getConsignorPayoutHistory = useCallback((consignorId: string): Payout[] => {
        return payouts.filter(p => p.consignor_id === consignorId);
    }, [payouts]);

    // Calculate totals across all consignors
    const getTotals = useCallback(() => {
        return consignorSummaries.reduce(
            (acc, summary) => ({
                totalPending: acc.totalPending + summary.pendingAmount,
                totalGrossSales: acc.totalGrossSales + summary.grossSales,
                totalStoreShare: acc.totalStoreShare + summary.storeShare,
                totalTaxCollected: acc.totalTaxCollected + summary.taxCollected,
                totalSalesCount: acc.totalSalesCount + summary.salesCount,
                totalItemsSold: acc.totalItemsSold + summary.itemsSold,
                consignorsWithPending: acc.consignorsWithPending + (summary.pendingAmount > 0 ? 1 : 0),
            }),
            {
                totalPending: 0,
                totalGrossSales: 0,
                totalStoreShare: 0,
                totalTaxCollected: 0,
                totalSalesCount: 0,
                totalItemsSold: 0,
                consignorsWithPending: 0,
            }
        );
    }, [consignorSummaries]);

    useEffect(() => {
        calculateConsignorSummaries();
    }, [calculateConsignorSummaries]);

    return {
        payouts,
        consignorSummaries,
        isLoading,
        error,
        refetch: calculateConsignorSummaries,
        markAsPaid,
        getConsignorPayoutHistory,
        getTotals,
    };
}
