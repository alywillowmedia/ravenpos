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
    PaymentBreakdownEntry,
    VendorLedgerEntry,
    VendorInvoiceDeduction,
} from '../types';
import {
    applyEffectiveConsignorTerms,
    getLocalDateString,
    type ConsignorRateSchedule,
} from '../lib/consignorRateSchedules';
import { calculateStripeTerminalProcessingFee } from '../lib/cardFees';

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
    discount_amount?: number;
    consignor_pays_card_fee?: boolean;
    sale: {
        id: string;
        completed_at: string;
        tax_amount: number;
        subtotal: number;
        total: number;
        discount_total?: number;
        payment_method: PaymentMethod;
        payment_breakdown?: PaymentBreakdownEntry[] | null;
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

interface VendorInvoiceRecord {
    id: string;
    consignor_id: string | null;
    recipient_name: string;
    total: number;
    amount_paid: number;
    status: 'unpaid' | 'partially_paid' | 'paid';
    notes: string | null;
    created_at: string;
}

export interface UnattributedPayoutSale {
    id: string;
    completed_at: string;
    subtotal: number;
    total: number;
    payment_method: PaymentMethod;
}

const SUPABASE_PAGE_SIZE = 1000;

type SupabasePagedQuery<T> = {
    range: (from: number, to: number) => PromiseLike<{
        data: T[] | null;
        error: unknown;
    }>;
};

async function fetchAllRows<T>(createQuery: () => SupabasePagedQuery<T>): Promise<T[]> {
    const rows: T[] = [];

    for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
        const to = from + SUPABASE_PAGE_SIZE - 1;
        const { data, error } = await createQuery().range(from, to);

        if (error) throw error;

        const page = data || [];
        rows.push(...page);

        if (page.length < SUPABASE_PAGE_SIZE) break;
    }

    return rows;
}

function roundCurrency(value: number): number {
    return Number(value.toFixed(2));
}

function formatInvoiceNumber(invoiceId: string): string {
    return invoiceId.slice(0, 8).toUpperCase();
}

function getInvoiceStatusFromPayment(amountPaid: number, total: number): 'unpaid' | 'partially_paid' | 'paid' {
    if (amountPaid <= 0) return 'unpaid';
    if (amountPaid >= total) return 'paid';
    return 'partially_paid';
}

function getCardTenderAmount(sale: SaleItemWithJoins['sale'], saleNetSubtotal: number): number {
    if (sale.payment_method === 'split') {
        return (sale.payment_breakdown || [])
            .filter((entry) => entry.method === 'card')
            .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    }

    return sale.payment_method === 'card' ? Number(sale.total || saleNetSubtotal) : 0;
}

function getPayoutPeriodBounds(summary: ConsignorPayoutSummary): { start: string; end: string } {
    const saleDates = summary.salesSinceLastPayout
        .map((item) => new Date(item.saleDate))
        .filter((date) => Number.isFinite(date.getTime()))
        .sort((a, b) => a.getTime() - b.getTime());

    const now = new Date();
    const start = saleDates[0]
        || (summary.lastPayout ? getCoveredThroughDate(summary.lastPayout) : null)
        || now;
    const latestSaleDate = saleDates[saleDates.length - 1];
    const end = latestSaleDate && latestSaleDate < now ? latestSaleDate : now;

    return {
        start: start.toISOString(),
        end: end.toISOString(),
    };
}

function clampPeriodEndToNow(periodEnd: string): string {
    const parsed = new Date(periodEnd);
    if (Number.isNaN(parsed.getTime())) return new Date().toISOString();

    const now = new Date();
    return parsed > now ? now.toISOString() : parsed.toISOString();
}

function getCoveredThroughDate(payout: Pick<Payout, 'period_end' | 'paid_at'>): Date | null {
    const paidAt = new Date(payout.paid_at);
    const periodEnd = new Date(payout.period_end || payout.paid_at);
    if (Number.isNaN(paidAt.getTime()) && Number.isNaN(periodEnd.getTime())) return null;
    if (Number.isNaN(periodEnd.getTime())) return paidAt;
    if (Number.isNaN(paidAt.getTime())) return periodEnd;

    return periodEnd > paidAt ? paidAt : periodEnd;
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
            const isDateRangePayout = payout.notes?.startsWith('[Range Payout:') === true;
            const includesDeferredCarryover = payout.notes?.includes('[Deferred Carryover Included]') === true;
            if (!isDateRangePayout || includesDeferredCarryover) {
                deferredBalanceOutstanding = 0;
            }
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
    const [unattributedSales, setUnattributedSales] = useState<UnattributedPayoutSale[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Calculate pending payouts for all consignors
    const calculateConsignorSummaries = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);

            // Fetch all active consignors
            const activeConsignors = await fetchAllRows<Consignor>(() => supabase
                .from('consignors')
                .select('*')
                .eq('is_active', true)
                .order('consignor_number')
            );
            const today = getLocalDateString();
            const consignorIds = activeConsignors.map((consignor) => consignor.id);

            let effectiveConsignors = activeConsignors;
            if (consignorIds.length > 0) {
                let scheduleData: ConsignorRateSchedule[] = [];
                try {
                    scheduleData = await fetchAllRows<ConsignorRateSchedule>(() => supabase
                        .from('consignor_rate_schedules')
                        .select('id, consignor_id, effective_date, commission_split, booth_square_feet, booth_cost_per_square_foot, monthly_booth_rent, created_at, updated_at')
                        .in('consignor_id', consignorIds)
                        .lte('effective_date', today)
                        .order('effective_date')
                    );
                } catch (scheduleError) {
                    if (!isMissingRateScheduleTable(scheduleError)) throw scheduleError;
                }

                const schedulesByConsignor = new Map<string, ConsignorRateSchedule[]>();
                for (const schedule of scheduleData) {
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
            const allPayouts = await fetchAllRows<Payout>(() => supabase
                .from('payouts')
                .select(`
                    *,
                    consignor:consignors(*)
                `)
                .order('paid_at', { ascending: false })
            );

            // Fetch all sale items with sale data (including payment_method for fee calc)
            const saleItems = await fetchAllRows<SaleItemWithJoins>(() => supabase
                .from('sale_items')
                .select(`
                    *,
                    sale:sales(id, completed_at, tax_amount, subtotal, total, discount_total, payment_method, payment_breakdown)
                `)
                .order('id')
            );

            const recentSalesCutoff = new Date();
            recentSalesCutoff.setDate(recentSalesCutoff.getDate() - 30);
            const { data: payoutOrphanSales, error: payoutOrphanSalesError } = await supabase.rpc(
                'get_payout_orphan_sales',
                { p_since: recentSalesCutoff.toISOString() }
            );

            if (payoutOrphanSalesError) throw payoutOrphanSalesError;
            setUnattributedSales((payoutOrphanSales || []) as UnattributedPayoutSale[]);

            // Fetch all refunds to check for refunded items
            const refunds = await fetchAllRows<{ items: Array<{ sale_item_id: string; quantity: number }> | null }>(() => supabase
                .from('refunds')
                .select('*')
                .order('id')
            );

            const boothRentPayments = await fetchAllRows<BoothRentPaymentRecord>(() => supabase
                .from('booth_rent_payments')
                .select('id, consignor_id, period_month, period_year')
                .order('id')
            );

            const marketingAllocations = await fetchAllRows<MarketingAllocationRecord>(() => supabase
                .from('marketing_fee_allocations')
                .select('id, consignor_id, amount, deducted_payout_id')
                .order('id')
            );

            const vendorLedgerEntries = await fetchAllRows<VendorLedgerEntryRecord>(() => supabase
                .from('vendor_ledger_entries')
                .select('id, consignor_id, description, amount, deducted_payout_id, deducted_at, created_by, created_at')
                .order('id')
            );

            const vendorInvoices = await fetchAllRows<VendorInvoiceRecord>(() => supabase
                .from('invoices')
                .select('id, consignor_id, recipient_name, total, amount_paid, status, notes, created_at')
                .eq('recipient_type', 'vendor')
                .in('status', ['unpaid', 'partially_paid'])
                .order('created_at', { ascending: true })
            );

            // Build a map of refunded sale_item_ids to refunded quantities
            const refundedItemsMap = new Map<string, number>();
            for (const refund of refunds) {
                const items = refund.items as Array<{ sale_item_id: string; quantity: number }>;
                for (const item of items || []) {
                    const current = refundedItemsMap.get(item.sale_item_id) || 0;
                    refundedItemsMap.set(item.sale_item_id, current + item.quantity);
                }
            }

            // Calculate summaries for each consignor
            const summaries: ConsignorPayoutSummary[] = [];

            for (const consignor of effectiveConsignors) {
                const consignorPayouts = allPayouts.filter((p) => p.consignor_id === consignor.id);
                // allPayouts is already ordered by paid_at DESC.
                const lastPayout = consignorPayouts[0] || null;
                const lastPayoutBoundary = consignorPayouts.reduce<Date | null>((latest, payout) => {
                    const boundaryCandidate = getCoveredThroughDate(payout);
                    if (!boundaryCandidate) return latest;
                    if (!latest || boundaryCandidate > latest) return boundaryCandidate;
                    return latest;
                }, null);
                const lastPayoutDate = lastPayoutBoundary || new Date(0);
                const deferredCarryover = getDeferredBalanceCarryover(consignorPayouts);
                const consignorBoothRentPayments = boothRentPayments.filter(
                    (payment: BoothRentPaymentRecord) => payment.consignor_id === consignor.id
                );

                // Filter sale items for this consignor since last payout
                const consignorSaleItems = saleItems
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
                const invoiceDeductionsToApply: VendorInvoiceDeduction[] = [];
                const pendingInvoiceDeductions: VendorInvoiceDeduction[] = [];

                // Group all items by sale_id so per-sale discount/tax/fee allocation is accurate.
                const itemsBySale = new Map<string, SaleItemWithJoins[]>();
                for (const item of saleItems) {
                    const existing = itemsBySale.get(item.sale_id) || [];
                    existing.push(item);
                    itemsBySale.set(item.sale_id, existing);
                }
                const saleFinancialContext = new Map<string, { orderDiscountRatio: number; netSubtotal: number }>();

                for (const [saleId, itemsForSale] of itemsBySale) {
                    let subtotalAfterItemDiscounts = 0;
                    let totalItemDiscounts = 0;

                    for (const saleItem of itemsForSale) {
                        const rawLineTotal = Number(saleItem.price) * saleItem.quantity;
                        const itemDiscount = Math.max(0, Math.min(Number(saleItem.discount_amount || 0), rawLineTotal));
                        subtotalAfterItemDiscounts += Math.max(0, rawLineTotal - itemDiscount);
                        totalItemDiscounts += itemDiscount;
                    }

                    const saleDiscountTotal = Math.max(0, Number(itemsForSale[0]?.sale?.discount_total || 0));
                    const orderDiscountTotal = Math.max(
                        0,
                        Math.min(saleDiscountTotal - totalItemDiscounts, subtotalAfterItemDiscounts)
                    );
                    const orderDiscountRatio = subtotalAfterItemDiscounts > 0
                        ? orderDiscountTotal / subtotalAfterItemDiscounts
                        : 0;
                    const netSubtotal = Math.max(0, subtotalAfterItemDiscounts - orderDiscountTotal);

                    saleFinancialContext.set(saleId, { orderDiscountRatio, netSubtotal });
                }

                for (const item of consignorSaleItems) {
                    const rawLineTotal = Number(item.price) * item.quantity;
                    const itemDiscount = Math.max(0, Math.min(Number(item.discount_amount || 0), rawLineTotal));
                    const lineAfterItemDiscount = Math.max(0, rawLineTotal - itemDiscount);
                    const saleContext = saleFinancialContext.get(item.sale_id);
                    const orderDiscountRatio = saleContext?.orderDiscountRatio || 0;
                    const netLineTotal = lineAfterItemDiscount * (1 - orderDiscountRatio);
                    const saleNetSubtotal = saleContext?.netSubtotal || netLineTotal;

                    // Calculate proportional credit card fee for this item
                    let itemCreditCardFee = 0;
                    const cardTenderAmount = getCardTenderAmount(item.sale, saleNetSubtotal);
                    if (cardTenderAmount > 0 && item.consignor_pays_card_fee) {
                        const totalSaleFee = calculateStripeTerminalProcessingFee(cardTenderAmount);
                        // This item's proportional share of the fee
                        itemCreditCardFee = saleNetSubtotal > 0 ? totalSaleFee * (netLineTotal / saleNetSubtotal) : 0;
                    }

                    // Consignor share is reduced by the credit card fee
                    const consignorShareBeforeFee = netLineTotal * item.commission_split;
                    const consignorShare = consignorShareBeforeFee - itemCreditCardFee;
                    const itemStoreShare = netLineTotal - consignorShareBeforeFee; // Store share unaffected by fee

                    // Calculate proportional tax for this item
                    const saleTax = item.sale.tax_amount || 0;
                    const itemTaxPortion = saleNetSubtotal > 0 ? (netLineTotal / saleNetSubtotal) * saleTax : 0;

                    // Check if this item has been refunded
                    const refundedQty = refundedItemsMap.get(item.id) || 0;
                    const isRefunded = refundedQty >= item.quantity;

                    // Only count non-refunded items toward pending payout
                    const effectiveQuantity = Math.max(0, item.quantity - refundedQty);
                    const effectiveRatio = item.quantity > 0 ? effectiveQuantity / item.quantity : 0;
                    const effectiveLineTotal = netLineTotal * effectiveRatio;
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
                        lineTotal: netLineTotal,
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
                const pendingMarketingAllocations = marketingAllocations
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

                const unpaidLedgerEntries = vendorLedgerEntries
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

                pendingFromSales = Math.max(0, pendingFromSales - ledgerDeduction);

                const unpaidVendorInvoices = vendorInvoices
                    .filter((invoice) => invoice.consignor_id === consignor.id)
                    .sort((a, b) => {
                        if (a.created_at !== b.created_at) return a.created_at.localeCompare(b.created_at);
                        return a.id.localeCompare(b.id);
                    });

                for (const invoice of unpaidVendorInvoices) {
                    const total = Number(invoice.total || 0);
                    const amountPaid = Number(invoice.amount_paid || 0);
                    const balanceDue = roundCurrency(Math.max(0, total - amountPaid));
                    if (balanceDue <= 0) continue;

                    pendingInvoiceDeductions.push({
                        invoice_id: invoice.id,
                        invoice_number: formatInvoiceNumber(invoice.id),
                        recipient_name: invoice.recipient_name,
                        total,
                        amount_paid: amountPaid,
                        balance_due: balanceDue,
                        amount_to_apply: 0,
                        created_at: invoice.created_at,
                        notes: invoice.notes,
                    });
                }

                const finalPendingAmount = roundCurrency(Math.max(0, pendingFromSales));

                summaries.push({
                    consignor,
                    deferredBalanceCarryover: roundCurrency(deferredCarryover),
                    pendingFromSales: roundCurrency(pendingAmount),
                    pendingAmount: finalPendingAmount,
                    grossSales,
                    taxCollected,
                    storeShare,
                    creditCardFees,
                    boothRentDeduction,
                    marketingFeeDeduction,
                    ledgerDeduction: roundCurrency(ledgerDeduction),
                    invoiceDeduction: 0,
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
                    invoiceDeductionsToApply,
                    pendingInvoiceDeductions,
                });
            }

            // Sort by pending amount descending (highest payouts first)
            summaries.sort((a, b) => b.pendingAmount - a.pendingAmount);

            setConsignorSummaries(summaries);
            setPayouts(allPayouts);
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
        balanceDisposition?: BalanceDisposition,
        options?: {
            periodStartOverride?: string;
            periodEndOverride?: string;
        }
    ): Promise<{ success: boolean; error?: string }> => {
        try {
            const invoiceDeductionsToApply = summary.invoiceDeductionsToApply.filter(
                (deduction) => Number(deduction.amount_to_apply || 0) > 0
            );
            const invoiceDeduction = roundCurrency(invoiceDeductionsToApply.reduce(
                (sum, deduction) => sum + Number(deduction.amount_to_apply || 0),
                0
            ));
            const currentInvoicesById = new Map<string, Pick<VendorInvoiceRecord, 'id' | 'consignor_id' | 'total' | 'amount_paid' | 'status'>>();

            if (invoiceDeductionsToApply.length > 0) {
                const { data: currentInvoices, error: invoiceFetchError } = await supabase
                    .from('invoices')
                    .select('id, consignor_id, total, amount_paid, status')
                    .in('id', invoiceDeductionsToApply.map((deduction) => deduction.invoice_id));

                if (invoiceFetchError) throw invoiceFetchError;

                for (const invoice of currentInvoices || []) {
                    currentInvoicesById.set(invoice.id, invoice as Pick<VendorInvoiceRecord, 'id' | 'consignor_id' | 'total' | 'amount_paid' | 'status'>);
                }

                for (const deduction of invoiceDeductionsToApply) {
                    const currentInvoice = currentInvoicesById.get(deduction.invoice_id);
                    const currentBalance = currentInvoice
                        ? roundCurrency(Math.max(0, Number(currentInvoice.total) - Number(currentInvoice.amount_paid || 0)))
                        : 0;

                    if (!currentInvoice || currentInvoice.consignor_id !== consignorId || currentInvoice.status === 'paid') {
                        return { success: false, error: `Invoice #${deduction.invoice_number} is no longer available for this payout` };
                    }
                    if (Number(deduction.amount_to_apply) > currentBalance) {
                        return { success: false, error: `Invoice #${deduction.invoice_number} exceeds its current ${currentBalance.toFixed(2)} balance` };
                    }
                }
            }

            // Determine period dates
            const payoutPeriod = getPayoutPeriodBounds(summary);
            const periodStart = options?.periodStartOverride || payoutPeriod.start;
            const periodEnd = options?.periodEndOverride
                ? clampPeriodEndToNow(options.periodEndOverride)
                : payoutPeriod.end;

            // Determine if this is a partial payout
            const isPartial = customAmount !== undefined && customAmount < summary.pendingAmount;
            const payoutAmount = customAmount !== undefined ? customAmount : summary.pendingAmount;
            if (!Number.isFinite(payoutAmount) || payoutAmount < 0 || payoutAmount > summary.pendingAmount) {
                return { success: false, error: 'Payout amount must be within the remaining available payout' };
            }

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
                ledger_deduction: summary.ledgerDeduction,
                invoice_deduction: invoiceDeduction,
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

            if (summary.ledgerEntryIdsToDeduct.length > 0) {
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

            if (invoiceDeductionsToApply.length > 0) {
                const now = new Date().toISOString();
                const deductionRows = invoiceDeductionsToApply.map((deduction) => ({
                    invoice_id: deduction.invoice_id,
                    payout_id: insertedPayout.id,
                    consignor_id: consignorId,
                    amount: deduction.amount_to_apply,
                    created_at: now,
                }));

                const { error: deductionInsertError } = await supabase
                    .from('invoice_payout_deductions')
                    .insert(deductionRows);

                if (deductionInsertError) throw deductionInsertError;

                for (const deduction of invoiceDeductionsToApply) {
                    const currentInvoice = currentInvoicesById.get(deduction.invoice_id);
                    if (!currentInvoice) {
                        throw new Error(`Invoice #${deduction.invoice_number} is no longer available`);
                    }
                    const total = Number(currentInvoice.total || 0);
                    const nextAmountPaid = roundCurrency(
                        Math.min(total, Number(currentInvoice.amount_paid || 0) + Number(deduction.amount_to_apply || 0))
                    );
                    const nextStatus = getInvoiceStatusFromPayment(nextAmountPaid, total);
                    const { error: invoiceUpdateError } = await supabase
                        .from('invoices')
                        .update({
                            amount_paid: nextAmountPaid,
                            status: nextStatus,
                            paid_at: nextStatus === 'paid' ? now : null,
                        })
                        .eq('id', deduction.invoice_id);

                    if (invoiceUpdateError) throw invoiceUpdateError;
                }
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
        unattributedSales,
        isLoading,
        error,
        refetch: calculateConsignorSummaries,
        markAsPaid,
        createLedgerEntry,
        getConsignorPayoutHistory,
        getTotals,
    };
}
