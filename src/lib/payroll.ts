export type PayFrequency = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly';
export type TaxClassification = 'w2' | '1099';
export type StateWithholdingMethod = 'custom_rate' | 'custom_brackets' | 'virginia_brackets';
export type FederalFilingStatus =
    | 'single'
    | 'married_filing_jointly'
    | 'married_filing_separately'
    | 'head_of_household';

export interface PayrollBusinessProfile {
    id: string;
    employer: 'Ravenlia' | 'Alywillow';
    legal_name: string;
    fein: string | null;
    tax_state: string;
    state_withholding_method: StateWithholdingMethod;
    pay_frequency: PayFrequency;
    state_income_tax_rate: number;
    custom_state_standard_deduction?: number;
    custom_state_brackets?: CustomStateWithholdingBracket[];
    local_income_tax_rate: number;
    state_unemployment_rate: number;
    state_unemployment_wage_base: number;
    futa_rate: number;
}

export interface CustomStateWithholdingBracket {
    threshold: number;
    baseTax: number;
    rate: number;
}

export interface EmployeePayrollProfile {
    id: string;
    employee_id: string;
    tax_classification: TaxClassification;
    federal_filing_status: FederalFilingStatus;
    step_2_checked: boolean;
    dependents_amount: number;
    other_income: number;
    deductions: number;
    extra_withholding: number;
    federal_exempt: boolean;
    state_exempt: boolean;
    state_additional_withholding: number;
    state_personal_exemptions: number;
    state_additional_exemptions: number;
    backup_withholding_enabled: boolean;
    prior_ytd_wages: number;
    prior_ytd_social_security_wages: number;
    prior_ytd_medicare_wages: number;
    prior_ytd_federal_withheld: number;
    prior_ytd_state_withheld: number;
}

export interface PayrollYtdTotals {
    wages: number;
    socialSecurityWages: number;
    medicareWages: number;
}

export interface PayrollCalculationInput {
    hourlyRate: number;
    hoursWorked: number;
    businessProfile: PayrollBusinessProfile;
    employeeProfile: EmployeePayrollProfile;
    ytdTotals: PayrollYtdTotals;
}

export interface PayrollCalculationResult {
    grossPay: number;
    federalWithholding: number;
    socialSecurityTax: number;
    medicareTax: number;
    additionalMedicareTax: number;
    stateWithholding: number;
    localWithholding: number;
    contractorBackupWithholding: number;
    netPay: number;
    employerSocialSecurityTax: number;
    employerMedicareTax: number;
    employerFutaTax: number;
    employerSutaTax: number;
}

export interface PayrollAccuracyBasis {
    isW2: boolean;
    payPeriods: number;
    ytdWagesBefore: number;
    ytdWagesAfter: number;
    annualizedGross: number;
    federalStandardDeduction: number;
    federalAdjustedAnnualWages: number;
    federalDependentCreditsPerPeriod: number;
    socialSecurityWagesBefore: number;
    socialSecurityTaxableWagesThisCheck: number;
    socialSecurityWagesAfter: number;
    medicareWagesBefore: number;
    additionalMedicareTaxableWagesThisCheck: number;
    stateAnnualDeduction: number;
    stateAnnualizedTaxableIncome: number;
    stateBracketCount: number;
    stateAdditionalWithholding: number;
}

const PAY_PERIODS_PER_YEAR: Record<PayFrequency, number> = {
    weekly: 52,
    biweekly: 26,
    semimonthly: 24,
    monthly: 12,
};

export const SOCIAL_SECURITY_RATE = 0.062;
export const MEDICARE_RATE = 0.0145;
export const ADDITIONAL_MEDICARE_RATE = 0.009;
export const ADDITIONAL_MEDICARE_THRESHOLD = 200000;
export const SOCIAL_SECURITY_WAGE_BASE_2026 = 184500;
const FUTA_WAGE_BASE = 7000;
const BACKUP_WITHHOLDING_RATE = 0.24;

const VIRGINIA_STANDARD_DEDUCTION = 8750;
const VIRGINIA_PERSONAL_EXEMPTION_AMOUNT = 930;
const VIRGINIA_AGE_BLIND_EXEMPTION_AMOUNT = 800;

type WithholdingBracket = {
    threshold: number;
    baseTax: number;
    rate: number;
};

type FilingStatusTables = Record<FederalFilingStatus, WithholdingBracket[]>;

const STANDARD_DEDUCTION_ADJUSTMENTS_2026: Record<FederalFilingStatus, number> = {
    single: 8600,
    married_filing_jointly: 12900,
    married_filing_separately: 8600,
    head_of_household: 12900,
};

// IRS Publication 15-T (2026), Worksheet 1A Annual Percentage Method schedules.
const STANDARD_WITHHOLDING_TABLES_2026: FilingStatusTables = {
    single: [
        { threshold: 0, baseTax: 0, rate: 0 },
        { threshold: 7500, baseTax: 0, rate: 0.1 },
        { threshold: 19900, baseTax: 1240, rate: 0.12 },
        { threshold: 57900, baseTax: 5800, rate: 0.22 },
        { threshold: 113200, baseTax: 17966, rate: 0.24 },
        { threshold: 209275, baseTax: 41024, rate: 0.32 },
        { threshold: 263725, baseTax: 58448, rate: 0.35 },
        { threshold: 648100, baseTax: 192979.25, rate: 0.37 },
    ],
    married_filing_separately: [
        { threshold: 0, baseTax: 0, rate: 0 },
        { threshold: 7500, baseTax: 0, rate: 0.1 },
        { threshold: 19900, baseTax: 1240, rate: 0.12 },
        { threshold: 57900, baseTax: 5800, rate: 0.22 },
        { threshold: 113200, baseTax: 17966, rate: 0.24 },
        { threshold: 209275, baseTax: 41024, rate: 0.32 },
        { threshold: 263725, baseTax: 58448, rate: 0.35 },
        { threshold: 648100, baseTax: 192979.25, rate: 0.37 },
    ],
    married_filing_jointly: [
        { threshold: 0, baseTax: 0, rate: 0 },
        { threshold: 19300, baseTax: 0, rate: 0.1 },
        { threshold: 44100, baseTax: 2480, rate: 0.12 },
        { threshold: 120100, baseTax: 11600, rate: 0.22 },
        { threshold: 230700, baseTax: 35932, rate: 0.24 },
        { threshold: 422850, baseTax: 82048, rate: 0.32 },
        { threshold: 531750, baseTax: 116896, rate: 0.35 },
        { threshold: 788000, baseTax: 206583.5, rate: 0.37 },
    ],
    head_of_household: [
        { threshold: 0, baseTax: 0, rate: 0 },
        { threshold: 15550, baseTax: 0, rate: 0.1 },
        { threshold: 33250, baseTax: 1770, rate: 0.12 },
        { threshold: 83000, baseTax: 7740, rate: 0.22 },
        { threshold: 121250, baseTax: 16155, rate: 0.24 },
        { threshold: 217300, baseTax: 39207, rate: 0.32 },
        { threshold: 271750, baseTax: 56631, rate: 0.35 },
        { threshold: 656150, baseTax: 191171, rate: 0.37 },
    ],
};

const CHECKBOX_WITHHOLDING_TABLES_2026: FilingStatusTables = {
    single: [
        { threshold: 0, baseTax: 0, rate: 0 },
        { threshold: 8050, baseTax: 0, rate: 0.1 },
        { threshold: 14250, baseTax: 620, rate: 0.12 },
        { threshold: 33250, baseTax: 2900, rate: 0.22 },
        { threshold: 60900, baseTax: 8983, rate: 0.24 },
        { threshold: 108938, baseTax: 20512, rate: 0.32 },
        { threshold: 136163, baseTax: 29224, rate: 0.35 },
        { threshold: 328350, baseTax: 96489.63, rate: 0.37 },
    ],
    married_filing_separately: [
        { threshold: 0, baseTax: 0, rate: 0 },
        { threshold: 8050, baseTax: 0, rate: 0.1 },
        { threshold: 14250, baseTax: 620, rate: 0.12 },
        { threshold: 33250, baseTax: 2900, rate: 0.22 },
        { threshold: 60900, baseTax: 8983, rate: 0.24 },
        { threshold: 108938, baseTax: 20512, rate: 0.32 },
        { threshold: 136163, baseTax: 29224, rate: 0.35 },
        { threshold: 328350, baseTax: 96489.63, rate: 0.37 },
    ],
    married_filing_jointly: [
        { threshold: 0, baseTax: 0, rate: 0 },
        { threshold: 16100, baseTax: 0, rate: 0.1 },
        { threshold: 28500, baseTax: 1240, rate: 0.12 },
        { threshold: 66500, baseTax: 5800, rate: 0.22 },
        { threshold: 121800, baseTax: 17966, rate: 0.24 },
        { threshold: 217875, baseTax: 41024, rate: 0.32 },
        { threshold: 272325, baseTax: 58448, rate: 0.35 },
        { threshold: 400450, baseTax: 103291.75, rate: 0.37 },
    ],
    head_of_household: [
        { threshold: 0, baseTax: 0, rate: 0 },
        { threshold: 12075, baseTax: 0, rate: 0.1 },
        { threshold: 20925, baseTax: 885, rate: 0.12 },
        { threshold: 45800, baseTax: 3870, rate: 0.22 },
        { threshold: 64925, baseTax: 8077.5, rate: 0.24 },
        { threshold: 112950, baseTax: 19603.5, rate: 0.32 },
        { threshold: 140175, baseTax: 28315.5, rate: 0.35 },
        { threshold: 332375, baseTax: 95585.5, rate: 0.37 },
    ],
};

export function getPayPeriodsPerYear(payFrequency: PayFrequency): number {
    return PAY_PERIODS_PER_YEAR[payFrequency];
}

export function getDefaultPayrollDateRange(
    payFrequency: PayFrequency,
    referenceDate: Date = new Date(),
): { start: Date; end: Date } {
    const anchor = new Date(referenceDate);
    anchor.setHours(0, 0, 0, 0);

    if (payFrequency === 'weekly') {
        const start = new Date(anchor);
        start.setDate(anchor.getDate() - anchor.getDay());
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        end.setHours(23, 59, 59, 999);
        return { start, end };
    }

    if (payFrequency === 'biweekly') {
        const weekly = getDefaultPayrollDateRange('weekly', referenceDate);
        const end = new Date(weekly.start);
        end.setMilliseconds(-1);
        const start = new Date(weekly.start);
        start.setDate(start.getDate() - 14);
        return { start, end };
    }

    if (payFrequency === 'semimonthly') {
        const day = anchor.getDate();
        if (day <= 15) {
            const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
            const end = new Date(anchor.getFullYear(), anchor.getMonth(), 15, 23, 59, 59, 999);
            return { start, end };
        }

        const start = new Date(anchor.getFullYear(), anchor.getMonth(), 16);
        const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 23, 59, 59, 999);
        return { start, end };
    }

    const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 23, 59, 59, 999);
    return { start, end };
}

export function calculatePayroll(input: PayrollCalculationInput): PayrollCalculationResult {
    const grossPay = roundCurrency(input.hourlyRate * input.hoursWorked);
    const isW2 = input.employeeProfile.tax_classification === 'w2';

    const socialSecurityTax = isW2
        ? calculateTaxWithWageBase(
            grossPay,
            input.employeeProfile.prior_ytd_social_security_wages + input.ytdTotals.socialSecurityWages,
            SOCIAL_SECURITY_WAGE_BASE_2026,
            SOCIAL_SECURITY_RATE,
        )
        : 0;

    const medicareTax = isW2 ? roundCurrency(grossPay * MEDICARE_RATE) : 0;
    const additionalMedicareTax = isW2
        ? calculateAdditionalMedicareTax(
            grossPay,
            input.employeeProfile.prior_ytd_medicare_wages + input.ytdTotals.medicareWages,
        )
        : 0;

    const federalWithholding = isW2
        ? calculateFederalWithholding(grossPay, input.businessProfile.pay_frequency, input.employeeProfile)
        : 0;

    const contractorBackupWithholding = !isW2 && input.employeeProfile.backup_withholding_enabled
        ? roundCurrency(grossPay * BACKUP_WITHHOLDING_RATE)
        : 0;

    const stateWithholding = calculateStateWithholding(input, grossPay, isW2);

    const localWithholding = isW2 && !input.employeeProfile.state_exempt
        ? roundCurrency(grossPay * normalizeRate(input.businessProfile.local_income_tax_rate))
        : 0;

    const employerSocialSecurityTax = isW2 ? socialSecurityTax : 0;
    const employerMedicareTax = isW2 ? medicareTax : 0;
    const employerFutaTax = isW2
        ? calculateTaxWithWageBase(
            grossPay,
            input.employeeProfile.prior_ytd_wages + input.ytdTotals.wages,
            FUTA_WAGE_BASE,
            normalizeRate(input.businessProfile.futa_rate),
        )
        : 0;
    const employerSutaTax = isW2
        ? calculateTaxWithWageBase(
            grossPay,
            input.employeeProfile.prior_ytd_wages + input.ytdTotals.wages,
            input.businessProfile.state_unemployment_wage_base,
            normalizeRate(input.businessProfile.state_unemployment_rate),
        )
        : 0;

    const netPay = roundCurrency(
        grossPay
        - federalWithholding
        - socialSecurityTax
        - medicareTax
        - additionalMedicareTax
        - stateWithholding
        - localWithholding
        - contractorBackupWithholding,
    );

    return {
        grossPay,
        federalWithholding,
        socialSecurityTax,
        medicareTax,
        additionalMedicareTax,
        stateWithholding,
        localWithholding,
        contractorBackupWithholding,
        netPay,
        employerSocialSecurityTax,
        employerMedicareTax,
        employerFutaTax,
        employerSutaTax,
    };
}

export function getPayrollAccuracyBasis(input: PayrollCalculationInput): PayrollAccuracyBasis {
    const grossPay = roundCurrency(input.hourlyRate * input.hoursWorked);
    const isW2 = input.employeeProfile.tax_classification === 'w2';
    const payPeriods = getPayPeriodsPerYear(input.businessProfile.pay_frequency);
    const annualizedGross = grossPay * payPeriods;
    const ytdWagesBefore = input.employeeProfile.prior_ytd_wages + input.ytdTotals.wages;
    const socialSecurityWagesBefore = input.employeeProfile.prior_ytd_social_security_wages + input.ytdTotals.socialSecurityWages;
    const medicareWagesBefore = input.employeeProfile.prior_ytd_medicare_wages + input.ytdTotals.medicareWages;
    const federalStandardDeduction = input.employeeProfile.step_2_checked
        ? 0
        : STANDARD_DEDUCTION_ADJUSTMENTS_2026[input.employeeProfile.federal_filing_status];
    const federalAdjustedAnnualWages = input.employeeProfile.federal_exempt
        ? 0
        : Math.max(
            0,
            annualizedGross
                + input.employeeProfile.other_income
                - input.employeeProfile.deductions
                - federalStandardDeduction,
        );
    const socialSecurityTaxableWagesThisCheck = isW2
        ? Math.max(0, Math.min(grossPay, SOCIAL_SECURITY_WAGE_BASE_2026 - socialSecurityWagesBefore))
        : 0;
    const additionalMedicareThresholdRemaining = Math.max(0, ADDITIONAL_MEDICARE_THRESHOLD - medicareWagesBefore);
    const additionalMedicareTaxableWagesThisCheck = isW2
        ? Math.max(0, grossPay - additionalMedicareThresholdRemaining)
        : 0;
    const stateAnnualDeduction = getStateAnnualDeduction(input);

    return {
        isW2,
        payPeriods,
        ytdWagesBefore: roundCurrency(ytdWagesBefore),
        ytdWagesAfter: roundCurrency(ytdWagesBefore + grossPay),
        annualizedGross: roundCurrency(annualizedGross),
        federalStandardDeduction: roundCurrency(federalStandardDeduction),
        federalAdjustedAnnualWages: roundCurrency(federalAdjustedAnnualWages),
        federalDependentCreditsPerPeriod: roundCurrency(input.employeeProfile.dependents_amount / payPeriods),
        socialSecurityWagesBefore: roundCurrency(socialSecurityWagesBefore),
        socialSecurityTaxableWagesThisCheck: roundCurrency(socialSecurityTaxableWagesThisCheck),
        socialSecurityWagesAfter: roundCurrency(socialSecurityWagesBefore + socialSecurityTaxableWagesThisCheck),
        medicareWagesBefore: roundCurrency(medicareWagesBefore),
        additionalMedicareTaxableWagesThisCheck: roundCurrency(additionalMedicareTaxableWagesThisCheck),
        stateAnnualDeduction: roundCurrency(stateAnnualDeduction),
        stateAnnualizedTaxableIncome: roundCurrency(Math.max(0, annualizedGross - stateAnnualDeduction)),
        stateBracketCount: Array.isArray(input.businessProfile.custom_state_brackets)
            ? input.businessProfile.custom_state_brackets.length
            : 0,
        stateAdditionalWithholding: roundCurrency(input.employeeProfile.state_additional_withholding),
    };
}

export function calculateVirginiaAnnualTax(virginiaTaxableIncome: number): number {
    const income = Math.max(0, virginiaTaxableIncome);

    if (income <= 3000) {
        return Math.round(income * 0.02);
    }

    if (income <= 5000) {
        return Math.round(60 + (income - 3000) * 0.03);
    }

    if (income <= 17000) {
        return Math.round(120 + (income - 5000) * 0.05);
    }

    return Math.round(720 + (income - 17000) * 0.0575);
}

export function calculateCustomStateAnnualTax(
    taxableIncome: number,
    brackets: CustomStateWithholdingBracket[] = [],
): number {
    const income = Math.max(0, taxableIncome);
    const sortedBrackets = brackets
        .map((bracket) => ({
            threshold: Math.max(0, Number(bracket.threshold || 0)),
            baseTax: Math.max(0, Number(bracket.baseTax || 0)),
            rate: Math.max(0, normalizeRate(Number(bracket.rate || 0))),
        }))
        .filter((bracket) => Number.isFinite(bracket.threshold) && Number.isFinite(bracket.baseTax) && Number.isFinite(bracket.rate))
        .sort((a, b) => a.threshold - b.threshold);

    if (sortedBrackets.length === 0) {
        return 0;
    }

    let activeBracket = sortedBrackets[0];
    for (const bracket of sortedBrackets) {
        if (income >= bracket.threshold) {
            activeBracket = bracket;
        } else {
            break;
        }
    }

    return roundCurrency(activeBracket.baseTax + ((income - activeBracket.threshold) * activeBracket.rate));
}

export function calculateFederalWithholding(
    grossPay: number,
    payFrequency: PayFrequency,
    employeeProfile: EmployeePayrollProfile,
): number {
    if (employeeProfile.federal_exempt) {
        return 0;
    }

    const payPeriods = getPayPeriodsPerYear(payFrequency);
    const annualizedWages = grossPay * payPeriods;
    const standardDeduction = employeeProfile.step_2_checked
        ? 0
        : STANDARD_DEDUCTION_ADJUSTMENTS_2026[employeeProfile.federal_filing_status];

    const adjustedAnnualWages = Math.max(
        0,
        annualizedWages
            + employeeProfile.other_income
            - employeeProfile.deductions
            - standardDeduction,
    );

    const schedule = employeeProfile.step_2_checked
        ? CHECKBOX_WITHHOLDING_TABLES_2026[employeeProfile.federal_filing_status]
        : STANDARD_WITHHOLDING_TABLES_2026[employeeProfile.federal_filing_status];

    const tentativeAnnualWithholding = computeAnnualWithholding(adjustedAnnualWages, schedule);
    const dependentCreditsPerPeriod = employeeProfile.dependents_amount / payPeriods;

    return roundCurrency(
        Math.max(
            0,
            tentativeAnnualWithholding / payPeriods
            - dependentCreditsPerPeriod
            + employeeProfile.extra_withholding,
        ),
    );
}

function computeAnnualWithholding(
    adjustedAnnualWages: number,
    brackets: WithholdingBracket[],
): number {
    let activeBracket = brackets[0];

    for (const bracket of brackets) {
        if (adjustedAnnualWages >= bracket.threshold) {
            activeBracket = bracket;
        } else {
            break;
        }
    }

    return activeBracket.baseTax + (adjustedAnnualWages - activeBracket.threshold) * activeBracket.rate;
}

function calculateTaxWithWageBase(
    currentWages: number,
    priorWages: number,
    wageBase: number,
    rate: number,
): number {
    const remainingBase = Math.max(0, wageBase - priorWages);
    const taxableWages = Math.max(0, Math.min(currentWages, remainingBase));
    return roundCurrency(taxableWages * rate);
}

function calculateAdditionalMedicareTax(currentWages: number, priorWages: number): number {
    const thresholdRemaining = Math.max(0, ADDITIONAL_MEDICARE_THRESHOLD - priorWages);
    const taxableWages = Math.max(0, currentWages - thresholdRemaining);
    return roundCurrency(taxableWages * ADDITIONAL_MEDICARE_RATE);
}

function calculateStateWithholding(
    input: PayrollCalculationInput,
    grossPay: number,
    isW2: boolean,
): number {
    if (!isW2 || input.employeeProfile.state_exempt) {
        return 0;
    }

    const additionalWithholding = input.employeeProfile.state_additional_withholding;

    if (input.businessProfile.state_withholding_method === 'virginia_brackets') {
        const payPeriods = getPayPeriodsPerYear(input.businessProfile.pay_frequency);
        const annualizedGross = grossPay * payPeriods;
        const virginiaDeductions = VIRGINIA_STANDARD_DEDUCTION
            + (input.employeeProfile.state_personal_exemptions * VIRGINIA_PERSONAL_EXEMPTION_AMOUNT)
            + (input.employeeProfile.state_additional_exemptions * VIRGINIA_AGE_BLIND_EXEMPTION_AMOUNT);
        const annualizedTaxableIncome = Math.max(0, annualizedGross - virginiaDeductions);
        const annualVirginiaTax = calculateVirginiaAnnualTax(annualizedTaxableIncome);
        return roundCurrency(annualVirginiaTax / payPeriods + additionalWithholding);
    }

    if (input.businessProfile.state_withholding_method === 'custom_brackets') {
        const payPeriods = getPayPeriodsPerYear(input.businessProfile.pay_frequency);
        const annualizedGross = grossPay * payPeriods;
        const annualDeduction = Number(input.businessProfile.custom_state_standard_deduction || 0);
        const annualizedTaxableIncome = Math.max(0, annualizedGross - annualDeduction);
        const annualStateTax = calculateCustomStateAnnualTax(
            annualizedTaxableIncome,
            input.businessProfile.custom_state_brackets || [],
        );
        return roundCurrency(annualStateTax / payPeriods + additionalWithholding);
    }

    return roundCurrency(
        grossPay * normalizeRate(input.businessProfile.state_income_tax_rate) + additionalWithholding,
    );
}

function getStateAnnualDeduction(input: PayrollCalculationInput): number {
    if (input.businessProfile.state_withholding_method === 'virginia_brackets') {
        return VIRGINIA_STANDARD_DEDUCTION
            + (input.employeeProfile.state_personal_exemptions * VIRGINIA_PERSONAL_EXEMPTION_AMOUNT)
            + (input.employeeProfile.state_additional_exemptions * VIRGINIA_AGE_BLIND_EXEMPTION_AMOUNT);
    }

    if (input.businessProfile.state_withholding_method === 'custom_brackets') {
        return Number(input.businessProfile.custom_state_standard_deduction || 0);
    }

    return 0;
}

function normalizeRate(rate: number): number {
    if (rate > 1) {
        return rate / 100;
    }

    return rate;
}

function roundCurrency(value: number): number {
    return Math.round(value * 100) / 100;
}
