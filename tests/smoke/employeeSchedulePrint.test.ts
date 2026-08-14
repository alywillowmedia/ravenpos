import { describe, expect, it } from 'vitest';
import {
    buildEmployeeSchedulePrintHtml,
    getSchedulePrintPeriod,
    schedulePrintDateKey,
} from '../../src/lib/employeeSchedulePrint';

describe('employee schedule printing', () => {
    it('builds Monday-based one and two week ranges', () => {
        const anchor = new Date(2026, 7, 14);
        const week = getSchedulePrintPeriod('week', anchor);
        const twoWeeks = getSchedulePrintPeriod('two_weeks', anchor);

        expect(schedulePrintDateKey(week.start)).toBe('2026-08-10');
        expect(schedulePrintDateKey(week.end)).toBe('2026-08-16');
        expect(week.days).toHaveLength(7);
        expect(schedulePrintDateKey(twoWeeks.end)).toBe('2026-08-23');
        expect(twoWeeks.days).toHaveLength(14);
        expect(twoWeeks.rowCount).toBe(2);
    });

    it('creates a complete Monday-first month grid', () => {
        const month = getSchedulePrintPeriod('month', new Date(2026, 7, 14));

        expect(schedulePrintDateKey(month.start)).toBe('2026-08-01');
        expect(schedulePrintDateKey(month.end)).toBe('2026-08-31');
        expect(schedulePrintDateKey(month.days[0])).toBe('2026-07-27');
        expect(month.days).toHaveLength(42);
        expect(month.rowCount).toBe(6);
    });

    it('scales month cards up when a day has room', () => {
        const period = getSchedulePrintPeriod('month', new Date(2026, 7, 14));
        const html = buildEmployeeSchedulePrintHtml({
            period,
            range: 'month',
            shifts: [{
                employeeId: 'employee-1',
                employeeName: 'Hailey Abigail Croom',
                date: '2026-08-12',
                startTime: '09:45',
                endTime: '16:00',
            }],
        });

        expect(html).toContain('class="day roomy"');
        expect(html).toContain('.day.roomy .shift { padding: 3px 4px; font-size: 9px; }');
        expect(html).toContain('font-size: 7.25px');
    });

    it('escapes employee names in generated print markup', () => {
        const period = getSchedulePrintPeriod('week', new Date(2026, 7, 14));
        const html = buildEmployeeSchedulePrintHtml({
            period,
            range: 'week',
            shifts: [{
                employeeId: 'employee-1',
                employeeName: '<script>alert("no")</script>',
                date: '2026-08-10',
                startTime: '09:00',
                endTime: '17:00',
            }],
        });

        expect(html).toContain('&lt;script&gt;alert(&quot;no&quot;)&lt;/script&gt;');
        expect(html).not.toContain('<script>alert("no")</script>');
        expect(html).toContain('overflow-wrap: anywhere');
        expect(html).not.toContain('text-overflow: ellipsis');
    });
});
