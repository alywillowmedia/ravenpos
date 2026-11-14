// Gift cards are not sales rows: selling one only creates the card. These
// helpers turn the cards sold in a date range into a list someone can read and
// search, one row per payment.

import { roundCashAmount } from './cashRounding';

/** The gift_cards columns the Sales page loads for the Gift Cards tab. */
export const GIFT_CARD_SALE_COLUMNS = [
    'id',
    'code',
    'original_amount',
    'current_balance',
    'recipient_name',
    'recipient_email',
    'from_name',
    'message',
    'purchase_payment_method',
    'purchase_payment_intent_id',
    'issued_at',
    'expires_at',
    'last_redeemed_at',
    'is_active',
    'consignor_id',
    'theme',
    'batch_id',
].join(', ');

export interface GiftCardSaleRow {
    id: string;
    code: string;
    original_amount: number;
    current_balance: number;
    recipient_name: string | null;
    recipient_email: string | null;
    from_name: string | null;
    message: string | null;
    purchase_payment_method: string | null;
    purchase_payment_intent_id: string | null;
    issued_at: string;
    expires_at: string | null;
    last_redeemed_at: string | null;
    is_active: boolean;
    /** NULL = good for anything in the store. */
    consignor_id: string | null;
    theme: string | null;
    /** Cards sold together in one payment share a batch id. */
    batch_id: string | null;
}

/** One payment at the register: one card, or several sold together. */
export interface GiftCardSale {
    key: string;
    soldAt: string;
    paymentMethod: string | null;
    /** The cards to show. A search can narrow this to the ones that match. */
    cards: GiftCardSaleRow[];
    /** How many cards were in the whole sale, whatever the search shows. */
    cardCount: number;
    /** Face value of every card in the sale. */
    total: number;
    /** What the customer handed over: cash is rounded to the nickel. */
    paid: number;
    /** What is still unspent across every card in the sale. */
    balance: number;
}

function toCents(value: number | string | null | undefined): number {
    return Math.round((Number(value) || 0) * 100);
}

export function groupGiftCardSales(cards: GiftCardSaleRow[]): GiftCardSale[] {
    const byPayment = new Map<string, GiftCardSaleRow[]>();
    for (const card of cards) {
        const key = card.batch_id ? `batch:${card.batch_id}` : `card:${card.id}`;
        const group = byPayment.get(key);
        if (group) group.push(card);
        else byPayment.set(key, [card]);
    }

    const sales: GiftCardSale[] = [];
    for (const [key, group] of byPayment) {
        const sorted = [...group].sort((a, b) => a.issued_at.localeCompare(b.issued_at) || a.code.localeCompare(b.code));
        const totalCents = sorted.reduce((sum, card) => sum + toCents(card.original_amount), 0);
        const balanceCents = sorted.reduce((sum, card) => sum + toCents(card.current_balance), 0);
        const paymentMethod = sorted[0].purchase_payment_method;
        const total = totalCents / 100;
        sales.push({
            key,
            soldAt: sorted[0].issued_at,
            paymentMethod,
            cards: sorted,
            cardCount: sorted.length,
            total,
            paid: paymentMethod === 'cash' ? roundCashAmount(total) : total,
            balance: balanceCents / 100,
        });
    }

    return sales.sort((a, b) => b.soldAt.localeCompare(a.soldAt));
}

/**
 * Narrows the list to cards matching the search: code, who it is for, their
 * email, who it is from, or the vendor it is good for.
 */
export function filterGiftCardSales(
    sales: GiftCardSale[],
    query: string,
    vendorNames: Map<string, string>
): GiftCardSale[] {
    const needle = query.trim().toLowerCase();
    if (!needle) return sales;

    const matches = (card: GiftCardSaleRow) => [
        card.code,
        card.recipient_name,
        card.recipient_email,
        card.from_name,
        card.consignor_id ? vendorNames.get(card.consignor_id) : null,
    ].some((value) => (value || '').toLowerCase().includes(needle));

    const narrowed: GiftCardSale[] = [];
    for (const sale of sales) {
        const cards = sale.cards.filter(matches);
        if (cards.length > 0) narrowed.push({ ...sale, cards });
    }
    return narrowed;
}

export type GiftCardStatusId = 'unused' | 'partial' | 'used' | 'expired' | 'inactive';

export function getGiftCardStatus(
    card: Pick<GiftCardSaleRow, 'original_amount' | 'current_balance' | 'expires_at' | 'is_active'>,
    now: Date = new Date()
): { id: GiftCardStatusId; label: string } {
    if (!card.is_active) return { id: 'inactive', label: 'Turned off' };
    const balanceCents = toCents(card.current_balance);
    if (balanceCents <= 0) return { id: 'used', label: 'Used up' };
    if (card.expires_at && new Date(card.expires_at).getTime() <= now.getTime()) return { id: 'expired', label: 'Expired' };
    if (balanceCents < toCents(card.original_amount)) return { id: 'partial', label: 'Partly used' };
    return { id: 'unused', label: 'Not used yet' };
}

/** One line of a card's history (gift_card_transactions). */
export interface GiftCardHistoryEntry {
    id: string;
    gift_card_id: string;
    amount: number;
    balance_after: number;
    entry_type: string;
    sale_id: string | null;
    refund_id: string | null;
    note: string | null;
    actor_name: string | null;
    created_at: string;
}

export function describeGiftCardEntry(entry: Pick<GiftCardHistoryEntry, 'entry_type' | 'amount'>): string {
    switch (entry.entry_type) {
        case 'issue': return 'Sold';
        case 'sale_redemption': return 'Used on a sale';
        case 'refund_restore': return 'Put back by a refund';
        case 'manual_redemption': return 'Taken off by hand';
        case 'manual_restore': return 'Added by hand';
        case 'migrated_adjustment': return 'Earlier use';
        default: return 'Balance change';
    }
}
