import type { TenderMethod } from '../types';
import { getSaleTenders, type SaleTenderSource } from './tenders';

interface PaymentBreakdownLike {
    method?: string | null;
    amount?: number | string | null;
    tendered?: number | string | null;
    change?: number | string | null;
}

interface CashSaleLike {
    payment_method?: string | null;
    cash_tendered?: number | string | null;
    change_given?: number | string | null;
    total?: number | string | null;
    store_credit_used?: number | string | null;
    gift_card_used?: number | string | null;
    payment_breakdown?: PaymentBreakdownLike[] | null;
}

interface RefundTenderLike {
    payment_method?: string | null;
    refund_amount?: number | string | null;
    payment_breakdown?: PaymentBreakdownLike[] | null;
}

function toSafeNumber(value: number | string | null | undefined): number {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
}

export function toCurrencyCents(value: number | string | null | undefined): number {
    return Math.round(toSafeNumber(value) * 100);
}

export function fromCurrencyCents(cents: number): number {
    return cents / 100;
}

function hasBreakdown(row: { payment_breakdown?: PaymentBreakdownLike[] | null }): boolean {
    return Array.isArray(row.payment_breakdown) && row.payment_breakdown.length > 0;
}

// Rows read from Supabase can carry NUMERIC values as strings; getSaleTenders
// normalizes amounts and drops unknown methods, so the loose shape is safe here.
function asTenderSource(sale: CashSaleLike): SaleTenderSource {
    return sale as SaleTenderSource;
}

/**
 * Amount of one tender on a sale, in cents. Works for sales with a
 * payment_breakdown and for older rows that only have payment_method/total.
 */
export function getSaleTenderAmountCents(sale: CashSaleLike, method: TenderMethod): number {
    return getSaleTenders(asTenderSource(sale))
        .filter((entry) => entry.method === method)
        .reduce((sum, entry) => sum + toCurrencyCents(entry.amount), 0);
}

/** Cash kept from a sale (cash tender amount, i.e. tendered minus change). */
export function getNetCashSaleCents(sale: CashSaleLike): number {
    if (hasBreakdown(sale)) {
        return getPaymentBreakdownAmountCents(sale, 'cash');
    }

    // Rows without a breakdown are a single tender for the whole total.
    if (sale.payment_method && sale.payment_method !== 'cash') {
        return 0;
    }

    const tendered = toCurrencyCents(sale.cash_tendered);
    const change = toCurrencyCents(sale.change_given);
    const total = toCurrencyCents(sale.total);
    return tendered > 0 ? (tendered - change) : total;
}

/** Cash handed over, change given back, and cash kept for a sale's cash tender(s). */
export function getCashTenderCents(sale: CashSaleLike): { netCents: number; tenderedCents: number; changeCents: number } {
    const cashEntries = getSaleTenders(asTenderSource(sale)).filter((entry) => entry.method === 'cash');
    return cashEntries.reduce(
        (acc, entry) => {
            const amountCents = toCurrencyCents(entry.amount);
            acc.netCents += amountCents;
            acc.tenderedCents += entry.tendered != null ? toCurrencyCents(entry.tendered) : amountCents;
            acc.changeCents += toCurrencyCents(entry.change ?? 0);
            return acc;
        },
        { netCents: 0, tenderedCents: 0, changeCents: 0 }
    );
}

export function sumCashSalesNetCents(sales: CashSaleLike[]): number {
    return sales.reduce((sum, sale) => sum + getNetCashSaleCents(sale), 0);
}

export function getPaymentBreakdownAmountCents(
    sale: { payment_breakdown?: PaymentBreakdownLike[] | null },
    method: TenderMethod
): number {
    return (sale.payment_breakdown || [])
        .filter((entry) => entry.method === method)
        .reduce((sum, entry) => sum + toCurrencyCents(entry.amount), 0);
}

/**
 * Portion of a refund returned through one tender, in cents. Refunds with a
 * payment_breakdown are split per tender; older refunds went back entirely
 * through payment_method.
 */
export function getRefundTenderAmountCents(refund: RefundTenderLike, method: TenderMethod): number {
    if (hasBreakdown(refund)) {
        return getPaymentBreakdownAmountCents(refund, method);
    }
    return refund.payment_method === method ? toCurrencyCents(refund.refund_amount) : 0;
}

export function getExpectedCashFromSalesCents(input: {
    cashSalesNetCents: number;
    cashRefundsCents: number;
    dealerCashPurchasesCents: number;
    offlineUnsyncedCashSalesCents?: number;
    giftCardCashSalesCents?: number;
}): number {
    return input.cashSalesNetCents
        - input.cashRefundsCents
        - input.dealerCashPurchasesCents
        + (input.giftCardCashSalesCents || 0)
        + (input.offlineUnsyncedCashSalesCents || 0);
}

export function getCountedDrawerCents(
    denominations: ReadonlyArray<{ key: string; value: number }>,
    denominationCounts: Record<string, string>
): number {
    return denominations.reduce((sum, denomination) => {
        const quantity = Math.max(0, Number.parseInt(denominationCounts[denomination.key] || '0', 10) || 0);
        return sum + (quantity * toCurrencyCents(denomination.value));
    }, 0);
}
