import { describe, expect, it } from 'vitest';
import {
    buildStatementEmail,
    formatPlainDate,
    isUsableEmail,
    normalizePortalUrl,
    rollsForwardAmount,
    scopeLabelFor,
    type StatementEmailInput,
} from '../../supabase/functions/send-payout-statement/statement';
import { statementScopeLabel } from '../../src/lib/payoutDraft';
import type { PayoutStatementData } from '../../src/types/payouts';

const input: StatementEmailInput = {
    vendorName: 'Alywillow',
    amount: 367,
    paidDate: '2025-11-03',
    method: 'Check',
    reference: '1042',
    scopeLabel: 'Earnings through Oct 31',
    carriedIn: 100,
    earned: 300,
    deductions: [{ label: 'Booth rent', amount: 25.5 }, { label: 'Marketing fee', amount: 7.5 }],
    rollsForward: 0,
    statementUrl: 'https://portal.example.com/vendor/payouts/abc',
};

describe('buildStatementEmail', () => {
    it('puts the amount in the subject and body', () => {
        const email = buildStatementEmail(input);
        expect(email.subject).toBe('Your Ravenlia payout statement · $367.00');
        expect(email.html).toContain('$367.00');
    });

    it('shows the equation, deductions, method, reference, scope and a plain date', () => {
        const html = buildStatementEmail(input).html;
        expect(html).toContain('Carried in');
        expect(html).toContain('$100.00');
        expect(html).toContain('Earned');
        expect(html).toContain('$300.00');
        expect(html).toContain('Booth rent');
        expect(html).toContain('$25.50');
        expect(html).toContain('Check');
        expect(html).toContain('1042');
        expect(html).toContain('Earnings through Oct 31');
        expect(html).toContain('Nov 3, 2025');
    });

    it('escapes every interpolated value', () => {
        const html = buildStatementEmail({
            ...input,
            vendorName: '<b>Al</b>',
            reference: '<i>1</i>',
            method: '<u>x</u>',
            scopeLabel: '<s>y</s>',
            deductions: [{ label: '<script>z</script>', amount: 1 }],
        }).html;
        expect(html).toContain('&lt;b&gt;Al&lt;/b&gt;');
        expect(html).toContain('&lt;i&gt;1&lt;/i&gt;');
        expect(html).toContain('&lt;u&gt;x&lt;/u&gt;');
        expect(html).toContain('&lt;s&gt;y&lt;/s&gt;');
        expect(html).not.toContain('<script>');
        expect(html).not.toContain('<b>Al</b>');
    });

    it('leaves the link out when there is no statement url', () => {
        expect(buildStatementEmail({ ...input, statementUrl: null }).html).not.toContain('href=');
        expect(buildStatementEmail(input).html).toContain('href="https://portal.example.com/vendor/payouts/abc"');
    });

    it('hides the equation lines on older payouts without snapshots', () => {
        const html = buildStatementEmail({ ...input, carriedIn: null, earned: null }).html;
        expect(html).not.toContain('Carried in');
    });

    it('omits the deductions and rolls forward lines when there are none', () => {
        const html = buildStatementEmail({ ...input, deductions: [], rollsForward: 0 }).html;
        expect(html).not.toContain('Deductions');
        expect(html).not.toContain('Rolls forward');
    });

    it('shows rolls forward when money stays owed, and no reference line when absent', () => {
        const html = buildStatementEmail({ ...input, rollsForward: 12.34, reference: null }).html;
        expect(html).toContain('Rolls forward');
        expect(html).toContain('$12.34');
        expect(html).not.toContain('Reference');
    });

    it('formats thousands with commas', () => {
        expect(buildStatementEmail({ ...input, amount: 1234.5 }).subject).toBe('Your Ravenlia payout statement · $1,234.50');
    });
});

describe('statement helpers', () => {
    it('formats a plain date with no timezone shift', () => {
        expect(formatPlainDate('2025-01-01')).toBe('Jan 1, 2025');
        expect(formatPlainDate('2025-12-31T00:00:00+00:00')).toBe('Dec 31, 2025');
        expect(formatPlainDate(null)).toBe('');
    });

    it('trims and validates the address, with the invoice email regex', () => {
        expect(isUsableEmail('  a@b.co ')).toBe('a@b.co');
        expect(isUsableEmail('not-an-email')).toBeNull();
        expect(isUsableEmail('a b@c.com')).toBeNull();
        expect(isUsableEmail('')).toBeNull();
        expect(isUsableEmail(null)).toBeNull();
    });

    it('strips trailing slashes from PORTAL_URL', () => {
        expect(normalizePortalUrl('https://p.example.com///')).toBe('https://p.example.com');
        expect(normalizePortalUrl('  ')).toBeNull();
        expect(normalizePortalUrl(undefined)).toBeNull();
    });

    it('floors rolls forward at zero', () => {
        expect(rollsForwardAmount(400, 367)).toBe(33);
        expect(rollsForwardAmount(300, 367)).toBe(0);
        expect(rollsForwardAmount(null, 367)).toBe(0);
        expect(rollsForwardAmount(100.1, 100)).toBe(0.1);
    });
});

describe('scopeLabelFor matches the app wording', () => {
    const cases: Array<Partial<PayoutStatementData['payout']>> = [
        { range_mode: 'through_date', source_range_end: '2025-10-31' },
        { range_mode: 'through_date', cutoff_at: '2025-11-01T03:30:00Z' },
        { range_mode: 'selected_range', source_range_start: '2025-10-01', source_range_end: '2025-10-31' },
        { range_mode: 'all_outstanding' },
        { range_mode: 'through_date' },
    ];
    for (const c of cases) {
        it(JSON.stringify(c), () => {
            const payout = { cutoff_at: null, source_range_start: null, source_range_end: null, ...c } as PayoutStatementData['payout'];
            expect(scopeLabelFor(payout)).toBe(statementScopeLabel(payout));
        });
    }
    it('pins the wording', () => {
        expect(scopeLabelFor({ range_mode: 'through_date', source_range_end: '2025-10-31', source_range_start: null, cutoff_at: null })).toBe('Earnings through Oct 31');
        expect(scopeLabelFor({ range_mode: 'selected_range', source_range_start: '2025-10-01', source_range_end: '2025-10-31', cutoff_at: null })).toBe('Sales from Oct 1 to Oct 31');
        expect(scopeLabelFor({ range_mode: 'all_outstanding', source_range_start: null, source_range_end: null, cutoff_at: null })).toBe('All outstanding');
    });
});
