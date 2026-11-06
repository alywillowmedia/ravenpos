import { describe, expect, it } from 'vitest';
import {
    defaultThroughDate,
    countAfterCutoff,
    filterRows,
    formatDay,
    formatPayoutDate,
    historyMonthOptions,
    localDateString,
    monthName,
    parseThrough,
    payoutsBackPath,
    payRunTotal,
    prepareSummary,
    readyToPrepare,
    runTotals,
    shortId,
    splitBarParts,
    statusLine,
    validateMinimum,
} from '../../src/lib/payoutRun';
import type { PayoutRunRow } from '../../src/types/payouts';

let counter = 0;
function row(overrides: Partial<PayoutRunRow> = {}): PayoutRunRow {
    counter += 1;
    return {
        consignor_id: `id-${counter}`, consignor_number: `V${counter}`, name: 'Alex Smith', business_name: null,
        pay_to_name: 'Alex Smith', email: null, is_active: true, threshold: 100,
        carried_in: 0, earned: 0, booth_rent: 0, other_deductions: 0,
        invoices_applied: 0, payable_before_invoices: 0, payable: 0, paying_now: 0,
        status: 'paid_up', threshold_remaining: 0,
        pending_total: 0, pending_count: 0, pending_type: null,
        draft_id: null, draft_through: null, override_reason: null,
        last_paid_at: null, legacy_item_count: 0,
        items_count: 0, sales_count: 0, cutoff_at: '2026-10-31T00:00:00Z',
        ...overrides,
    };
}

const today = new Date(2026, 10, 5);

describe('through dates', () => {
    it('defaults to the last day of the previous month', () => {
        expect(defaultThroughDate(new Date(2026, 10, 5))).toBe('2026-10-31');
        expect(defaultThroughDate(new Date(2026, 0, 15))).toBe('2025-12-31');
        expect(defaultThroughDate(new Date(2024, 2, 10))).toBe('2024-02-29');
    });

    it('accepts a real past date and falls back otherwise', () => {
        expect(parseThrough('2026-09-30', today)).toBe('2026-09-30');
        expect(parseThrough('nonsense', today)).toBe('2026-10-31');
        expect(parseThrough('2026-13-40', today)).toBe('2026-10-31');
        expect(parseThrough('2026-02-30', today)).toBe('2026-10-31');
        expect(parseThrough('2027-01-01', today)).toBe('2026-10-31');
        expect(parseThrough(null, today)).toBe('2026-10-31');
    });

    it('formats local dates without time zone shifts', () => {
        expect(localDateString(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
        expect(formatDay('2026-10-31')).toBe('Oct 31');
        expect(formatDay('2026-09-05')).toBe('Sep 5');
        expect(monthName('2026-10-31')).toBe('October');
    });
});

describe('statusLine', () => {
    it('shows what is left on an accruing vendor', () => {
        expect(statusLine(row({ status: 'accruing', threshold_remaining: 27.45 }))).toBe('$27.45 to go');
    });

    it('names a single pending deduction type', () => {
        expect(statusLine(row({ pending_count: 1, pending_total: 26.1, pending_type: 'booth_rent' }))).toBe('Booth rent $26.10 still owed');
        expect(statusLine(row({ pending_count: 1, pending_total: 5, pending_type: 'marketing_fee' }))).toBe('Marketing fee $5.00 still owed');
        expect(statusLine(row({ pending_count: 1, pending_total: 5, pending_type: 'manual_ledger' }))).toBe('Ledger charge $5.00 still owed');
        expect(statusLine(row({ pending_count: 1, pending_total: 5, pending_type: 'refund_reversal' }))).toBe('Refund $5.00 still owed');
    });

    it('sums several pending deductions', () => {
        expect(statusLine(row({ pending_count: 3, pending_total: 40 }))).toBe('$40.00 in deductions still owed');
    });

    it('describes a draft', () => {
        expect(statusLine(row({ status: 'draft', draft_id: 'a1b2c3d4-0000', draft_through: '2026-09-30' }))).toBe('Draft #A1B2C3D4 · through Sep 30');
    });

    it('flags inactive vendors', () => {
        expect(statusLine(row({ is_active: false, status: 'paid_up' }))).toBe('Inactive');
    });

    it('prefers draft over inactive over pending over accruing', () => {
        const draft = row({ status: 'draft', draft_id: 'abcdef12-0', draft_through: '2026-09-30', is_active: false, pending_count: 1, pending_total: 1, pending_type: 'booth_rent' });
        expect(statusLine(draft)).toBe('Draft #ABCDEF12 · through Sep 30');
        expect(statusLine(row({ is_active: false, pending_count: 1, pending_total: 1, pending_type: 'booth_rent' }))).toBe('Inactive');
        expect(statusLine(row({ status: 'accruing', threshold_remaining: 5, pending_count: 1, pending_total: 1, pending_type: 'booth_rent' }))).toBe('Booth rent $1.00 still owed');
    });

    it('is empty for a ready vendor', () => {
        expect(statusLine(row({ status: 'ready' }))).toBeNull();
    });
});

describe('queue logic', () => {
    it('picks only ready vendors to prepare', () => {
        expect(readyToPrepare([row({ status: 'ready' }), row({ status: 'draft' })])).toHaveLength(1);
    });

    it('filters by status and by search across names and number', () => {
        const rows = [
            row({ status: 'ready', name: 'Alex Smith', consignor_number: 'V100' }),
            row({ status: 'draft', name: 'Sam Lee', pay_to_name: 'Sam Lee', business_name: 'Willow Antiques', consignor_number: 'V200' }),
            row({ status: 'accruing', name: 'Pat Jones', pay_to_name: 'Pat Jones LLC', consignor_number: 'V300' }),
        ];
        expect(filterRows(rows, { search: '', status: 'all' })).toHaveLength(3);
        expect(filterRows(rows, { search: '', status: 'ready' })).toHaveLength(1);
        expect(filterRows(rows, { search: 'willow', status: 'all' })).toHaveLength(1);
        expect(filterRows(rows, { search: 'JONES', status: 'all' })).toHaveLength(1);
        expect(filterRows(rows, { search: 'v200', status: 'all' })).toHaveLength(1);
        expect(filterRows(rows, { search: 'alex', status: 'draft' })).toHaveLength(0);
    });

    it('totals ready, accruing and drafts, summing paying_now for drafts', () => {
        const totals = runTotals([
            row({ status: 'ready', payable: 100, paying_now: 100, booth_rent: 10, other_deductions: 2, invoices_applied: 3 }),
            row({ status: 'draft', payable: 80, paying_now: 60, booth_rent: 5, invoices_applied: 15 }),
            row({ status: 'accruing', payable: 20 }),
            row({ status: 'paid_up', payable: 0 }),
        ]);
        expect(totals.ready).toEqual({ count: 1, total: 100 });
        expect(totals.accruing).toEqual({ count: 1, total: 20 });
        expect(totals.drafts).toEqual({ count: 1, total: 60 });
        expect(totals.run).toEqual({ vendors: 2, payable: 160, boothRent: 15, invoicesAndFees: 20 });
    });

    it('builds split bar parts, or null at zero', () => {
        expect(splitBarParts(runTotals([row()]))).toBeNull();
        const parts = splitBarParts(runTotals([row({ status: 'ready', payable: 100, paying_now: 100, booth_rent: 10, invoices_applied: 5 })]));
        expect(parts?.map((part) => part.label)).toEqual(['Payable', 'Booth rent', 'Invoices and fees']);
        expect(parts?.map((part) => part.value)).toEqual([100, 10, 5]);
        expect(parts?.[0].display).toBe('$100.00');
    });

    it('totals only the selected vendors', () => {
        const a = row({ paying_now: 50 });
        const b = row({ paying_now: 30 });
        const c = row({ paying_now: 20 });
        expect(payRunTotal([a, b, c], new Set([a.consignor_id, c.consignor_id]))).toEqual({ count: 2, total: 70 });
        expect(payRunTotal([a, b, c], new Set())).toEqual({ count: 0, total: 0 });
    });

    it('shortens ids', () => {
        expect(shortId('a1b2c3d4-0000-1111')).toBe('A1B2C3D4');
    });
    it('lists the last 24 months for history, plus All months', () => {
        const options = historyMonthOptions(new Date(2026, 10, 5));
        expect(options).toHaveLength(25);
        expect(options[0]).toEqual({ value: '', label: 'All months' });
        expect(options[1]).toEqual({ value: '2026-11', label: 'November 2026' });
        expect(options[2]).toEqual({ value: '2026-10', label: 'October 2026' });
        expect(options[24]).toEqual({ value: '2024-12', label: 'December 2024' });
    });

    it('summarises a prepare run including skipped vendors', () => {
        expect(prepareSummary(4, 2)).toBe('4 drafts prepared, 2 already had drafts');
        expect(prepareSummary(1, 1)).toBe('1 draft prepared, 1 already had a draft');
        expect(prepareSummary(3, 0)).toBe('3 drafts prepared');
        expect(prepareSummary(0, 2)).toBe('No new drafts, 2 already had drafts');
        expect(prepareSummary(0, 1)).toBe('No new drafts, 1 already had a draft');
        expect(prepareSummary(0, 0)).toBe('No drafts prepared');
    });
    it('shows the payment date for a payout, falling back to when it was paid', () => {
        // A backdated payout shows the date it was paid on, not when it was recorded.
        expect(formatPayoutDate({ payment_date: '2026-03-05', paid_at: '2026-04-12T15:00:00Z' })).toBe('Mar 5, 2026');
        expect(formatPayoutDate({ payment_date: null, paid_at: '2026-04-12T15:00:00Z' })).toBe('Apr 12, 2026');
        expect(formatPayoutDate({ payment_date: null, paid_at: null })).toBe('—');
    });
});

describe('vendor page helpers', () => {
    it('counts items after the cutoff instant, which is itself in scope', () => {
        const cutoff = '2026-10-31T23:59:59.999Z';
        const items = [
            { sale_timestamp: '2026-10-31T23:59:59.999Z' },
            { sale_timestamp: '2026-11-01T00:00:00Z' },
            { sale_timestamp: '2026-11-03T12:00:00Z' },
            { sale_timestamp: '2026-10-15T12:00:00Z' },
        ];
        expect(countAfterCutoff(items, cutoff)).toBe(2);
        expect(countAfterCutoff([], cutoff)).toBe(0);
        expect(countAfterCutoff(items, 'not a date')).toBe(0);
    });

    it('builds the back link, keeping through and tab and omitting defaults', () => {
        expect(payoutsBackPath('2026-10-31', 'queue', today)).toBe('/admin/payouts');
        expect(payoutsBackPath('2026-09-30', 'queue', today)).toBe('/admin/payouts?through=2026-09-30');
        expect(payoutsBackPath('2026-10-31', 'drafts', today)).toBe('/admin/payouts?tab=drafts');
        expect(payoutsBackPath('2026-09-30', 'history', today)).toBe('/admin/payouts?through=2026-09-30&tab=history');
    });

    it('validates a payout minimum', () => {
        expect(validateMinimum('100')).toBeNull();
        expect(validateMinimum(' 25.50 ')).toBeNull();
        expect(validateMinimum('0')).toBeNull();
        expect(validateMinimum('.5')).toBeNull();
        expect(validateMinimum('')).not.toBeNull();
        expect(validateMinimum('-5')).not.toBeNull();
        expect(validateMinimum('abc')).not.toBeNull();
        expect(validateMinimum('1.234')).not.toBeNull();
    });
});
