import { useCallback, useEffect, useMemo, useState } from 'react';
import { Header } from '../components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { EmptyState, UsersIcon } from '../components/ui/EmptyState';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { Modal, ModalFooter } from '../components/ui/Modal';
import { useEmployees } from '../hooks/useEmployees';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { supabase } from '../lib/supabase';
import {
    calculatePayroll,
    getDefaultPayrollDateRange,
    type EmployeePayrollProfile,
    type FederalFilingStatus,
    type PayrollBusinessProfile,
    type PayrollCalculationResult,
    type PayFrequency,
    type StateWithholdingMethod,
    type TaxClassification,
} from '../lib/payroll';
import { formatCurrency } from '../lib/utils';
import type { EmployeeWithStats } from '../types/employee';

interface EmployeePayoutRow {
    id: string;
    employee_id: string;
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

interface WizardStepState {
    current: 1 | 2;
    complete: boolean;
}

interface LatestPayoutSnapshot {
    paidAt: string;
    grossPay: number;
    netPay: number;
}

type EmployeePayoutMethod = 'direct_deposit' | 'check' | 'cash' | 'other';

interface PayrollBusinessProfileForm {
    employer: 'Ravenlia' | 'Alywillow';
    legal_name: string;
    fein: string;
    tax_state: string;
    state_withholding_method: StateWithholdingMethod;
    pay_frequency: PayFrequency;
    state_income_tax_rate: number;
    local_income_tax_rate: number;
    state_unemployment_rate: number;
    state_unemployment_wage_base: number;
    futa_rate: number;
}

interface EmployeePayrollProfileForm {
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

function toDateInput(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function parseDateInput(value: string, endOfDay = false): Date {
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    if (endOfDay) {
        date.setHours(23, 59, 59, 999);
    } else {
        date.setHours(0, 0, 0, 0);
    }
    return date;
}

function numberValue(value: string): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function getDefaultBusinessForm(employer: 'Ravenlia' | 'Alywillow'): PayrollBusinessProfileForm {
    return {
        employer,
        legal_name: employer,
        fein: '',
        tax_state: 'VA',
        state_withholding_method: 'custom_rate',
        pay_frequency: 'biweekly',
        state_income_tax_rate: 0,
        local_income_tax_rate: 0,
        state_unemployment_rate: 0,
        state_unemployment_wage_base: 7000,
        futa_rate: 0.006,
    };
}

function getDefaultEmployeePayrollForm(): EmployeePayrollProfileForm {
    return {
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
    };
}

function mapBusinessProfileToForm(profile: PayrollBusinessProfile): PayrollBusinessProfileForm {
    return {
        employer: profile.employer,
        legal_name: profile.legal_name,
        fein: profile.fein || '',
        tax_state: profile.tax_state,
        state_withholding_method: profile.state_withholding_method || 'custom_rate',
        pay_frequency: profile.pay_frequency,
        state_income_tax_rate: profile.state_income_tax_rate,
        local_income_tax_rate: profile.local_income_tax_rate,
        state_unemployment_rate: profile.state_unemployment_rate,
        state_unemployment_wage_base: profile.state_unemployment_wage_base,
        futa_rate: profile.futa_rate,
    };
}

function mapEmployeeProfileToForm(profile: EmployeePayrollProfile): EmployeePayrollProfileForm {
    return {
        tax_classification: profile.tax_classification,
        federal_filing_status: profile.federal_filing_status,
        step_2_checked: profile.step_2_checked,
        dependents_amount: profile.dependents_amount,
        other_income: profile.other_income,
        deductions: profile.deductions,
        extra_withholding: profile.extra_withholding,
        federal_exempt: profile.federal_exempt,
        state_exempt: profile.state_exempt,
        state_additional_withholding: profile.state_additional_withholding,
        state_personal_exemptions: profile.state_personal_exemptions ?? 0,
        state_additional_exemptions: profile.state_additional_exemptions ?? 0,
        backup_withholding_enabled: profile.backup_withholding_enabled,
        prior_ytd_wages: profile.prior_ytd_wages,
        prior_ytd_social_security_wages: profile.prior_ytd_social_security_wages,
        prior_ytd_medicare_wages: profile.prior_ytd_medicare_wages,
        prior_ytd_federal_withheld: profile.prior_ytd_federal_withheld,
        prior_ytd_state_withheld: profile.prior_ytd_state_withheld,
    };
}

function getCurrentYearYtd(payoutHistory: EmployeePayoutRow[]) {
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);

    return payoutHistory.reduce(
        (acc, payout) => {
            const paidAt = new Date(payout.paid_at);
            if (paidAt < yearStart) return acc;

            const nextWages = acc.wages + Number(payout.gross_pay || 0);
            return {
                wages: nextWages,
                socialSecurityWages: nextWages,
                medicareWages: nextWages,
            };
        },
        {
            wages: 0,
            socialSecurityWages: 0,
            medicareWages: 0,
        },
    );
}

export function EmployeePayouts() {
    const { employees, isLoading, error } = useEmployees();
    const { user } = useAuth();
    const toast = useToast();

    const [searchQuery, setSearchQuery] = useState('');
    const [latestPayouts, setLatestPayouts] = useState<Record<string, LatestPayoutSnapshot>>({});

    const [activeEmployee, setActiveEmployee] = useState<EmployeeWithStats | null>(null);
    const [modalOpen, setModalOpen] = useState(false);
    const [isLoadingModalData, setIsLoadingModalData] = useState(false);
    const [isSavingWizard, setIsSavingWizard] = useState(false);
    const [isRecordingPayout, setIsRecordingPayout] = useState(false);

    const [businessProfile, setBusinessProfile] = useState<PayrollBusinessProfile | null>(null);
    const [employeePayrollProfile, setEmployeePayrollProfile] = useState<EmployeePayrollProfile | null>(null);
    const [businessForm, setBusinessForm] = useState<PayrollBusinessProfileForm>(getDefaultBusinessForm('Ravenlia'));
    const [employeePayrollForm, setEmployeePayrollForm] = useState<EmployeePayrollProfileForm>(getDefaultEmployeePayrollForm());
    const [wizard, setWizard] = useState<WizardStepState>({ current: 1, complete: true });

    const [periodStart, setPeriodStart] = useState(() => toDateInput(new Date()));
    const [periodEnd, setPeriodEnd] = useState(() => toDateInput(new Date()));
    const [hoursWorked, setHoursWorked] = useState(0);
    const [hourlyRate, setHourlyRate] = useState(0);
    const [payoutMethod, setPayoutMethod] = useState<EmployeePayoutMethod>('direct_deposit');
    const [checkNumber, setCheckNumber] = useState('');
    const [payoutNotes, setPayoutNotes] = useState('');
    const [payoutHistory, setPayoutHistory] = useState<EmployeePayoutRow[]>([]);
    const [selectedHistoryPayout, setSelectedHistoryPayout] = useState<EmployeePayoutRow | null>(null);

    const [hoursLoadStatus, setHoursLoadStatus] = useState<'idle' | 'loading' | 'error'>('idle');

    const filteredEmployees = useMemo(() => {
        if (!searchQuery.trim()) return employees;

        const query = searchQuery.toLowerCase().trim();
        return employees.filter((employee) => {
            const employer = employee.employer || '';
            return employee.name.toLowerCase().includes(query) || employer.toLowerCase().includes(query);
        });
    }, [employees, searchQuery]);

    const calculation: PayrollCalculationResult | null = useMemo(() => {
        if (!businessProfile || !employeePayrollProfile) return null;
        if (hoursWorked <= 0 || hourlyRate < 0) return null;

        return calculatePayroll({
            hourlyRate,
            hoursWorked,
            businessProfile,
            employeeProfile: employeePayrollProfile,
            ytdTotals: getCurrentYearYtd(payoutHistory),
        });
    }, [businessProfile, employeePayrollProfile, hourlyRate, hoursWorked, payoutHistory]);

    const refreshLatestPayouts = useCallback(async () => {
        const { data, error: payoutError } = await supabase
            .from('employee_payouts')
            .select('id, employee_id, paid_at, gross_pay, net_pay')
            .order('paid_at', { ascending: false });

        if (payoutError) {
            console.error('Failed to load latest employee payouts', payoutError);
            return;
        }

        const snapshots: Record<string, LatestPayoutSnapshot> = {};
        for (const row of data || []) {
            if (snapshots[row.employee_id]) continue;
            snapshots[row.employee_id] = {
                paidAt: row.paid_at,
                grossPay: Number(row.gross_pay || 0),
                netPay: Number(row.net_pay || 0),
            };
        }

        setLatestPayouts(snapshots);
    }, []);

    useEffect(() => {
        refreshLatestPayouts();
    }, [refreshLatestPayouts]);

    const loadEmployeeHours = useCallback(async (employeeId: string, start: string, end: string) => {
        setHoursLoadStatus('loading');

        const startDate = parseDateInput(start);
        const endDate = parseDateInput(end, true);

        const { data, error: timeError } = await supabase
            .from('time_entries')
            .select('total_hours')
            .eq('employee_id', employeeId)
            .gte('clock_in', startDate.toISOString())
            .lte('clock_in', endDate.toISOString())
            .not('total_hours', 'is', null);

        if (timeError) {
            setHoursLoadStatus('error');
            toast.error('Could not load timecard hours', timeError.message);
            return;
        }

        const totalHours = (data || []).reduce((sum, entry) => sum + Number(entry.total_hours || 0), 0);
        setHoursWorked(Math.round(totalHours * 100) / 100);
        setHoursLoadStatus('idle');
    }, [toast]);

    const loadPayoutHistory = useCallback(async (employeeId: string) => {
        const { data, error: historyError } = await supabase
            .from('employee_payouts')
            .select(`
                id,
                employee_id,
                paid_at,
                period_start,
                period_end,
                hours_worked,
                hourly_rate,
                gross_pay,
                federal_withholding,
                social_security_tax,
                medicare_tax,
                additional_medicare_tax,
                state_withholding,
                local_withholding,
                contractor_backup_withholding,
                net_pay,
                employer_social_security_tax,
                employer_medicare_tax,
                employer_futa_tax,
                employer_suta_tax,
                payout_method,
                check_number,
                notes
            `)
            .eq('employee_id', employeeId)
            .order('paid_at', { ascending: false })
            .limit(20);

        if (historyError) {
            toast.error('Could not load payout history', historyError.message);
            setPayoutHistory([]);
            return;
        }

        setPayoutHistory((data || []) as EmployeePayoutRow[]);
    }, [toast]);

    const openPayoutModal = useCallback(async (employee: EmployeeWithStats) => {
        setActiveEmployee(employee);
        setModalOpen(true);
        setIsLoadingModalData(true);

        const employer = (employee.employer || 'Ravenlia') as 'Ravenlia' | 'Alywillow';
        const defaultBusinessForm = getDefaultBusinessForm(employer);
        const defaultEmployeeForm = getDefaultEmployeePayrollForm();

        setBusinessProfile(null);
        setEmployeePayrollProfile(null);
        setBusinessForm(defaultBusinessForm);
        setEmployeePayrollForm(defaultEmployeeForm);
        setPayoutNotes('');
        setPayoutMethod('direct_deposit');
        setCheckNumber('');
        setSelectedHistoryPayout(null);
        setHourlyRate(Number(employee.hourly_rate || 0));

        const { data: businessData, error: businessError } = await supabase
            .from('payroll_business_profiles')
            .select('*')
            .eq('employer', employer)
            .maybeSingle();

        if (businessError) {
            toast.error('Could not load business payroll setup', businessError.message);
        }

        const { data: payrollProfileData, error: payrollProfileError } = await supabase
            .from('employee_payroll_profiles')
            .select('*')
            .eq('employee_id', employee.id)
            .maybeSingle();

        if (payrollProfileError) {
            toast.error('Could not load employee payroll setup', payrollProfileError.message);
        }

        const business = (businessData || null) as PayrollBusinessProfile | null;
        const employeeProfile = (payrollProfileData || null) as EmployeePayrollProfile | null;

        if (business) {
            setBusinessProfile(business);
            setBusinessForm(mapBusinessProfileToForm(business));

            const dates = getDefaultPayrollDateRange(business.pay_frequency);
            const startInput = toDateInput(dates.start);
            const endInput = toDateInput(dates.end);
            setPeriodStart(startInput);
            setPeriodEnd(endInput);
            await loadEmployeeHours(employee.id, startInput, endInput);
        } else {
            const today = new Date();
            const startInput = toDateInput(today);
            const endInput = toDateInput(today);
            setPeriodStart(startInput);
            setPeriodEnd(endInput);
            setHoursWorked(0);
        }

        if (employeeProfile) {
            setEmployeePayrollProfile(employeeProfile);
            setEmployeePayrollForm(mapEmployeeProfileToForm(employeeProfile));
        }

        await loadPayoutHistory(employee.id);

        if (!business) {
            setWizard({ current: 1, complete: false });
        } else if (!employeeProfile) {
            setWizard({ current: 2, complete: false });
        } else {
            setWizard({ current: 1, complete: true });
        }

        setIsLoadingModalData(false);
    }, [loadEmployeeHours, loadPayoutHistory, toast]);

    const closePayoutModal = () => {
        setModalOpen(false);
        setActiveEmployee(null);
        setBusinessProfile(null);
        setEmployeePayrollProfile(null);
        setPayoutHistory([]);
        setHoursWorked(0);
        setCheckNumber('');
        setSelectedHistoryPayout(null);
    };

    const handleBusinessProfileSave = async () => {
        if (!activeEmployee) return;

        if (!businessForm.legal_name.trim()) {
            toast.warning('Legal business name is required');
            return;
        }

        setIsSavingWizard(true);

        const payload = {
            employer: businessForm.employer,
            legal_name: businessForm.legal_name.trim(),
            fein: businessForm.fein.trim() || null,
            tax_state: businessForm.tax_state.trim().toUpperCase(),
            state_withholding_method: businessForm.state_withholding_method,
            pay_frequency: businessForm.pay_frequency,
            state_income_tax_rate: businessForm.state_income_tax_rate,
            local_income_tax_rate: businessForm.local_income_tax_rate,
            state_unemployment_rate: businessForm.state_unemployment_rate,
            state_unemployment_wage_base: businessForm.state_unemployment_wage_base,
            futa_rate: businessForm.futa_rate,
        };

        const { data, error: upsertError } = await supabase
            .from('payroll_business_profiles')
            .upsert(payload, { onConflict: 'employer' })
            .select('*')
            .single();

        if (upsertError) {
            setIsSavingWizard(false);
            toast.error('Could not save business payroll setup', upsertError.message);
            return;
        }

        const saved = data as PayrollBusinessProfile;
        setBusinessProfile(saved);

        const dates = getDefaultPayrollDateRange(saved.pay_frequency);
        const startInput = toDateInput(dates.start);
        const endInput = toDateInput(dates.end);
        setPeriodStart(startInput);
        setPeriodEnd(endInput);
        await loadEmployeeHours(activeEmployee.id, startInput, endInput);

        setWizard({ current: 2, complete: false });
        setIsSavingWizard(false);
        toast.success('Business tax setup saved');
    };

    const handleEmployeePayrollProfileSave = async () => {
        if (!activeEmployee) return;

        setIsSavingWizard(true);

        const payload = {
            employee_id: activeEmployee.id,
            tax_classification: employeePayrollForm.tax_classification,
            federal_filing_status: employeePayrollForm.federal_filing_status,
            step_2_checked: employeePayrollForm.step_2_checked,
            dependents_amount: employeePayrollForm.dependents_amount,
            other_income: employeePayrollForm.other_income,
            deductions: employeePayrollForm.deductions,
            extra_withholding: employeePayrollForm.extra_withholding,
            federal_exempt: employeePayrollForm.federal_exempt,
            state_exempt: employeePayrollForm.state_exempt,
            state_additional_withholding: employeePayrollForm.state_additional_withholding,
            state_personal_exemptions: employeePayrollForm.state_personal_exemptions,
            state_additional_exemptions: employeePayrollForm.state_additional_exemptions,
            backup_withholding_enabled: employeePayrollForm.backup_withholding_enabled,
            prior_ytd_wages: employeePayrollForm.prior_ytd_wages,
            prior_ytd_social_security_wages: employeePayrollForm.prior_ytd_social_security_wages,
            prior_ytd_medicare_wages: employeePayrollForm.prior_ytd_medicare_wages,
            prior_ytd_federal_withheld: employeePayrollForm.prior_ytd_federal_withheld,
            prior_ytd_state_withheld: employeePayrollForm.prior_ytd_state_withheld,
        };

        const { data, error: upsertError } = await supabase
            .from('employee_payroll_profiles')
            .upsert(payload, { onConflict: 'employee_id' })
            .select('*')
            .single();

        if (upsertError) {
            setIsSavingWizard(false);
            toast.error('Could not save employee payroll setup', upsertError.message);
            return;
        }

        setEmployeePayrollProfile(data as EmployeePayrollProfile);
        setWizard({ current: 1, complete: true });
        setIsSavingWizard(false);
        toast.success('Employee payroll setup saved');
    };

    const handleRecordPayout = async () => {
        if (!activeEmployee || !businessProfile || !employeePayrollProfile || !calculation) return;

        if (hoursWorked <= 0) {
            toast.warning('Hours worked must be greater than 0');
            return;
        }
        if (payoutMethod === 'check' && !checkNumber.trim()) {
            toast.warning('Enter a check number for check payouts');
            return;
        }

        setIsRecordingPayout(true);

        const payload = {
            employee_id: activeEmployee.id,
            business_profile_id: businessProfile.id,
            payroll_profile_id: employeePayrollProfile.id,
            period_start: periodStart,
            period_end: periodEnd,
            hours_worked: hoursWorked,
            hourly_rate: hourlyRate,
            gross_pay: calculation.grossPay,
            federal_withholding: calculation.federalWithholding,
            social_security_tax: calculation.socialSecurityTax,
            medicare_tax: calculation.medicareTax,
            additional_medicare_tax: calculation.additionalMedicareTax,
            state_withholding: calculation.stateWithholding,
            local_withholding: calculation.localWithholding,
            contractor_backup_withholding: calculation.contractorBackupWithholding,
            net_pay: calculation.netPay,
            employer_social_security_tax: calculation.employerSocialSecurityTax,
            employer_medicare_tax: calculation.employerMedicareTax,
            employer_futa_tax: calculation.employerFutaTax,
            employer_suta_tax: calculation.employerSutaTax,
            tax_breakdown: {
                federal_filing_status: employeePayrollProfile.federal_filing_status,
                tax_classification: employeePayrollProfile.tax_classification,
                pay_frequency: businessProfile.pay_frequency,
                ytd_from_recorded_payouts: getCurrentYearYtd(payoutHistory),
            },
            payout_method: payoutMethod,
            check_number: payoutMethod === 'check' ? checkNumber.trim() : null,
            notes: payoutNotes.trim() || null,
            created_by_admin_id: user?.id || null,
        };

        const { error: insertError } = await supabase.from('employee_payouts').insert(payload);

        if (insertError) {
            setIsRecordingPayout(false);
            toast.error('Could not record payout', insertError.message);
            return;
        }

        await loadPayoutHistory(activeEmployee.id);
        await refreshLatestPayouts();

        if (payoutMethod !== 'check') {
            setCheckNumber('');
        }
        setPayoutNotes('');
        setIsRecordingPayout(false);
        toast.success('Employee payout recorded');
    };

    const handlePrintPayoutStatement = (row: EmployeePayoutRow) => {
        if (!activeEmployee || !businessProfile) {
            toast.warning('Open this employee payroll modal before printing');
            return;
        }

        const issueDate = new Date(row.paid_at).toLocaleDateString();
        const periodText = `${new Date(row.period_start).toLocaleDateString()} - ${new Date(row.period_end).toLocaleDateString()}`;
        const methodLabel = getPayoutMethodLabel(row.payout_method);
        const checkLine = row.check_number ? `Check #: ${row.check_number}` : '';

        const html = `
            <!doctype html>
            <html>
            <head>
                <meta charset="utf-8" />
                <title>Employee Payout Statement</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 24px; color: #111827; }
                    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
                    .title { font-size: 20px; font-weight: 700; margin: 0; }
                    .subtitle { font-size: 12px; color: #4b5563; margin-top: 4px; }
                    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
                    .card { border: 1px solid #d1d5db; border-radius: 8px; padding: 10px; }
                    .label { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 2px; }
                    .value { font-size: 14px; font-weight: 600; }
                    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 10px; }
                    th, td { border: 1px solid #e5e7eb; padding: 7px 8px; text-align: left; }
                    th { background: #f3f4f6; font-weight: 700; }
                    .text-right { text-align: right; }
                    .total { font-weight: 700; background: #f9fafb; }
                    .note { margin-top: 10px; font-size: 12px; color: #374151; white-space: pre-wrap; }
                </style>
            </head>
            <body>
                <div class="header">
                    <div>
                        <h1 class="title">Employee Payout Statement</h1>
                        <div class="subtitle">${businessProfile.legal_name}</div>
                    </div>
                    <div class="subtitle">Issued: ${issueDate}</div>
                </div>

                <div class="grid">
                    <div class="card">
                        <div class="label">Employee</div>
                        <div class="value">${activeEmployee.name}</div>
                    </div>
                    <div class="card">
                        <div class="label">Pay Period</div>
                        <div class="value">${periodText}</div>
                    </div>
                    <div class="card">
                        <div class="label">Payout Method</div>
                        <div class="value">${methodLabel}${checkLine ? ` (${checkLine})` : ''}</div>
                    </div>
                    <div class="card">
                        <div class="label">Hours x Rate</div>
                        <div class="value">${row.hours_worked.toFixed(2)} x ${formatCurrency(row.hourly_rate)}</div>
                    </div>
                </div>

                <table>
                    <thead>
                        <tr>
                            <th>Description</th>
                            <th class="text-right">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr><td>Gross Pay</td><td class="text-right">${formatCurrency(row.gross_pay)}</td></tr>
                        <tr><td>Federal Withholding</td><td class="text-right">-${formatCurrency(row.federal_withholding)}</td></tr>
                        <tr><td>Social Security</td><td class="text-right">-${formatCurrency(row.social_security_tax)}</td></tr>
                        <tr><td>Medicare</td><td class="text-right">-${formatCurrency(row.medicare_tax)}</td></tr>
                        <tr><td>Additional Medicare</td><td class="text-right">-${formatCurrency(row.additional_medicare_tax)}</td></tr>
                        <tr><td>State Withholding</td><td class="text-right">-${formatCurrency(row.state_withholding)}</td></tr>
                        <tr><td>Local Withholding</td><td class="text-right">-${formatCurrency(row.local_withholding)}</td></tr>
                        <tr><td>1099 Backup Withholding</td><td class="text-right">-${formatCurrency(row.contractor_backup_withholding)}</td></tr>
                        <tr class="total"><td>Net Pay</td><td class="text-right">${formatCurrency(row.net_pay)}</td></tr>
                    </tbody>
                </table>

                <table>
                    <thead>
                        <tr>
                            <th>Employer Tax Summary</th>
                            <th class="text-right">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr><td>Employer Social Security</td><td class="text-right">${formatCurrency(row.employer_social_security_tax)}</td></tr>
                        <tr><td>Employer Medicare</td><td class="text-right">${formatCurrency(row.employer_medicare_tax)}</td></tr>
                        <tr><td>Employer FUTA</td><td class="text-right">${formatCurrency(row.employer_futa_tax)}</td></tr>
                        <tr><td>Employer SUTA</td><td class="text-right">${formatCurrency(row.employer_suta_tax)}</td></tr>
                    </tbody>
                </table>

                ${row.notes ? `<div class="note"><strong>Notes:</strong> ${row.notes}</div>` : ''}
            </body>
            </html>
        `;

        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            toast.error('Unable to open print window');
            return;
        }

        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.onload = () => {
            printWindow.focus();
            printWindow.print();
        };
    };

    return (
        <div className="animate-fadeIn">
            <Header
                title="Employee Payouts"
                description="Run employee payroll calculations and record payout history."
                actions={
                    <div className="text-xs text-[var(--color-muted)] max-w-sm">
                        Federal withholding and FICA are calculated automatically. State and local taxes are based on your configured rates.
                    </div>
                }
            />

            <Card variant="outlined" className="mb-5">
                <CardContent className="p-4">
                    <Input
                        label="Search employees"
                        placeholder="Name or employer"
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                    />
                </CardContent>
            </Card>

            {isLoading ? (
                <div className="flex items-center justify-center h-72">
                    <LoadingSpinner size={32} />
                </div>
            ) : error ? (
                <Card variant="outlined">
                    <CardContent className="p-6 text-[var(--color-danger)]">{error}</CardContent>
                </Card>
            ) : filteredEmployees.length === 0 ? (
                <Card variant="outlined">
                    <CardContent>
                        <EmptyState
                            icon={<UsersIcon size={44} />}
                            title="No employees found"
                            description="Try a different search or create an employee account first."
                        />
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {filteredEmployees.map((employee) => {
                        const latest = latestPayouts[employee.id];
                        return (
                            <Card key={employee.id} variant="outlined" className="h-full">
                                <CardHeader className="mb-2">
                                    <CardTitle className="text-base">{employee.name}</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-[var(--color-muted)]">Employer</span>
                                        <span>{employee.employer || 'Not set'}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-[var(--color-muted)]">Hourly Rate</span>
                                        <span>{formatCurrency(employee.hourly_rate)}/hr</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-[var(--color-muted)]">This Week</span>
                                        <span>{employee.weeklyHours.toFixed(2)} h</span>
                                    </div>
                                    {latest ? (
                                        <>
                                            <div className="flex justify-between">
                                                <span className="text-[var(--color-muted)]">Last Payout</span>
                                                <span>{new Date(latest.paidAt).toLocaleDateString()}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-[var(--color-muted)]">Last Net</span>
                                                <span className="font-semibold">{formatCurrency(latest.netPay)}</span>
                                            </div>
                                        </>
                                    ) : (
                                        <p className="text-xs text-[var(--color-muted)]">No payout history yet</p>
                                    )}

                                    <Button className="w-full mt-3" onClick={() => openPayoutModal(employee)}>
                                        Open Payout
                                    </Button>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}

            <Modal
                isOpen={modalOpen}
                onClose={closePayoutModal}
                size="4xl"
                closeOnOverlayClick={false}
                closeOnEscape={false}
            >
                <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                        <h2 className="text-xl font-semibold">{activeEmployee?.name || 'Employee'} Payroll</h2>
                        <p className="text-sm text-[var(--color-muted)] mt-1">
                            Configure payroll once, then generate and record payouts.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={closePayoutModal}
                        className="p-2 rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-surface)]"
                        aria-label="Close payout modal"
                        title="Close"
                    >
                        <CloseIcon />
                    </button>
                </div>

                {isLoadingModalData ? (
                    <div className="flex items-center justify-center h-52">
                        <LoadingSpinner size={28} />
                    </div>
                ) : (
                    <>
                        {!wizard.complete ? (
                            <div className="space-y-4">
                                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm">
                                    Step {wizard.current} of 2
                                </div>

                                {wizard.current === 1 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <Select
                                            label="Employer"
                                            value={businessForm.employer}
                                            onChange={(event) => {
                                                const employer = event.target.value as 'Ravenlia' | 'Alywillow';
                                                setBusinessForm((prev) => ({ ...prev, employer, legal_name: prev.legal_name || employer }));
                                            }}
                                            options={[
                                                { value: 'Ravenlia', label: 'Ravenlia' },
                                                { value: 'Alywillow', label: 'Alywillow' },
                                            ]}
                                        />
                                        <Input
                                            label="Legal Business Name"
                                            value={businessForm.legal_name}
                                            onChange={(event) => setBusinessForm((prev) => ({ ...prev, legal_name: event.target.value }))}
                                        />
                                        <Input
                                            label="FEIN (optional)"
                                            value={businessForm.fein}
                                            onChange={(event) => setBusinessForm((prev) => ({ ...prev, fein: event.target.value }))}
                                        />
                                        <Select
                                            label="State Withholding Method"
                                            value={businessForm.state_withholding_method}
                                            onChange={(event) => {
                                                const method = event.target.value as StateWithholdingMethod;
                                                setBusinessForm((prev) => ({
                                                    ...prev,
                                                    state_withholding_method: method,
                                                    tax_state: method === 'virginia_brackets' ? 'VA' : prev.tax_state,
                                                }));
                                            }}
                                            options={[
                                                { value: 'custom_rate', label: 'Custom Rate' },
                                                { value: 'virginia_brackets', label: 'Virginia Brackets' },
                                            ]}
                                        />
                                        {businessForm.state_withholding_method === 'custom_rate' ? (
                                            <Input
                                                label="Tax State"
                                                value={businessForm.tax_state}
                                                maxLength={2}
                                                onChange={(event) => setBusinessForm((prev) => ({ ...prev, tax_state: event.target.value.toUpperCase() }))}
                                            />
                                        ) : (
                                            <Input
                                                label="Tax State"
                                                value="VA"
                                                readOnly
                                                hint="Virginia bracket schedule selected."
                                            />
                                        )}
                                        <Select
                                            label="Pay Frequency"
                                            value={businessForm.pay_frequency}
                                            onChange={(event) => setBusinessForm((prev) => ({ ...prev, pay_frequency: event.target.value as PayFrequency }))}
                                            options={[
                                                { value: 'weekly', label: 'Weekly' },
                                                { value: 'biweekly', label: 'Biweekly' },
                                                { value: 'semimonthly', label: 'Semimonthly' },
                                                { value: 'monthly', label: 'Monthly' },
                                            ]}
                                        />
                                        {businessForm.state_withholding_method === 'custom_rate' ? (
                                            <Input
                                                label="State Income Tax Rate"
                                                type="number"
                                                step="0.0001"
                                                value={businessForm.state_income_tax_rate}
                                                onChange={(event) => setBusinessForm((prev) => ({ ...prev, state_income_tax_rate: numberValue(event.target.value) }))}
                                                hint="Use decimal (0.05) or percent style (5)."
                                            />
                                        ) : (
                                            <Input
                                                label="State Income Tax"
                                                value="Virginia Tax Rate Schedule (2% / 3% / 5% / 5.75%)"
                                                readOnly
                                                hint="Uses Virginia schedule on annualized wages and rounds annual tax to whole dollars."
                                            />
                                        )}
                                        <Input
                                            label="Local Income Tax Rate"
                                            type="number"
                                            step="0.0001"
                                            value={businessForm.local_income_tax_rate}
                                            onChange={(event) => setBusinessForm((prev) => ({ ...prev, local_income_tax_rate: numberValue(event.target.value) }))}
                                        />
                                        <Input
                                            label="State Unemployment Rate"
                                            type="number"
                                            step="0.0001"
                                            value={businessForm.state_unemployment_rate}
                                            onChange={(event) => setBusinessForm((prev) => ({ ...prev, state_unemployment_rate: numberValue(event.target.value) }))}
                                        />
                                        <Input
                                            label="State Unemployment Wage Base"
                                            type="number"
                                            step="0.01"
                                            value={businessForm.state_unemployment_wage_base}
                                            onChange={(event) => setBusinessForm((prev) => ({ ...prev, state_unemployment_wage_base: numberValue(event.target.value) }))}
                                        />
                                        <Input
                                            label="FUTA Rate"
                                            type="number"
                                            step="0.0001"
                                            value={businessForm.futa_rate}
                                            onChange={(event) => setBusinessForm((prev) => ({ ...prev, futa_rate: numberValue(event.target.value) }))}
                                            hint="Default federal FUTA rate after standard credit is 0.006 (0.6%)."
                                        />
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <Select
                                            label="Tax Classification"
                                            value={employeePayrollForm.tax_classification}
                                            onChange={(event) => setEmployeePayrollForm((prev) => ({ ...prev, tax_classification: event.target.value as TaxClassification }))}
                                            options={[
                                                { value: 'w2', label: 'W-2 Employee' },
                                                { value: '1099', label: '1099 Contractor' },
                                            ]}
                                        />
                                        <Select
                                            label="Federal Filing Status"
                                            value={employeePayrollForm.federal_filing_status}
                                            onChange={(event) => setEmployeePayrollForm((prev) => ({
                                                ...prev,
                                                federal_filing_status: event.target.value as FederalFilingStatus,
                                            }))}
                                            options={[
                                                { value: 'single', label: 'Single' },
                                                { value: 'married_filing_jointly', label: 'Married Filing Jointly' },
                                                { value: 'married_filing_separately', label: 'Married Filing Separately' },
                                                { value: 'head_of_household', label: 'Head of Household' },
                                            ]}
                                        />
                                        <Input
                                            label="Dependents Credit (W-4 Step 3 annual amount)"
                                            type="number"
                                            step="0.01"
                                            value={employeePayrollForm.dependents_amount}
                                            onChange={(event) => setEmployeePayrollForm((prev) => ({ ...prev, dependents_amount: numberValue(event.target.value) }))}
                                        />
                                        <Input
                                            label="Other Income (annual)"
                                            type="number"
                                            step="0.01"
                                            value={employeePayrollForm.other_income}
                                            onChange={(event) => setEmployeePayrollForm((prev) => ({ ...prev, other_income: numberValue(event.target.value) }))}
                                        />
                                        <Input
                                            label="Deductions (annual)"
                                            type="number"
                                            step="0.01"
                                            value={employeePayrollForm.deductions}
                                            onChange={(event) => setEmployeePayrollForm((prev) => ({ ...prev, deductions: numberValue(event.target.value) }))}
                                        />
                                        <Input
                                            label="Extra Federal Withholding (per pay period)"
                                            type="number"
                                            step="0.01"
                                            value={employeePayrollForm.extra_withholding}
                                            onChange={(event) => setEmployeePayrollForm((prev) => ({ ...prev, extra_withholding: numberValue(event.target.value) }))}
                                        />
                                        <Input
                                            label="Additional State Withholding (per pay period)"
                                            type="number"
                                            step="0.01"
                                            value={employeePayrollForm.state_additional_withholding}
                                            onChange={(event) => setEmployeePayrollForm((prev) => ({ ...prev, state_additional_withholding: numberValue(event.target.value) }))}
                                        />
                                        {businessForm.state_withholding_method === 'virginia_brackets' && (
                                            <>
                                                <Input
                                                    label="VA Personal Exemptions (VA-4)"
                                                    type="number"
                                                    step="1"
                                                    min="0"
                                                    value={employeePayrollForm.state_personal_exemptions}
                                                    onChange={(event) => setEmployeePayrollForm((prev) => ({ ...prev, state_personal_exemptions: Math.max(0, Math.floor(numberValue(event.target.value))) }))}
                                                    hint="$930 each in annual Virginia withholding formula."
                                                />
                                                <Input
                                                    label="VA Age/Blind Exemptions (VA-4)"
                                                    type="number"
                                                    step="1"
                                                    min="0"
                                                    value={employeePayrollForm.state_additional_exemptions}
                                                    onChange={(event) => setEmployeePayrollForm((prev) => ({ ...prev, state_additional_exemptions: Math.max(0, Math.floor(numberValue(event.target.value))) }))}
                                                    hint="$800 each in annual Virginia withholding formula."
                                                />
                                            </>
                                        )}
                                        <Input
                                            label="Prior YTD Wages"
                                            type="number"
                                            step="0.01"
                                            value={employeePayrollForm.prior_ytd_wages}
                                            onChange={(event) => setEmployeePayrollForm((prev) => ({ ...prev, prior_ytd_wages: numberValue(event.target.value) }))}
                                        />
                                        <Input
                                            label="Prior YTD Social Security Wages"
                                            type="number"
                                            step="0.01"
                                            value={employeePayrollForm.prior_ytd_social_security_wages}
                                            onChange={(event) => setEmployeePayrollForm((prev) => ({ ...prev, prior_ytd_social_security_wages: numberValue(event.target.value) }))}
                                        />
                                        <Input
                                            label="Prior YTD Medicare Wages"
                                            type="number"
                                            step="0.01"
                                            value={employeePayrollForm.prior_ytd_medicare_wages}
                                            onChange={(event) => setEmployeePayrollForm((prev) => ({ ...prev, prior_ytd_medicare_wages: numberValue(event.target.value) }))}
                                        />

                                        <div className="rounded-lg border border-[var(--color-border)] p-3 text-sm">
                                            <label className="flex items-center gap-2">
                                                <input
                                                    type="checkbox"
                                                    checked={employeePayrollForm.step_2_checked}
                                                    onChange={(event) => setEmployeePayrollForm((prev) => ({ ...prev, step_2_checked: event.target.checked }))}
                                                />
                                                W-4 Step 2 checked
                                            </label>
                                            <label className="flex items-center gap-2 mt-2">
                                                <input
                                                    type="checkbox"
                                                    checked={employeePayrollForm.federal_exempt}
                                                    onChange={(event) => setEmployeePayrollForm((prev) => ({ ...prev, federal_exempt: event.target.checked }))}
                                                />
                                                Federal exempt withholding
                                            </label>
                                            <label className="flex items-center gap-2 mt-2">
                                                <input
                                                    type="checkbox"
                                                    checked={employeePayrollForm.state_exempt}
                                                    onChange={(event) => setEmployeePayrollForm((prev) => ({ ...prev, state_exempt: event.target.checked }))}
                                                />
                                                State/local exempt withholding
                                            </label>
                                            <label className="flex items-center gap-2 mt-2">
                                                <input
                                                    type="checkbox"
                                                    checked={employeePayrollForm.backup_withholding_enabled}
                                                    onChange={(event) => setEmployeePayrollForm((prev) => ({ ...prev, backup_withholding_enabled: event.target.checked }))}
                                                />
                                                1099 backup withholding (24%)
                                            </label>
                                        </div>
                                    </div>
                                )}

                                <ModalFooter>
                                    {wizard.current === 2 && (
                                        <Button variant="secondary" onClick={() => setWizard({ current: 1, complete: false })}>
                                            Back
                                        </Button>
                                    )}
                                    {wizard.current === 1 ? (
                                        <Button onClick={handleBusinessProfileSave} isLoading={isSavingWizard}>
                                            Save Business Setup
                                        </Button>
                                    ) : (
                                        <Button onClick={handleEmployeePayrollProfileSave} isLoading={isSavingWizard}>
                                            Save Employee Setup
                                        </Button>
                                    )}
                                </ModalFooter>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <Card variant="outlined">
                                    <CardContent className="p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
                                        <Input
                                            label="Period Start"
                                            type="date"
                                            value={periodStart}
                                            onChange={(event) => setPeriodStart(event.target.value)}
                                        />
                                        <Input
                                            label="Period End"
                                            type="date"
                                            value={periodEnd}
                                            onChange={(event) => setPeriodEnd(event.target.value)}
                                        />
                                        <Input
                                            label="Hours Worked"
                                            type="number"
                                            step="0.01"
                                            value={hoursWorked}
                                            onChange={(event) => setHoursWorked(numberValue(event.target.value))}
                                        />
                                        <Input
                                            label="Hourly Rate"
                                            type="number"
                                            step="0.01"
                                            value={hourlyRate}
                                            onChange={(event) => setHourlyRate(numberValue(event.target.value))}
                                        />
                                    </CardContent>
                                </Card>

                                <div className="flex flex-wrap gap-2">
                                    <Button
                                        variant="secondary"
                                        onClick={() => activeEmployee && loadEmployeeHours(activeEmployee.id, periodStart, periodEnd)}
                                        isLoading={hoursLoadStatus === 'loading'}
                                    >
                                        Load Hours From Timecards
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        onClick={() => {
                                            setWizard({ current: 2, complete: false });
                                            setEmployeePayrollForm(
                                                employeePayrollProfile
                                                    ? mapEmployeeProfileToForm(employeePayrollProfile)
                                                    : getDefaultEmployeePayrollForm(),
                                            );
                                        }}
                                    >
                                        Edit Tax Setup
                                    </Button>
                                </div>

                                {!businessProfile || !employeePayrollProfile || !calculation ? (
                                    <Card variant="outlined">
                                        <CardContent className="p-4 text-sm text-[var(--color-muted)]">
                                            Enter hours and ensure payroll setup is complete to preview payout calculations.
                                        </CardContent>
                                    </Card>
                                ) : (
                                    <Card variant="outlined">
                                        <CardHeader>
                                            <CardTitle className="text-base">Payout Preview</CardTitle>
                                        </CardHeader>
                                        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                                            <PreviewRow label="Gross Pay" value={calculation.grossPay} highlight />
                                            <PreviewRow label="Federal Withholding" value={-calculation.federalWithholding} />
                                            <PreviewRow label="Social Security" value={-calculation.socialSecurityTax} />
                                            <PreviewRow label="Medicare" value={-calculation.medicareTax} />
                                            <PreviewRow label="Additional Medicare" value={-calculation.additionalMedicareTax} />
                                            <PreviewRow label="State Withholding" value={-calculation.stateWithholding} />
                                            <PreviewRow label="Local Withholding" value={-calculation.localWithholding} />
                                            <PreviewRow label="1099 Backup Withholding" value={-calculation.contractorBackupWithholding} />
                                            <PreviewRow label="Net Pay" value={calculation.netPay} highlight />
                                            <PreviewRow label="Employer Social Security" value={calculation.employerSocialSecurityTax} />
                                            <PreviewRow label="Employer Medicare" value={calculation.employerMedicareTax} />
                                            <PreviewRow label="Employer FUTA" value={calculation.employerFutaTax} />
                                            <PreviewRow label="Employer SUTA" value={calculation.employerSutaTax} />
                                        </CardContent>
                                    </Card>
                                )}

                                <Input
                                    label="Notes"
                                    value={payoutNotes}
                                    onChange={(event) => setPayoutNotes(event.target.value)}
                                    placeholder="Optional payout notes"
                                />
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <Select
                                        label="Payout Method"
                                        value={payoutMethod}
                                        onChange={(event) => setPayoutMethod(event.target.value as EmployeePayoutMethod)}
                                        options={[
                                            { value: 'direct_deposit', label: 'Direct Deposit' },
                                            { value: 'check', label: 'Check' },
                                            { value: 'cash', label: 'Cash' },
                                            { value: 'other', label: 'Other' },
                                        ]}
                                    />
                                    {payoutMethod === 'check' ? (
                                        <Input
                                            label="Check Number"
                                            value={checkNumber}
                                            onChange={(event) => setCheckNumber(event.target.value)}
                                            placeholder="Enter check number"
                                        />
                                    ) : (
                                        <Input
                                            label="Check Number"
                                            value=""
                                            readOnly
                                            placeholder="Only required for check payouts"
                                        />
                                    )}
                                </div>

                                <ModalFooter>
                                    <Button variant="secondary" onClick={closePayoutModal}>
                                        Close
                                    </Button>
                                    <Button
                                        onClick={handleRecordPayout}
                                        isLoading={isRecordingPayout}
                                        disabled={!calculation}
                                    >
                                        Record Payout
                                    </Button>
                                </ModalFooter>

                                <Card variant="outlined">
                                    <CardHeader>
                                        <CardTitle className="text-base">Recent Payout History</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        {payoutHistory.length === 0 ? (
                                            <p className="text-sm text-[var(--color-muted)]">No payouts recorded yet.</p>
                                        ) : (
                                            <div className="space-y-2 max-h-56 overflow-y-auto">
                                                {payoutHistory.map((row) => (
                                                    <div key={row.id} className="rounded-lg border border-[var(--color-border)] p-3">
                                                        <div className="flex items-center justify-between text-sm">
                                                            <span>{new Date(row.paid_at).toLocaleDateString()}</span>
                                                            <span className="font-semibold">{formatCurrency(row.net_pay)}</span>
                                                        </div>
                                                        <div className="text-xs text-[var(--color-muted)] mt-1">
                                                            {new Date(row.period_start).toLocaleDateString()} - {new Date(row.period_end).toLocaleDateString()} | {row.hours_worked.toFixed(2)} h | Gross {formatCurrency(row.gross_pay)} | {getPayoutMethodLabel(row.payout_method)}{row.check_number ? ` #${row.check_number}` : ''}
                                                        </div>
                                                        <div className="flex gap-2 mt-2">
                                                            <Button
                                                                size="sm"
                                                                variant="secondary"
                                                                onClick={() => setSelectedHistoryPayout(row)}
                                                            >
                                                                View
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                onClick={() => handlePrintPayoutStatement(row)}
                                                            >
                                                                Print PDF
                                                            </Button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            </div>
                        )}
                    </>
                )}
            </Modal>

            <Modal
                isOpen={!!selectedHistoryPayout}
                onClose={() => setSelectedHistoryPayout(null)}
                title="Payout Details"
                size="lg"
            >
                {selectedHistoryPayout && (
                    <div className="space-y-2 text-sm">
                        <DetailRow label="Paid At" value={new Date(selectedHistoryPayout.paid_at).toLocaleString()} />
                        <DetailRow
                            label="Period"
                            value={`${new Date(selectedHistoryPayout.period_start).toLocaleDateString()} - ${new Date(selectedHistoryPayout.period_end).toLocaleDateString()}`}
                        />
                        <DetailRow label="Hours Worked" value={selectedHistoryPayout.hours_worked.toFixed(2)} />
                        <DetailRow label="Hourly Rate" value={formatCurrency(selectedHistoryPayout.hourly_rate)} />
                        <DetailRow label="Payout Method" value={`${getPayoutMethodLabel(selectedHistoryPayout.payout_method)}${selectedHistoryPayout.check_number ? ` #${selectedHistoryPayout.check_number}` : ''}`} />
                        <DetailRow label="Gross Pay" value={formatCurrency(selectedHistoryPayout.gross_pay)} />
                        <DetailRow label="Federal Withholding" value={formatCurrency(selectedHistoryPayout.federal_withholding)} />
                        <DetailRow label="Social Security" value={formatCurrency(selectedHistoryPayout.social_security_tax)} />
                        <DetailRow label="Medicare" value={formatCurrency(selectedHistoryPayout.medicare_tax)} />
                        <DetailRow label="Additional Medicare" value={formatCurrency(selectedHistoryPayout.additional_medicare_tax)} />
                        <DetailRow label="State Withholding" value={formatCurrency(selectedHistoryPayout.state_withholding)} />
                        <DetailRow label="Local Withholding" value={formatCurrency(selectedHistoryPayout.local_withholding)} />
                        <DetailRow label="1099 Backup Withholding" value={formatCurrency(selectedHistoryPayout.contractor_backup_withholding)} />
                        <DetailRow label="Net Pay" value={formatCurrency(selectedHistoryPayout.net_pay)} />
                        {selectedHistoryPayout.notes && (
                            <div className="rounded-lg border border-[var(--color-border)] p-2">
                                <span className="text-[var(--color-muted)]">Notes</span>
                                <p className="mt-1">{selectedHistoryPayout.notes}</p>
                            </div>
                        )}
                        <ModalFooter>
                            <Button variant="secondary" onClick={() => setSelectedHistoryPayout(null)}>
                                Close
                            </Button>
                            <Button onClick={() => handlePrintPayoutStatement(selectedHistoryPayout)}>
                                Print PDF
                            </Button>
                        </ModalFooter>
                    </div>
                )}
            </Modal>
        </div>
    );
}

function PreviewRow({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
    return (
        <div className="flex justify-between rounded-lg border border-[var(--color-border)] px-3 py-2">
            <span className="text-[var(--color-muted)]">{label}</span>
            <span className={highlight ? 'font-semibold text-[var(--color-primary)]' : 'font-medium'}>{formatCurrency(value)}</span>
        </div>
    );
}

function DetailRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between rounded-lg border border-[var(--color-border)] px-3 py-2">
            <span className="text-[var(--color-muted)]">{label}</span>
            <span className="font-medium text-right">{value}</span>
        </div>
    );
}

function getPayoutMethodLabel(method: EmployeePayoutMethod): string {
    if (method === 'direct_deposit') return 'Direct Deposit';
    if (method === 'check') return 'Check';
    if (method === 'cash') return 'Cash';
    return 'Other';
}

function CloseIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m18 6-12 12" />
            <path d="m6 6 12 12" />
        </svg>
    );
}
