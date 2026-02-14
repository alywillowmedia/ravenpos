import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Payout, PayoutInput, ConsignorPayoutSummary, SaleItemDetail, Consignor, BalanceDisposition, PaymentMethod } from '../types';

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
    consignor_pays_card_fee?: boolean;
    sale: {
        id: string;
        completed_at: string;
        tax_amount: number;
        subtotal: number;
        payment_method: PaymentMethod;
    };
    consignor: Consignor;
}

interface BoothRentPaymentRecord {
    id: string;
    consignor_id: string;
    period_month: number;
    period_year: number;
}

interface MarketingAllocationRecord {
    id: string;
    consignor_id: string;
    amount: number;
    deducted_payout_id: string | null;
}

// Stripe Terminal fee constants (2.7% + $0.05 per transaction)
const STRIPE_FEE_PERCENT = 0.027;
const STRIPE_FEE_FIXED = 0.05;

function getDueBoothRentMonths(lastPayout: Payout | null): Array<{ period_month: number; period_year: number }> {
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const start = lastPayout
        ? new Date(new Date(lastPayout.paid_at).getFullYear(), new Date(lastPayout.paid_at).getMonth() + 1, 1)
        : currentMonthStart;

    const months: Array<{ period_month: number; period_year: number }> = [];
    const cursor = new Date(start);
    cursor.setHours(0, 0, 0, 0);

    while (cursor <= currentMonthStart) {
        months.push({
            period_month: cursor.getMonth() + 1,
            period_year: cursor.getFullYear(),
        });
        cursor.setMonth(cursor.getMonth() + 1, 1);
    }

    return months;
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

            // Fetch all sale items with sale data (including payment_method for fee calc)
            const { data: saleItems, error: saleItemsError } = await supabase
                .from('sale_items')
                .select(`
                    *,
                    sale:sales(id, completed_at, tax_amount, subtotal, payment_method)
                `);

            if (saleItemsError) throw saleItemsError;

            // Fetch all refunds to check for refunded items
            const { data: refunds, error: refundsError } = await supabase
                .from('refunds')
                .select('*');

            if (refundsError) throw refundsError;

            const { data: boothRentPayments, error: boothRentError } = await supabase
                .from('booth_rent_payments')
                .select('id, consignor_id, period_month, period_year');

            if (boothRentError) throw boothRentError;

            const { data: marketingAllocations, error: marketingAllocationsError } = await supabase
                .from('marketing_fee_allocations')
                .select('id, consignor_id, amount, deducted_payout_id');

            if (marketingAllocationsError) throw marketingAllocationsError;

            // Build a map of refunded sale_item_ids to refunded quantities
            const refundedItemsMap = new Map<string, number>();
            for (const refund of refunds || []) {
                const items = refund.items as Array<{ sale_item_id: string; quantity: number }>;
                for (const item of items || []) {
                    const current = refundedItemsMap.get(item.sale_item_id) || 0;
                    refundedItemsMap.set(item.sale_item_id, current + item.quantity);
                }
            }

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
                let creditCardFees = 0;
                let itemsSold = 0;
                const salesSet = new Set<string>();
                const salesDetails: SaleItemDetail[] = [];
                const boothRentMonthsToDeduct: Array<{ period_month: number; period_year: number }> = [];
                const marketingAllocationIdsToDeduct: string[] = [];

                // Group items by sale_id to calculate per-sale fees
                const itemsBySale = new Map<string, SaleItemWithJoins[]>();
                for (const item of consignorSaleItems as SaleItemWithJoins[]) {
                    const existing = itemsBySale.get(item.sale_id) || [];
                    existing.push(item);
                    itemsBySale.set(item.sale_id, existing);
                }

                for (const item of consignorSaleItems as SaleItemWithJoins[]) {
                    const lineTotal = Number(item.price) * item.quantity;

                    // Calculate proportional credit card fee for this item
                    let itemCreditCardFee = 0;
                    if (item.sale.payment_method === 'card' && item.consignor_pays_card_fee) {
                        const saleSubtotal = item.sale.subtotal || lineTotal;
                        // Total fee for the entire sale
                        const totalSaleFee = (saleSubtotal * STRIPE_FEE_PERCENT) + STRIPE_FEE_FIXED;
                        // This item's proportional share of the fee
                        itemCreditCardFee = saleSubtotal > 0 ? totalSaleFee * (lineTotal / saleSubtotal) : 0;
                    }

                    // Consignor share is reduced by the credit card fee
                    const consignorShareBeforeFee = lineTotal * item.commission_split;
                    const consignorShare = consignorShareBeforeFee - itemCreditCardFee;
                    const itemStoreShare = lineTotal - consignorShareBeforeFee; // Store share unaffected by fee

                    // Calculate proportional tax for this item
                    const saleSubtotal = item.sale.subtotal || lineTotal;
                    const saleTax = item.sale.tax_amount || 0;
                    const itemTaxPortion = saleSubtotal > 0 ? (lineTotal / saleSubtotal) * saleTax : 0;

                    // Check if this item has been refunded
                    const refundedQty = refundedItemsMap.get(item.id) || 0;
                    const isRefunded = refundedQty >= item.quantity;

                    // Only count non-refunded items toward pending payout
                    const effectiveQuantity = Math.max(0, item.quantity - refundedQty);
                    const effectiveRatio = item.quantity > 0 ? effectiveQuantity / item.quantity : 0;
                    const effectiveLineTotal = Number(item.price) * effectiveQuantity;
                    const effectiveCreditCardFee = itemCreditCardFee * effectiveRatio;
                    const effectiveConsignorShare = (effectiveLineTotal * item.commission_split) - effectiveCreditCardFee;
                    const effectiveStoreShare = effectiveLineTotal - (effectiveLineTotal * item.commission_split);

                    pendingAmount += effectiveConsignorShare;
                    grossSales += effectiveLineTotal;
                    storeShare += effectiveStoreShare;
                    creditCardFees += effectiveCreditCardFee;
                    itemsSold += effectiveQuantity;
                    salesSet.add(item.sale_id);

                    salesDetails.push({
                        saleId: item.sale_id,
                        saleItemId: item.id,
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
                        creditCardFee: itemCreditCardFee,
                        isRefunded,
                        refundedQuantity: refundedQty,
                    });
                }

                // Refunds reverse tax, so only include non-refunded quantity portions
                const taxCollected = salesDetails.reduce((sum, s) => {
                    const effectiveQuantity = Math.max(0, s.quantity - s.refundedQuantity);
                    const effectiveRatio = s.quantity > 0 ? effectiveQuantity / s.quantity : 0;
                    return sum + (s.taxAmount * effectiveRatio);
                }, 0);

                let pendingFromSales = pendingAmount;

                // Booth rent deduction: charge due unpaid months, limited by available sales earnings.
                let boothRentDeduction = 0;
                const monthlyBoothRent = Number(consignor.monthly_booth_rent || 0);
                if (monthlyBoothRent > 0) {
                    const paidPeriods = new Set(
                        (boothRentPayments || [])
                            .filter((payment: BoothRentPaymentRecord) => payment.consignor_id === consignor.id)
                            .map((payment: BoothRentPaymentRecord) => `${payment.period_year}-${String(payment.period_month).padStart(2, '0')}`)
                    );

                    const dueMonths = getDueBoothRentMonths(lastPayout).filter((period) => {
                        const key = `${period.period_year}-${String(period.period_month).padStart(2, '0')}`;
                        return !paidPeriods.has(key);
                    });

                    const maxAffordableMonths = Math.floor(Math.max(0, pendingFromSales) / monthlyBoothRent);
                    const monthsToCharge = dueMonths.slice(0, maxAffordableMonths);
                    boothRentDeduction = monthsToCharge.length * monthlyBoothRent;
                    boothRentMonthsToDeduct.push(...monthsToCharge);
                }

                pendingFromSales = Math.max(0, pendingFromSales - boothRentDeduction);

                // Marketing fee deduction: deduct unpaid allocations, limited by remaining available amount.
                const pendingMarketingAllocations = (marketingAllocations || [])
                    .filter((allocation: MarketingAllocationRecord) =>
                        allocation.consignor_id === consignor.id && !allocation.deducted_payout_id
                    )
                    .sort((a: MarketingAllocationRecord, b: MarketingAllocationRecord) => a.id.localeCompare(b.id));

                let marketingFeeDeduction = 0;
                for (const allocation of pendingMarketingAllocations) {
                    const allocationAmount = Number(allocation.amount);
                    if ((marketingFeeDeduction + allocationAmount) > pendingFromSales) {
                        break;
                    }
                    marketingFeeDeduction += allocationAmount;
                    marketingAllocationIdsToDeduct.push(allocation.id);
                }

                const finalPendingAmount = Math.max(0, pendingFromSales - marketingFeeDeduction);

                summaries.push({
                    consignor,
                    pendingFromSales: pendingAmount,
                    pendingAmount: finalPendingAmount,
                    grossSales,
                    taxCollected,
                    storeShare,
                    creditCardFees,
                    boothRentDeduction,
                    marketingFeeDeduction,
                    salesCount: salesSet.size,
                    itemsSold,
                    lastPayout,
                    salesSinceLastPayout: salesDetails.sort(
                        (a, b) => new Date(b.saleDate).getTime() - new Date(a.saleDate).getTime()
                    ),
                    boothRentMonthsToDeduct,
                    marketingAllocationIdsToDeduct,
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
        notes?: string,
        customAmount?: number,
        partialReason?: string,
        balanceDisposition?: BalanceDisposition
    ): Promise<{ success: boolean; error?: string }> => {
        try {
            // Determine period dates
            const periodStart = summary.lastPayout
                ? summary.lastPayout.paid_at
                : summary.salesSinceLastPayout.length > 0
                    ? summary.salesSinceLastPayout[summary.salesSinceLastPayout.length - 1].saleDate
                    : new Date().toISOString();
            const periodEnd = new Date().toISOString();

            // Determine if this is a partial payout
            const isPartial = customAmount !== undefined && customAmount < summary.pendingAmount;
            const payoutAmount = customAmount !== undefined ? customAmount : summary.pendingAmount;

            const payoutData: PayoutInput = {
                consignor_id: consignorId,
                amount: payoutAmount,
                period_start: periodStart,
                period_end: periodEnd,
                sales_count: summary.salesCount,
                items_sold: summary.itemsSold,
                gross_sales: summary.grossSales,
                tax_collected: summary.taxCollected,
                store_share: summary.storeShare,
                credit_card_fees: summary.creditCardFees,
                booth_rent_deduction: summary.boothRentDeduction,
                marketing_fee_deduction: summary.marketingFeeDeduction,
                notes: notes || null,
                paid_at: new Date().toISOString(),
                original_amount_due: isPartial ? summary.pendingAmount : null,
                is_partial: isPartial,
                partial_reason: isPartial ? (partialReason || null) : null,
                balance_disposition: isPartial ? (balanceDisposition || null) : null,
            };

            const { data: insertedPayout, error: insertError } = await supabase
                .from('payouts')
                .insert(payoutData)
                .select('id')
                .single();

            if (insertError) throw insertError;

            if (summary.boothRentMonthsToDeduct.length > 0) {
                const monthlyBoothRent = Number(summary.consignor.monthly_booth_rent || 0);
                if (monthlyBoothRent > 0) {
                    const boothRentRows = summary.boothRentMonthsToDeduct.map((period) => ({
                        consignor_id: consignorId,
                        amount: monthlyBoothRent,
                        period_month: period.period_month,
                        period_year: period.period_year,
                        notes: `Deducted from payout ${insertedPayout.id.slice(0, 8)}`,
                        paid_at: new Date().toISOString(),
                    }));

                    const { error: boothInsertError } = await supabase
                        .from('booth_rent_payments')
                        .upsert(boothRentRows, { onConflict: 'consignor_id,period_month,period_year', ignoreDuplicates: true });

                    if (boothInsertError) throw boothInsertError;
                }
            }

            if (summary.marketingAllocationIdsToDeduct.length > 0) {
                const { error: marketingUpdateError } = await supabase
                    .from('marketing_fee_allocations')
                    .update({
                        deducted_payout_id: insertedPayout.id,
                        deducted_at: new Date().toISOString(),
                    })
                    .in('id', summary.marketingAllocationIdsToDeduct)
                    .is('deducted_payout_id', null);

                if (marketingUpdateError) throw marketingUpdateError;
            }

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
