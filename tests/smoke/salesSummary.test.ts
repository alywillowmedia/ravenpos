import { describe, expect, it } from 'vitest';
import {
    booksCsv,
    booksFilename,
    buildBooksReportHtml,
    buildSalesSummary,
    busiestSlot,
    dailyNetSales,
    topCategories,
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

function splitSum(input: SalesSummaryInput): number {
    const { split } = buildSalesSummary(input);
    return Math.round(split.rows.reduce((sum, row) => sum + Math.round(row.amount * 100), 0)) / 100;
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

    it('shows the drawer expectation and only the nonzero notes', () => {
        const { balance } = buildSalesSummary(realExample);
        expect(balance.drawer.expected).toBe(1575.81);
        expect(balance.drawer.notes).toEqual([{ key: 'dealerCashOut', label: 'Dealer cash out', amount: 43 }]);

        const all = buildSalesSummary(withMetrics({ giftCardSalesCash: 25, offlineUnsyncedCashSales: 12.5 })).balance.drawer.notes;
        expect(all.map((note) => note.key)).toEqual(['dealerCashOut', 'giftCardsSoldForCash', 'offlineUnsynced']);

        const none = buildSalesSummary(withMetrics({ dealerCashPurchases: 0 })).balance.drawer.notes;
        expect(none).toEqual([]);
    });
});

describe('who gets what', () => {
    it('adds up to Collected on the real example with no Not split row', () => {
        const { split } = buildSalesSummary(realExample);
        expect(split.rows.map((row) => [row.key, row.amount])).toEqual([
            ['vendors', 4706.91],
            ['store', 1100.92],
            ['salesTax', 300.51],
            ['cardFees', 118],
        ]);
        expect(split.notSplit).toBe(0);
        expect(split.total).toBe(6226.34);
        expect(splitSum(realExample)).toBe(6226.34);
    });

    it('adds the identity on a refund: vendors + store + vendor fees + Not split = Net sales', () => {
        // $200 of goods, 7% tax, $50 of it returned with its $3.50 tax: net $150, tax $10.50.
        const refund = withMetrics(
            {
                grossProductSales: 200,
                discounts: 0,
                returns: 50,
                netSales: 150,
                salesTax: 10.5,
                creditCardFeesCharged: 0,
                totalCollected: 160.5,
                totalReceived: 160.5,
            },
            { payout: { consignorShare: 120, storeShare: 30, consignorCardFees: 0 } }
        );
        const { split, books } = buildSalesSummary(refund);
        expect(split.notSplit).toBe(0);
        expect(split.total).toBe(160.5);
        expect(splitSum(refund)).toBe(160.5);
        expect(books.left.total.amount).toBe(150);
    });

    it('shows a muted Not split row for what the item splits do not cover, and still sums', () => {
        // Items of an inactive vendor are left out of the payout basis.
        const input = withMetrics({}, { payout: { consignorShare: 4000, storeShare: 1000, consignorCardFees: 0 } });
        const { split } = buildSalesSummary(input);
        const notSplit = split.rows.find((row) => row.key === 'notSplit');
        expect(notSplit).toBeDefined();
        expect(notSplit?.muted).toBe(true);
        expect(notSplit?.amount).toBe(807.83);
        expect(split.notSplit).toBe(807.83);
        expect(splitSum(input)).toBe(6226.34);
    });

    it('shows vendor-paid card fees as their own row, added back so the sum still holds', () => {
        // Vendors keep 4700 after a 6.91 card fee came out of their share.
        const input = withMetrics({}, { payout: { consignorShare: 4700, storeShare: 1100.92, consignorCardFees: 6.91 } });
        const { split } = buildSalesSummary(input);
        const keys = split.rows.map((row) => row.key);
        expect(keys).toContain('vendorCardFees');
        expect(split.rows.find((row) => row.key === 'vendorCardFees')?.amount).toBe(6.91);
        expect(split.notSplit).toBe(0);
        expect(splitSum(input)).toBe(6226.34);
    });

    it('shows gift cards sold only when there are some, and they are part of Collected', () => {
        const input = withMetrics({ giftCertificatesSold: 50, totalCollected: 6276.34, totalReceived: 6276.34 });
        const { split } = buildSalesSummary(input);
        expect(split.rows.find((row) => row.key === 'giftCardsSold')?.amount).toBe(50);
        expect(split.total).toBe(6276.34);
        expect(splitSum(input)).toBe(6276.34);
        expect(buildSalesSummary(realExample).split.rows.some((row) => row.key === 'giftCardsSold')).toBe(false);
    });

    it('keeps a one-cent remainder visible instead of absorbing it', () => {
        const input = withMetrics({}, { payout: { consignorShare: 4706.9, storeShare: 1100.92, consignorCardFees: 0 } });
        const { split } = buildSalesSummary(input);
        expect(split.notSplit).toBe(0.01);
        expect(splitSum(input)).toBe(6226.34);
    });

    it('carries the footnote about estimates', () => {
        expect(buildSalesSummary(realExample).split.footnote).toBe(
            "Vendor figure is an estimate from each item's split. Actual payouts are on Vendor payouts."
        );
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
            .toEqual({ weekday: 'Saturday', hourRange: '2-3 PM', text: 'Saturday, 2-3 PM' });
    });

    it('crosses noon and midnight cleanly', () => {
        expect(busiestSlot({ hourlyBreakdown: hours({ 11: 4 }), weekdayBreakdown: days({ 0: 1 }) })?.hourRange).toBe('11 AM-12 PM');
        expect(busiestSlot({ hourlyBreakdown: hours({ 23: 4 }), weekdayBreakdown: days({ 0: 1 }) })?.hourRange).toBe('11 PM-12 AM');
    });

    it('breaks a tie on count by amount, then by the earlier slot', () => {
        const hourly = hours({ 9: 5, 15: 5 });
        hourly[15].amount = 999;
        expect(busiestSlot({ hourlyBreakdown: hourly, weekdayBreakdown: days({ 2: 3 }) })?.hourRange).toBe('3-4 PM');

        const evenHours = hours({ 9: 5, 15: 5 });
        const evenDays = days({ 2: 4, 4: 4 });
        const slot = busiestSlot({ hourlyBreakdown: evenHours, weekdayBreakdown: evenDays });
        expect(slot?.hourRange).toBe('9-10 AM');
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
