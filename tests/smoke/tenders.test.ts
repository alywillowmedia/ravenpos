import { describe, expect, it } from 'vitest';
import {
    allocateRefundToTenders,
    buildSaleTenders,
    derivePaymentMethod,
    formatSalePaymentLabel,
    getSaleTenderAmount,
    getSaleTenders,
} from '../../src/lib/tenders';

describe('sale tenders', () => {
    it('records store credit as its own tender ahead of the card remainder', () => {
        const tenders = buildSaleTenders({
            storeCredit: { amount: 20.95, consignorId: null },
            giftCard: null,
            remainder: { method: 'card', amount: 14.05, stripePaymentIntentId: 'pi_1', cardLast4: '4242' },
        });

        expect(tenders.map((entry) => [entry.method, entry.amount])).toEqual([
            ['store_credit', 20.95],
            ['card', 14.05],
        ]);
        expect(derivePaymentMethod(tenders, 'card')).toBe('split');
    });

    it('labels a sale paid entirely with store credit as store credit, not card', () => {
        const tenders = buildSaleTenders({
            storeCredit: { amount: 20.95, consignorId: null },
            remainder: { method: 'none' },
        });

        expect(derivePaymentMethod(tenders, 'card')).toBe('store_credit');
        expect(formatSalePaymentLabel({ payment_method: 'store_credit', payment_breakdown: tenders, total: 20.95 }))
            .toBe('Store Credit');
    });

    it('keeps the gift card code only for the server to resolve', () => {
        const tenders = buildSaleTenders({
            giftCard: { code: ' gc-43c8f9ff6f ', amount: 10 },
            remainder: { method: 'cash', amount: 5, tendered: 10, change: 5 },
        });

        expect(tenders[0]).toMatchObject({ method: 'gift_card', amount: 10, gift_card_code: 'GC-43C8F9FF6F' });
        expect(tenders[1]).toMatchObject({ method: 'cash', amount: 5, tendered: 10, change: 5 });
    });

    it('reads sales saved before payment_breakdown was written for every sale', () => {
        const legacyCash = { payment_method: 'cash', total: 89.51, cash_tendered: 100, change_given: 10.49 };
        expect(getSaleTenders(legacyCash)).toEqual([
            expect.objectContaining({ method: 'cash', amount: 89.51, tendered: 100, change: 10.49 }),
        ]);
        expect(formatSalePaymentLabel(legacyCash)).toBe('Cash');
        expect(getSaleTenderAmount(legacyCash, 'card')).toBe(0);
    });

    it('lists combined tenders in the order they are applied', () => {
        const sale = {
            payment_method: 'split',
            total: 35,
            payment_breakdown: [
                { method: 'cash' as const, amount: 5 },
                { method: 'gift_card' as const, amount: 10, code_last4: 'FF6F' },
                { method: 'store_credit' as const, amount: 20 },
            ],
        };

        expect(formatSalePaymentLabel(sale)).toBe('Store Credit + Gift Card + Cash');
        expect(getSaleTenderAmount(sale, 'store_credit')).toBe(20);
    });
});

describe('refund allocation', () => {
    const tenders = [
        { method: 'store_credit' as const, amount: 20, consignor_id: null },
        { method: 'card' as const, amount: 30, stripe_payment_intent_id: 'pi_1' },
    ];

    it('returns money to each tender in proportion to what was paid', () => {
        const allocation = allocateRefundToTenders({ tenders, priorRefunds: [], refundAmount: 25 });

        expect(allocation).toEqual([
            expect.objectContaining({ method: 'store_credit', amount: 10 }),
            expect.objectContaining({ method: 'card', amount: 15, stripe_payment_intent_id: 'pi_1' }),
        ]);
    });

    it('refunds whatever is left on each tender after earlier refunds', () => {
        const allocation = allocateRefundToTenders({
            tenders,
            priorRefunds: [{
                refund_amount: 25,
                payment_breakdown: [
                    { method: 'store_credit', amount: 10, consignor_id: null },
                    { method: 'card', amount: 15, stripe_payment_intent_id: 'pi_1' },
                ],
            }],
            refundAmount: 25,
        });

        expect(allocation.map((entry) => [entry.method, entry.amount])).toEqual([
            ['store_credit', 10],
            ['card', 15],
        ]);
    });

    it('counts refunds recorded before per-tender refunds against their method', () => {
        const allocation = allocateRefundToTenders({
            tenders: [
                { method: 'cash', amount: 52 },
                { method: 'card', amount: 58.32, stripe_payment_intent_id: 'pi_2' },
            ],
            priorRefunds: [{ payment_method: 'card', refund_amount: 58.32 }],
            refundAmount: 52,
        });

        expect(allocation).toEqual([expect.objectContaining({ method: 'cash', amount: 52 })]);
    });

    it('never splits a cent that is not there', () => {
        const allocation = allocateRefundToTenders({
            tenders: [
                { method: 'store_credit', amount: 10 },
                { method: 'gift_card', amount: 10, gift_card_id: 'g1' },
                { method: 'card', amount: 10 },
            ],
            priorRefunds: [],
            refundAmount: 10,
        });

        const totalCents = allocation.reduce((sum, entry) => sum + Math.round(entry.amount * 100), 0);
        expect(totalCents).toBe(1000);
        expect(allocation.find((entry) => entry.method === 'gift_card')?.gift_card_id).toBe('g1');
    });
});
