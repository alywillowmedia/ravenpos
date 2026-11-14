import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
    describeGiftCardEntry,
    filterGiftCardSales,
    getGiftCardStatus,
    groupGiftCardSales,
    type GiftCardSaleRow,
} from '../../src/lib/giftCardSales';

function card(overrides: Partial<GiftCardSaleRow> = {}): GiftCardSaleRow {
    return {
        id: 'card-1',
        code: 'GC-AAAA111111',
        original_amount: 25,
        current_balance: 25,
        recipient_name: null,
        recipient_email: null,
        from_name: null,
        message: null,
        purchase_payment_method: 'cash',
        purchase_payment_intent_id: null,
        issued_at: '2026-11-10T15:00:00.000Z',
        expires_at: null,
        last_redeemed_at: null,
        is_active: true,
        consignor_id: null,
        theme: 'everyday',
        batch_id: null,
        ...overrides,
    };
}

describe('gift card sales list', () => {
    it('puts cards sold in one payment on one row, newest sale first', () => {
        const sales = groupGiftCardSales([
            card({ id: 'a', code: 'GC-A', batch_id: 'b1', issued_at: '2026-11-10T15:00:00.000Z' }),
            card({ id: 'b', code: 'GC-B', batch_id: 'b1', issued_at: '2026-11-10T15:00:00.100Z', original_amount: 50, current_balance: 20 }),
            card({ id: 'c', code: 'GC-C', batch_id: 'b2', issued_at: '2026-11-12T09:00:00.000Z', purchase_payment_method: 'card' }),
            // Cards from before batches existed each stand alone.
            card({ id: 'd', code: 'GC-D', issued_at: '2026-10-01T09:00:00.000Z' }),
            card({ id: 'e', code: 'GC-E', issued_at: '2026-10-02T09:00:00.000Z' }),
        ]);

        expect(sales.map((sale) => sale.cards.map((entry) => entry.code))).toEqual([
            ['GC-C'],
            ['GC-A', 'GC-B'],
            ['GC-E'],
            ['GC-D'],
        ]);
        const pair = sales[1];
        expect(pair.cardCount).toBe(2);
        expect(pair.total).toBe(75);
        expect(pair.balance).toBe(45);
        expect(pair.paymentMethod).toBe('cash');
        expect(pair.soldAt).toBe('2026-11-10T15:00:00.000Z');
    });

    it('shows what was actually paid when a cash sale was rounded to the nickel', () => {
        const [sale] = groupGiftCardSales([
            card({ id: 'a', batch_id: 'b1', original_amount: 10.02 }),
            card({ id: 'b', batch_id: 'b1', original_amount: 10.01 }),
        ]);
        expect(sale.total).toBe(20.03);
        expect(sale.paid).toBe(20.05);

        const [byCard] = groupGiftCardSales([card({ original_amount: 20.03, purchase_payment_method: 'card' })]);
        expect(byCard.paid).toBe(20.03);
    });

    it('finds a card by code, recipient, email, sender or vendor', () => {
        const vendorNames = new Map([['v1', 'Alywillow Organics']]);
        const sales = groupGiftCardSales([
            card({ id: 'a', code: 'GC-ABC1234567', batch_id: 'b1', recipient_name: 'Margaret', recipient_email: 'meg@example.com' }),
            card({ id: 'b', code: 'GC-ZZZ9999999', batch_id: 'b1', from_name: 'Uncle Bo' }),
            card({ id: 'c', code: 'GC-VENDOR0001', batch_id: 'b2', consignor_id: 'v1' }),
        ]);

        const codes = (query: string) => filterGiftCardSales(sales, query, vendorNames)
            .flatMap((sale) => sale.cards.map((entry) => entry.code));

        expect(codes('')).toHaveLength(3);
        expect(codes('  gc-abc ')).toEqual(['GC-ABC1234567']);
        expect(codes('abc1234567')).toEqual(['GC-ABC1234567']);
        expect(codes('margaret')).toEqual(['GC-ABC1234567']);
        expect(codes('MEG@EXAMPLE')).toEqual(['GC-ABC1234567']);
        expect(codes('uncle bo')).toEqual(['GC-ZZZ9999999']);
        expect(codes('alywillow')).toEqual(['GC-VENDOR0001']);
        expect(codes('nobody')).toEqual([]);
    });

    it('keeps the size of the whole sale when a search narrows its cards', () => {
        const sales = groupGiftCardSales([
            card({ id: 'a', code: 'GC-A', batch_id: 'b1', recipient_name: 'Margaret' }),
            card({ id: 'b', code: 'GC-B', batch_id: 'b1' }),
            card({ id: 'c', code: 'GC-C', batch_id: 'b1' }),
        ]);
        const [match] = filterGiftCardSales(sales, 'margaret', new Map());
        expect(match.cards).toHaveLength(1);
        expect(match.cardCount).toBe(3);
        expect(match.total).toBe(75);
    });

    it('says where each card stands', () => {
        const now = new Date('2026-11-14T12:00:00.000Z');
        expect(getGiftCardStatus(card(), now)).toEqual({ id: 'unused', label: 'Not used yet' });
        expect(getGiftCardStatus(card({ current_balance: 10 }), now)).toEqual({ id: 'partial', label: 'Partly used' });
        expect(getGiftCardStatus(card({ current_balance: 0 }), now)).toEqual({ id: 'used', label: 'Used up' });
        expect(getGiftCardStatus(card({ expires_at: '2026-11-01T00:00:00.000Z' }), now)).toEqual({ id: 'expired', label: 'Expired' });
        expect(getGiftCardStatus(card({ is_active: false }), now)).toEqual({ id: 'inactive', label: 'Turned off' });
        // A spent card is "used up" even if it has since expired.
        expect(getGiftCardStatus(card({ current_balance: 0, expires_at: '2026-11-01T00:00:00.000Z' }), now).id).toBe('used');
    });

    it('describes each line of a card history in plain words', () => {
        expect(describeGiftCardEntry({ entry_type: 'issue', amount: 25 })).toBe('Sold');
        expect(describeGiftCardEntry({ entry_type: 'sale_redemption', amount: -10 })).toBe('Used on a sale');
        expect(describeGiftCardEntry({ entry_type: 'refund_restore', amount: 10 })).toBe('Put back by a refund');
        expect(describeGiftCardEntry({ entry_type: 'manual_redemption', amount: -5 })).toBe('Taken off by hand');
        expect(describeGiftCardEntry({ entry_type: 'manual_restore', amount: 5 })).toBe('Added by hand');
        expect(describeGiftCardEntry({ entry_type: 'migrated_adjustment', amount: -5 })).toBe('Earlier use');
        expect(describeGiftCardEntry({ entry_type: 'something_new', amount: 5 })).toBe('Balance change');
    });
});

describe('gift cards on the Sales page', () => {
    const page = readFileSync('src/pages/Sales.tsx', 'utf8');

    it('has a Gift Cards tab for admins that lists the cards sold', () => {
        expect(page).toMatch(/id: 'giftCards', label: 'Gift Cards'/);
        expect(page).toMatch(/activeTab === 'giftCards'/);
        expect(page).toMatch(/<GiftCardsSoldList/);
    });

    it('loads enough of each card to list it, not just the totals', () => {
        expect(page).toMatch(/GIFT_CARD_SALE_COLUMNS/);
    });
});
