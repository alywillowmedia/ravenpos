import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/supabase', () => ({ supabase: {} }));

import { inStoreDateRange } from '../../src/lib/payoutDraft';
import { payoutPaidOn } from '../../src/lib/consignorReports';

describe('inStoreDateRange', () => {
    // 11:30pm on Oct 31 in New York is 03:30 UTC on Nov 1.
    const lateOct31 = '2025-11-01T03:30:00Z';
    // 12:30am on Oct 1 in New York is 04:30 UTC on Oct 1.
    const earlyOct1 = '2025-10-01T04:30:00Z';
    // 9pm on Sep 30 in New York is 01:00 UTC on Oct 1.
    const lateSep30 = '2025-10-01T01:00:00Z';

    it('keeps a late sale on the last store day of the range', () => {
        expect(inStoreDateRange(lateOct31, '2025-10-01', '2025-10-31')).toBe(true);
    });

    it('keeps the first minutes of the first store day', () => {
        expect(inStoreDateRange(earlyOct1, '2025-10-01', '2025-10-31')).toBe(true);
    });

    it('drops the evening before the range starts', () => {
        expect(inStoreDateRange(lateSep30, '2025-10-01', '2025-10-31')).toBe(false);
    });

    it('treats blank bounds as open', () => {
        expect(inStoreDateRange(lateSep30, '', '')).toBe(true);
        expect(inStoreDateRange(lateOct31, '', '2025-10-30')).toBe(false);
    });

    it('drops an unreadable timestamp', () => {
        expect(inStoreDateRange('nope', '', '')).toBe(false);
    });
});

describe('payoutPaidOn', () => {
    it('uses the payment date on the statement over when it was recorded', () => {
        const day = new Date(payoutPaidOn({ paid_at: '2026-01-02T15:00:00Z', payment_date: '2025-12-31' }));
        expect([day.getFullYear(), day.getMonth() + 1, day.getDate()]).toEqual([2025, 12, 31]);
    });

    it('falls back to the recorded time for older payouts', () => {
        expect(payoutPaidOn({ paid_at: '2025-06-01T15:00:00Z', payment_date: null })).toBe('2025-06-01T15:00:00Z');
    });
});
