import { describe, expect, it } from 'vitest';
import {
    defaultThroughDate,
    draftPath,
    countAfterCutoff,
    filterRows,
    formatDay,
    formatPayoutDate,
    historyMonthOptions,
    localDateString,
    monthName,
    parseThrough,
    payoutsBackPath,
    payRunBlocked,
    payRunReasonRequired,
    payRunSummary,
    payoutCount,
    payRunTotal,
    prepareSummary,
    readyToPrepare,
    runPayRun,
    type PayRunDeps,
    type PayRunJob,
    type PayRunRowState,
    runTotals,
    shortId,
    splitBarParts,
    statusLine,
    sumEarnings,
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

    it('builds the draft link with the through date', () => {
        expect(draftPath('abc', '2026-09-30')).toBe('/admin/payouts/drafts/abc?through=2026-09-30');
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

describe('payRunBlocked', () => {
    const entry = (overrides: Partial<PayoutRunRow> = {}, extra: { selected?: boolean; reference?: string; reason?: string } = {}) => ({
        row: row({ paying_now: 50, payable_before_invoices: 150, ...overrides }),
        selected: extra.selected ?? true,
        reference: extra.reference ?? '',
        reason: extra.reason ?? '',
    });

    it('is blocked by a selected check row above $0 with no reference', () => {
        expect(payRunBlocked([entry()], 'check', '2026-11-05')).toBe(true);
        expect(payRunBlocked([entry({}, { reference: '1042' })], 'check', '2026-11-05')).toBe(false);
    });

    it('does not need a reference for other methods', () => {
        expect(payRunBlocked([entry()], 'cash', '2026-11-05')).toBe(false);
    });

    it('lets a $0 row through without a reference', () => {
        expect(payRunBlocked([entry({ paying_now: 0 })], 'check', '2026-11-05')).toBe(false);
    });

    it('is blocked by a selected below-minimum row with no reason', () => {
        const below = { payable_before_invoices: 40, threshold: 100 };
        expect(payRunBlocked([entry(below, { reference: '1' })], 'check', '2026-11-05')).toBe(true);
        expect(payRunBlocked([entry(below, { reference: '1', reason: 'Closing account' })], 'check', '2026-11-05')).toBe(false);
    });

    it('ignores an unticked bad row', () => {
        expect(payRunBlocked([entry({}, { selected: false }), entry({}, { reference: '7' })], 'check', '2026-11-05')).toBe(false);
    });

    it('is blocked when nothing is selected, or the date is missing', () => {
        expect(payRunBlocked([], 'check', '2026-11-05')).toBe(true);
        expect(payRunBlocked([entry({}, { selected: false })], 'check', '2026-11-05')).toBe(true);
        expect(payRunBlocked([entry({}, { reference: '1' })], 'check', '')).toBe(true);
    });
});

describe('payRunReasonRequired', () => {
    it('needs a reason only when paying something below the minimum', () => {
        expect(payRunReasonRequired(row({ paying_now: 40, payable_before_invoices: 40, threshold: 100 }))).toBe(true);
        expect(payRunReasonRequired(row({ paying_now: 0, payable_before_invoices: 40, threshold: 100 }))).toBe(false);
        expect(payRunReasonRequired(row({ paying_now: 100, payable_before_invoices: 100, threshold: 100 }))).toBe(false);
    });
});

describe('pay run wording', () => {
    it('summarises the run', () => {
        expect(payRunSummary(5, 1)).toBe('5 paid, 1 failed');
        expect(payRunSummary(3, 0)).toBe('3 paid');
        expect(payRunSummary(0, 2)).toBe('0 paid, 2 failed');
        expect(payRunSummary(2, 1, 1)).toBe('2 paid, 1 failed, 1 could not be confirmed');
    });

    it('uses the singular for one payout', () => {
        expect(payoutCount(1)).toBe('1 payout');
        expect(payoutCount(5)).toBe('5 payouts');
        expect(payoutCount(0)).toBe('0 payouts');
    });
});

describe('runPayRun', () => {
    const job = (id: string, extra: Partial<PayRunJob> = {}): PayRunJob => ({
        id, payoutId: `p-${id}`, amount: 50, reference: `ref-${id}`, date: '2026-11-06', sendEmail: false, ...extra,
    });

    function harness(overrides: Partial<PayRunDeps> = {}) {
        const log: string[] = [];
        const states: Record<string, PayRunRowState[]> = {};
        const deps: PayRunDeps = {
            pay: async (j) => { log.push(`pay:${j.id}`); },
            checkStatus: async () => ({ status: 'draft', amount: 50, reference: null, date: null }),
            sendEmail: async () => 'sent',
            onRowState: (id, state) => { (states[id] ??= []).push(state); },
            ...overrides,
        };
        return { deps, log, states };
    }

    it('pays rows in order, and a row is paid only after its payer resolves', async () => {
        let release: () => void = () => {};
        const { deps, states } = harness({
            pay: () => new Promise<void>((resolve) => { release = resolve; }),
        });
        const run = runPayRun([job('a')], deps);
        await Promise.resolve();
        expect(states.a.map((s) => s.phase)).toEqual(['paying']);
        release();
        const final = await run;
        expect(states.a.map((s) => s.phase)).toEqual(['paying', 'paid']);
        expect(final.a.phase).toBe('paid');
    });

    it('continues with the next row after a throw, and never reads the failed row as paid', async () => {
        const { deps, log, states } = harness({
            pay: async (j) => {
                log.push(`pay:${j.id}`);
                if (j.id === 'a') throw new Error('Draft no longer reconciles: allocations plus adjustments equal 1.00, expected 2.00.');
            },
        });
        const final = await runPayRun([job('a'), job('b')], deps);
        expect(log).toEqual(['pay:a', 'pay:b']);
        expect(final.a).toEqual({ phase: 'failed', error: 'This draft changed after it was prepared. Open it and recalculate.' });
        expect(final.b.phase).toBe('paid');
        expect(states.a.map((s) => s.phase)).not.toContain('paid');
    });

    it('maps the amount-changed error to a failed row', async () => {
        const { deps } = harness({ pay: async () => { throw new Error('The payout amount changed after this screen loaded.'); } });
        const final = await runPayRun([job('a')], deps);
        expect(final.a).toEqual({ phase: 'failed', error: 'The amount changed after this screen loaded. Reload and check it.' });
    });

    it('skips rows that are already settled on a restart, and retries failed ones', async () => {
        let fail = true;
        const { deps, log } = harness({
            pay: async (j) => { log.push(`pay:${j.id}`); if (j.id === 'b' && fail) throw new Error('boom'); },
        });
        const first = await runPayRun([job('a'), job('b')], deps);
        expect(first.a.phase).toBe('paid');
        expect(first.b.phase).toBe('failed');
        fail = false;
        log.length = 0;
        const second = await runPayRun([job('a'), job('b')], deps, first);
        expect(log).toEqual(['pay:b']);
        expect(second.a.phase).toBe('paid');
        expect(second.b.phase).toBe('paid');
    });

    describe('after a finalize failure the stored status decides', () => {
        const failing = (stored: Awaited<ReturnType<PayRunDeps['checkStatus']>> | Error, extra: Partial<PayRunDeps> = {}) =>
            harness({
                pay: async () => { throw new Error('network dropped'); },
                checkStatus: async () => { if (stored instanceof Error) throw stored; return stored; },
                ...extra,
            });

        it('paid with this run reference, date and amount: becomes paid and is emailed when ticked', async () => {
            const sent: string[] = [];
            const { deps } = failing(
                { status: 'paid', amount: 50, reference: 'ref-a', date: '2026-11-06' },
                { sendEmail: async (j) => { sent.push(j.id); return 'failed'; } },
            );
            const final = await runPayRun([job('a', { sendEmail: true })], deps);
            expect(final.a).toEqual({ phase: 'paid', email: 'failed' });
            expect(sent).toEqual(['a']);
        });

        it('paid with this run reference but email not ticked: paid, no email sent', async () => {
            const sent: string[] = [];
            const { deps } = failing(
                { status: 'paid', amount: 50, reference: 'ref-a', date: '2026-11-06' },
                { sendEmail: async (j) => { sent.push(j.id); return 'sent'; } },
            );
            const final = await runPayRun([job('a')], deps);
            expect(final.a).toEqual({ phase: 'paid', email: 'skipped' });
            expect(sent).toEqual([]);
        });

        it('a blank reference matches a stored null reference', async () => {
            const { deps } = failing({ status: 'paid', amount: 50, reference: null, date: '2026-11-06' });
            const final = await runPayRun([job('a', { reference: null })], deps);
            expect(final.a.phase).toBe('paid');
        });

        it('paid by someone else: Already paid, out of retry, not failed', async () => {
            const { deps } = failing({ status: 'paid', amount: 50, reference: 'other', date: '2026-11-01' });
            const final = await runPayRun([job('a')], deps);
            expect(final.a.phase).toBe('already_paid');
        });

        it('voided: Removed', async () => {
            const { deps } = failing({ status: 'voided', amount: 50, reference: 'ref-a', date: '2026-11-06' });
            expect((await runPayRun([job('a')], deps)).a.phase).toBe('removed');
        });

        it('gone: Removed', async () => {
            const { deps } = failing(null);
            expect((await runPayRun([job('a')], deps)).a.phase).toBe('removed');
        });

        it('still a draft: Failed with the described reason', async () => {
            const { deps } = failing({ status: 'draft', amount: 50, reference: null, date: null });
            expect((await runPayRun([job('a')], deps)).a).toEqual({ phase: 'failed', error: 'network dropped' });
        });

        it('status read also fails: cannot confirm, and is skipped on restart', async () => {
            const { deps, log } = failing(new Error('offline'));
            const first = await runPayRun([job('a')], deps);
            expect(first.a).toEqual({ phase: 'unconfirmed', error: 'Could not confirm. Reload before retrying.' });
            const second = await runPayRun([job('a')], deps, first);
            expect(log).toEqual([]);
            expect(second.a.phase).toBe('unconfirmed');
        });
    });

    it('maps the email outcome onto the paid row', async () => {
        const outcomes = ['sent', 'failed', 'no_email'] as const;
        for (const outcome of outcomes) {
            const { deps } = harness({ sendEmail: async () => outcome });
            const final = await runPayRun([job('a', { sendEmail: true })], deps);
            expect(final.a).toEqual({ phase: 'paid', email: outcome });
        }
    });
});

describe('sumEarnings', () => {
    it('sums in cents and counts a missing id as $0', () => {
        const earnings = new Map([['a', 0.1], ['b', 0.2]]);
        expect(sumEarnings(['a', 'b', 'x'], earnings)).toBe(0.3);
    });

    it('is 0 for no ids', () => {
        expect(sumEarnings([], new Map([['a', 5]]))).toBe(0);
    });
});
