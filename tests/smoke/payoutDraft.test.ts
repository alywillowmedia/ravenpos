import { describe, expect, it } from 'vitest';
import {
    PAYMENT_METHODS,
    describeFinalizeError,
    draftPayable,
    nextPayingNow,
    notInThisPayout,
    rollsForward,
    scopeFromPayout,
    scopeToSaveInput,
    statementFigures,
    validatePayingNow,
    validatePayment,
} from '../../src/lib/payoutDraft';
import type { PayoutAdjustmentSnapshot, PayoutStatementData } from '../../src/types/payouts';

type Payout = PayoutStatementData['payout'];

function payout(overrides: Record<string, unknown>): Payout {
    return {
        range_mode: 'through_date',
        source_range_start: null,
        source_range_end: null,
        include_prior_balance: true,
        cutoff_at: null,
        carried_in_snapshot: null,
        earned_snapshot: null,
        payable_before_invoices_snapshot: null,
        ...overrides,
    } as unknown as Payout;
}

function adj(adjustment_type: string, amount: number): PayoutAdjustmentSnapshot {
    return { adjustment_type, amount } as PayoutAdjustmentSnapshot;
}

describe('payment methods', () => {
    it('lists check, ach, cash, other', () => {
        expect(PAYMENT_METHODS).toEqual([
            { value: 'check', label: 'Check' },
            { value: 'ach', label: 'ACH' },
            { value: 'cash', label: 'Cash' },
            { value: 'other', label: 'Other' },
        ]);
    });
});

describe('draft arithmetic', () => {
    it('computes payable, rolls forward and not in this payout', () => {
        expect(draftPayable({ carriedIn: 20, earned: 30, required: 5, invoices: 10 })).toBe(35);
        expect(draftPayable({ carriedIn: 0, earned: 5, required: 3, invoices: 9 })).toBe(0);
        expect(rollsForward(35, 20)).toBe(15);
        expect(notInThisPayout(50, 35)).toBe(15);
        expect(notInThisPayout(30, 35)).toBe(0);
    });

    it('follows payable only while following', () => {
        expect(nextPayingNow({ payable: 35, typed: '40.00', following: true })).toBe('35.00');
        expect(nextPayingNow({ payable: 35, typed: '20.00', following: false })).toBe('20.00');
    });
});

describe('validatePayingNow', () => {
    it('validates the amount', () => {
        expect(validatePayingNow('', 35)).toBe('Enter an amount.');
        expect(validatePayingNow('abc', 35)).toBe('Enter an amount.');
        expect(validatePayingNow('-1', 35)).toBe('Must be between $0.00 and $35.00.');
        expect(validatePayingNow('35.01', 35)).toBe('Must be between $0.00 and $35.00.');
        expect(validatePayingNow('0', 35)).toBeNull();
        expect(validatePayingNow('35', 35)).toBeNull();
        expect(validatePayingNow('.50', 35)).toBeNull();
        for (const bad of ['1e3', '0x10', ' ', '12.345', '35.004', 'Infinity']) {
            expect(validatePayingNow(bad, 35)).toBe('Enter an amount.');
        }
    });
});

describe('validatePayment', () => {
    const base = { method: 'check', date: '2026-11-05', reference: '', amount: 10, reasonRequired: false, reason: '' };

    it('requires a check number only for check payments with money', () => {
        expect(validatePayment(base).reference).toBe('Enter the check number.');
        expect(validatePayment({ ...base, amount: 0 }).reference).toBeUndefined();
        expect(validatePayment({ ...base, method: 'cash' }).reference).toBeUndefined();
        expect(validatePayment({ ...base, reference: '1042' })).toEqual({});
    });

    it('requires a reason and a date when asked', () => {
        expect(validatePayment({ ...base, reference: '1042', reasonRequired: true }).reason).toBe('Say why this payout is below the minimum.');
        expect(validatePayment({ ...base, reference: '1042', reasonRequired: true, reason: 'Vendor asked' }).reason).toBeUndefined();
        expect(validatePayment({ ...base, reference: '1042', date: '' }).date).toBe('Choose a payment date.');
    });
});

describe('describeFinalizeError', () => {
    it('maps known messages and passes others through', () => {
        expect(describeFinalizeError('Finalizable payout draft not found.')).toBe('This payout was already paid or removed.');
        expect(describeFinalizeError('A sale allocation is no longer available.')).toBe('This draft changed after it was prepared. Open it and recalculate.');
        expect(describeFinalizeError('Sales changed after the draft was prepared.')).toBe('This draft changed after it was prepared. Open it and recalculate.');
        expect(describeFinalizeError('Sale allocation conflict detected for item 3f2b8c1e-0000-4000-8000-000000000000.')).toBe('This draft changed after it was prepared. Open it and recalculate.');
        expect(describeFinalizeError('Draft no longer reconciles: allocations plus adjustments equal 10.00, expected 12.00.')).toBe('This draft changed after it was prepared. Open it and recalculate.');
        expect(describeFinalizeError('Something else')).toBe('Something else');
    });
});

describe('scopeFromPayout', () => {
    it('gives between for a selected range without prior balance', () => {
        expect(scopeFromPayout(payout({ range_mode: 'selected_range', include_prior_balance: false, source_range_start: '2026-10-01', source_range_end: '2026-10-31' }), '2026-11-05'))
            .toEqual({ kind: 'between', from: '2026-10-01', to: '2026-10-31' });
    });

    it('gives through for the other modes, falling back to cutoff then today', () => {
        expect(scopeFromPayout(payout({ range_mode: 'through_date', source_range_end: '2026-10-31' }), '2026-11-05')).toEqual({ kind: 'through', date: '2026-10-31' });
        expect(scopeFromPayout(payout({ range_mode: 'all_outstanding', source_range_end: '2026-10-15' }), '2026-11-05')).toEqual({ kind: 'through', date: '2026-10-15' });
        expect(scopeFromPayout(payout({ range_mode: 'selected_range', include_prior_balance: true, source_range_end: '2026-10-20' }), '2026-11-05')).toEqual({ kind: 'through', date: '2026-10-20' });
        // 2026-11-01T02:00Z is still 2026-10-31 in New York.
        expect(scopeFromPayout(payout({ cutoff_at: '2026-11-01T02:00:00Z' }), '2026-11-05')).toEqual({ kind: 'through', date: '2026-10-31' });
        expect(scopeFromPayout(payout({}), '2026-11-05')).toEqual({ kind: 'through', date: '2026-11-05' });
    });
});

describe('scopeToSaveInput', () => {
    it('maps scopes to save input', () => {
        expect(scopeToSaveInput({ kind: 'through', date: '2026-10-31' })).toEqual({
            rangeMode: 'through_date', sourceRangeStart: null, sourceRangeEnd: '2026-10-31', includePriorBalance: true,
        });
        expect(scopeToSaveInput({ kind: 'between', from: '2026-10-01', to: '2026-10-31' })).toEqual({
            rangeMode: 'selected_range', sourceRangeStart: '2026-10-01', sourceRangeEnd: '2026-10-31', includePriorBalance: false,
        });
    });
});

describe('statementFigures', () => {
    it('reads snapshots and splits deductions', () => {
        const figures = statementFigures(
            payout({ carried_in_snapshot: 20, earned_snapshot: 30, payable_before_invoices_snapshot: 45 }),
            [adj('fee', -2.5), adj('invoice_deduction', -10), adj('legacy_carryover', 4), adj('correction', -2.5)],
        );
        expect(figures).toEqual({ carriedIn: 20, earned: 30, required: 5, invoices: 10, hasSnapshots: true });
    });

    it('derives earned when snapshots are missing', () => {
        const figures = statementFigures(payout({ payable_before_invoices_snapshot: 40 }), [adj('fee', -3)]);
        expect(figures.hasSnapshots).toBe(false);
        expect(figures.required).toBe(3);
        expect(figures.earned).toBe(43);
        expect(figures.carriedIn).toBe(0);
    });
});
