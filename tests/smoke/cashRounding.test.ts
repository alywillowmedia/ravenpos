import { describe, expect, it } from 'vitest';
import {
    floorCashCents,
    getCashRounding,
    getGiftCardCashRounding,
    roundCashAmount,
    roundCashCents,
} from '../../src/lib/cashRounding';

describe('cash rounding to the nearest nickel', () => {
    it.each([
        [10.00, 10.00],
        [10.01, 10.00],
        [10.02, 10.00],
        [10.03, 10.05],
        [10.04, 10.05],
        [10.05, 10.05],
        [10.06, 10.05],
        [10.07, 10.05],
        [10.08, 10.10],
        [10.09, 10.10],
    ])('rounds %s to %s', (exact, rounded) => {
        expect(roundCashAmount(exact)).toBe(rounded);
    });

    it('leaves zero alone and rounds tiny amounts away or up to a nickel', () => {
        expect(roundCashAmount(0)).toBe(0);
        expect(roundCashAmount(0.01)).toBe(0);
        expect(roundCashAmount(0.02)).toBe(0);
        expect(roundCashAmount(0.03)).toBe(0.05);
        expect(roundCashAmount(0.04)).toBe(0.05);
    });

    it('rounds negative amounts the same distance as positive ones', () => {
        expect(roundCashCents(-1002)).toBe(-1000);
        expect(roundCashCents(-1003)).toBe(-1005);
        expect(roundCashAmount(-0.02)).toBe(0);
    });

    it('is not thrown off by floating point noise or bad input', () => {
        expect(roundCashAmount(0.1 + 0.2)).toBe(0.3);
        expect(roundCashAmount(1.005 + 1.02)).toBe(2.05);
        expect(roundCashAmount(Number.NaN)).toBe(0);
    });

    it('reports the signed difference between the rounded and exact amount', () => {
        expect(getCashRounding(10.02)).toBe(-0.02);
        expect(getCashRounding(10.01)).toBe(-0.01);
        expect(getCashRounding(10.03)).toBe(0.02);
        expect(getCashRounding(10.04)).toBe(0.01);
        expect(getCashRounding(10.05)).toBe(0);
        expect(getCashRounding(0)).toBe(0);
    });

    it('rounds down to a nickel when asked', () => {
        expect(floorCashCents(1004)).toBe(1000);
        expect(floorCashCents(1005)).toBe(1005);
        expect(floorCashCents(2)).toBe(0);
    });
});

describe('gift cards sold for cash', () => {
    it('rounds each payment once, not each card', () => {
        const cards = [
            { original_amount: 10.01, purchase_payment_method: 'cash', batch_id: 'a' },
            { original_amount: 10.01, purchase_payment_method: 'cash', batch_id: 'a' },
            { original_amount: 10.01, purchase_payment_method: 'cash', batch_id: 'a' },
        ];
        // 30.03 paid as 30.05
        expect(getGiftCardCashRounding(cards)).toBe(0.02);
    });

    it('treats cards without a batch as separate payments and ignores card payments', () => {
        const cards = [
            { original_amount: 25.02, purchase_payment_method: 'cash', batch_id: null },
            { original_amount: 25.02, purchase_payment_method: 'cash' },
            { original_amount: 25.03, purchase_payment_method: 'card', batch_id: 'b' },
            { original_amount: 50, purchase_payment_method: 'cash', batch_id: 'c' },
        ];
        expect(getGiftCardCashRounding(cards)).toBe(-0.04);
    });
});
