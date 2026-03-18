import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type {
    Payout,
    PayoutInput,
    ConsignorPayoutSummary,
    SaleItemDetail,
    Consignor,
    BalanceDisposition,
    PaymentMethod,
    VendorLedgerEntry,
} from '../types';
import {
    applyEffectiveConsignorTerms,
    getLocalDateString,
    type ConsignorRateSchedule,
} from '../lib/consignorRateSchedules';

function isMissingRateScheduleTable(error: unknown): boolean {
    const err = error as { code?: string; message?: string; details?: string; hint?: string } | null;
    const text = `${err?.message || ''} ${err?.details || ''} ${err?.hint || ''}`.toLowerCase();
    return err?.code === '42P01' || text.includes('consignor_rate_schedules');
}

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

interface VendorLedgerEntryRecord {
    id: string;
    consignor_id: string;
    description: string;
    amount: number;
    deducted_payout_id: string | null;
    deducted_at: string | null;
    created_by: string | null;
    created_at: string;
}

// Stripe Terminal fee constants (2.7% + $0.05 per transaction)
const STRIPE_FEE_PERCENT = 0.027;
const STRIPE_FEE_FIXED = 0.05;

function roundCurrency(value: number): number {
    return Number(value.toFixed(2));
}

function getDueBoothRentMonths(
    consignorPayouts: Payout[],
    consignorBoothRentPayments: BoothRentPaymentRecord[]
): Array<{ period_month: number; period_year: number }> {
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    let start = currentMonthStart;

    if (consignorBoothRentPayments.length > 0) {
        const latestPaidPeriod = consignorBoothRentPayments.reduce((latest, payment) => {
            const latestKey = `${latest.period_year}-${String(latest.period_month).padStart(2, '0')}`;
            const paymentKey = `${payment.period_year}-${String(payment.period_month).padStart(2, '0')}`;
            return paymentKey > latestKey ? payment : latest;
        });

        // Start charging from the month after the latest booth-rent month already paid.
        start = new Date(latestPaidPeriod.period_year, latestPaidPeriod.period_month, 1);
    } else if (consignorPayouts.length > 0) {
        const oldestPayout = consignorPayouts[consignorPayouts.length - 1];
        const oldestPayoutDate = new Date(oldestPayout.paid_at);
        // If no booth-rent period has ever been paid, carry booth-rent due months
        // forward from the first payout month so skipped months are not dropped.
        start = new Date(oldestPayoutDate.getFullYear(), oldestPayoutDate.getMonth(), 1);
    }

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

function getDeferredBalanceCarryover(consignorPayouts: Payout[]): number {
    let deferredBalanceOutstanding = 0;
    const payoutTimeline = [...consignorPayouts].sort(
        (a, b) => new Date(a.paid_at).getTime() - new Date(b.paid_at).getTime()
    );

    for (const payout of payoutTimeline) {
        if (!payout.is_partial) {
            deferredBalanceOutstanding = 0;
            continue;
        }

        const originalDue = Number(
            payout.original_amount_due !== null && payout.original_amount_due !== undefined
                ? payout.original_amount_due
                : payout.amount
        );
        const paid = Number(payout.amount || 0);
        const remaining = Math.max(0, originalDue - paid);
        const disposition = payout.balance_disposition || 'deferred';

        deferredBalanceOutstanding = disposition === 'deferred' ? remaining : 0;
    }

    return roundCurrency(deferredBalanceOutstanding);
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

            const activeConsignors = (consignors || []) as Consignor[];
            const today = getLocalDateString();
            const consignorIds = activeConsignors.map((consignor) => consignor.id);

            let effectiveConsignors = activeConsignors;
            if (consignorIds.length > 0) {
                const { data: scheduleData, error: scheduleError } = await supabase
                    .from('consignor_rate_schedules')
                    .select('id, consignor_id, effective_date, commission_split, booth_square_feet, booth_cost_per_square_foot, monthly_booth_rent, created_at, updated_at')
                    .in('consignor_id', consignorIds)
                    .lte('effective_date', today);

                if (scheduleError && !isMissingRateScheduleTable(scheduleError)) throw scheduleError;

                const schedulesByConsignor = new Map<string, ConsignorRateSchedule[]>();
                for (const schedule of (scheduleData || []) as ConsignorRateSchedule[]) {
                    const existing = schedulesByConsignor.get(schedule.consignor_id) || [];
                    existing.push(schedule);
                    schedulesByConsignor.set(schedule.consignor_id, existing);
                }

                effectiveConsignors = activeConsignors.map((consignor) =>
                    applyEffectiveConsignorTerms(
                        consignor,
                        schedulesByConsignor.get(consignor.id) || [],
                        today
                    )
                );
            }

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

            const { data: vendorLedgerEntries, error: vendorLedgerEntriesError } = await supabase
                .from('vendor_ledger_entries')
                .select('id, consignor_id, description, amount, deducted_payout_id, deducted_at, created_by, created_at');

            if (vendorLedgerEntriesError) throw vendorLedgerEntriesError;

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

            for (const consignor of effectiveConsignors) {
                const consignorPayouts = (allPayouts || []).filter((p) => p.consignor_id === consignor.id);
                // allPayouts is already ordered by paid_at DESC.
                const lastPayout = consignorPayouts[0] || null;
                const lastPayoutDate = lastPayout ? new Date(lastPayout.paid_at) : new Date(0);
                const deferredCarryover = getDeferredBalanceCarryover(consignorPayouts);
                const consignorBoothRentPayments = (boothRentPayments || []).filter(
                    (payment: BoothRentPaymentRecord) => payment.consignor_id === consignor.id
                );

                // Filter sale items for this consignor since last payout
                const consignorSaleItems = (saleItems || [])
                    .filter((item: SaleItemWithJoins) => {
                        if (item.consignor_id !== consignor.id) return false;
                        if (!item.sale) return false;
                        const saleDate = new Date(item.sale.completed_at);
                        return saleDate > lastPayoutDate;
                    });

                // Calculate totals
                let pendingAmount = deferredCarryover;
                let grossSales = 0;
                let storeShare = 0;
                let creditCardFees = 0;
                let itemsSold = 0;
                const salesSet = new Set<string>();
                const salesDetails: SaleItemDetail[] = [];
                const boothRentMonthsToDeduct: Array<{ period_month: number; period_year: number }> = [];
                const marketingAllocationIdsToDeduct: string[] = [];
                const ledgerEntryIdsToDeduct: string[] = [];
                const pendingLedgerEntries: VendorLedgerEntry[] = [];

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
                        consignorBoothRentPayments
                            .map((payment: BoothRentPaymentRecord) => `${payment.period_year}-${String(payment.period_month).padStart(2, '0')}`)
                    );

                    const dueMonths = getDueBoothRentMonths(consignorPayouts, consignorBoothRentPayments).filter((period) => {
                        const key = `${period.period_year}-${String(period.period_month).padStart(2, '0')}`;
                        return !paidPeriods.has(key);
                    });

                    const maxAffordableMonths = Math.floor(Math.max(0, pendingFromSales) / monthlyBoothRent);
                    const monthsToCharge = dueMonths
                        .sort((a, b) => (a.period_year - b.period_year) || (a.period_month - b.period_month))
                        .slice(0, maxAffordableMonths);
                    boothRentDeduction = roundCurrency(monthsToCharge.length * monthlyBoothRent);
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

                pendingFromSales = Math.max(0, pendingFromSales - marketingFeeDeduction);

                const unpaidLedgerEntries = (vendorLedgerEntries || [])
                    .filter((entry: VendorLedgerEntryRecord) =>
                        entry.consignor_id === consignor.id && !entry.deducted_payout_id
                    )
                    .sort((a: VendorLedgerEntryRecord, b: VendorLedgerEntryRecord) => {
                        if (a.created_at !== b.created_at) return a.created_at.localeCompare(b.created_at);
                        return a.id.localeCompare(b.id);
                    });

                let ledgerDeduction = 0;
                for (const entry of unpaidLedgerEntries) {
                    const entryAmount = Number(entry.amount);
                    if ((ledgerDeduction + entryAmount) > pendingFromSales) {
                        break;
                    }
                    ledgerDeduction += entryAmount;
                    ledgerEntryIdsToDeduct.push(entry.id);
                    pendingLedgerEntries.push(entry as VendorLedgerEntry);
                }

                const finalPendingAmount = roundCurrency(Math.max(0, pendingFromSales - ledgerDeduction));

                summaries.push({
                    consignor,
                    pendingFromSales: roundCurrency(pendingAmount),
                    pendingAmount: finalPendingAmount,
                    grossSales,
                    taxCollected,
                    storeShare,
                    creditCardFees,
                    boothRentDeduction,
                    marketingFeeDeduction,
                    ledgerDeduction: roundCurrency(ledgerDeduction),
                    salesCount: salesSet.size,
                    itemsSold,
                    lastPayout,
                    salesSinceLastPayout: salesDetails.sort(
                        (a, b) => new Date(b.saleDate).getTime() - new Date(a.saleDate).getTime()
                    ),
                    boothRentMonthsToDeduct,
                    marketingAllocationIdsToDeduct,
                    ledgerEntryIdsToDeduct,
                    pendingLedgerEntries,
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
            const isDeferredPartial = isPartial && (balanceDisposition || 'deferred') === 'deferred';
            const appliedBoothRentDeduction = isDeferredPartial ? 0 : summary.boothRentDeduction;
            const appliedMarketingFeeDeduction = isDeferredPartial ? 0 : summary.marketingFeeDeduction;
            const appliedLedgerDeduction = isDeferredPartial ? 0 : summary.ledgerDeduction;

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
                booth_rent_deduction: appliedBoothRentDeduction,
                marketing_fee_deduction: appliedMarketingFeeDeduction,
                ledger_deduction: appliedLedgerDeduction,
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

            if (!isDeferredPartial && summary.boothRentMonthsToDeduct.length > 0) {
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

            if (!isDeferredPartial && summary.marketingAllocationIdsToDeduct.length > 0) {
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

            if (!isDeferredPartial && summary.ledgerEntryIdsToDeduct.length > 0) {
                const { error: ledgerUpdateError } = await supabase
                    .from('vendor_ledger_entries')
                    .update({
                        deducted_payout_id: insertedPayout.id,
                        deducted_at: new Date().toISOString(),
                    })
                    .in('id', summary.ledgerEntryIdsToDeduct)
                    .is('deducted_payout_id', null);

                if (ledgerUpdateError) throw ledgerUpdateError;
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

    const createLedgerEntry = useCallback(async (
        consignorId: string,
        description: string,
        amount: number
    ): Promise<{ success: boolean; error?: string }> => {
        try {
            const cleanedDescription = description.trim();
            if (!cleanedDescription) {
                return { success: false, error: 'Description is required' };
            }

            const numericAmount = roundCurrency(Number(amount));
            if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
                return { success: false, error: 'Amount must be greater than 0' };
            }

            const { error: insertError } = await supabase
                .from('vendor_ledger_entries')
                .insert({
                    consignor_id: consignorId,
                    description: cleanedDescription,
                    amount: numericAmount,
                });

            if (insertError) throw insertError;

            await calculateConsignorSummaries();
            return { success: true };
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to add ledger entry';
            return { success: false, error: message };
        }
    }, [calculateConsignorSummaries]);

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
        createLedgerEntry,
        getConsignorPayoutHistory,
        getTotals,
    };
}
