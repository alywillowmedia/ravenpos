import { describe, expect, it } from 'vitest';
import {
    buildPaystubHtml,
    buildPaystubYtdTotals,
    formatPaystubAddressLines,
    formatPaystubPercent,
    getPaystubShortCode,
    hasPaystubAddress,
    type PaystubPayout,
} from '../../src/lib/paystub';
import type { EmployeePayrollProfile, PayrollBusinessProfile } from '../../src/lib/payroll';

const payout: PaystubPayout = {
    id: '12345678-aaaa-bbbb-cccc-123456789abc',
    paid_at: '2026-06-05T12:00:00Z',
    period_start: '2026-06-01',
    period_end: '2026-06-05',
    hours_worked: 40,
    hourly_rate: 20,
    gross_pay: 800,
    federal_withholding: 55,
    social_security_tax: 49.6,
    medicare_tax: 11.6,
    additional_medicare_tax: 0,
    state_withholding: 40,
    local_withholding: 8,
    contractor_backup_withholding: 0,
    net_pay: 635.8,
    employer_social_security_tax: 49.6,
    employer_medicare_tax: 11.6,
    employer_futa_tax: 4.8,
    employer_suta_tax: 24,
    payout_method: 'check',
    check_number: '1004',
    notes: 'Payroll note',
};

const businessProfile: PayrollBusinessProfile = {
    id: 'biz-1',
    employer: 'Ravenlia',
    legal_name: 'Ravenlia LLC',
    fein: '12-3456789',
    address_line_1: '100 Main St',
    address_line_2: 'Suite 2',
    city: 'Richmond',
    state: 'VA',
    postal_code: '23220',
    country: 'US',
    tax_state: 'VA',
    state_withholding_method: 'custom_rate',
    pay_frequency: 'biweekly',
    state_income_tax_rate: 0.05,
    custom_state_standard_deduction: 0,
    custom_state_brackets: [],
    local_income_tax_rate: 0.01,
    state_unemployment_rate: 0.03,
    state_unemployment_wage_base: 12000,
    futa_rate: 0.006,
};

const employeeProfile: Pick<EmployeePayrollProfile,
    | 'prior_ytd_wages'
    | 'prior_ytd_social_security_wages'
    | 'prior_ytd_medicare_wages'
    | 'prior_ytd_federal_withheld'
    | 'prior_ytd_state_withheld'
> = {
    prior_ytd_wages: 1000,
    prior_ytd_social_security_wages: 900,
    prior_ytd_medicare_wages: 1000,
    prior_ytd_federal_withheld: 80,
    prior_ytd_state_withheld: 30,
};

describe('paystub helpers', () => {
    it('formats structured addresses and missing address states', () => {
        expect(hasPaystubAddress(businessProfile)).toBe(true);
        expect(formatPaystubAddressLines(businessProfile)).toEqual([
            '100 Main St',
            'Suite 2',
            'Richmond, VA 23220',
            'US',
        ]);
        expect(formatPaystubAddressLines({})).toEqual(['Address not on file']);
    });

    it('formats payroll rates as percentages', () => {
        expect(formatPaystubPercent(0.062)).toBe('6.2%');
        expect(formatPaystubPercent(1.45)).toBe('1.45%');
    });

    it('builds ytd totals from prior setup plus recorded payouts through the target pay date', () => {
        const laterPayout = {
            ...payout,
            id: 'later-payout',
            paid_at: '2026-07-01T12:00:00Z',
            gross_pay: 1000,
            net_pay: 700,
        };

        const totals = buildPaystubYtdTotals([laterPayout, payout], payout, employeeProfile);

        expect(totals.grossPay).toBe(1800);
        expect(totals.federalWithholding).toBe(135);
        expect(totals.stateWithholding).toBe(70);
        expect(totals.netPay).toBe(635.8);
        expect(totals.socialSecurityWages).toBe(1700);
        expect(totals.medicareWages).toBe(1800);
    });

    it('renders a real paystub with identity blocks, rates, ytd totals, and escaped notes', () => {
        const html = buildPaystubHtml({
            payout: { ...payout, notes: '<script>alert(1)</script>' },
            employeeName: 'Jane Employee',
            employeeAddress: {
                address_line_1: '25 Staff Way',
                city: 'Richmond',
                state: 'VA',
                postal_code: '23221',
                country: 'US',
            },
            employerName: businessProfile.legal_name,
            employerFein: businessProfile.fein,
            employerAddress: businessProfile,
            businessProfile,
            taxClassification: 'w2',
            ytdTotals: buildPaystubYtdTotals([payout], payout, employeeProfile),
        });

        expect(getPaystubShortCode(payout.id)).toBe('12345678');
        expect(html).toContain('PAYSTUB');
        expect(html).toContain('Paystub #12345678');
        expect(html).toContain('Jane Employee');
        expect(html).toContain('100 Main St');
        expect(html).toContain('6.2%');
        expect(html).toContain('1.45%');
        expect(html).toContain('$1,800.00');
        expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    });
});
