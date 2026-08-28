import { describe, expect, it } from 'vitest';
import { allocateCents, allocationStatus, hasUnpaidBalance, reportEquation, selectInvoicesOldestFirst, toCents } from '../../src/lib/payoutLedger';

describe('payout ledger invariants', () => {
    it('distributes discount remainders deterministically across a multi-vendor sale', () => {
        const result = allocateCents(100, [
            { key: 'vendor-b', weightCents: 333 },
            { key: 'vendor-a', weightCents: 333 },
            { key: 'vendor-c', weightCents: 334 },
        ]);
        expect(result).toEqual({ 'vendor-b': 33, 'vendor-a': 33, 'vendor-c': 34 });
        expect(Object.values(result).reduce((sum, cents) => sum + cents, 0)).toBe(100);
    });

    it('rounds sale-time monetary values to cents', () => {
        expect(toCents(10.005)).toBe(1001);
        expect(toCents(4.444)).toBe(444);
    });

    it('derives unpaid, partial, paid, refunded, and legacy-uncertain states from evidence', () => {
        expect(allocationStatus({ eligibleCents: 5000, paidCents: 0, refundedQuantity: 0, quantity: 1 })).toBe('unpaid');
        expect(allocationStatus({ eligibleCents: 5000, paidCents: 2500, refundedQuantity: 0, quantity: 1 })).toBe('partially_paid');
        expect(allocationStatus({ eligibleCents: 5000, paidCents: 5000, refundedQuantity: 0, quantity: 1 })).toBe('paid');
        expect(allocationStatus({ eligibleCents: 0, paidCents: 0, refundedQuantity: 1, quantity: 1 })).toBe('refunded');
        expect(allocationStatus({ eligibleCents: 5000, paidCents: 0, refundedQuantity: 0, quantity: 1, legacyUncertain: true })).toBe('legacy_uncertain');
    });

    it('shows only sale items with a remaining payable balance in unpaid-items views', () => {
        expect(hasUnpaidBalance({ remaining_amount: 14 })).toBe(true);
        expect(hasUnpaidBalance({ remaining_amount: 0.01 })).toBe(true);
        expect(hasUnpaidBalance({ remaining_amount: 0 })).toBe(false);
        expect(hasUnpaidBalance({ remaining_amount: 0.004 })).toBe(false);
        expect(hasUnpaidBalance({ remaining_amount: -5 })).toBe(false);
    });

    it('preselects invoice applications oldest-first and partially applies the last invoice', () => {
        expect(selectInvoicesOldestFirst(6500, [
            { id: 'new', createdAt: '2026-02-01', balanceCents: 4000 },
            { id: 'old', createdAt: '2026-01-01', balanceCents: 5000 },
        ])).toEqual([
            { invoiceId: 'old', amountCents: 5000 },
            { invoiceId: 'new', amountCents: 1500 },
        ]);
    });

    it('keeps opening unpaid money in report-mode closing balance', () => {
        expect(reportEquation({ openingCents: 8000, activityCents: 5000, adjustmentCents: -1000, paymentCents: 4000 })).toBe(8000);
    });
});
