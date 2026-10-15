import type { PaymentBreakdownEntry, PaymentMethod, TenderMethod } from '../types';

// Store credit and gift cards are listed first: they are applied before the
// customer pays the remainder with cash, check, or card.
export const TENDER_ORDER: TenderMethod[] = ['store_credit', 'gift_card', 'cash', 'check', 'card'];

const TENDER_LABELS: Record<TenderMethod, string> = {
    store_credit: 'Store Credit',
    gift_card: 'Gift Card',
    cash: 'Cash',
    check: 'Check',
    card: 'Card',
};

export function isTenderMethod(value: unknown): value is TenderMethod {
    return typeof value === 'string' && value in TENDER_LABELS;
}

export function formatTenderLabel(method: string | null | undefined): string {
    if (isTenderMethod(method)) return TENDER_LABELS[method];
    if (method === 'split') return 'Split';
    return 'Unknown';
}

export interface SaleTenderSource {
    payment_method?: string | null;
    payment_breakdown?: PaymentBreakdownEntry[] | null;
    total?: number | string | null;
    store_credit_used?: number | string | null;
    gift_card_used?: number | string | null;
    cash_tendered?: number | string | null;
    change_given?: number | string | null;
    check_number?: string | null;
    stripe_payment_intent_id?: string | null;
    card_last4?: string | null;
}

function toCents(value: number | string | null | undefined): number {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

export function roundCurrency(value: number): number {
    return Math.round(value * 100) / 100;
}

/**
 * Every tender on a sale. Sales saved since tenders became first-class carry a
 * payment_breakdown that sums to total; older rows without one are read as a
 * single tender of payment_method for the whole total.
 */
export function getSaleTenders(sale: SaleTenderSource): PaymentBreakdownEntry[] {
    if (Array.isArray(sale.payment_breakdown) && sale.payment_breakdown.length > 0) {
        return sale.payment_breakdown
            .filter((entry) => isTenderMethod(entry?.method))
            .map((entry) => ({ ...entry, amount: roundCurrency(Number(entry.amount || 0)) }))
            .filter((entry) => entry.amount > 0);
    }

    const tenders: PaymentBreakdownEntry[] = [];
    const storeCredit = toCents(sale.store_credit_used) / 100;
    const giftCard = toCents(sale.gift_card_used) / 100;
    const total = toCents(sale.total) / 100;
    if (storeCredit > 0) tenders.push({ method: 'store_credit', amount: storeCredit });
    if (giftCard > 0) tenders.push({ method: 'gift_card', amount: giftCard });

    const method = sale.payment_method;
    if (total > 0 && (method === 'cash' || method === 'check' || method === 'card')) {
        tenders.push({
            method,
            amount: total,
            tendered: method === 'cash' && sale.cash_tendered != null ? Number(sale.cash_tendered) : null,
            change: method === 'cash' && sale.change_given != null ? Number(sale.change_given) : null,
            check_number: method === 'check' ? sale.check_number || null : null,
            stripe_payment_intent_id: method === 'card' ? sale.stripe_payment_intent_id || null : null,
            card_last4: method === 'card' ? sale.card_last4 || null : null,
        });
    } else if (total > 0 && (method === 'store_credit' || method === 'gift_card') && tenders.length === 0) {
        tenders.push({ method, amount: total });
    }

    return tenders;
}

export function getSaleTenderAmount(sale: SaleTenderSource, method: TenderMethod): number {
    const cents = getSaleTenders(sale)
        .filter((entry) => entry.method === method)
        .reduce((sum, entry) => sum + toCents(entry.amount), 0);
    return cents / 100;
}

export function sortTenders(entries: PaymentBreakdownEntry[]): PaymentBreakdownEntry[] {
    return [...entries].sort((a, b) => TENDER_ORDER.indexOf(a.method) - TENDER_ORDER.indexOf(b.method));
}

/** "Store Credit", "Store Credit + Card", "Cash + Card", ... */
export function formatSalePaymentLabel(sale: SaleTenderSource): string {
    const methods = Array.from(new Set(sortTenders(getSaleTenders(sale)).map((entry) => entry.method)));
    if (methods.length === 0) return formatTenderLabel(sale.payment_method);
    return methods.map((method) => TENDER_LABELS[method]).join(' + ');
}

export function derivePaymentMethod(entries: PaymentBreakdownEntry[], fallback: PaymentMethod): PaymentMethod {
    const nonZero = entries.filter((entry) => entry.amount > 0);
    if (nonZero.length === 1) return nonZero[0].method;
    if (nonZero.length > 1) return 'split';
    return fallback;
}

/** Short description of one tender line, e.g. "Gift Card ••••4F2A" or "Card ••••9550". */
export function describeTender(entry: PaymentBreakdownEntry): string {
    const label = TENDER_LABELS[entry.method];
    if (entry.method === 'gift_card' && entry.code_last4) return `${label} ••••${entry.code_last4}`;
    if (entry.method === 'card' && entry.card_last4) return `${label} ••••${entry.card_last4}`;
    if (entry.method === 'check' && entry.check_number) return `${label} #${entry.check_number}`;
    return label;
}

// ---------------------------------------------------------------------------
// Building a sale's tenders
// ---------------------------------------------------------------------------

/** How the amount left after store credit and gift card is paid. */
export type SaleRemainderPayment =
    | { method: 'none' }
    | { method: 'cash'; amount: number; tendered: number; change: number }
    | { method: 'check'; amount: number; checkNumber?: string | null }
    | { method: 'card'; amount: number; stripePaymentIntentId?: string | null; cardLast4?: string | null }
    | { method: 'split'; entries: PaymentBreakdownEntry[] };

function roundMoney(value: number): number {
    return Math.max(0, Math.round(Number(value || 0) * 100) / 100);
}

/** All tenders for the sale, in the order they are applied. */
export function buildSaleTenders(params: {
    storeCredit?: { amount: number; consignorId: string | null } | null;
    giftCard?: { code: string; amount: number } | null;
    remainder: SaleRemainderPayment;
}): PaymentBreakdownEntry[] {
    const tenders: PaymentBreakdownEntry[] = [];
    const storeCreditAmount = roundMoney(params.storeCredit?.amount || 0);
    const giftCardAmount = roundMoney(params.giftCard?.amount || 0);

    if (storeCreditAmount > 0) {
        tenders.push({
            method: 'store_credit',
            amount: storeCreditAmount,
            consignor_id: params.storeCredit?.consignorId || null,
        });
    }
    if (giftCardAmount > 0 && params.giftCard?.code) {
        tenders.push({
            method: 'gift_card',
            amount: giftCardAmount,
            gift_card_code: params.giftCard.code.trim().toUpperCase(),
        });
    }

    const remainder = params.remainder;
    switch (remainder.method) {
        case 'cash':
            tenders.push({
                method: 'cash',
                amount: roundMoney(remainder.amount),
                tendered: roundMoney(remainder.tendered),
                change: roundMoney(remainder.change),
            });
            break;
        case 'check':
            tenders.push({
                method: 'check',
                amount: roundMoney(remainder.amount),
                check_number: remainder.checkNumber?.trim() || null,
            });
            break;
        case 'card':
            tenders.push({
                method: 'card',
                amount: roundMoney(remainder.amount),
                stripe_payment_intent_id: remainder.stripePaymentIntentId || null,
                card_last4: remainder.cardLast4 || null,
            });
            break;
        case 'split':
            for (const entry of remainder.entries) {
                tenders.push({
                    ...entry,
                    amount: roundMoney(entry.amount),
                    tendered: entry.tendered == null ? null : roundMoney(entry.tendered),
                    change: entry.change == null ? null : roundMoney(entry.change),
                    check_number: entry.check_number?.trim() || null,
                    stripe_payment_intent_id: entry.stripe_payment_intent_id || null,
                    card_last4: entry.card_last4 || null,
                });
            }
            break;
        default:
            break;
    }

    return tenders.filter((entry) => entry.amount > 0);
}

// ---------------------------------------------------------------------------
// Refund allocation
// ---------------------------------------------------------------------------

export interface PriorRefundLike {
    payment_method?: string | null;
    refund_amount?: number | string | null;
    payment_breakdown?: PaymentBreakdownEntry[] | null;
}

function tenderKey(entry: PaymentBreakdownEntry): string {
    switch (entry.method) {
        case 'store_credit':
            return `store_credit:${entry.consignor_id || ''}`;
        case 'gift_card':
            return `gift_card:${entry.gift_card_id || ''}`;
        case 'card':
            return `card:${entry.stripe_payment_intent_id || ''}`;
        default:
            return entry.method;
    }
}

/**
 * Splits a refund across the tenders the sale was paid with, in proportion to
 * what is still refundable on each tender. Store credit goes back to credit,
 * gift card back to the card, and cash/check/card back to the original method.
 */
export function allocateRefundToTenders(params: {
    tenders: PaymentBreakdownEntry[];
    priorRefunds: PriorRefundLike[];
    refundAmount: number;
}): PaymentBreakdownEntry[] {
    const tenders = sortTenders(params.tenders.filter((entry) => toCents(entry.amount) > 0));
    const refundedCentsByKey = new Map<string, number>();

    for (const refund of params.priorRefunds) {
        if (Array.isArray(refund.payment_breakdown) && refund.payment_breakdown.length > 0) {
            for (const entry of refund.payment_breakdown) {
                const key = tenderKey(entry);
                refundedCentsByKey.set(key, (refundedCentsByKey.get(key) || 0) + toCents(entry.amount));
            }
            continue;
        }

        // Refunds recorded before per-tender refunds existed: one method for the whole amount.
        const legacyMethod = refund.payment_method;
        const match = tenders.find((entry) => entry.method === legacyMethod);
        if (match) {
            const key = tenderKey(match);
            refundedCentsByKey.set(key, (refundedCentsByKey.get(key) || 0) + toCents(refund.refund_amount));
        }
    }

    const remaining = tenders.map((entry) => {
        const key = tenderKey(entry);
        const refunded = refundedCentsByKey.get(key) || 0;
        const tenderCents = toCents(entry.amount);
        const available = Math.max(0, tenderCents - refunded);
        // Several entries can share a key (e.g. two cash lines); consume as we go.
        refundedCentsByKey.set(key, Math.max(0, refunded - tenderCents));
        return available;
    });

    const totalRemaining = remaining.reduce((sum, cents) => sum + cents, 0);
    const refundCents = Math.min(toCents(params.refundAmount), totalRemaining);
    if (refundCents <= 0 || totalRemaining <= 0) return [];

    const shares = remaining.map((cents) => Math.floor((cents * refundCents) / totalRemaining));
    let leftover = refundCents - shares.reduce((sum, cents) => sum + cents, 0);
    for (let index = 0; leftover > 0 && index < shares.length; index += 1) {
        const room = remaining[index] - shares[index];
        const add = Math.min(room, leftover);
        shares[index] += add;
        leftover -= add;
    }

    return tenders
        .map((entry, index) => ({
            method: entry.method,
            amount: shares[index] / 100,
            consignor_id: entry.method === 'store_credit' ? entry.consignor_id ?? null : undefined,
            gift_card_id: entry.method === 'gift_card' ? entry.gift_card_id ?? null : undefined,
            code_last4: entry.method === 'gift_card' ? entry.code_last4 ?? null : undefined,
            stripe_payment_intent_id: entry.method === 'card' ? entry.stripe_payment_intent_id ?? null : undefined,
        }))
        .filter((entry) => entry.amount > 0);
}
