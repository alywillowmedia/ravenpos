import { describe, expect, it } from 'vitest';
import { calculateTillAccountabilityMetrics } from '../../src/lib/tillAccountability';
import { calculateProRatedRefundAmount } from '../../src/lib/refundCalculations';
import { calculatePayoutBasis, refundsOfSales, returnsOfEarlierSales } from '../../src/lib/payoutBasis';
import {
    booksCsv,
    booksFilename,
    buildBooksReportHtml,
    buildSalesSummary,
    busiestSlot,
    dailyNetSales,
    topCategories,
    topCategoryByItems,
    type SalesSummaryInput,
} from '../../src/lib/salesSummary';

// The owner's screen, last 30 days.
const realExample: SalesSummaryInput = {
    metrics: {
        grossProductSales: 6005.48,
        discounts: 197.65,
        returns: 0,
        allowances: 0,
        netSales: 5807.83,
        salesTax: 300.51,
        creditCardFeesCharged: 118.0,
        giftCertificatesSold: 0,
        totalCollected: 6226.34,
        cashInDrawer: 1618.81,
        checksInHand: 0,
        creditCardsBatchTotal: 4257.69,
        storeCreditRedeemed: 318.26,
        giftCardRedeemed: 31.58,
        totalReceived: 6226.34,
        expectedCashFromSales: 1575.81,
        dealerCashPurchases: 43.0,
        giftCardSalesCash: 0,
        offlineUnsyncedCashSales: 0,
    },
    payout: { consignorShare: 4706.91, storeShare: 1100.92, consignorCardFees: 0 },
    transactionCount: 93,
    itemsSold: 326,
    topCategory: 'Home Decor',
};

function withMetrics(patch: Partial<SalesSummaryInput['metrics']>, rest: Partial<SalesSummaryInput> = {}): SalesSummaryInput {
    return { ...realExample, ...rest, metrics: { ...realExample.metrics, ...patch } };
}

describe('headline', () => {
    it('reports net sales, the store share of it, and items on the real example', () => {
        const { headline } = buildSalesSummary(realExample);
        expect(headline.netSales).toBe(5807.83);
        expect(headline.storeKeeps).toBe(1100.92);
        expect(headline.storeKeepsPercent).toBe(19);
        expect(headline.transactionCount).toBe(93);
        expect(headline.averageSale).toBe(62.45);
        expect(headline.itemsSold).toBe(326);
        expect(headline.topCategory).toBe('Home Decor');
    });

    it('does not divide by zero and omits a missing top category', () => {
        const { headline } = buildSalesSummary({
            ...withMetrics({ netSales: 0 }),
            transactionCount: 0,
            itemsSold: 0,
            topCategory: null,
            payout: { consignorShare: 0, storeShare: 0, consignorCardFees: 0 },
        });
        expect(headline.averageSale).toBe(0);
        expect(headline.storeKeepsPercent).toBe(0);
        expect(headline.topCategory).toBeNull();
    });
});

describe('does it balance', () => {
    it('is balanced to the cent on the real example', () => {
        const { balance } = buildSalesSummary(realExample);
        expect(balance.balanced).toBe(true);
        expect(balance.difference).toBe(0);
        expect(balance.hint).toBeNull();
        expect(balance.rows.map((row) => [row.key, row.amount])).toEqual([
            ['cash', 1618.81],
            ['card', 4257.69],
            ['storeCredit', 318.26],
            ['giftCards', 31.58],
            ['checks', 0],
        ]);
        expect(balance.received).toBe(6226.34);
        expect(balance.collected).toBe(6226.34);
    });

    it('is off when collected and received differ by one cent', () => {
        const { balance } = buildSalesSummary(withMetrics({ totalCollected: 6226.35 }));
        expect(balance.balanced).toBe(false);
        expect(balance.difference).toBe(0.01);
        expect(balance.hint).toMatch(/\S/);
    });

    it('is off the other way round, reporting a positive amount', () => {
        const { balance } = buildSalesSummary(withMetrics({ totalCollected: 6200.0 }));
        expect(balance.balanced).toBe(false);
        expect(balance.difference).toBe(26.34);
        expect(balance.hint).toMatch(/\S/);
    });

    it('treats float noise below half a cent as balanced', () => {
        const { balance } = buildSalesSummary(withMetrics({ totalCollected: 6226.341, totalReceived: 6226.34 }));
        expect(balance.balanced).toBe(true);
    });

    it('shows the drawer expectation and only the nonzero notes, with the sign decided here', () => {
        const { balance } = buildSalesSummary(realExample);
        expect(balance.drawer.expected).toBe(1575.81);
        expect(balance.drawer.notes).toEqual([
            { key: 'dealerCashOut', text: 'Dealer cash out \u2212$43.00', amount: 43 },
        ]);

        const all = buildSalesSummary(withMetrics({ giftCardSalesCash: 25, offlineUnsyncedCashSales: 12.5 })).balance.drawer.notes;
        expect(all.map((note) => note.key)).toEqual(['dealerCashOut', 'giftCardsSoldForCash', 'offlineUnsynced']);
        expect(all[1].text).toBe('Includes $25.00 gift cards sold for cash');
        expect(all[2].text).toBe('Offline unsynced +$12.50');

        const none = buildSalesSummary(withMetrics({ dealerCashPurchases: 0 })).balance.drawer.notes;
        expect(none).toEqual([]);
    });

    it('names the real causes when it is off', () => {
        const collectedHigh = buildSalesSummary(withMetrics({ totalCollected: 6300 })).balance.hint;
        expect(collectedHigh).toMatch(/gift card/i);
        expect(collectedHigh).toMatch(/payment method/i);
        expect(collectedHigh).toMatch(/payments are less than/i);
        const receivedHigh = buildSalesSummary(withMetrics({ totalCollected: 6200 })).balance.hint;
        expect(receivedHigh).toMatch(/refund/i);
        expect(receivedHigh).toMatch(/tender/i);
    });

    it('a failed load is never balanced and never shows figures as good news', () => {
        const summary = buildSalesSummary({ ...realExample, loadFailed: true });
        expect(summary.failed).toBe(true);
        expect(summary.balance.balanced).toBe(false);
        expect(summary.loading).toBe(false);
        expect(buildSalesSummary(realExample).failed).toBe(false);
        // Failing wins over loading: a retry in flight is still "loading", but an error with nothing loading is failed.
        expect(buildSalesSummary({ ...realExample, loadFailed: true, isLoading: true }).failed).toBe(false);
    });

    it('is loading, never balanced, until the data has arrived', () => {
        const summary = buildSalesSummary({ ...realExample, isLoading: true });
        expect(summary.loading).toBe(true);
        expect(summary.balance.balanced).toBe(false);
        expect(buildSalesSummary(realExample).loading).toBe(false);
    });
});

describe('who gets what', () => {
    it('adds up to Collected on the real example with no extra rows', () => {
        const { split } = buildSalesSummary(realExample);
        expect(split.rows.map((row) => [row.key, row.amount])).toEqual([
            ['vendors', 4706.91],
            ['store', 1100.92],
            ['salesTax', 300.51],
            ['cardFees', 118],
        ]);
        expect(split.notSplit).toBe(0);
        expect(split.total).toBe(6226.34);
        expect(split.hint).toBeNull();
    });

    it('shows cash rounding on its own row so the split still adds up to Collected', () => {
        const summary = buildSalesSummary({
            ...realExample,
            metrics: { ...realExample.metrics, cashRounding: 0.03, totalCollected: 6226.37, totalReceived: 6226.37 },
        });
        expect(summary.split.rows.map((row) => [row.key, row.amount])).toEqual([
            ['vendors', 4706.91],
            ['store', 1100.92],
            ['salesTax', 300.51],
            ['cardFees', 118],
            ['cashRounding', 0.03],
        ]);
        expect(summary.split.notSplit).toBe(0);
        expect(summary.split.total).toBe(6226.37);
        expect(summary.books.right.lines.map((line) => line.key)).toContain('cashRounding');
        expect(buildSalesSummary(realExample).books.right.lines.map((line) => line.key)).not.toContain('cashRounding');
    });

    it('labels a remainder of one cent or less Rounding, quietly', () => {
        const { split } = buildSalesSummary(withMetrics({}, { payout: { consignorShare: 4706.9, storeShare: 1100.92, consignorCardFees: 0 } }));
        const row = split.rows.find((r) => r.key === 'notSplit');
        expect(row?.label).toBe('Rounding');
        expect(row?.amount).toBe(0.01);
        expect(row?.tone).toBeUndefined();
        expect(split.hint).toBeNull();
    });

    it('keeps Not split for two cents without alarm, and warns above that', () => {
        const two = buildSalesSummary(withMetrics({}, { payout: { consignorShare: 4706.89, storeShare: 1100.92, consignorCardFees: 0 } })).split;
        expect(two.rows.find((r) => r.key === 'notSplit')?.label).toBe('Not split');
        expect(two.rows.find((r) => r.key === 'notSplit')?.tone).toBeUndefined();

        const three = buildSalesSummary(withMetrics({}, { payout: { consignorShare: 4706.88, storeShare: 1100.92, consignorCardFees: 0 } })).split;
        const row = three.rows.find((r) => r.key === 'notSplit');
        expect(row?.label).toBe('Not split');
        expect(row?.tone).toBe('warning');
        expect(three.hint).toMatch(/check/i);
    });

    it('allows two cents per in-range refund before it warns', () => {
        const input = (refundCount: number) => withMetrics({}, { payout: { consignorShare: 4706.8, storeShare: 1100.92, consignorCardFees: 0 }, refundCount });
        // 11 cents short.
        expect(buildSalesSummary(input(0)).split.rows.find((r) => r.key === 'notSplit')?.tone).toBe('warning');
        expect(buildSalesSummary(input(4)).split.rows.find((r) => r.key === 'notSplit')?.tone).toBe('warning'); // allows 10
        const fine = buildSalesSummary(input(5)).split; // allows 12
        expect(fine.rows.find((r) => r.key === 'notSplit')?.tone).toBeUndefined();
        expect(fine.rows.find((r) => r.key === 'notSplit')?.muted).toBe(true);
        expect(fine.hint).toBeNull();
        // Within what refunds can drift by, it is called Rounding.
        const small = buildSalesSummary(withMetrics({}, { payout: { consignorShare: 4706.85, storeShare: 1100.92, consignorCardFees: 0 }, refundCount: 5 }));
        expect(small.split.rows.find((r) => r.key === 'notSplit')?.label).toBe('Rounding');
    });

    it('shows a negative remainder as it is, with the same warning', () => {
        const { split } = buildSalesSummary(withMetrics({}, { payout: { consignorShare: 4800, storeShare: 1100.92, consignorCardFees: 0 } }));
        expect(split.notSplit).toBe(-93.09);
        expect(split.rows.find((r) => r.key === 'notSplit')?.tone).toBe('warning');
    });

    it('shows vendor-paid card fees as their own row, added back', () => {
        const input = withMetrics({}, { payout: { consignorShare: 4700, storeShare: 1100.92, consignorCardFees: 6.91 } });
        const { split } = buildSalesSummary(input);
        const row = split.rows.find((r) => r.key === 'vendorCardFees');
        expect(row?.label).toBe('Card fees paid by vendors, to the processor');
        expect(row?.amount).toBe(6.91);
        expect(split.notSplit).toBe(0);
    });

    it('shows gift cards sold only when there are some', () => {
        const input = withMetrics({ giftCertificatesSold: 50, totalCollected: 6276.34, totalReceived: 6276.34 });
        const { split } = buildSalesSummary(input);
        expect(split.rows.find((row) => row.key === 'giftCardsSold')?.amount).toBe(50);
        expect(split.total).toBe(6276.34);
        expect(buildSalesSummary(realExample).split.rows.some((row) => row.key === 'giftCardsSold')).toBe(false);
    });

    it('carries the footnote about estimates', () => {
        expect(buildSalesSummary(realExample).split.footnote).toBe(
            "Vendor figure is an estimate from each item's split. Actual payouts are on Vendor payouts."
        );
    });

    it('with a vendor filter, splits Vendors into the vendor and the others in the same sales', () => {
        const input: SalesSummaryInput = {
            ...realExample,
            payout: { consignorShare: 4706.91, storeShare: 1100.92, consignorCardFees: 0, selectedVendorShare: 3000, otherVendorsShare: 1706.91 },
            vendor: { label: 'C001 - Maple Co' },
        };
        const { split } = buildSalesSummary(input);
        expect(split.rows.map((row) => [row.key, row.label, row.amount]).slice(0, 3)).toEqual([
            ['vendor', 'C001 - Maple Co', 3000],
            ['otherVendors', 'Other vendors in the same sales', 1706.91],
            ['store', 'Store', 1100.92],
        ]);
        expect(split.notSplit).toBe(0);
        expect(buildSalesSummary(input).vendorNote).toBe('Sales that include C001 - Maple Co. Totals cover whole sales.');
        expect(buildSalesSummary(realExample).vendorNote).toBeNull();
    });
});

// The same data through the real metrics and the real payout basis.
describe('who gets what on the same data as the metrics', () => {
    const item = (id: string, price: number, quantity: number, split: number, extra: Record<string, unknown> = {}) => ({
        id, price, quantity, commission_split: split, discount_amount: 0, consignor_id: 'v1', consignor: { is_active: true }, ...extra,
    });
    const cashSale = (id: string, items: ReturnType<typeof item>[], subtotal: number, tax: number) => ({
        id,
        items,
        subtotal,
        discount_total: 0,
        tax_amount: tax,
        card_fee_amount: 0,
        total: subtotal + tax,
        payment_method: 'cash',
        payment_breakdown: [{ method: 'cash', amount: subtotal + tax }],
    });
    const cashRefund = (saleId: string | null, amount: number, sale: { total: number; tax_amount: number; card_fee_amount: number } | null, items: unknown = []) => ({
        sale_id: saleId,
        created_at: new Date(2026, 9, 3, 12).toISOString(),
        refund_amount: amount,
        payment_method: 'cash',
        payment_breakdown: [{ method: 'cash', amount }],
        items,
        sale,
    });

    function run(sales: ReturnType<typeof cashSale>[], refunds: ReturnType<typeof cashRefund>[], vendorId?: string) {
        const metrics = calculateTillAccountabilityMetrics({ sales, refunds, giftCardsSold: [] });
        const payout = calculatePayoutBasis({ sales, refunds, vendorId });
        const summary = buildSalesSummary({
            metrics,
            payout,
            earlierReturns: returnsOfEarlierSales(refunds, sales),
            transactionCount: sales.length,
            itemsSold: 0,
            topCategory: null,
        });
        return { metrics, payout, summary };
    }
    const rows = (summary: ReturnType<typeof buildSalesSummary>) => Object.fromEntries(summary.split.rows.map((r) => [r.key, r.amount]));

    it('a plain sale splits to the cent', () => {
        const { summary } = run([cashSale('s1', [item('i1', 100, 1, 0.6)], 100, 7)], []);
        expect(rows(summary)).toEqual({ vendors: 60, store: 40, salesTax: 7, cardFees: 0 });
        expect(summary.split.notSplit).toBe(0);
        expect(summary.split.total).toBe(107);
    });

    it('a refund of an earlier sale gets its own negative row and Not split stays 0', () => {
        const sale = cashSale('s1', [item('i1', 100, 1, 0.6), item('i2', 50, 1, 0.5, { consignor: { is_active: false } })], 150, 10.5);
        // Sale 'old' is from before the range: $20 of goods, $1.40 tax.
        const refund = cashRefund('old', 21.4, { total: 107, tax_amount: 7, card_fee_amount: 0 });
        const { metrics, summary } = run([sale], [refund]);
        expect(metrics.netSales).toBe(130);
        expect(metrics.totalCollected).toBe(139.1);
        expect(rows(summary)).toEqual({
            vendors: 60,
            store: 40,
            inactiveVendors: 50,
            earlierReturns: -20,
            salesTax: 9.1,
            cardFees: 0,
        });
        expect(summary.split.notSplit).toBe(0);
        expect(summary.split.total).toBe(139.1);
    });

    it('a refund of an in-range item leaves the item out of both shares', () => {
        const sale = cashSale('s1', [item('i1', 50, 2, 0.5)], 100, 7);
        const refund = cashRefund('s1', 53.5, { total: 107, tax_amount: 7, card_fee_amount: 0 }, [{ sale_item_id: 'i1', quantity: 1 }]);
        const { metrics, summary } = run([sale], [refund]);
        expect(metrics.netSales).toBe(50);
        expect(rows(summary)).toEqual({ vendors: 25, store: 25, salesTax: 3.5, cardFees: 0 });
        expect(summary.split.notSplit).toBe(0);
    });

    it('a refund with no sale at all counts as a return of an earlier sale', () => {
        const sale = cashSale('s1', [item('i1', 100, 1, 0.6)], 100, 7);
        const { summary } = run([sale], [cashRefund(null, 10, null)]);
        expect(rows(summary).earlierReturns).toBe(-10);
        expect(summary.split.notSplit).toBe(0);
    });

    it('a refund whose amount does not match the returned quantity is a real remainder, flagged', () => {
        const sale = cashSale('s1', [item('i1', 50, 2, 0.5)], 100, 7);
        const refund = cashRefund('s1', 32.1, { total: 107, tax_amount: 7, card_fee_amount: 0 }, [{ sale_item_id: 'i1', quantity: 1 }]);
        const { summary } = run([sale], [refund]);
        // 30 of goods refunded but one 50 item taken out of the shares: the 20 gap is not split.
        expect(summary.split.notSplit).toBe(20);
        expect(summary.split.rows.find((r) => r.key === 'notSplit')?.tone).toBe('warning');
    });

    it('does not lose or invent cents across many odd-priced lines with an order discount', () => {
        const items = Array.from({ length: 40 }, (_, index) => item(`i${index}`, 3.33 + index * 0.07, 1, 0.65));
        const subtotal = Math.round(items.reduce((sum, line) => sum + line.price, 0) * 100) / 100;
        const sale = { ...cashSale('s1', items, subtotal, 0), discount_total: 12.34 };
        sale.total = Math.round((subtotal - 12.34) * 100) / 100;
        sale.payment_breakdown = [{ method: 'cash', amount: sale.total }];
        const { metrics, payout } = run([sale], []);
        const lines = Math.round((payout.consignorShare + payout.storeShare + payout.consignorCardFees) * 100);
        expect(lines).toBe(Math.round(metrics.netSales * 100));
    });

    // Many real pro-rated refunds on clean data: each refund rounds three times,
    // so the remainder drifts a cent or two per refund. That is not a data problem.
    function manyRefunds(seed: number, count: number, mismatch = 0) {
        let state = seed;
        const random = () => { state = (state * 1664525 + 1013904223) % 4294967296; return state / 4294967296; };
        const sales: ReturnType<typeof cashSale>[] = [];
        const refunds: ReturnType<typeof cashRefund>[] = [];
        for (let n = 0; n < count; n += 1) {
            const items = Array.from({ length: 3 }, (_, k) => item(`s${n}i${k}`, Math.round((5 + random() * 60) * 100) / 100, 1, 0.6));
            const subtotal = Math.round(items.reduce((sum, line) => sum + line.price, 0) * 100) / 100;
            const discount = Math.round(random() * 500) / 100;
            const tax = Math.round((subtotal - discount) * 0.0725 * 100) / 100;
            const total = Math.round((subtotal - discount + tax) * 100) / 100;
            sales.push({ ...cashSale(`s${n}`, items, subtotal, tax), discount_total: discount, total, payment_breakdown: [{ method: 'cash', amount: total }] });
            const amount = calculateProRatedRefundAmount({
                saleItems: items,
                saleTotal: total,
                saleDiscountTotal: discount,
                existingRefundAmount: 0,
                alreadyRefundedQuantityBySaleItemId: {},
                selectedRefundQuantityBySaleItemId: { [items[0].id]: 1 },
            });
            refunds.push(cashRefund(`s${n}`, amount + (n === 0 ? mismatch : 0), { total, tax_amount: tax, card_fee_amount: 0 }, [{ sale_item_id: items[0].id, quantity: 1 }]));
        }
        const metrics = calculateTillAccountabilityMetrics({ sales, refunds, giftCardsSold: [] });
        return buildSalesSummary({
            metrics,
            payout: calculatePayoutBasis({ sales, refunds }),
            earlierReturns: returnsOfEarlierSales(refunds, sales),
            refundCount: refunds.length,
            transactionCount: sales.length,
            itemsSold: 0,
            topCategory: null,
        });
    }

    it('30 clean pro-rated refunds drift by cents but never reach the warning', () => {
        let drifted = 0;
        for (let seed = 1; seed <= 40; seed += 1) {
            const { split } = manyRefunds(seed, 30);
            if (Math.abs(split.notSplit) > 0.02) drifted += 1; // the old fixed 2 cents would have warned here
            expect(split.rows.find((r) => r.key === 'notSplit')?.tone).toBeUndefined();
            expect(split.hint).toBeNull();
        }
        expect(drifted).toBeGreaterThan(0);
    });

    it('a genuine mismatch still warns among many refunds', () => {
        const { split } = manyRefunds(7, 30, 25);
        expect(split.rows.find((r) => r.key === 'notSplit')?.tone).toBe('warning');
        expect(split.hint).toMatch(/check/i);
    });

    it('with a vendor filter the vendor and the others add to the vendors figure', () => {
        const sale = cashSale('s1', [item('i1', 100, 1, 0.6), item('i2', 50, 1, 0.5, { consignor_id: 'v2' })], 150, 0);
        const { payout } = run([sale], [], 'v1');
        expect(payout.selectedVendorShare).toBe(60);
        expect(payout.otherVendorsShare).toBe(25);
        expect(payout.consignorShare).toBe(85);
    });

    it('keeps only refunds of the filtered sales', () => {
        const refunds = [cashRefund('s1', 5, null), cashRefund('old', 6, null), cashRefund(null, 7, null)];
        expect(refundsOfSales(refunds, [{ id: 's1' }]).map((r) => r.refund_amount)).toEqual([5]);
    });

    it('daily net sales add up to the metrics net sales on the same data', () => {
        const day = (n: number) => new Date(2026, 9, n, 12).toISOString();
        const sales = [
            { ...cashSale('s1', [item('i1', 100, 1, 0.6)], 100, 7), completed_at: day(1), discount_total: 10 },
            { ...cashSale('s2', [item('i2', 40.55, 1, 0.6)], 40.55, 2.84), completed_at: day(3) },
        ];
        const refunds = [{ ...cashRefund('s2', 10.7, { total: 43.39, tax_amount: 2.84, card_fee_amount: 0 }), created_at: day(5) }];
        const metrics = calculateTillAccountabilityMetrics({ sales, refunds, giftCardsSold: [] });
        const rowsDaily = dailyNetSales({ sales, refunds, start: new Date(2026, 9, 1), end: new Date(2026, 9, 6) });
        const total = Math.round(rowsDaily.reduce((sum, entry) => sum + Math.round(entry.amount * 100), 0)) / 100;
        expect(total).toBe(metrics.netSales);
    });
});

describe('zero handling', () => {
    it('never produces negative zero or a sub-cent value', () => {
        const input = withMetrics({ returns: -0, allowances: -0.001, checksInHand: -0 }, { payout: { consignorShare: 4706.91, storeShare: 1100.92, consignorCardFees: -0 } });
        const summary = buildSalesSummary(input);
        const numbers: number[] = [
            ...summary.balance.rows.map((row) => row.amount),
            ...summary.books.left.lines.map((line) => line.amount),
            ...summary.books.right.lines.map((line) => line.amount),
            summary.balance.difference,
            summary.split.notSplit,
        ];
        for (const value of numbers) {
            expect(Object.is(value, -0)).toBe(false);
        }
        expect(summary.books.left.lines.find((line) => line.key === 'returns')?.amount).toBe(0);
        expect(summary.books.left.lines.find((line) => line.key === 'allowances')?.amount).toBe(0);
    });
});

describe('for the books', () => {
    it('lays out both columns on the real example', () => {
        const { books } = buildSalesSummary(realExample);
        expect(books.left.lines.map((line) => [line.label, line.amount, Boolean(line.deduct)])).toEqual([
            ['Gross product sales', 6005.48, false],
            ['Discounts', 197.65, true],
            ['Returns', 0, true],
            ['Allowances', 0, true],
        ]);
        expect(books.left.total).toEqual({ label: 'Net sales', amount: 5807.83 });
        expect(books.right.lines.map((line) => [line.label, line.amount])).toEqual([
            ['Net sales', 5807.83],
            ['Sales tax', 300.51],
            ['Card fees charged', 118],
            ['Gift cards sold', 0],
        ]);
        expect(books.right.total).toEqual({ label: 'Total collected', amount: 6226.34 });
    });
});

describe('booksCsv', () => {
    const books = buildSalesSummary(realExample).books;

    it('carries the date range and consignor filter in the header and every figure', () => {
        const csv = booksCsv({ books, rangeLabel: '10/8/2026 - 11/6/2026', consignorLabel: 'All vendors' });
        const lines = csv.split('\r\n');
        expect(lines[0]).toBe('Sales summary for the books');
        expect(lines).toContain('Date range,10/8/2026 - 11/6/2026');
        expect(lines).toContain('Vendor,All vendors');
        expect(lines).toContain('Gross product sales,6005.48');
        expect(lines).toContain('Discounts,-197.65');
        expect(lines).toContain('Returns,0.00');
        expect(lines).toContain('Net sales,5807.83');
        expect(lines).toContain('Total collected,6226.34');
    });

    it('quotes commas, quotes and newlines, and neutralises spreadsheet formulas', () => {
        const csv = booksCsv({ books, rangeLabel: 'a, "b"\nc', consignorLabel: '=HYPERLINK("x")' });
        expect(csv).toContain('Date range,"a, ""b""\nc"');
        expect(csv).toContain(`Vendor,"'=HYPERLINK(""x"")"`);
    });

    it('adds the vendor scope note to the CSV header and the print page', () => {
        const note = 'Sales that include C001 - Maple Co. Totals cover whole sales.';
        const csv = booksCsv({ books, rangeLabel: 'r', consignorLabel: 'C001 - Maple Co', scopeNote: note });
        expect(csv).toContain(`Note,${note}`);
        expect(booksCsv({ books, rangeLabel: 'r', consignorLabel: 'All vendors' })).not.toContain('Note,');
        const html = buildBooksReportHtml({ books, rangeLabel: 'r', consignorLabel: 'C001', scopeNote: '<b>x</b>' });
        expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    });

    it('builds a filename that carries the range and vendor', () => {
        expect(booksFilename('10/8/2026 - 11/6/2026', 'All vendors')).toBe('sales-summary-10-8-2026-11-6-2026-all-vendors.csv');
        expect(booksFilename('', '  ')).toBe('sales-summary.csv');
    });
});

describe('buildBooksReportHtml', () => {
    it('escapes the labels it prints', () => {
        const html = buildBooksReportHtml({
            books: buildSalesSummary(realExample).books,
            rangeLabel: '<script>alert(1)</script>',
            consignorLabel: 'A & B "Co"',
        });
        expect(html).not.toContain('<script>alert(1)</script>');
        expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
        expect(html).toContain('A &amp; B &quot;Co&quot;');
        expect(html).toContain('$6,226.34');
    });
});

describe('busiestSlot', () => {
    const hours = (counts: Record<number, number>) =>
        Array.from({ length: 24 }, (_, hour) => ({
            label: `${hour % 12 === 0 ? 12 : hour % 12} ${hour < 12 ? 'AM' : 'PM'}`,
            count: counts[hour] || 0,
            amount: (counts[hour] || 0) * 10,
        }));
    const days = (counts: Record<number, number>) =>
        ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((label, index) => ({
            label,
            count: counts[index] || 0,
            amount: (counts[index] || 0) * 10,
        }));

    it('names the weekday and the hour range', () => {
        expect(busiestSlot({ hourlyBreakdown: hours({ 14: 9, 11: 3 }), weekdayBreakdown: days({ 6: 12, 1: 2 }) }))
            .toEqual({ weekday: 'Saturday', hourRange: '2\u20133 PM', text: 'Busiest day Saturday \u00b7 busiest hour 2\u20133 PM' });
    });

    it('crosses noon and midnight cleanly', () => {
        expect(busiestSlot({ hourlyBreakdown: hours({ 11: 4 }), weekdayBreakdown: days({ 0: 1 }) })?.hourRange).toBe('11 AM\u201312 PM');
        expect(busiestSlot({ hourlyBreakdown: hours({ 23: 4 }), weekdayBreakdown: days({ 0: 1 }) })?.hourRange).toBe('11 PM\u201312 AM');
    });

    it('breaks a tie on count by amount, then by the earlier slot', () => {
        const hourly = hours({ 9: 5, 15: 5 });
        hourly[15].amount = 999;
        expect(busiestSlot({ hourlyBreakdown: hourly, weekdayBreakdown: days({ 2: 3 }) })?.hourRange).toBe('3\u20134 PM');

        const evenHours = hours({ 9: 5, 15: 5 });
        const evenDays = days({ 2: 4, 4: 4 });
        const slot = busiestSlot({ hourlyBreakdown: evenHours, weekdayBreakdown: evenDays });
        expect(slot?.hourRange).toBe('9\u201310 AM');
        expect(slot?.weekday).toBe('Tuesday');
    });

    it('returns null with no data', () => {
        expect(busiestSlot(null)).toBeNull();
        expect(busiestSlot({ hourlyBreakdown: hours({}), weekdayBreakdown: days({}) })).toBeNull();
        expect(busiestSlot({ hourlyBreakdown: [], weekdayBreakdown: [] })).toBeNull();
    });
});

describe('topCategories', () => {
    it('keeps the top few by amount and drops empty ones', () => {
        const data = [
            { category: 'A', amount: 10, count: 1 },
            { category: 'B', amount: 50, count: 1 },
            { category: 'C', amount: 0, count: 1 },
            { category: 'D', amount: 30, count: 1 },
            { category: 'E', amount: 20, count: 1 },
            { category: 'F', amount: 15, count: 1 },
            { category: 'G', amount: 5, count: 1 },
        ];
        expect(topCategories(data, 5).map((row) => row.category)).toEqual(['B', 'D', 'E', 'F', 'A']);
        expect(topCategories([], 5)).toEqual([]);
    });
});

describe('topCategoryByItems', () => {
    it('ranks by items sold, not by amount', () => {
        expect(topCategoryByItems([
            { category: 'Pricey', amount: 900, count: 2 },
            { category: 'Busy', amount: 100, count: 30 },
        ])).toBe('Busy');
        expect(topCategoryByItems([])).toBeNull();
        expect(topCategoryByItems([{ category: 'None', amount: 0, count: 0 }])).toBeNull();
    });
});

describe('dailyNetSales', () => {
    const noon = (day: number) => new Date(2026, 9, day, 12, 0, 0).toISOString();

    it('adds up per day, takes returns off the day they happened, and fills empty days', () => {
        const sales = [
            { completed_at: noon(1), subtotal: 100, discount_total: 10 },
            { completed_at: noon(1), subtotal: 50, discount_total: 0 },
            { completed_at: noon(3), subtotal: 40, discount_total: 0 },
        ];
        const refunds = [
            {
                created_at: noon(3),
                refund_amount: 10.7,
                sale: { total: 107, tax_amount: 7, card_fee_amount: 0 },
            },
        ];
        const rows = dailyNetSales({
            sales,
            refunds,
            start: new Date(2026, 9, 1),
            end: new Date(2026, 9, 4),
        });
        expect(rows.map((row) => row.amount)).toEqual([140, 0, 30, 0]);
        expect(rows.map((row) => row.date)).toEqual(['Oct 1', 'Oct 2', 'Oct 3', 'Oct 4']);
        expect(rows[0].count).toBe(2);
    });

    it('uses the span of the data when no range is given and handles nothing', () => {
        expect(dailyNetSales({ sales: [], refunds: [] })).toEqual([]);
        const rows = dailyNetSales({
            sales: [{ completed_at: noon(2), subtotal: 5, discount_total: 0 }, { completed_at: noon(4), subtotal: 6, discount_total: 0 }],
            refunds: [],
        });
        expect(rows.map((row) => row.amount)).toEqual([5, 0, 6]);
    });
});
