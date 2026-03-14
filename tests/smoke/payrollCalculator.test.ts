import { describe, expect, it } from 'vitest';
import {
    calculatePayroll,
    calculateFederalWithholding,
    calculateVirginiaAnnualTax,
    type EmployeePayrollProfile,
    type PayrollBusinessProfile,
} from '../../src/lib/payroll';

const businessProfile: PayrollBusinessProfile = {
    id: 'biz-1',
    employer: 'Ravenlia',
    legal_name: 'Ravenlia LLC',
    fein: null,
    tax_state: 'NY',
    state_withholding_method: 'custom_rate',
    pay_frequency: 'biweekly',
    state_income_tax_rate: 0.05,
    local_income_tax_rate: 0.01,
    state_unemployment_rate: 0.03,
    state_unemployment_wage_base: 12000,
    futa_rate: 0.006,
};

function buildW2Profile(overrides: Partial<EmployeePayrollProfile> = {}): EmployeePayrollProfile {
    return {
        id: 'emp-pay-1',
        employee_id: 'emp-1',
        tax_classification: 'w2',
        federal_filing_status: 'single',
        step_2_checked: false,
        dependents_amount: 0,
        other_income: 0,
        deductions: 0,
        extra_withholding: 0,
        federal_exempt: false,
        state_exempt: false,
        state_additional_withholding: 0,
        state_personal_exemptions: 0,
        state_additional_exemptions: 0,
        backup_withholding_enabled: false,
        prior_ytd_wages: 0,
        prior_ytd_social_security_wages: 0,
        prior_ytd_medicare_wages: 0,
        prior_ytd_federal_withheld: 0,
        prior_ytd_state_withheld: 0,
        ...overrides,
    };
}

describe('payroll calculator', () => {
    it('calculates W-2 payroll with taxes and positive net pay', () => {
        const result = calculatePayroll({
            hourlyRate: 20,
            hoursWorked: 80,
            businessProfile,
            employeeProfile: buildW2Profile(),
            ytdTotals: { wages: 0, socialSecurityWages: 0, medicareWages: 0 },
        });

        expect(result.grossPay).toBe(1600);
        expect(result.federalWithholding).toBeGreaterThan(0);
        expect(result.socialSecurityTax).toBe(99.2);
        expect(result.medicareTax).toBe(23.2);
        expect(result.stateWithholding).toBe(80);
        expect(result.localWithholding).toBe(16);
        expect(result.netPay).toBeGreaterThan(0);
    });

    it('caps social security tax at the 2026 wage base', () => {
        const result = calculatePayroll({
            hourlyRate: 50,
            hoursWorked: 40,
            businessProfile,
            employeeProfile: buildW2Profile({ prior_ytd_social_security_wages: 183500 }),
            ytdTotals: { wages: 0, socialSecurityWages: 0, medicareWages: 0 },
        });

        expect(result.grossPay).toBe(2000);
        expect(result.socialSecurityTax).toBe(62);
        expect(result.employerSocialSecurityTax).toBe(62);
    });

    it('applies additional medicare tax above threshold', () => {
        const result = calculatePayroll({
            hourlyRate: 100,
            hoursWorked: 20,
            businessProfile,
            employeeProfile: buildW2Profile({ prior_ytd_medicare_wages: 199500 }),
            ytdTotals: { wages: 0, socialSecurityWages: 0, medicareWages: 0 },
        });

        expect(result.grossPay).toBe(2000);
        expect(result.additionalMedicareTax).toBe(13.5);
    });

    it('uses backup withholding for 1099 when enabled', () => {
        const contractorProfile = buildW2Profile({
            tax_classification: '1099',
            backup_withholding_enabled: true,
        });

        const result = calculatePayroll({
            hourlyRate: 30,
            hoursWorked: 40,
            businessProfile,
            employeeProfile: contractorProfile,
            ytdTotals: { wages: 0, socialSecurityWages: 0, medicareWages: 0 },
        });

        expect(result.grossPay).toBe(1200);
        expect(result.federalWithholding).toBe(0);
        expect(result.socialSecurityTax).toBe(0);
        expect(result.contractorBackupWithholding).toBe(288);
        expect(result.netPay).toBe(912);
    });

    it('returns zero federal withholding when marked exempt', () => {
        const withholding = calculateFederalWithholding(1500, 'biweekly', buildW2Profile({ federal_exempt: true }));
        expect(withholding).toBe(0);
    });

    it('matches Virginia annual tax schedule example', () => {
        expect(calculateVirginiaAnnualTax(90000)).toBe(4918);
    });

    it('uses Virginia brackets when selected', () => {
        const virginiaBusiness: PayrollBusinessProfile = {
            ...businessProfile,
            tax_state: 'VA',
            state_withholding_method: 'virginia_brackets',
            state_income_tax_rate: 0,
        };

        const result = calculatePayroll({
            hourlyRate: 90_000 / 26 / 40,
            hoursWorked: 40,
            businessProfile: virginiaBusiness,
            employeeProfile: buildW2Profile(),
            ytdTotals: { wages: 0, socialSecurityWages: 0, medicareWages: 0 },
        });

        expect(result.grossPay).toBe(3461.54);
        expect(result.stateWithholding).toBe(169.77);
    });
});
