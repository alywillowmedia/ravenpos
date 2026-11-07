import { describe, expect, it } from 'vitest';
import { calculatePayoutBasis } from '../../src/lib/payoutBasis';

/**
 * Hand-computed against the server's get_payout_sale_financials, in cents.
 *
 * Sale: A 33.33 (v1, 60%, v1 pays the card fee), B 20.01 (v2, 50%),
 * C 10.07 (v3, 70%, INACTIVE), D 7.77 x2 (v1, 60%, v1 pays the card fee).
 * Order discount 1.11, no item discounts. Gross 3333 / 2001 / 1007 / 1554 = 7895.
 *
 * Order discount, floor(111 * g / 7895) = 46 / 28 / 14 / 21 = 109, so 2 cents
 * go to the largest remainders (A 6793, D 6699): 47 / 28 / 14 / 22.
 * Net lines: A 3286, B 1973, C 993, D 1532 = 7784 (all four items, inactive included).
 *
 * Vendor before fee = round(net * split): A 1972, B 987 (986.5 rounds up),
 * D 919. Store = 6791 - 3878 = 2913. Inactive C keeps its 993 out of both.
 */
const item = (id: string, price: number, quantity: number, split: number, extra: Record<string, unknown> = {}) => ({
    id,
    price,
    quantity,
    commission_split: split,
    discount_amount: 0,
    consignor_id: 'v1',
    consignor_pays_card_fee: false,
    consignor: { is_active: true },
    ...extra,
});

const mixedItems = () => [
    item('a', 33.33, 1, 0.6, { consignor_pays_card_fee: true }),
    item('b', 20.01, 1, 0.5, { consignor_id: 'v2' }),
    item('c', 10.07, 1, 0.7, { consignor_id: 'v3', consignor: { is_active: false } }),
    item('d', 7.77, 2, 0.6, { consignor_pays_card_fee: true }),
];

describe('calculatePayoutBasis against the server method', () => {
    it('card-paid mixed sale: discount and fee allocated over all four items, inactive included', () => {
        // Card sale, total 83.29 = 77.84 + 5.45 tax. Fee = round(8329 * 0.027 + 5) = 230 cents.
        // Fee over net lines, floor + largest remainder: A 97, B 58, C 30 (extra cent), D 45.
        // Only v1 pays: A 97 + D 45 = 142.
        const sale = {
            id: 's1',
            items: mixedItems(),
            discount_total: 1.11,
            total: 83.29,
            payment_method: 'card',
            payment_breakdown: [{ method: 'card', amount: 83.29 }],
        };
        const totals = calculatePayoutBasis({ sales: [sale], refunds: [], vendorId: 'v1' });
        // v1: (1972 - 97) + (919 - 45) = 2749. v2: 987. Both net of the fee only v1 pays.
        expect(totals.selectedVendorShare).toBe(27.49);
        expect(totals.otherVendorsShare).toBe(9.87);
        expect(totals.consignorShare).toBe(37.36);
        expect(totals.storeShare).toBe(29.13);
        expect(totals.consignorCardFees).toBe(1.42);
        expect(totals.inactiveVendorLines).toBe(9.93);
    });

    it('split sale: the fee is on the card portion, not the sale total', () => {
        // Card 40.00 of 83.29. Fee = round(4000 * 0.027 + 5) = 113 cents.
        // Over net lines: A 48, B 29, C 14, D 22. v1 pays A + D = 70.
        const sale = {
            id: 's1',
            items: mixedItems(),
            discount_total: 1.11,
            total: 83.29,
            payment_method: 'split',
            payment_breakdown: [
                { method: 'card', amount: 40 },
                { method: 'cash', amount: 43.29 },
            ],
        };
        const totals = calculatePayoutBasis({ sales: [sale], refunds: [], vendorId: 'v1' });
        expect(totals.consignorCardFees).toBe(0.7);
        expect(totals.selectedVendorShare).toBe(28.21); // (1972 - 48) + (919 - 22)
        expect(totals.otherVendorsShare).toBe(9.87);
        expect(totals.storeShare).toBe(29.13);
    });

    it('cash sale: no fee at all', () => {
        const sale = {
            id: 's1',
            items: mixedItems(),
            discount_total: 1.11,
            total: 83.29,
            payment_method: 'cash',
            payment_breakdown: [{ method: 'cash', amount: 83.29 }],
        };
        const totals = calculatePayoutBasis({ sales: [sale], refunds: [], vendorId: 'v1' });
        expect(totals.consignorCardFees).toBe(0);
        expect(totals.selectedVendorShare).toBe(28.91); // 1972 + 919
    });

    it('rounds the running total, not each line: a 1.11 discount over six 10.01 lines is exactly 58.95', () => {
        // Per-line rounding would give 58.98 (983 x 6). The server floors and hands out 3 remainder cents: 5895.
        const items = Array.from({ length: 6 }, (_, k) => item(`i${k}`, 10.01, 1, 0.6));
        const sale = { id: 's1', items, discount_total: 1.11, total: 58.95, payment_method: 'cash', payment_breakdown: [{ method: 'cash', amount: 58.95 }] };
        const totals = calculatePayoutBasis({ sales: [sale], refunds: [] });
        const lines = Math.round((totals.consignorShare + totals.storeShare + totals.consignorCardFees) * 100);
        expect(lines).toBe(5895);
    });

    it('does not let an inactive vendor change what the others get (inactive-first allocation)', () => {
        // The old code spread the 1.11 over active items only (6888 gross), giving A 3286.14 -> different cents.
        // With all items, A's line is 3286, so v1's before-fee vendor part on A is 1972.
        const sale = { id: 's1', items: mixedItems(), discount_total: 1.11, total: 83.29, payment_method: 'cash', payment_breakdown: [{ method: 'cash', amount: 83.29 }] };
        const withInactive = calculatePayoutBasis({ sales: [sale], refunds: [], vendorId: 'v1' });
        expect(withInactive.selectedVendorShare + withInactive.otherVendorsShare + withInactive.storeShare + withInactive.inactiveVendorLines).toBe(77.84);
    });
});
