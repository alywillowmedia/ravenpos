import { describe, expect, it } from 'vitest';
import { getNetCashSaleCents, getPaymentBreakdownAmountCents } from '../../src/lib/cashReconciliation';
import { calculateTillAccountabilityMetrics } from '../../src/lib/tillAccountability';

describe('split payment accounting', () => {
    it('uses the cash portion from payment_breakdown for drawer cash', () => {
        const sale = {
            total: 53,
            cash_tendered: 25,
            change_given: 5,
            payment_breakdown: [
                { method: 'cash', amount: 20, tendered: 25, change: 5 },
                { method: 'card', amount: 33 },
            ],
        };

        expect(getNetCashSaleCents(sale)).toBe(2000);
        expect(getPaymentBreakdownAmountCents(sale, 'card')).toBe(3300);
    });

    it('splits tender totals into cash, card, and check accountability buckets', () => {
        const metrics = calculateTillAccountabilityMetrics({
            sales: [
                {
                    subtotal: 100,
                    tax_amount: 0,
                    total: 100,
                    payment_method: 'split',
                    payment_breakdown: [
                        { method: 'cash', amount: 20 },
                        { method: 'check', amount: 30 },
                        { method: 'card', amount: 50 },
                    ],
                },
            ],
            refunds: [],
            giftCardsSold: [],
        });

        expect(metrics.cashInDrawer).toBe(20);
        expect(metrics.checksInHand).toBe(30);
        expect(metrics.creditCardsBatchTotal).toBe(50);
    });
});
