import {
    MEDICARE_RATE,
    SOCIAL_SECURITY_RATE,
    ADDITIONAL_MEDICARE_RATE,
    type EmployeePayrollProfile,
    type PayFrequency,
    type PayrollBusinessProfile,
    type StateWithholdingMethod,
    type TaxClassification,
} from './payroll';
import { formatCurrency } from './utils';

export interface PaystubAddress {
    address_line_1?: string | null;
    address_line_2?: string | null;
    city?: string | null;
    state?: string | null;
    postal_code?: string | null;
    country?: string | null;
}

export interface PaystubPayout {
    id: string;
    paid_at: string;
    period_start: string;
    period_end: string;
    hours_worked: number;
    hourly_rate: number;
    gross_pay: number;
    federal_withholding: number;
    social_security_tax: number;
    medicare_tax: number;
    additional_medicare_tax: number;
    state_withholding: number;
    local_withholding: number;
    contractor_backup_withholding: number;
    net_pay: number;
    employer_social_security_tax: number;
    employer_medicare_tax: number;
    employer_futa_tax: number;
    employer_suta_tax: number;
    payout_method: 'direct_deposit' | 'check' | 'cash' | 'other';
    check_number: string | null;
    notes: string | null;
}

export interface PaystubYtdTotals {
    grossPay: number;
    employeeWithheld: number;
    netPay: number;
    socialSecurityWages: number;
    medicareWages: number;
    federalWithholding: number;
    stateWithholding: number;
}

export interface PaystubHtmlInput {
    payout: PaystubPayout;
    employeeName: string;
    employeeAddress: PaystubAddress | null;
    employerName: string;
    employerFein: string | null;
    employerAddress: PaystubAddress | null;
    businessProfile: Pick<PayrollBusinessProfile, 'pay_frequency' | 'tax_state' | 'state_withholding_method' | 'state_income_tax_rate' | 'local_income_tax_rate' | 'state_unemployment_rate' | 'futa_rate'>;
    taxClassification: TaxClassification;
    ytdTotals: PaystubYtdTotals;
}

const BACKUP_WITHHOLDING_RATE = 0.24;

export function hasPaystubAddress(address: PaystubAddress | null | undefined): boolean {
    if (!address) return false;

    return [
        address.address_line_1,
        address.address_line_2,
        address.city,
        address.state,
        address.postal_code,
        address.country,
    ].some((part) => Boolean(part?.trim()));
}

export function formatPaystubAddressLines(address: PaystubAddress | null | undefined): string[] {
    if (!hasPaystubAddress(address)) {
        return ['Address not on file'];
    }

    const cityStatePostal = [
        [address?.city, address?.state].filter(Boolean).join(', '),
        address?.postal_code,
    ].filter(Boolean).join(' ');

    return [
        address?.address_line_1,
        address?.address_line_2,
        cityStatePostal,
        address?.country,
    ].filter((part): part is string => Boolean(part?.trim()));
}

export function formatPaystubPercent(value: number): string {
    const normalized = Math.abs(value) > 1 ? value : value * 100;
    return `${normalized.toFixed(4).replace(/\.?0+$/, '')}%`;
}

export function getPaystubShortCode(id: string): string {
    return id.slice(0, 8).toUpperCase();
}

export function getEmployeeWithholdingTotal(payout: Pick<PaystubPayout,
    | 'federal_withholding'
    | 'social_security_tax'
    | 'medicare_tax'
    | 'additional_medicare_tax'
    | 'state_withholding'
    | 'local_withholding'
    | 'contractor_backup_withholding'
>): number {
    return roundCurrency(
        Number(payout.federal_withholding || 0)
        + Number(payout.social_security_tax || 0)
        + Number(payout.medicare_tax || 0)
        + Number(payout.additional_medicare_tax || 0)
        + Number(payout.state_withholding || 0)
        + Number(payout.local_withholding || 0)
        + Number(payout.contractor_backup_withholding || 0),
    );
}

export function buildPaystubYtdTotals(
    payoutHistory: PaystubPayout[],
    targetPayout: PaystubPayout,
    employeeProfile: Pick<EmployeePayrollProfile,
        | 'prior_ytd_wages'
        | 'prior_ytd_social_security_wages'
        | 'prior_ytd_medicare_wages'
        | 'prior_ytd_federal_withheld'
        | 'prior_ytd_state_withheld'
    > | null,
): PaystubYtdTotals {
    const paidAt = new Date(targetPayout.paid_at);
    const year = paidAt.getFullYear();
    const paidAtMs = paidAt.getTime();
    const relevantPayouts = payoutHistory.filter((payout) => {
        const payoutDate = new Date(payout.paid_at);
        const payoutDateMs = payoutDate.getTime();
        return payoutDate.getFullYear() === year
            && Number.isFinite(payoutDateMs)
            && payoutDateMs <= paidAtMs;
    });

    const priorFederal = Number(employeeProfile?.prior_ytd_federal_withheld || 0);
    const priorState = Number(employeeProfile?.prior_ytd_state_withheld || 0);
    const currentFederal = relevantPayouts.reduce((sum, payout) => sum + Number(payout.federal_withholding || 0), 0);
    const currentState = relevantPayouts.reduce((sum, payout) => sum + Number(payout.state_withholding || 0), 0);

    return {
        grossPay: roundCurrency(Number(employeeProfile?.prior_ytd_wages || 0) + relevantPayouts.reduce((sum, payout) => sum + Number(payout.gross_pay || 0), 0)),
        employeeWithheld: roundCurrency(priorFederal + priorState + relevantPayouts.reduce((sum, payout) => sum + getEmployeeWithholdingTotal(payout), 0)),
        netPay: roundCurrency(relevantPayouts.reduce((sum, payout) => sum + Number(payout.net_pay || 0), 0)),
        socialSecurityWages: roundCurrency(Number(employeeProfile?.prior_ytd_social_security_wages || 0) + relevantPayouts.reduce((sum, payout) => sum + Number(payout.gross_pay || 0), 0)),
        medicareWages: roundCurrency(Number(employeeProfile?.prior_ytd_medicare_wages || 0) + relevantPayouts.reduce((sum, payout) => sum + Number(payout.gross_pay || 0), 0)),
        federalWithholding: roundCurrency(priorFederal + currentFederal),
        stateWithholding: roundCurrency(priorState + currentState),
    };
}

export function buildPaystubHtml(input: PaystubHtmlInput): string {
    const {
        payout,
        businessProfile,
        ytdTotals,
    } = input;
    const issueDate = formatDate(payout.paid_at);
    const periodText = `${formatDate(payout.period_start)} - ${formatDate(payout.period_end)}`;
    const paystubNumber = getPaystubShortCode(payout.id);
    const employeeWithheld = getEmployeeWithholdingTotal(payout);
    const employerTaxes = roundCurrency(
        payout.employer_social_security_tax
        + payout.employer_medicare_tax
        + payout.employer_futa_tax
        + payout.employer_suta_tax,
    );
    const employeeAddressLines = formatPaystubAddressLines(input.employeeAddress);
    const employerAddressLines = formatPaystubAddressLines(input.employerAddress);
    const stateRateLabel = getStateRateLabel(
        businessProfile.state_withholding_method,
        businessProfile.tax_state,
        businessProfile.state_income_tax_rate,
    );

    const employeeDeductions = [
        { label: 'Federal Income Tax', rate: 'IRS Pub. 15-T annual percentage method', current: payout.federal_withholding, ytd: ytdTotals.federalWithholding },
        { label: 'Social Security', rate: formatPaystubPercent(SOCIAL_SECURITY_RATE), current: payout.social_security_tax, ytd: null },
        { label: 'Medicare', rate: formatPaystubPercent(MEDICARE_RATE), current: payout.medicare_tax, ytd: null },
        { label: 'Additional Medicare', rate: `${formatPaystubPercent(ADDITIONAL_MEDICARE_RATE)} when applicable`, current: payout.additional_medicare_tax, ytd: null },
        { label: `${businessProfile.tax_state || 'State'} Withholding`, rate: stateRateLabel, current: payout.state_withholding, ytd: ytdTotals.stateWithholding },
        { label: 'Local Withholding', rate: formatPaystubPercent(businessProfile.local_income_tax_rate), current: payout.local_withholding, ytd: null },
        { label: '1099 Backup Withholding', rate: formatPaystubPercent(BACKUP_WITHHOLDING_RATE), current: payout.contractor_backup_withholding, ytd: null },
    ];

    const employerRows = [
        { label: 'Employer Social Security', rate: formatPaystubPercent(SOCIAL_SECURITY_RATE), current: payout.employer_social_security_tax },
        { label: 'Employer Medicare', rate: formatPaystubPercent(MEDICARE_RATE), current: payout.employer_medicare_tax },
        { label: 'Employer FUTA', rate: formatPaystubPercent(businessProfile.futa_rate), current: payout.employer_futa_tax },
        { label: 'Employer SUTA', rate: formatPaystubPercent(businessProfile.state_unemployment_rate), current: payout.employer_suta_tax },
    ];

    return `
        <!doctype html>
        <html>
        <head>
            <meta charset="utf-8" />
            <title>Paystub ${escapeHtml(paystubNumber)}</title>
            <style>
                * { box-sizing: border-box; }
                body { font-family: Arial, sans-serif; margin: 28px; color: #111827; font-size: 12px; }
                .header { display: flex; justify-content: space-between; gap: 20px; border-bottom: 3px solid #111827; padding-bottom: 14px; margin-bottom: 16px; }
                .title { font-size: 24px; font-weight: 800; margin: 0; letter-spacing: 0.02em; }
                .muted { color: #4b5563; }
                .strong { font-weight: 700; }
                .block-title { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 700; margin-bottom: 5px; }
                .identity-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; }
                .box { border: 1px solid #d1d5db; padding: 10px; min-height: 92px; }
                .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 14px; }
                .summary { border: 1px solid #d1d5db; padding: 8px; background: #f9fafb; }
                .summary-value { font-size: 15px; font-weight: 800; margin-top: 3px; }
                table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                th, td { border: 1px solid #d1d5db; padding: 7px 8px; text-align: left; vertical-align: top; }
                th { background: #f3f4f6; font-size: 11px; text-transform: uppercase; color: #374151; letter-spacing: 0.04em; }
                .text-right { text-align: right; }
                .total-row td { font-weight: 800; background: #f9fafb; }
                .net-row td { font-size: 14px; font-weight: 900; background: #111827; color: #ffffff; }
                .section-title { margin-top: 14px; font-size: 14px; font-weight: 800; }
                .note { margin-top: 12px; border: 1px solid #d1d5db; padding: 9px; white-space: pre-wrap; }
                .footer { margin-top: 14px; color: #6b7280; font-size: 10px; }
            </style>
        </head>
        <body>
            <div class="header">
                <div>
                    <h1 class="title">PAYSTUB</h1>
                    <div class="muted">Paystub #${escapeHtml(paystubNumber)}</div>
                </div>
                <div class="text-right">
                    <div class="block-title">Pay Date</div>
                    <div class="strong">${escapeHtml(issueDate)}</div>
                    <div class="muted">${escapeHtml(getPayFrequencyLabel(businessProfile.pay_frequency))}</div>
                </div>
            </div>

            <div class="identity-grid">
                <div class="box">
                    <div class="block-title">Employer</div>
                    <div class="strong">${escapeHtml(input.employerName)}</div>
                    ${input.employerFein ? `<div>FEIN: ${escapeHtml(input.employerFein)}</div>` : '<div class="muted">FEIN not on file</div>'}
                    ${addressLinesToHtml(employerAddressLines)}
                </div>
                <div class="box">
                    <div class="block-title">Employee</div>
                    <div class="strong">${escapeHtml(input.employeeName)}</div>
                    <div>${escapeHtml(input.taxClassification === '1099' ? '1099 Contractor' : 'W-2 Employee')}</div>
                    ${addressLinesToHtml(employeeAddressLines)}
                </div>
            </div>

            <div class="summary-grid">
                <div class="summary"><div class="block-title">Pay Period</div><div class="summary-value">${escapeHtml(periodText)}</div></div>
                <div class="summary"><div class="block-title">Hours</div><div class="summary-value">${formatHours(payout.hours_worked)}</div></div>
                <div class="summary"><div class="block-title">Rate</div><div class="summary-value">${escapeHtml(formatCurrency(payout.hourly_rate))}/hr</div></div>
                <div class="summary"><div class="block-title">Method</div><div class="summary-value">${escapeHtml(getPayoutMethodLabel(payout.payout_method))}${payout.check_number ? ` #${escapeHtml(payout.check_number)}` : ''}</div></div>
            </div>

            <table>
                <thead>
                    <tr>
                        <th>Earnings</th>
                        <th class="text-right">Hours</th>
                        <th class="text-right">Rate</th>
                        <th class="text-right">Current</th>
                        <th class="text-right">YTD</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>Regular Pay</td>
                        <td class="text-right">${escapeHtml(formatHours(payout.hours_worked))}</td>
                        <td class="text-right">${escapeHtml(formatCurrency(payout.hourly_rate))}</td>
                        <td class="text-right">${escapeHtml(formatCurrency(payout.gross_pay))}</td>
                        <td class="text-right">${escapeHtml(formatCurrency(ytdTotals.grossPay))}</td>
                    </tr>
                </tbody>
            </table>

            <div class="section-title">Employee Taxes & Withholdings</div>
            <table>
                <thead>
                    <tr>
                        <th>Description</th>
                        <th>Rate / Basis</th>
                        <th class="text-right">Current</th>
                        <th class="text-right">YTD</th>
                    </tr>
                </thead>
                <tbody>
                    ${employeeDeductions.map((row) => `
                        <tr>
                            <td>${escapeHtml(row.label)}</td>
                            <td>${escapeHtml(row.rate)}</td>
                            <td class="text-right">-${escapeHtml(formatCurrency(row.current))}</td>
                            <td class="text-right">${row.ytd === null ? '-' : escapeHtml(formatCurrency(row.ytd))}</td>
                        </tr>
                    `).join('')}
                    <tr class="total-row">
                        <td>Total Employee Withholdings</td>
                        <td></td>
                        <td class="text-right">-${escapeHtml(formatCurrency(employeeWithheld))}</td>
                        <td class="text-right">${escapeHtml(formatCurrency(ytdTotals.employeeWithheld))}</td>
                    </tr>
                    <tr class="net-row">
                        <td>Net Pay</td>
                        <td>Gross minus employee withholdings</td>
                        <td class="text-right">${escapeHtml(formatCurrency(payout.net_pay))}</td>
                        <td class="text-right">${escapeHtml(formatCurrency(ytdTotals.netPay))}</td>
                    </tr>
                </tbody>
            </table>

            <div class="section-title">Taxable Wage Bases</div>
            <table>
                <thead>
                    <tr>
                        <th>Basis</th>
                        <th class="text-right">YTD Wages</th>
                    </tr>
                </thead>
                <tbody>
                    <tr><td>Social Security Wages</td><td class="text-right">${escapeHtml(formatCurrency(ytdTotals.socialSecurityWages))}</td></tr>
                    <tr><td>Medicare Wages</td><td class="text-right">${escapeHtml(formatCurrency(ytdTotals.medicareWages))}</td></tr>
                </tbody>
            </table>

            <div class="section-title">Employer Tax Summary</div>
            <table>
                <thead>
                    <tr>
                        <th>Description</th>
                        <th>Rate / Basis</th>
                        <th class="text-right">Current</th>
                    </tr>
                </thead>
                <tbody>
                    ${employerRows.map((row) => `
                        <tr>
                            <td>${escapeHtml(row.label)}</td>
                            <td>${escapeHtml(row.rate)}</td>
                            <td class="text-right">${escapeHtml(formatCurrency(row.current))}</td>
                        </tr>
                    `).join('')}
                    <tr class="total-row"><td>Total Employer Taxes</td><td></td><td class="text-right">${escapeHtml(formatCurrency(employerTaxes))}</td></tr>
                </tbody>
            </table>

            ${payout.notes ? `<div class="note"><strong>Notes:</strong> ${escapeHtml(payout.notes)}</div>` : ''}
            <div class="footer">Employer taxes are shown for payroll transparency and are not deducted from employee net pay.</div>
        </body>
        </html>
    `;
}

function getStateRateLabel(method: StateWithholdingMethod, taxState: string, stateRate: number): string {
    if (method === 'virginia_brackets') {
        return 'Virginia bracket schedule';
    }

    if (method === 'custom_brackets') {
        return `${taxState || 'State'} custom brackets`;
    }

    return formatPaystubPercent(stateRate);
}

function getPayFrequencyLabel(frequency: PayFrequency): string {
    if (frequency === 'weekly') return 'Weekly payroll';
    if (frequency === 'biweekly') return 'Biweekly payroll';
    if (frequency === 'semimonthly') return 'Semimonthly payroll';
    return 'Monthly payroll';
}

function getPayoutMethodLabel(method: PaystubPayout['payout_method']): string {
    if (method === 'direct_deposit') return 'Direct Deposit';
    if (method === 'check') return 'Check';
    if (method === 'cash') return 'Cash';
    return 'Other';
}

function addressLinesToHtml(lines: string[]): string {
    return `<div class="muted" style="margin-top: 6px;">${lines.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}</div>`;
}

function formatDate(value: string): string {
    const [datePart] = value.split('T');
    if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
        const [year, month, day] = datePart.split('-').map(Number);
        return new Date(year, month - 1, day).toLocaleDateString();
    }

    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) {
        return value;
    }

    return date.toLocaleDateString();
}

function formatHours(hours: number): string {
    return `${Number(hours || 0).toFixed(1)} h`;
}

function roundCurrency(value: number): number {
    return Math.round(value * 100) / 100;
}

function escapeHtml(value: string | number): string {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
