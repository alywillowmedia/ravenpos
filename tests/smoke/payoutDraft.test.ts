import { describe, expect, it } from 'vitest';
import {
    PAYMENT_METHODS,
    classifyDraftError,
    describeFinalizeError,
    invoiceAmountsFromAdjustments,
    invoiceApplicationsFrom,
    invoiceRoom,
    isScopeValid,
    pendingReasonText,
    pendingDeductions,
    sameScope,
    startsFollowing,
    wouldLoseEdits,
    validateInvoiceAmount,
    draftPayable,
    nextPayingNow,
    notInThisPayout,
    rollsForward,
    scopeFromPayout,
    scopeToSaveInput,
    statementScopeLabel,
    formatStatementCutoff,
    statementEmailLine,
    statementFigures,
    validatePayingNow,
    validatePayment,
} from '../../src/lib/payoutDraft';
import type { PayoutAdjustmentSnapshot, PayoutStatementData, PayoutStatementEmail, RequiredPayoutAdjustment } from '../../src/types/payouts';

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
        expect(describeFinalizeError('The payout amount changed after this screen loaded.')).toBe('The amount changed after this screen loaded. Reload and check it.');
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


describe('invoiceRoom', () => {
    it('is what is left of carried in + earned - required after the other invoices', () => {
        const figures = { carriedIn: 10, earned: 40, required: 5 };
        expect(invoiceRoom(figures, 0)).toBe(45);
        expect(invoiceRoom(figures, 30)).toBe(15);
        expect(invoiceRoom(figures, 60)).toBe(0);
        expect(invoiceRoom({ carriedIn: 0, earned: 2, required: 5 }, 0)).toBe(0);
    });
});

describe('validateInvoiceAmount', () => {
    it('accepts blank and amounts within the balance and room', () => {
        expect(validateInvoiceAmount('', 50, 40)).toBeNull();
        expect(validateInvoiceAmount('0', 50, 40)).toBeNull();
        expect(validateInvoiceAmount('40.00', 50, 40)).toBeNull();
    });

    it('rejects text, negatives and more than two decimals', () => {
        expect(validateInvoiceAmount('abc', 50, 40)).toBe('Enter an amount.');
        expect(validateInvoiceAmount('-1', 50, 40)).toBe('Enter an amount.');
        expect(validateInvoiceAmount('1.234', 50, 40)).toBe('Enter an amount.');
    });

    it('caps at the lower of the invoice balance and the room', () => {
        expect(validateInvoiceAmount('45', 50, 40)).toBe('Can\'t be more than $40.00 here.');
        expect(validateInvoiceAmount('55', 50, 500)).toBe('Can\'t be more than the $50.00 due.');
    });
});

describe('invoice amounts', () => {
    it('reads amounts from invoice deductions only', () => {
        const rows = [
            { adjustment_type: 'invoice_deduction', source_reference: 'a', amount: -12.5 },
            { adjustment_type: 'booth_rent', source_reference: 'b', amount: -5 },
            { adjustment_type: 'invoice_deduction', source_reference: null, amount: -3 },
        ] as unknown as PayoutAdjustmentSnapshot[];
        expect(invoiceAmountsFromAdjustments(rows)).toEqual({ a: '12.50' });
    });

    it('builds applications from positive amounts only', () => {
        expect(invoiceApplicationsFrom({ a: '12.5', b: '', c: '0', d: '0.00', e: '3' })).toEqual([
            { invoice_id: 'a', amount: 12.5 },
            { invoice_id: 'e', amount: 3 },
        ]);
    });
});

describe('scope helpers', () => {
    it('compares scopes', () => {
        expect(sameScope({ kind: 'through', date: '2026-10-31' }, { kind: 'through', date: '2026-10-31' })).toBe(true);
        expect(sameScope({ kind: 'through', date: '2026-10-31' }, { kind: 'through', date: '2026-10-30' })).toBe(false);
        expect(sameScope({ kind: 'through', date: '2026-10-31' }, { kind: 'between', from: '2026-10-01', to: '2026-10-31' })).toBe(false);
        expect(sameScope(
            { kind: 'between', from: '2026-10-01', to: '2026-10-31' },
            { kind: 'between', from: '2026-10-01', to: '2026-10-31' },
        )).toBe(true);
    });

    it('needs dates, with from on or before to', () => {
        expect(isScopeValid({ kind: 'through', date: '2026-10-31' }, '2026-11-06')).toBe(true);
        expect(isScopeValid({ kind: 'through', date: '' }, '2026-11-06')).toBe(false);
        expect(isScopeValid({ kind: 'between', from: '2026-10-01', to: '2026-10-01' }, '2026-11-06')).toBe(true);
        expect(isScopeValid({ kind: 'between', from: '2026-11-01', to: '2026-10-01' }, '2026-11-06')).toBe(false);
        expect(isScopeValid({ kind: 'between', from: '', to: '2026-10-01' }, '2026-11-06')).toBe(false);
    });

    it('refuses a date after today', () => {
        const today = '2026-11-06';
        expect(isScopeValid({ kind: 'through', date: '2026-11-06' }, today)).toBe(true);
        expect(isScopeValid({ kind: 'through', date: '2027-01-31' }, today)).toBe(false);
        expect(isScopeValid({ kind: 'between', from: '2026-10-01', to: '2026-11-06' }, today)).toBe(true);
        expect(isScopeValid({ kind: 'between', from: '2026-10-01', to: '2027-10-31' }, today)).toBe(false);
    });
});

describe('classifyDraftError', () => {
    it('spots a payout that is no longer a draft', () => {
        expect(classifyDraftError('Editable payout draft not found.')).toBe('not_a_draft');
        expect(classifyDraftError('Only drafts can be discarded.')).toBe('not_a_draft');
    });

    it('spots a draft that went stale', () => {
        expect(classifyDraftError('One or more invoice applications are invalid or stale.')).toBe('stale');
        expect(classifyDraftError('Invoice applications exceed available payout funds.')).toBe('stale');
        expect(classifyDraftError('Payment amount must be between zero and the current payable amount.')).toBe('stale');
    });

    it('leaves other errors alone', () => {
        expect(classifyDraftError('Network down')).toBeNull();
    });
});

describe('pendingReasonText', () => {
    it('reads the known reason in plain words', () => {
        expect(pendingReasonText('insufficient_available_funds')).toBe('Not enough earnings to cover this yet.');
    });

    it('falls back to a plain sentence', () => {
        expect(pendingReasonText('some_other_reason')).toBe('Some other reason.');
        expect(pendingReasonText(null)).toBe('Not enough earnings in this payout to cover this yet.');
    });
});


describe('wouldLoseEdits', () => {
    const invoices = [
        { id: 'a', created_at: '2026-01-01T00:00:00Z', balance_due: 30 },
        { id: 'b', created_at: '2026-02-01T00:00:00Z', balance_due: 50 },
    ];

    it('is false for the default draft: paying the full payable and invoices filled oldest first', () => {
        expect(wouldLoseEdits({ payingNow: '20.00', payable: 20, invoiceAmounts: { a: '30.00', b: '50.00' }, invoices, available: 100 })).toBe(false);
        expect(wouldLoseEdits({ payingNow: '0.00', payable: 0, invoiceAmounts: { a: '30.00', b: '20.00' }, invoices, available: 50 })).toBe(false);
    });

    it('is true when paying now differs from payable', () => {
        expect(wouldLoseEdits({ payingNow: '10.00', payable: 20, invoiceAmounts: { a: '30.00', b: '50.00' }, invoices, available: 100 })).toBe(true);
    });

    it('is true when an invoice amount is not the oldest-first fill', () => {
        expect(wouldLoseEdits({ payingNow: '20.00', payable: 20, invoiceAmounts: { a: '10.00', b: '50.00' }, invoices, available: 100 })).toBe(true);
        expect(wouldLoseEdits({ payingNow: '0.00', payable: 0, invoiceAmounts: { a: '0', b: '50.00' }, invoices, available: 50 })).toBe(true);
    });

    it('ignores blanks and formatting', () => {
        expect(wouldLoseEdits({ payingNow: '20', payable: 20, invoiceAmounts: { a: '30', b: '' }, invoices, available: 30 })).toBe(false);
    });
});

describe('pendingDeductions', () => {
    const required = [
        { adjustment_type: 'booth_rent', source_table: 'rent', source_reference: 'r1', will_apply: true, pending_reason: null },
        { adjustment_type: 'booth_rent', source_table: 'rent', source_reference: 'r2', will_apply: false, pending_reason: 'insufficient_available_funds' },
        { adjustment_type: 'fee', source_table: 'fees', source_reference: 'f1', will_apply: true, pending_reason: null },
    ] as unknown as RequiredPayoutAdjustment[];

    it('is every required deduction the draft did not apply, whatever will_apply says', () => {
        const applied = [{ adjustment_type: 'booth_rent', source_table: 'rent', source_reference: 'r1', amount: -5 }] as unknown as PayoutAdjustmentSnapshot[];
        expect(pendingDeductions(required, applied).map((row) => row.source_reference)).toEqual(['r2', 'f1']);
    });

    it('is empty when all were applied', () => {
        const applied = required.map((row) => ({ ...row, amount: -1 })) as unknown as PayoutAdjustmentSnapshot[];
        expect(pendingDeductions(required, applied)).toEqual([]);
    });
});

describe('startsFollowing', () => {
    it('is true only when the amount equals the original amount due', () => {
        expect(startsFollowing(50, 50)).toBe(true);
        expect(startsFollowing(49.99, 50)).toBe(false);
        expect(startsFollowing(50, null)).toBe(false);
        expect(startsFollowing(0, 0)).toBe(true);
    });
});

describe('statementScopeLabel', () => {
    it('names a through date', () => {
        expect(statementScopeLabel(payout({ range_mode: 'through_date', source_range_end: '2025-10-31' }))).toBe('Earnings through Oct 31');
    });

    it('falls back to the cutoff day in store time when a through date has no end', () => {
        expect(statementScopeLabel(payout({ range_mode: 'through_date', cutoff_at: '2025-11-01T03:30:00Z' }))).toBe('Earnings through Oct 31');
    });

    it('names a selected range from its plain dates', () => {
        expect(statementScopeLabel(payout({ range_mode: 'selected_range', source_range_start: '2025-10-01', source_range_end: '2025-10-31' }))).toBe('Sales from Oct 1 to Oct 31');
    });

    it('says all outstanding for older rows', () => {
        expect(statementScopeLabel(payout({ range_mode: 'all_outstanding' }))).toBe('All outstanding');
        expect(statementScopeLabel(payout({ range_mode: 'through_date' }))).toBe('All outstanding');
        expect(statementScopeLabel(payout({ range_mode: 'selected_range', source_range_start: '2025-10-01' }))).toBe('All outstanding');
    });
});

describe('formatStatementCutoff', () => {
    it('shows the cutoff in New York time', () => {
        expect(formatStatementCutoff('2025-11-01T03:59:00Z')).toBe('Oct 31, 2025, 11:59 PM EDT');
        expect(formatStatementCutoff('2025-12-01T04:59:00Z')).toBe('Nov 30, 2025, 11:59 PM EST');
    });
});

describe('statementEmailLine', () => {
    const email = (status: 'sent' | 'failed') => ({ recipient: 'a@b.com', status, created_at: '2025-11-05T17:00:00Z' }) as PayoutStatementEmail;

    it('says sent or failed and reads nothing without an attempt', () => {
        expect(statementEmailLine(email('sent'))).toBe('Emailed to a@b.com on Nov 5');
        expect(statementEmailLine(email('failed'))).toBe('Email to a@b.com failed on Nov 5');
        expect(statementEmailLine(null)).toBe('');
    });
});
