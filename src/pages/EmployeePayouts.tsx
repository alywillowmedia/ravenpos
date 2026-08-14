import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { EmptyState, UsersIcon } from '../components/ui/EmptyState';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { Modal, ModalFooter } from '../components/ui/Modal';
import { InactiveEmployeeToggle } from '../components/employees/InactiveEmployeeToggle';
import { useEmployees } from '../hooks/useEmployees';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { supabase } from '../lib/supabase';
import {
    calculatePayroll,
    getDefaultPayrollDateRange,
    getPayrollAccuracyBasis,
    ADDITIONAL_MEDICARE_THRESHOLD,
    SOCIAL_SECURITY_WAGE_BASE_2026,
    type EmployeePayrollProfile,
    type FederalFilingStatus,
    type CustomStateWithholdingBracket,
    type PayrollBusinessProfile,
    type PayrollAccuracyBasis,
    type PayrollCalculationResult,
    type PayrollYtdTotals,
    type PayFrequency,
    type StateWithholdingMethod,
    type TaxClassification,
} from '../lib/payroll';
import {
    buildPaystubHtml,
    buildPaystubYtdTotals,
    formatPaystubAddressLines,
    getPaystubShortCode,
    hasPaystubAddress,
    type PaystubAddress,
} from '../lib/paystub';
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
    employer_name_snapshot: string | null;
    employer_fein_snapshot: string | null;
    employer_address_snapshot: PaystubAddress | null;
    employee_name_snapshot: string | null;
    employee_address_snapshot: PaystubAddress | null;
}

interface PayrollTimeEntryRow {
    id: string;
    clock_in: string;
    clock_out: string | null;
    total_hours: number | null;
    lunch_break_minutes: number | null;
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

interface TimecardLoadSummary {
    entryCount: number;
    openEntryCount: number;
    clippedEntryCount: number;
    savedHoursEntryCount: number;
    proratedSavedHoursEntryCount: number;
    computedHoursEntryCount: number;
    rawHours: number;
    roundedHours: number;
    loadedAt: string;
}

type Employer = 'Ravenlia' | 'Alywillow';
type EmployeePayoutMethod = 'direct_deposit' | 'check' | 'cash' | 'other';
type BusinessProfileMap = Record<Employer, PayrollBusinessProfile | null>;
type PayoutWorkspaceTab = 'run' | 'history';

const PAYROLL_EMPLOYERS: Employer[] = ['Ravenlia', 'Alywillow'];

interface PayrollBusinessProfileForm {
    employer: Employer;
    legal_name: string;
    fein: string;
    address_line_1: string;
    address_line_2: string;
    city: string;
    state: string;
    postal_code: string;
    country: string;
    tax_state: string;
    state_withholding_method: StateWithholdingMethod;
    pay_frequency: PayFrequency;
    state_income_tax_rate: number;
    custom_state_standard_deduction: number;
    custom_state_brackets: CustomStateBracketForm[];
    local_income_tax_rate: number;
    state_unemployment_rate: number;
    state_unemployment_wage_base: number;
    futa_rate: number;
}

interface CustomStateBracketForm {
    threshold: number;
    baseTax: number;
    rate: number;
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

function formatDateOnly(value: string): string {
    const [datePart] = value.split('T');
    const [year, month, day] = datePart.split('-').map(Number);

    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
        return value;
    }

    return new Date(year, month - 1, day).toLocaleDateString();
}

function formatDateRange(start: string, end: string): string {
    return `${formatDateOnly(start)} - ${formatDateOnly(end)}`;
}

function numberValue(value: string): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function roundCurrency(value: number): number {
    return Math.round(value * 100) / 100;
}

function roundHoursToTenth(hours: number): number {
    return Math.round(hours * 10) / 10;
}

function formatPayoutHours(hours: number): string {
    return `${Number(hours || 0).toFixed(1)} h`;
}

function trimAddress(address: PaystubAddress): PaystubAddress {
    return {
        address_line_1: address.address_line_1?.trim() || null,
        address_line_2: address.address_line_2?.trim() || null,
        city: address.city?.trim() || null,
        state: address.state?.trim().toUpperCase() || null,
        postal_code: address.postal_code?.trim() || null,
        country: address.country?.trim().toUpperCase() || null,
    };
}

function getBusinessProfileAddress(profile: PayrollBusinessProfile | null): PaystubAddress | null {
    if (!profile) return null;

    return trimAddress({
        address_line_1: profile.address_line_1 || null,
        address_line_2: profile.address_line_2 || null,
        city: profile.city || null,
        state: profile.state || null,
        postal_code: profile.postal_code || null,
        country: profile.country || null,
    });
}

function getBusinessFormAddress(form: PayrollBusinessProfileForm): PaystubAddress {
    return trimAddress({
        address_line_1: form.address_line_1,
        address_line_2: form.address_line_2,
        city: form.city,
        state: form.state,
        postal_code: form.postal_code,
        country: form.country,
    });
}

function getEmployeeAddress(employee: EmployeeWithStats | null): PaystubAddress | null {
    if (!employee) return null;

    return trimAddress({
        address_line_1: employee.address_line_1 || null,
        address_line_2: employee.address_line_2 || null,
        city: employee.city || null,
        state: employee.state || null,
        postal_code: employee.postal_code || null,
        country: employee.country || null,
    });
}

function getSnapshotAddress(snapshot: PaystubAddress | null | undefined, fallback: PaystubAddress | null): PaystubAddress | null {
    return hasPaystubAddress(snapshot) ? snapshot || null : fallback;
}

function storedRateToPercentField(rate: number): number {
    return Math.round(Number(rate || 0) * 10000) / 100;
}

function percentFieldToStoredRate(percent: number): number {
    return Math.round((Number(percent || 0) / 100) * 1000000) / 1000000;
}

function getPayrollEmployer(value: string | null | undefined): Employer {
    return value === 'Alywillow' ? 'Alywillow' : 'Ravenlia';
}

function getDefaultCustomStateBrackets(): CustomStateBracketForm[] {
    return [
        { threshold: 0, baseTax: 0, rate: 0 },
    ];
}

function mapCustomStateBracketsToForm(brackets: CustomStateWithholdingBracket[] | null | undefined): CustomStateBracketForm[] {
    if (!Array.isArray(brackets) || brackets.length === 0) {
        return getDefaultCustomStateBrackets();
    }

    return brackets
        .map((bracket) => ({
            threshold: Number(bracket.threshold || 0),
            baseTax: Number(bracket.baseTax || 0),
            rate: storedRateToPercentField(Number(bracket.rate || 0)),
        }))
        .sort((a, b) => a.threshold - b.threshold);
}

function mapCustomStateBracketsToStored(brackets: CustomStateBracketForm[]): CustomStateWithholdingBracket[] {
    return brackets
        .map((bracket) => ({
            threshold: Math.max(0, Number(bracket.threshold || 0)),
            baseTax: Math.max(0, Number(bracket.baseTax || 0)),
            rate: percentFieldToStoredRate(Math.max(0, Number(bracket.rate || 0))),
        }))
        .filter((bracket) => Number.isFinite(bracket.threshold) && Number.isFinite(bracket.baseTax) && Number.isFinite(bracket.rate))
        .sort((a, b) => a.threshold - b.threshold);
}

function getPayrollHoursForEntry(
    entry: PayrollTimeEntryRow,
    rangeStart: Date,
    rangeEndExclusive: Date,
    now: Date,
): { hours: number; isOpen: boolean; isClipped: boolean; source: 'saved' | 'prorated_saved' | 'computed' } {
    const clockIn = new Date(entry.clock_in);
    const rawClockOut = entry.clock_out ? new Date(entry.clock_out) : now;

    const clockInMs = clockIn.getTime();
    const rawClockOutMs = rawClockOut.getTime();
    const rangeStartMs = rangeStart.getTime();
    const rangeEndMs = rangeEndExclusive.getTime();

    if (!Number.isFinite(clockInMs) || !Number.isFinite(rawClockOutMs) || rawClockOutMs <= clockInMs) {
        return { hours: 0, isOpen: !entry.clock_out, isClipped: false, source: 'computed' };
    }

    const clippedStartMs = Math.max(clockInMs, rangeStartMs);
    const clippedEndMs = Math.min(rawClockOutMs, rangeEndMs);

    if (clippedEndMs <= clippedStartMs) {
        return { hours: 0, isOpen: !entry.clock_out, isClipped: false, source: 'computed' };
    }

    const shiftMs = rawClockOutMs - clockInMs;
    const overlapMs = clippedEndMs - clippedStartMs;
    const isClipped = clippedStartMs !== clockInMs || clippedEndMs !== rawClockOutMs;
    const savedHours = Number(entry.total_hours);
    const hasSavedHours = entry.clock_out
        && Number.isFinite(savedHours)
        && savedHours >= 0;

    if (hasSavedHours && !isClipped) {
        return {
            hours: savedHours,
            isOpen: false,
            isClipped,
            source: 'saved',
        };
    }

    if (hasSavedHours && isClipped) {
        return {
            hours: Math.max(0, savedHours * (overlapMs / shiftMs)),
            isOpen: false,
            isClipped,
            source: 'prorated_saved',
        };
    }

    const lunchMs = Math.max(0, Number(entry.lunch_break_minutes || 0)) * 60 * 1000;
    const lunchWithinRangeMs = isClipped ? lunchMs * (overlapMs / shiftMs) : lunchMs;
    const payableMs = Math.max(0, overlapMs - lunchWithinRangeMs);

    return {
        hours: payableMs / (1000 * 60 * 60),
        isOpen: !entry.clock_out,
        isClipped,
        source: 'computed',
    };
}

function getDefaultBusinessForm(employer: 'Ravenlia' | 'Alywillow'): PayrollBusinessProfileForm {
    return {
        employer,
        legal_name: employer,
        fein: '',
        address_line_1: '',
        address_line_2: '',
        city: '',
        state: 'VA',
        postal_code: '',
        country: 'US',
        tax_state: 'VA',
        state_withholding_method: 'custom_rate',
        pay_frequency: 'biweekly',
        state_income_tax_rate: 0,
        custom_state_standard_deduction: 0,
        custom_state_brackets: getDefaultCustomStateBrackets(),
        local_income_tax_rate: 0,
        state_unemployment_rate: 0,
        state_unemployment_wage_base: 7000,
        futa_rate: 0.6,
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
        address_line_1: profile.address_line_1 || '',
        address_line_2: profile.address_line_2 || '',
        city: profile.city || '',
        state: profile.state || '',
        postal_code: profile.postal_code || '',
        country: profile.country || 'US',
        tax_state: profile.tax_state,
        state_withholding_method: profile.state_withholding_method || 'custom_rate',
        pay_frequency: profile.pay_frequency,
        state_income_tax_rate: storedRateToPercentField(profile.state_income_tax_rate),
        custom_state_standard_deduction: Number(profile.custom_state_standard_deduction || 0),
        custom_state_brackets: mapCustomStateBracketsToForm(profile.custom_state_brackets),
        local_income_tax_rate: storedRateToPercentField(profile.local_income_tax_rate),
        state_unemployment_rate: storedRateToPercentField(profile.state_unemployment_rate),
        state_unemployment_wage_base: profile.state_unemployment_wage_base,
        futa_rate: storedRateToPercentField(profile.futa_rate),
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

function getFederalSourceLabel(profile: PayrollBusinessProfile | null) {
    if (!profile) return 'Not configured';
    return `IRS Publication 15-T 2026, ${profile.pay_frequency} pay frequency`;
}

function getStateSourceLabel(profile: PayrollBusinessProfile | null) {
    if (!profile) return 'Not configured';
    if (profile.state_withholding_method === 'virginia_brackets') {
        return 'Virginia bracket schedule with VA-4 exemptions';
    }
    if (profile.state_withholding_method === 'custom_brackets') {
        const count = Array.isArray(profile.custom_state_brackets) ? profile.custom_state_brackets.length : 0;
        return `${profile.tax_state || 'State'} custom progressive brackets${count ? ` (${count})` : ''}`;
    }
    return `${profile.tax_state || 'State'} custom rate ${formatPercent(profile.state_income_tax_rate)}`;
}

function formatPercent(value: number) {
    const normalized = value > 1 ? value : value * 100;
    return `${normalized.toFixed(4).replace(/\.?0+$/, '')}%`;
}

export function EmployeePayouts() {
    const { employees, isLoading, error } = useEmployees();
    const { user } = useAuth();
    const toast = useToast();
    const navigate = useNavigate();
    const location = useLocation();
    const { employeeId } = useParams<{ employeeId?: string }>();

    const [searchQuery, setSearchQuery] = useState('');
    const [latestPayouts, setLatestPayouts] = useState<Record<string, LatestPayoutSnapshot>>({});

    const [activeEmployee, setActiveEmployee] = useState<EmployeeWithStats | null>(null);
    const [businessSetupOpen, setBusinessSetupOpen] = useState(false);
    const [isLoadingModalData, setIsLoadingModalData] = useState(false);
    const [isSavingWizard, setIsSavingWizard] = useState(false);
    const [isRecordingPayout, setIsRecordingPayout] = useState(false);

    const [businessProfiles, setBusinessProfiles] = useState<BusinessProfileMap>({ Ravenlia: null, Alywillow: null });
    const [businessProfile, setBusinessProfile] = useState<PayrollBusinessProfile | null>(null);
    const [employeePayrollProfile, setEmployeePayrollProfile] = useState<EmployeePayrollProfile | null>(null);
    const [businessForm, setBusinessForm] = useState<PayrollBusinessProfileForm>(getDefaultBusinessForm('Ravenlia'));
    const [employeePayrollForm, setEmployeePayrollForm] = useState<EmployeePayrollProfileForm>(getDefaultEmployeePayrollForm());
    const [wizard, setWizard] = useState<WizardStepState>({ current: 1, complete: true });
    const [payoutWorkspaceTab, setPayoutWorkspaceTab] = useState<PayoutWorkspaceTab>('run');

    const [periodStart, setPeriodStart] = useState(() => toDateInput(new Date()));
    const [periodEnd, setPeriodEnd] = useState(() => toDateInput(new Date()));
    const [hoursWorked, setHoursWorked] = useState(0);
    const [hourlyRate, setHourlyRate] = useState(0);
    const [payoutMethod, setPayoutMethod] = useState<EmployeePayoutMethod>('direct_deposit');
    const [checkNumber, setCheckNumber] = useState('');
    const [payoutNotes, setPayoutNotes] = useState('');
    const [payoutHistory, setPayoutHistory] = useState<EmployeePayoutRow[]>([]);
    const [selectedHistoryPayout, setSelectedHistoryPayout] = useState<EmployeePayoutRow | null>(null);
    const [timecardSummary, setTimecardSummary] = useState<TimecardLoadSummary | null>(null);
    const [showInactiveEmployees, setShowInactiveEmployees] = useState(false);

    const [hoursLoadStatus, setHoursLoadStatus] = useState<'idle' | 'loading' | 'error'>('idle');
    const hoursLoadRequestRef = useRef(0);
    const autoLoadedHoursKeyRef = useRef<string | null>(null);

    const ytdTotals = useMemo(() => getCurrentYearYtd(payoutHistory), [payoutHistory]);

    const inactiveEmployeeCount = useMemo(
        () => employees.filter((employee) => !employee.is_active).length,
        [employees]
    );

    const filteredEmployees = useMemo(() => {
        const statusFiltered = showInactiveEmployees
            ? employees
            : employees.filter((employee) => employee.is_active);
        if (!searchQuery.trim()) return statusFiltered;

        const query = searchQuery.toLowerCase().trim();
        return statusFiltered.filter((employee) => {
            const employer = employee.employer || '';
            return employee.name.toLowerCase().includes(query) || employer.toLowerCase().includes(query);
        });
    }, [employees, searchQuery, showInactiveEmployees]);

    const refreshBusinessProfiles = useCallback(async () => {
        const { data, error: profileError } = await supabase
            .from('payroll_business_profiles')
            .select('*');

        if (profileError) {
            console.error('Failed to load business payroll profiles', profileError);
            return;
        }

        const nextProfiles: BusinessProfileMap = { Ravenlia: null, Alywillow: null };
        for (const row of (data || []) as PayrollBusinessProfile[]) {
            if (row.employer === 'Ravenlia' || row.employer === 'Alywillow') {
                nextProfiles[row.employer] = row;
            }
        }

        setBusinessProfiles(nextProfiles);
    }, []);

    const calculation: PayrollCalculationResult | null = useMemo(() => {
        if (!businessProfile || !employeePayrollProfile) return null;
        if (hoursWorked <= 0 || hourlyRate < 0) return null;

        return calculatePayroll({
            hourlyRate,
            hoursWorked,
            businessProfile,
            employeeProfile: employeePayrollProfile,
            ytdTotals,
        });
    }, [businessProfile, employeePayrollProfile, hourlyRate, hoursWorked, ytdTotals]);

    const accuracyBasis: PayrollAccuracyBasis | null = useMemo(() => {
        if (!businessProfile || !employeePayrollProfile) return null;
        if (hoursWorked <= 0 || hourlyRate < 0) return null;

        return getPayrollAccuracyBasis({
            hourlyRate,
            hoursWorked,
            businessProfile,
            employeeProfile: employeePayrollProfile,
            ytdTotals,
        });
    }, [businessProfile, employeePayrollProfile, hourlyRate, hoursWorked, ytdTotals]);

    const refreshLatestPayouts = useCallback(async () => {
        const { data, error: payoutError } = await supabase
            .from('employee_payouts')
            .select('id, employee_id, paid_at, gross_pay, net_pay')
            .order('paid_at', { ascending: false });

        if (payoutError) {
            console.error('Failed to load latest payroll records', payoutError);
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

    useEffect(() => {
        refreshBusinessProfiles();
    }, [refreshBusinessProfiles]);

    useEffect(() => {
        if (location.pathname.startsWith('/admin/employees/payouts')) {
            const nextPath = location.pathname.replace('/admin/employees/payouts', '/admin/employees/payroll');
            navigate(nextPath, { replace: true });
        }
    }, [location.pathname, navigate]);

    const loadEmployeeHours = useCallback(async (employeeId: string, start: string, end: string) => {
        const requestId = hoursLoadRequestRef.current + 1;
        hoursLoadRequestRef.current = requestId;
        setHoursLoadStatus('loading');

        const startDate = parseDateInput(start);
        const endDateExclusive = parseDateInput(end);
        endDateExclusive.setDate(endDateExclusive.getDate() + 1);

        const { data, error: timeError } = await supabase
            .from('time_entries')
            .select('id, clock_in, clock_out, total_hours, lunch_break_minutes')
            .eq('employee_id', employeeId)
            .lt('clock_in', endDateExclusive.toISOString())
            .or(`clock_out.gte.${startDate.toISOString()},clock_out.is.null`);

        if (timeError) {
            if (requestId !== hoursLoadRequestRef.current) return;
            setHoursLoadStatus('error');
            toast.error('Could not load timecard hours', timeError.message);
            return;
        }

        if (requestId !== hoursLoadRequestRef.current) return;

        const now = new Date();
        const rows = (data || []) as PayrollTimeEntryRow[];
        let rawHours = 0;
        let openEntryCount = 0;
        let clippedEntryCount = 0;
        let savedHoursEntryCount = 0;
        let proratedSavedHoursEntryCount = 0;
        let computedHoursEntryCount = 0;

        for (const entry of rows) {
            const result = getPayrollHoursForEntry(entry, startDate, endDateExclusive, now);
            rawHours += result.hours;
            if (result.isOpen) openEntryCount += 1;
            if (result.isClipped) clippedEntryCount += 1;
            if (result.source === 'saved') savedHoursEntryCount += 1;
            if (result.source === 'prorated_saved') proratedSavedHoursEntryCount += 1;
            if (result.source === 'computed') computedHoursEntryCount += 1;
        }

        const roundedHours = roundHoursToTenth(rawHours);
        setHoursWorked(roundedHours);
        setTimecardSummary({
            entryCount: rows.length,
            openEntryCount,
            clippedEntryCount,
            savedHoursEntryCount,
            proratedSavedHoursEntryCount,
            computedHoursEntryCount,
            rawHours,
            roundedHours,
            loadedAt: now.toISOString(),
        });
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
                employer_name_snapshot,
                employer_fein_snapshot,
                employer_address_snapshot,
                employee_name_snapshot,
                employee_address_snapshot,
                notes
            `)
            .eq('employee_id', employeeId)
            .order('paid_at', { ascending: false });

        if (historyError) {
            toast.error('Could not load payroll history', historyError.message);
            setPayoutHistory([]);
            return;
        }

        setPayoutHistory((data || []) as EmployeePayoutRow[]);
    }, [toast]);

    const loadPayoutWorkspace = useCallback(async (employee: EmployeeWithStats) => {
        setActiveEmployee(employee);
        setIsLoadingModalData(true);

        const employer = getPayrollEmployer(employee.employer);
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
        setTimecardSummary(null);
        setPayoutWorkspaceTab('run');
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
            setBusinessProfiles((prev) => ({ ...prev, [business.employer]: business }));
            setBusinessForm(mapBusinessProfileToForm(business));

            const dates = getDefaultPayrollDateRange(business.pay_frequency);
            const startInput = toDateInput(dates.start);
            const endInput = toDateInput(dates.end);
            setPeriodStart(startInput);
            setPeriodEnd(endInput);
            autoLoadedHoursKeyRef.current = `${employee.id}:${startInput}:${endInput}`;
            await loadEmployeeHours(employee.id, startInput, endInput);
        } else {
            const today = new Date();
            const startInput = toDateInput(today);
            const endInput = toDateInput(today);
            setPeriodStart(startInput);
            setPeriodEnd(endInput);
            autoLoadedHoursKeyRef.current = null;
            setHoursWorked(0);
        }

        if (employeeProfile) {
            setEmployeePayrollProfile(employeeProfile);
            setEmployeePayrollForm(mapEmployeeProfileToForm(employeeProfile));
        }

        await loadPayoutHistory(employee.id);

        if (!employeeProfile) {
            setWizard({ current: 2, complete: false });
        } else {
            setWizard({ current: 1, complete: true });
        }

        setIsLoadingModalData(false);
    }, [loadEmployeeHours, loadPayoutHistory, toast]);

    const closePayoutWorkspace = () => {
        navigate('/admin/employees/payroll');
        setActiveEmployee(null);
        setBusinessProfile(null);
        setEmployeePayrollProfile(null);
        setPayoutHistory([]);
        setHoursWorked(0);
        setCheckNumber('');
        setSelectedHistoryPayout(null);
        setTimecardSummary(null);
        setPayoutWorkspaceTab('run');
        autoLoadedHoursKeyRef.current = null;
    };

    useEffect(() => {
        if (!employeeId) {
            if (activeEmployee) {
                setActiveEmployee(null);
                setBusinessProfile(null);
                setEmployeePayrollProfile(null);
                setPayoutHistory([]);
                setHoursWorked(0);
                setCheckNumber('');
                setSelectedHistoryPayout(null);
                setTimecardSummary(null);
            }
            return;
        }

        if (isLoading) return;

        const employee = employees.find((row) => row.id === employeeId);
        if (!employee) {
            toast.warning('Employee not found for payroll');
            navigate('/admin/employees/payroll');
            return;
        }

        if (activeEmployee?.id === employeeId) return;

        void loadPayoutWorkspace(employee);
    }, [activeEmployee, employeeId, employees, isLoading, loadPayoutWorkspace, navigate, toast]);

    useEffect(() => {
        if (!activeEmployee || !businessProfile || !wizard.complete || isLoadingModalData) return;
        if (!periodStart || !periodEnd) return;

        const autoLoadKey = `${activeEmployee.id}:${periodStart}:${periodEnd}`;
        if (autoLoadedHoursKeyRef.current === autoLoadKey) return;

        autoLoadedHoursKeyRef.current = autoLoadKey;
        const timeoutId = window.setTimeout(() => {
            void loadEmployeeHours(activeEmployee.id, periodStart, periodEnd);
        }, 250);

        return () => window.clearTimeout(timeoutId);
    }, [
        activeEmployee,
        businessProfile,
        isLoadingModalData,
        loadEmployeeHours,
        periodEnd,
        periodStart,
        wizard.complete,
    ]);

    const openBusinessSetup = (employer: Employer) => {
        const existingProfile = businessProfiles[employer];
        setBusinessForm(existingProfile ? mapBusinessProfileToForm(existingProfile) : getDefaultBusinessForm(employer));
        setBusinessSetupOpen(true);
    };

    const handleBusinessProfileSave = async () => {
        if (!businessForm.legal_name.trim()) {
            toast.warning('Legal business name is required');
            return;
        }

        const customStateBrackets = mapCustomStateBracketsToStored(businessForm.custom_state_brackets);
        if (businessForm.state_withholding_method === 'custom_brackets') {
            if (customStateBrackets.length === 0) {
                toast.warning('Add at least one custom state withholding bracket');
                return;
            }
            if (customStateBrackets[0].threshold !== 0) {
                toast.warning('The first custom state bracket must start at $0');
                return;
            }
        }

        setIsSavingWizard(true);

        const payload = {
            employer: businessForm.employer,
            legal_name: businessForm.legal_name.trim(),
            fein: businessForm.fein.trim() || null,
            address_line_1: businessForm.address_line_1.trim() || null,
            address_line_2: businessForm.address_line_2.trim() || null,
            city: businessForm.city.trim() || null,
            state: businessForm.state.trim().toUpperCase() || null,
            postal_code: businessForm.postal_code.trim() || null,
            country: businessForm.country.trim().toUpperCase() || null,
            tax_state: businessForm.tax_state.trim().toUpperCase(),
            state_withholding_method: businessForm.state_withholding_method,
            pay_frequency: businessForm.pay_frequency,
            state_income_tax_rate: percentFieldToStoredRate(businessForm.state_income_tax_rate),
            custom_state_standard_deduction: businessForm.custom_state_standard_deduction,
            custom_state_brackets: customStateBrackets,
            local_income_tax_rate: percentFieldToStoredRate(businessForm.local_income_tax_rate),
            state_unemployment_rate: percentFieldToStoredRate(businessForm.state_unemployment_rate),
            state_unemployment_wage_base: businessForm.state_unemployment_wage_base,
            futa_rate: percentFieldToStoredRate(businessForm.futa_rate),
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
        setBusinessProfiles((prev) => ({ ...prev, [saved.employer]: saved }));

        const activeEmployer = getPayrollEmployer(activeEmployee?.employer);
        if (activeEmployee && activeEmployer === saved.employer) {
            setBusinessProfile(saved);

            const dates = getDefaultPayrollDateRange(saved.pay_frequency);
            const startInput = toDateInput(dates.start);
            const endInput = toDateInput(dates.end);
            setPeriodStart(startInput);
            setPeriodEnd(endInput);
            autoLoadedHoursKeyRef.current = `${activeEmployee.id}:${startInput}:${endInput}`;
            await loadEmployeeHours(activeEmployee.id, startInput, endInput);
        }

        setBusinessSetupOpen(false);
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
            toast.warning('Enter a check number for check payments');
            return;
        }

        setIsRecordingPayout(true);
        const employerAddressSnapshot = getBusinessProfileAddress(businessProfile);
        const employeeAddressSnapshot = getEmployeeAddress(activeEmployee);

        const payload = {
            employee_id: activeEmployee.id,
            business_profile_id: businessProfile.id,
            payroll_profile_id: employeePayrollProfile.id,
            period_start: periodStart,
            period_end: periodEnd,
            hours_worked: hoursWorked,
            hourly_rate: hourlyRate,
            gross_pay: roundCurrency(calculation.grossPay),
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
            employer_name_snapshot: businessProfile.legal_name,
            employer_fein_snapshot: businessProfile.fein || null,
            employer_address_snapshot: employerAddressSnapshot || {},
            employee_name_snapshot: activeEmployee.name,
            employee_address_snapshot: employeeAddressSnapshot || {},
            tax_breakdown: {
                federal_filing_status: employeePayrollProfile.federal_filing_status,
                tax_classification: employeePayrollProfile.tax_classification,
                pay_frequency: businessProfile.pay_frequency,
                federal_source: getFederalSourceLabel(businessProfile),
                state_source: getStateSourceLabel(businessProfile),
                state_withholding_method: businessProfile.state_withholding_method,
                custom_state_standard_deduction: businessProfile.custom_state_standard_deduction || 0,
                custom_state_brackets: businessProfile.custom_state_brackets || [],
                timecard_source: timecardSummary
                    ? {
                        entry_count: timecardSummary.entryCount,
                        open_entry_count: timecardSummary.openEntryCount,
                        clipped_entry_count: timecardSummary.clippedEntryCount,
                        raw_hours_before_rounding: timecardSummary.rawHours,
                        rounded_hours: timecardSummary.roundedHours,
                        rounding_increment_hours: 0.1,
                        saved_hours_entry_count: timecardSummary.savedHoursEntryCount,
                        prorated_saved_hours_entry_count: timecardSummary.proratedSavedHoursEntryCount,
                        computed_hours_entry_count: timecardSummary.computedHoursEntryCount,
                        loaded_at: timecardSummary.loadedAt,
                    }
                    : null,
                ytd_from_recorded_payouts: ytdTotals,
            },
            payout_method: payoutMethod,
            check_number: payoutMethod === 'check' ? checkNumber.trim() : null,
            notes: payoutNotes.trim() || null,
            created_by_admin_id: user?.id || null,
        };

        const { error: insertError } = await supabase.from('employee_payouts').insert(payload);

        if (insertError) {
            setIsRecordingPayout(false);
            toast.error('Could not record payroll', insertError.message);
            return;
        }

        await loadPayoutHistory(activeEmployee.id);
        await refreshLatestPayouts();

        if (payoutMethod !== 'check') {
            setCheckNumber('');
        }
        setPayoutNotes('');
        setIsRecordingPayout(false);
        setPayoutWorkspaceTab('history');
        toast.success('Payroll recorded');
    };

    const handlePrintPayoutStatement = (row: EmployeePayoutRow) => {
        if (!activeEmployee || !businessProfile || !employeePayrollProfile) {
            toast.warning('Open this employee payroll page before printing');
            return;
        }

        const ytdForPaystub = buildPaystubYtdTotals(payoutHistory, row, employeePayrollProfile);
        const html = buildPaystubHtml({
            payout: row,
            employeeName: row.employee_name_snapshot || activeEmployee.name,
            employeeAddress: getSnapshotAddress(row.employee_address_snapshot, getEmployeeAddress(activeEmployee)),
            employerName: row.employer_name_snapshot || businessProfile.legal_name,
            employerFein: row.employer_fein_snapshot || businessProfile.fein || null,
            employerAddress: getSnapshotAddress(row.employer_address_snapshot, getBusinessProfileAddress(businessProfile)),
            businessProfile,
            taxClassification: employeePayrollProfile.tax_classification,
            ytdTotals: ytdForPaystub,
        });

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
                title="Payroll"
                description="Run employee payroll calculations, record payroll history, and print paystubs."
                actions={
                    <div className="text-xs text-[var(--color-muted)] max-w-sm">
                        Federal withholding and FICA are calculated automatically. State and local taxes are based on your configured rates.
                    </div>
                }
            />

            {!employeeId && (
                <>
                    <Card variant="outlined" className="mb-5">
                        <CardHeader>
                            <CardTitle className="text-base">Business Payroll Setup</CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {PAYROLL_EMPLOYERS.map((employer) => {
                                    const profile = businessProfiles[employer];
                                    const hasAddress = hasPaystubAddress(getBusinessProfileAddress(profile));
                                    return (
                                        <div key={employer} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <div className="font-semibold">{employer}</div>
                                                    <div className="text-xs text-[var(--color-muted)] mt-1">
                                                        {profile
                                                            ? `${profile.pay_frequency} payroll | ${getStateSourceLabel(profile)} | ${hasAddress ? 'Address on file' : 'Address missing'}`
                                                            : 'Configure employer-wide tax rates and pay frequency.'}
                                                    </div>
                                                </div>
                                                <span className={`text-xs font-semibold ${profile ? 'text-[var(--color-success)]' : 'text-[var(--color-warning)]'}`}>
                                                    {profile ? 'Configured' : 'Needs setup'}
                                                </span>
                                            </div>
                                            <Button className="w-full mt-3" variant={profile ? 'secondary' : 'primary'} onClick={() => openBusinessSetup(employer)}>
                                                {profile ? 'Edit Business Setup' : 'Set Up Business'}
                                            </Button>
                                        </div>
                                    );
                                })}
                            </div>
                        </CardContent>
                    </Card>

                    <Card variant="outlined" className="mb-5">
                        <CardContent className="p-4">
                            <div className="flex flex-col gap-3 md:flex-row md:items-end">
                                <div className="flex-1">
                                    <Input
                                        label="Search employees"
                                        placeholder="Name or employer"
                                        value={searchQuery}
                                        onChange={(event) => setSearchQuery(event.target.value)}
                                    />
                                </div>
                                <InactiveEmployeeToggle
                                    showInactive={showInactiveEmployees}
                                    inactiveCount={inactiveEmployeeCount}
                                    onChange={setShowInactiveEmployees}
                                />
                            </div>
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
                                            <div className="flex items-center justify-between gap-2">
                                                <CardTitle className="text-base">{employee.name}</CardTitle>
                                                {!employee.is_active && (
                                                    <span className="text-xs font-semibold text-[var(--color-muted)]">Inactive</span>
                                                )}
                                            </div>
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
                                                        <span className="text-[var(--color-muted)]">Last Payroll</span>
                                                        <span>{new Date(latest.paidAt).toLocaleDateString()}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-[var(--color-muted)]">Last Net</span>
                                                        <span className="font-semibold">{formatCurrency(latest.netPay)}</span>
                                                    </div>
                                                </>
                                            ) : (
                                                <p className="text-xs text-[var(--color-muted)]">No payroll history yet</p>
                                            )}

                                            <Button className="w-full mt-3" onClick={() => navigate(`/admin/employees/payroll/${employee.id}`)}>
                                                Run Payroll
                                            </Button>
                                        </CardContent>
                                    </Card>
                                );
                            })}
                        </div>
                    )}
                </>
            )}

            <Modal
                isOpen={businessSetupOpen}
                onClose={() => setBusinessSetupOpen(false)}
                title="Business Payroll Setup"
                size="3xl"
            >
                <div className="space-y-4">
                    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm text-[var(--color-muted)]">
                        Configure employer-wide pay frequency, unemployment rates, and state/local withholding sources once. Employee-specific W-4 and VA-4 choices stay in each employee payroll setup.
                    </div>

                    <BusinessPayrollSetupFields
                        businessForm={businessForm}
                        setBusinessForm={setBusinessForm}
                    />

                    <ModalFooter>
                        <Button variant="secondary" onClick={() => setBusinessSetupOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleBusinessProfileSave} isLoading={isSavingWizard}>
                            Save Business Setup
                        </Button>
                    </ModalFooter>
                </div>
            </Modal>

            {employeeId && (
                <div className="space-y-5">
                    <div className="flex flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                            <button
                                type="button"
                                onClick={closePayoutWorkspace}
                                className="mb-3 text-sm font-medium text-[var(--color-primary)] hover:underline"
                            >
                                Back to payroll roster
                            </button>
                            <h2 className="text-2xl font-semibold">{activeEmployee?.name || 'Employee'} Payroll</h2>
                            <p className="text-sm text-[var(--color-muted)] mt-1">
                                Review timecards, verify rates, preview withholding, and record this employee payroll run.
                            </p>
                        </div>
                        {activeEmployee && (
                            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4 lg:min-w-[520px]">
                                <SummaryBox label="Employer" value={activeEmployee.employer || 'Not set'} />
                                <SummaryBox label="Hourly Rate" value={`${formatCurrency(activeEmployee.hourly_rate)}/hr`} />
                                <SummaryBox label="This Week" value={`${activeEmployee.weeklyHours.toFixed(2)} h`} />
                                <SummaryBox
                                    label="Paystub Address"
                                    value={hasPaystubAddress(getEmployeeAddress(activeEmployee)) ? 'On file' : 'Missing'}
                                    detail={employeePayrollProfile ? 'Tax setup configured' : 'Tax setup needed'}
                                />
                            </div>
                        )}
                    </div>

                {isLoadingModalData ? (
                    <div className="flex items-center justify-center h-52">
                        <LoadingSpinner size={28} />
                    </div>
                ) : (
                    <>
                        <PayoutWorkspaceTabs
                            activeTab={payoutWorkspaceTab}
                            onChange={setPayoutWorkspaceTab}
                            historyCount={payoutHistory.length}
                        />

                        {payoutWorkspaceTab === 'history' ? (
                            <PayoutHistoryTab
                                payoutHistory={payoutHistory}
                                ytdTotals={ytdTotals}
                                onViewPayout={setSelectedHistoryPayout}
                                onPrintPayout={handlePrintPayoutStatement}
                            />
                        ) : !wizard.complete ? (
                            <div className="space-y-4">
                                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm">
                                    Employee Tax Setup
                                </div>

                                {wizard.current === 2 ? (
                                    <EmployeePayrollSetupFields
                                        employeePayrollForm={employeePayrollForm}
                                        setEmployeePayrollForm={setEmployeePayrollForm}
                                        usesVirginiaBrackets={businessProfile?.state_withholding_method === 'virginia_brackets'}
                                    />
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
                                        {businessProfile?.state_withholding_method === 'virginia_brackets' && (
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
                                    <Button variant="secondary" onClick={closePayoutWorkspace}>
                                        Cancel
                                    </Button>
                                    <Button onClick={handleEmployeePayrollProfileSave} isLoading={isSavingWizard}>
                                        Save Employee Setup
                                    </Button>
                                </ModalFooter>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <PayrollReviewSteps />

                                <Card variant="outlined">
                                    <CardHeader>
                                        <CardTitle className="text-base">1. Pay Period & Timecards</CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-4 space-y-4">
                                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                            <Input
                                                label="Period Start"
                                                type="date"
                                                value={periodStart}
                                                onChange={(event) => {
                                                    setPeriodStart(event.target.value);
                                                    setTimecardSummary(null);
                                                }}
                                            />
                                            <Input
                                                label="Period End"
                                                type="date"
                                                value={periodEnd}
                                                onChange={(event) => {
                                                    setPeriodEnd(event.target.value);
                                                    setTimecardSummary(null);
                                                }}
                                            />
                                            <Input
                                                label="Payable Hours"
                                                type="number"
                                                step="0.1"
                                                value={hoursWorked}
                                                onChange={(event) => {
                                                    setHoursWorked(numberValue(event.target.value));
                                                    setTimecardSummary(null);
                                                }}
                                                hint="Loaded from timestamps and rounded to the nearest tenth of an hour."
                                            />
                                            <Input
                                                label="Hourly Rate"
                                                type="number"
                                                step="0.01"
                                                value={hourlyRate}
                                                onChange={(event) => setHourlyRate(numberValue(event.target.value))}
                                                hint="Defaults from the employee profile."
                                            />
                                        </div>

                                        <TimecardSourceSummary
                                            summary={timecardSummary}
                                            hoursWorked={hoursWorked}
                                            onReload={() => activeEmployee && loadEmployeeHours(activeEmployee.id, periodStart, periodEnd)}
                                            isLoading={hoursLoadStatus === 'loading'}
                                        />
                                    </CardContent>
                                </Card>

                                <RateAndTaxSourceSummary
                                    employee={activeEmployee}
                                    businessProfile={businessProfile}
                                    employeePayrollProfile={employeePayrollProfile}
                                    hourlyRate={hourlyRate}
                                    ytdTotals={ytdTotals}
                                    onEditBusinessSetup={() => {
                                        const employer = getPayrollEmployer(activeEmployee?.employer);
                                        openBusinessSetup(employer);
                                    }}
                                    onEditTaxSetup={() => {
                                        setWizard({ current: 2, complete: false });
                                        setEmployeePayrollForm(
                                            employeePayrollProfile
                                                ? mapEmployeeProfileToForm(employeePayrollProfile)
                                                : getDefaultEmployeePayrollForm(),
                                        );
                                    }}
                                />

                                {!businessProfile ? (
                                    <Card variant="outlined">
                                        <CardContent className="p-4 space-y-3 text-sm">
                                            <div>
                                                <div className="font-semibold text-[var(--color-foreground)]">Business setup required</div>
                                                <div className="text-[var(--color-muted)] mt-1">
                                                    Configure {activeEmployee?.employer || 'this employer'} before previewing net pay, employer taxes, or recording this payroll run.
                                                </div>
                                            </div>
                                            <Button onClick={() => openBusinessSetup(getPayrollEmployer(activeEmployee?.employer))}>
                                                Open Business Setup
                                            </Button>
                                        </CardContent>
                                    </Card>
                                ) : !employeePayrollProfile || !calculation || !accuracyBasis ? (
                                    <Card variant="outlined">
                                        <CardContent className="p-4 text-sm text-[var(--color-muted)]">
                                            Enter hours and ensure employee payroll setup is complete to preview payroll calculations.
                                        </CardContent>
                                    </Card>
                                ) : (
                                    <Card variant="outlined">
                                        <CardHeader>
                                            <CardTitle className="text-base">Payroll Preview</CardTitle>
                                        </CardHeader>
                                        <CardContent className="p-4">
                                            <PayoutPreview
                                                calculation={calculation}
                                                businessProfile={businessProfile}
                                                employeePayrollProfile={employeePayrollProfile}
                                                accuracyBasis={accuracyBasis}
                                            />
                                        </CardContent>
                                    </Card>
                                )}

                                <Input
                                    label="Notes"
                                    value={payoutNotes}
                                    onChange={(event) => setPayoutNotes(event.target.value)}
                                    placeholder="Optional payroll notes"
                                />
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <Select
                                        label="Payment Method"
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
                                            placeholder="Only required for check payments"
                                        />
                                    )}
                                </div>

                                <ModalFooter>
                                    <Button variant="secondary" onClick={closePayoutWorkspace}>
                                        Back to Roster
                                    </Button>
                                    <Button
                                        onClick={handleRecordPayout}
                                        isLoading={isRecordingPayout}
                                        disabled={!calculation}
                                    >
                                        Record Payroll
                                    </Button>
                                </ModalFooter>

                            </div>
                        )}
                    </>
                )}
                </div>
            )}

            <Modal
                isOpen={!!selectedHistoryPayout}
                onClose={() => setSelectedHistoryPayout(null)}
                title="Payroll Details"
                size="lg"
            >
                {selectedHistoryPayout && (
                    <div className="space-y-2 text-sm">
                        <DetailRow label="Paystub #" value={getPaystubShortCode(selectedHistoryPayout.id)} />
                        <DetailRow label="Paid At" value={new Date(selectedHistoryPayout.paid_at).toLocaleString()} />
                        <DetailRow
                            label="Period"
                            value={formatDateRange(selectedHistoryPayout.period_start, selectedHistoryPayout.period_end)}
                        />
                        <DetailRow
                            label="Employee Address"
                            value={formatPaystubAddressLines(getSnapshotAddress(selectedHistoryPayout.employee_address_snapshot, getEmployeeAddress(activeEmployee))).join(', ')}
                        />
                        <DetailRow
                            label="Employer Address"
                            value={formatPaystubAddressLines(getSnapshotAddress(selectedHistoryPayout.employer_address_snapshot, getBusinessProfileAddress(businessProfile))).join(', ')}
                        />
                        <DetailRow label="Hours Worked" value={formatPayoutHours(selectedHistoryPayout.hours_worked)} />
                        <DetailRow label="Hourly Rate" value={formatCurrency(selectedHistoryPayout.hourly_rate)} />
                        <DetailRow label="Payment Method" value={`${getPayoutMethodLabel(selectedHistoryPayout.payout_method)}${selectedHistoryPayout.check_number ? ` #${selectedHistoryPayout.check_number}` : ''}`} />
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
                                Print Paystub
                            </Button>
                        </ModalFooter>
                    </div>
                )}
            </Modal>
        </div>
    );
}

function PayoutPreview({
    calculation,
    businessProfile,
    employeePayrollProfile,
    accuracyBasis,
}: {
    calculation: PayrollCalculationResult;
    businessProfile: PayrollBusinessProfile;
    employeePayrollProfile: EmployeePayrollProfile;
    accuracyBasis: PayrollAccuracyBasis;
}) {
    const employeeDeductions = [
        { label: 'Federal Withholding', value: calculation.federalWithholding },
        { label: 'Social Security', value: calculation.socialSecurityTax },
        { label: 'Medicare', value: calculation.medicareTax },
        { label: 'Additional Medicare', value: calculation.additionalMedicareTax },
        { label: 'State Withholding', value: calculation.stateWithholding },
        { label: 'Local Withholding', value: calculation.localWithholding },
        { label: '1099 Backup Withholding', value: calculation.contractorBackupWithholding },
    ];
    const employerTaxes = [
        { label: 'Employer Social Security', value: calculation.employerSocialSecurityTax },
        { label: 'Employer Medicare', value: calculation.employerMedicareTax },
        { label: 'Employer FUTA', value: calculation.employerFutaTax },
        { label: 'Employer SUTA', value: calculation.employerSutaTax },
    ];
    const totalEmployeeDeductions = employeeDeductions.reduce((sum, item) => sum + item.value, 0);
    const totalEmployerTaxes = employerTaxes.reduce((sum, item) => sum + item.value, 0);
    const taxBasisNotes = getTaxBasisNotes(businessProfile, employeePayrollProfile, accuracyBasis);

    return (
        <div className="overflow-hidden rounded-lg border border-[var(--color-border)]">
            <div className="flex flex-col gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <div className="text-xs font-semibold uppercase text-[var(--color-muted)]">Gross Earnings</div>
                    <div className="mt-1 text-sm text-[var(--color-muted)]">Starting pay before employee withholdings.</div>
                </div>
                <div className="text-2xl font-semibold text-[var(--color-foreground)]">{formatCurrency(calculation.grossPay)}</div>
            </div>

            <div className="border-b border-[var(--color-border)] px-4 py-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <div className="text-xs font-semibold uppercase text-[var(--color-muted)]">Tax Basis Check</div>
                        <div className="mt-1 text-sm text-[var(--color-muted)]">
                            The amounts below are the wage totals and annualized figures used for this preview.
                        </div>
                    </div>
                    <div className="text-xs text-[var(--color-muted)]">
                        {businessProfile.pay_frequency} payroll, {accuracyBasis.payPeriods} checks per year
                    </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    <PreviewBasisBox
                        label="YTD Before This Check"
                        value={formatCurrency(accuracyBasis.ytdWagesBefore)}
                        detail="Prior setup plus recorded payroll runs."
                    />
                    <PreviewBasisBox
                        label="This Gross Pay"
                        value={formatCurrency(calculation.grossPay)}
                        detail="Hours multiplied by the hourly rate."
                    />
                    <PreviewBasisBox
                        label="YTD After This Check"
                        value={formatCurrency(accuracyBasis.ytdWagesAfter)}
                        detail="Used for wage-base taxes."
                    />
                    <PreviewBasisBox
                        label="Annualized Gross"
                        value={formatCurrency(accuracyBasis.annualizedGross)}
                        detail="This check projected across the pay frequency."
                    />
                </div>

                <div className="mt-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3">
                    <div className="text-xs font-semibold uppercase text-[var(--color-muted)]">Why It Is Taxed This Way</div>
                    <div className="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-2">
                        {taxBasisNotes.map((note) => (
                            <div key={note.label} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2">
                                <div className="text-xs font-semibold text-[var(--color-foreground)]">{note.label}</div>
                                <div className="mt-1 text-xs leading-relaxed text-[var(--color-muted)]">{note.detail}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.7fr)]">
                <div className="border-b border-[var(--color-border)] lg:border-b-0 lg:border-r">
                    <div className="border-b border-[var(--color-border)] px-4 py-3">
                        <div className="text-xs font-semibold uppercase text-[var(--color-muted)]">Employee Withholdings</div>
                    </div>
                    <div className="divide-y divide-[var(--color-border)]">
                        {employeeDeductions.map((item) => (
                            <StatementLine key={item.label} label={item.label} value={-item.value} />
                        ))}
                    </div>
                    <StatementLine label="Total Employee Withholdings" value={-totalEmployeeDeductions} strong />
                </div>

                <div>
                    <div className="border-b border-[var(--color-border)] px-4 py-3">
                        <div className="text-xs font-semibold uppercase text-[var(--color-muted)]">Employer Taxes</div>
                    </div>
                    <div className="divide-y divide-[var(--color-border)]">
                        {employerTaxes.map((item) => (
                            <StatementLine key={item.label} label={item.label} value={item.value} />
                        ))}
                    </div>
                    <StatementLine label="Total Employer Taxes" value={totalEmployerTaxes} strong />
                </div>
            </div>

            <div className="flex flex-col gap-2 border-t border-[var(--color-border)] bg-[var(--color-primary)] px-4 py-4 text-white sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <div className="text-xs font-semibold uppercase opacity-80">Final Net Pay</div>
                    <div className="mt-1 text-sm opacity-80">Gross pay minus employee withholdings.</div>
                </div>
                <div className="text-3xl font-semibold">{formatCurrency(calculation.netPay)}</div>
            </div>
        </div>
    );
}

function PayoutWorkspaceTabs({
    activeTab,
    onChange,
    historyCount,
}: {
    activeTab: PayoutWorkspaceTab;
    onChange: (tab: PayoutWorkspaceTab) => void;
    historyCount: number;
}) {
    const tabs: Array<{ id: PayoutWorkspaceTab; label: string; detail: string }> = [
        { id: 'run', label: 'Run Payroll', detail: 'Calculate and record this pay period.' },
        { id: 'history', label: `History (${historyCount})`, detail: 'Review and print recorded payroll runs.' },
    ];

    return (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                    <button
                        key={tab.id}
                        type="button"
                        onClick={() => onChange(tab.id)}
                        className={`rounded-lg border px-4 py-3 text-left transition ${
                            isActive
                                ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white'
                                : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-foreground)] hover:border-[var(--color-primary)]'
                        }`}
                    >
                        <div className="text-sm font-semibold">{tab.label}</div>
                        <div className={`mt-1 text-xs ${isActive ? 'text-white/80' : 'text-[var(--color-muted)]'}`}>
                            {tab.detail}
                        </div>
                    </button>
                );
            })}
        </div>
    );
}

function PayoutHistoryTab({
    payoutHistory,
    ytdTotals,
    onViewPayout,
    onPrintPayout,
}: {
    payoutHistory: EmployeePayoutRow[];
    ytdTotals: PayrollYtdTotals;
    onViewPayout: (payout: EmployeePayoutRow) => void;
    onPrintPayout: (payout: EmployeePayoutRow) => void;
}) {
    const ytdNetPay = payoutHistory
        .filter((row) => new Date(row.paid_at).getFullYear() === new Date().getFullYear())
        .reduce((sum, row) => sum + Number(row.net_pay || 0), 0);
    const ytdEmployeeWithheld = payoutHistory
        .filter((row) => new Date(row.paid_at).getFullYear() === new Date().getFullYear())
        .reduce((sum, row) => (
            sum
            + Number(row.federal_withholding || 0)
            + Number(row.social_security_tax || 0)
            + Number(row.medicare_tax || 0)
            + Number(row.additional_medicare_tax || 0)
            + Number(row.state_withholding || 0)
            + Number(row.local_withholding || 0)
            + Number(row.contractor_backup_withholding || 0)
        ), 0);

    return (
        <Card variant="outlined">
            <CardHeader>
                <CardTitle className="text-base">Payroll History</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <SummaryBox label="Current-Year Gross" value={formatCurrency(ytdTotals.wages)} detail="Recorded payroll runs this year." />
                    <SummaryBox label="Current-Year Net" value={formatCurrency(ytdNetPay)} detail="Net paid to employee." />
                    <SummaryBox label="Employee Withheld" value={formatCurrency(ytdEmployeeWithheld)} detail="Taxes withheld from checks." />
                </div>

                {payoutHistory.length === 0 ? (
                    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center">
                        <p className="font-semibold text-[var(--color-foreground)]">No payroll runs recorded yet</p>
                        <p className="mt-1 text-sm text-[var(--color-muted)]">Recorded payroll runs will appear here with view and print actions.</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {payoutHistory.map((row) => (
                            <div key={row.id} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                    <div>
                                        <div className="text-sm font-semibold">
                                            Paystub #{getPaystubShortCode(row.id)} | {formatDateRange(row.period_start, row.period_end)}
                                        </div>
                                        <div className="mt-1 text-xs text-[var(--color-muted)]">
                                            Paid {new Date(row.paid_at).toLocaleDateString()} | {formatPayoutHours(row.hours_worked)} | {getPayoutMethodLabel(row.payout_method)}{row.check_number ? ` #${row.check_number}` : ''}
                                        </div>
                                        <div className="mt-1 text-xs text-[var(--color-muted)]">
                                            {hasPaystubAddress(row.employee_address_snapshot) ? 'Employee address snapshotted' : 'Employee address not snapshotted'}
                                            {' | '}
                                            {hasPaystubAddress(row.employer_address_snapshot) ? 'Employer address snapshotted' : 'Employer address not snapshotted'}
                                        </div>
                                    </div>
                                    <div className="text-left md:text-right">
                                        <div className="text-sm font-semibold">{formatCurrency(row.net_pay)}</div>
                                        <div className="mt-1 text-xs text-[var(--color-muted)]">Gross {formatCurrency(row.gross_pay)}</div>
                                    </div>
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    <Button size="sm" variant="secondary" onClick={() => onViewPayout(row)}>
                                        View
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={() => onPrintPayout(row)}>
                                        Print Paystub
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

function getTaxBasisNotes(
    businessProfile: PayrollBusinessProfile,
    employeePayrollProfile: EmployeePayrollProfile,
    accuracyBasis: PayrollAccuracyBasis,
): Array<{ label: string; detail: string }> {
    if (!accuracyBasis.isW2) {
        return [
            {
                label: 'Contractor Tax Treatment',
                detail: employeePayrollProfile.backup_withholding_enabled
                    ? 'This profile is marked as a 1099 contractor, so payroll taxes are not withheld here, but 24% backup withholding is applied.'
                    : 'This profile is marked as a 1099 contractor, so employee payroll taxes are not withheld unless backup withholding is enabled.',
            },
        ];
    }

    const federalDetail = employeePayrollProfile.federal_exempt
        ? 'Federal withholding is zero because this employee is marked federal exempt.'
        : [
            `This check is annualized to ${formatCurrency(accuracyBasis.annualizedGross)} over ${accuracyBasis.payPeriods} pay periods.`,
            `After W-4 adjustments, the federal taxable annual wage estimate is ${formatCurrency(accuracyBasis.federalAdjustedAnnualWages)}.`,
            accuracyBasis.federalDependentCreditsPerPeriod > 0
                ? `${formatCurrency(accuracyBasis.federalDependentCreditsPerPeriod)} of dependent credit is applied to this check.`
                : '',
        ].filter(Boolean).join(' ');

    const socialSecurityDetail = accuracyBasis.socialSecurityTaxableWagesThisCheck <= 0
        ? `Social Security is zero because prior Social Security wages already reached the ${formatCurrency(SOCIAL_SECURITY_WAGE_BASE_2026)} wage base.`
        : `Social Security uses ${formatCurrency(accuracyBasis.socialSecurityTaxableWagesThisCheck)} of this check because this employee had ${formatCurrency(accuracyBasis.socialSecurityWagesBefore)} in Social Security wages before this payroll run. The 2026 wage base is ${formatCurrency(SOCIAL_SECURITY_WAGE_BASE_2026)}.`;

    const medicareDetail = accuracyBasis.additionalMedicareTaxableWagesThisCheck > 0
        ? `Regular Medicare applies to this check. Additional Medicare applies to ${formatCurrency(accuracyBasis.additionalMedicareTaxableWagesThisCheck)} because Medicare wages are over ${formatCurrency(ADDITIONAL_MEDICARE_THRESHOLD)}.`
        : `Regular Medicare applies to this check. Additional Medicare is zero because Medicare wages before this payroll run were ${formatCurrency(accuracyBasis.medicareWagesBefore)}, below the ${formatCurrency(ADDITIONAL_MEDICARE_THRESHOLD)} threshold.`;

    return [
        { label: 'Federal Withholding', detail: federalDetail },
        { label: 'Social Security', detail: socialSecurityDetail },
        { label: 'Medicare', detail: medicareDetail },
        { label: 'State and Local', detail: getStateTaxBasisNote(businessProfile, employeePayrollProfile, accuracyBasis) },
    ];
}

function getStateTaxBasisNote(
    businessProfile: PayrollBusinessProfile,
    employeePayrollProfile: EmployeePayrollProfile,
    accuracyBasis: PayrollAccuracyBasis,
): string {
    if (employeePayrollProfile.state_exempt) {
        return 'State and local withholding are zero because this employee is marked state/local exempt.';
    }

    const additionalText = accuracyBasis.stateAdditionalWithholding > 0
        ? ` Then ${formatCurrency(accuracyBasis.stateAdditionalWithholding)} of extra state withholding is added to this check.`
        : '';
    const localText = businessProfile.local_income_tax_rate > 0
        ? ` Local withholding uses ${formatPercent(businessProfile.local_income_tax_rate)} of gross pay.`
        : ' Local withholding is zero because the local rate is 0%.';

    if (businessProfile.state_withholding_method === 'virginia_brackets') {
        return `Virginia withholding annualizes this check, subtracts ${formatCurrency(accuracyBasis.stateAnnualDeduction)} of VA deductions/exemptions, applies the VA bracket schedule to ${formatCurrency(accuracyBasis.stateAnnualizedTaxableIncome)}, then divides back to one check.${additionalText}${localText}`;
    }

    if (businessProfile.state_withholding_method === 'custom_brackets') {
        return `${businessProfile.tax_state} withholding annualizes this check, subtracts ${formatCurrency(accuracyBasis.stateAnnualDeduction)}, applies ${accuracyBasis.stateBracketCount || 0} custom bracket${accuracyBasis.stateBracketCount === 1 ? '' : 's'} to ${formatCurrency(accuracyBasis.stateAnnualizedTaxableIncome)}, then divides back to one check.${additionalText}${localText}`;
    }

    return `${businessProfile.tax_state} withholding uses a flat ${formatPercent(businessProfile.state_income_tax_rate)} of this check's gross pay.${additionalText}${localText}`;
}

function PreviewBasisBox({ label, value, detail }: { label: string; value: string; detail: string }) {
    return (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2">
            <div className="text-[11px] font-semibold uppercase text-[var(--color-muted)]">{label}</div>
            <div className="mt-1 text-lg font-semibold tabular-nums text-[var(--color-foreground)]">{value}</div>
            <div className="mt-1 text-xs leading-relaxed text-[var(--color-muted)]">{detail}</div>
        </div>
    );
}

function StatementLine({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
    const displayValue = Math.abs(value) < 0.005 ? 0 : value;

    return (
        <div className={`flex items-center justify-between gap-4 px-4 py-3 text-sm ${strong ? 'bg-[var(--color-surface)] font-semibold' : ''}`}>
            <span className={strong ? 'text-[var(--color-foreground)]' : 'text-[var(--color-muted)]'}>{label}</span>
            <span className="font-semibold tabular-nums text-[var(--color-foreground)]">{formatCurrency(displayValue)}</span>
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

function PayrollReviewSteps() {
    const steps = ['Load timecards', 'Verify rates', 'Record payroll'];

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {steps.map((step, index) => (
                <div key={step} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
                    <div className="text-xs font-semibold text-[var(--color-primary)]">Step {index + 1}</div>
                    <div className="text-sm font-medium">{step}</div>
                </div>
            ))}
        </div>
    );
}

function BusinessPayrollSetupFields({
    businessForm,
    setBusinessForm,
}: {
    businessForm: PayrollBusinessProfileForm;
    setBusinessForm: Dispatch<SetStateAction<PayrollBusinessProfileForm>>;
}) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Select
                label="Employer"
                value={businessForm.employer}
                onChange={(event) => {
                    const employer = event.target.value as Employer;
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
            <div className="md:col-span-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <p className="text-sm font-semibold">Business Mailing Address</p>
                        <p className="mt-1 text-xs text-[var(--color-muted)]">Printed in the employer block on employee paystubs.</p>
                    </div>
                    <span className={`text-xs font-semibold ${hasPaystubAddress(getBusinessFormAddress(businessForm)) ? 'text-[var(--color-success)]' : 'text-[var(--color-warning)]'}`}>
                        {hasPaystubAddress(getBusinessFormAddress(businessForm)) ? 'Address on file' : 'Address missing'}
                    </span>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <Input
                        label="Address Line 1"
                        value={businessForm.address_line_1}
                        onChange={(event) => setBusinessForm((prev) => ({ ...prev, address_line_1: event.target.value }))}
                    />
                    <Input
                        label="Address Line 2"
                        value={businessForm.address_line_2}
                        onChange={(event) => setBusinessForm((prev) => ({ ...prev, address_line_2: event.target.value }))}
                    />
                    <Input
                        label="City"
                        value={businessForm.city}
                        onChange={(event) => setBusinessForm((prev) => ({ ...prev, city: event.target.value }))}
                    />
                    <Input
                        label="State"
                        value={businessForm.state}
                        maxLength={2}
                        onChange={(event) => setBusinessForm((prev) => ({ ...prev, state: event.target.value.toUpperCase() }))}
                    />
                    <Input
                        label="ZIP / Postal Code"
                        value={businessForm.postal_code}
                        onChange={(event) => setBusinessForm((prev) => ({ ...prev, postal_code: event.target.value }))}
                    />
                    <Input
                        label="Country"
                        value={businessForm.country}
                        maxLength={2}
                        onChange={(event) => setBusinessForm((prev) => ({ ...prev, country: event.target.value.toUpperCase() }))}
                    />
                </div>
            </div>
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
                    { value: 'custom_rate', label: 'Flat Rate' },
                    { value: 'custom_brackets', label: 'Custom Progressive Brackets' },
                    { value: 'virginia_brackets', label: 'Virginia Brackets' },
                ]}
            />
            {businessForm.state_withholding_method !== 'virginia_brackets' ? (
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
            {businessForm.state_withholding_method === 'custom_rate' && (
                <Input
                    label="State Income Tax Rate (%)"
                    type="number"
                    step="0.1"
                    value={businessForm.state_income_tax_rate}
                    onChange={(event) => setBusinessForm((prev) => ({ ...prev, state_income_tax_rate: numberValue(event.target.value) }))}
                    hint="Enter 5 for 5%."
                />
            )}
            {businessForm.state_withholding_method === 'virginia_brackets' && (
                <Input
                    label="State Income Tax"
                    value="Virginia Tax Rate Schedule (2% / 3% / 5% / 5.75%)"
                    readOnly
                    hint="Uses Virginia schedule on annualized wages and rounds annual tax to whole dollars."
                />
            )}
            {businessForm.state_withholding_method === 'custom_brackets' && (
                <CustomStateBracketEditor
                    brackets={businessForm.custom_state_brackets}
                    standardDeduction={businessForm.custom_state_standard_deduction}
                    onStandardDeductionChange={(value) => setBusinessForm((prev) => ({ ...prev, custom_state_standard_deduction: value }))}
                    onBracketsChange={(brackets) => setBusinessForm((prev) => ({ ...prev, custom_state_brackets: brackets }))}
                />
            )}
            <Input
                label="Local Income Tax Rate (%)"
                type="number"
                step="0.1"
                value={businessForm.local_income_tax_rate}
                onChange={(event) => setBusinessForm((prev) => ({ ...prev, local_income_tax_rate: numberValue(event.target.value) }))}
                hint="Enter 0 if no local payroll income tax applies."
            />
            <Input
                label="State Unemployment Rate (%)"
                type="number"
                step="0.1"
                value={businessForm.state_unemployment_rate}
                onChange={(event) => setBusinessForm((prev) => ({ ...prev, state_unemployment_rate: numberValue(event.target.value) }))}
                hint="Enter the employer SUTA percentage for this business."
            />
            <Input
                label="State Unemployment Wage Base"
                type="number"
                step="0.01"
                value={businessForm.state_unemployment_wage_base}
                onChange={(event) => setBusinessForm((prev) => ({ ...prev, state_unemployment_wage_base: numberValue(event.target.value) }))}
            />
            <Input
                label="FUTA Rate (%)"
                type="number"
                step="0.1"
                value={businessForm.futa_rate}
                onChange={(event) => setBusinessForm((prev) => ({ ...prev, futa_rate: numberValue(event.target.value) }))}
                hint="Default federal FUTA rate after standard credit is 0.6%."
            />
        </div>
    );
}

function CustomStateBracketEditor({
    brackets,
    standardDeduction,
    onStandardDeductionChange,
    onBracketsChange,
}: {
    brackets: CustomStateBracketForm[];
    standardDeduction: number;
    onStandardDeductionChange: (value: number) => void;
    onBracketsChange: (brackets: CustomStateBracketForm[]) => void;
}) {
    const updateBracket = (index: number, updates: Partial<CustomStateBracketForm>) => {
        onBracketsChange(brackets.map((bracket, bracketIndex) => (
            bracketIndex === index ? { ...bracket, ...updates } : bracket
        )));
    };
    const deleteBracket = (index: number) => {
        onBracketsChange(brackets.filter((_, bracketIndex) => bracketIndex !== index));
    };
    const addBracket = () => {
        const lastBracket = brackets[brackets.length - 1];
        onBracketsChange([
            ...brackets,
            {
                threshold: lastBracket ? Math.max(0, lastBracket.threshold + 1000) : 0,
                baseTax: lastBracket ? lastBracket.baseTax : 0,
                rate: lastBracket ? lastBracket.rate : 0,
            },
        ]);
    };

    return (
        <div className="md:col-span-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                    <p className="text-sm font-semibold">Custom Progressive State Withholding</p>
                    <p className="mt-1 text-xs text-[var(--color-muted)]">
                        Annualize each paycheck, subtract the annual deduction, then use the bracket whose threshold is at or below taxable income.
                    </p>
                </div>
                <Button size="sm" variant="secondary" onClick={addBracket}>
                    Add Bracket
                </Button>
            </div>

            <div className="mt-3">
                <Input
                    label="Annual Deduction Before Brackets"
                    type="number"
                    step="0.01"
                    min="0"
                    value={standardDeduction}
                    onChange={(event) => onStandardDeductionChange(Math.max(0, numberValue(event.target.value)))}
                    hint="Optional annual amount subtracted before applying the bracket schedule."
                />
            </div>

            <div className="mt-3 space-y-2">
                <div className="hidden grid-cols-[1fr_1fr_1fr_auto] gap-2 px-1 text-xs font-semibold uppercase text-[var(--color-muted)] md:grid">
                    <span>Annual income over</span>
                    <span>Base tax</span>
                    <span>Rate on excess</span>
                    <span />
                </div>
                {brackets.map((bracket, index) => (
                    <div key={index} className="grid grid-cols-1 gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-2 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
                        <Input
                            label="Annual income over"
                            type="number"
                            step="0.01"
                            min="0"
                            value={bracket.threshold}
                            onChange={(event) => updateBracket(index, { threshold: Math.max(0, numberValue(event.target.value)) })}
                        />
                        <Input
                            label="Base tax"
                            type="number"
                            step="0.01"
                            min="0"
                            value={bracket.baseTax}
                            onChange={(event) => updateBracket(index, { baseTax: Math.max(0, numberValue(event.target.value)) })}
                        />
                        <Input
                            label="Rate on excess (%)"
                            type="number"
                            step="0.01"
                            min="0"
                            value={bracket.rate}
                            onChange={(event) => updateBracket(index, { rate: Math.max(0, numberValue(event.target.value)) })}
                        />
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => deleteBracket(index)}
                            disabled={brackets.length === 1}
                        >
                            Delete
                        </Button>
                    </div>
                ))}
            </div>

            <p className="mt-3 text-xs text-[var(--color-muted)]">
                Example: a row with annual income over $17,000, base tax $720, and rate 5.75% means tax is $720 plus 5.75% of income above $17,000.
            </p>
        </div>
    );
}

function EmployeePayrollSetupFields({
    employeePayrollForm,
    setEmployeePayrollForm,
    usesVirginiaBrackets,
}: {
    employeePayrollForm: EmployeePayrollProfileForm;
    setEmployeePayrollForm: Dispatch<SetStateAction<EmployeePayrollProfileForm>>;
    usesVirginiaBrackets: boolean;
}) {
    return (
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
            {usesVirginiaBrackets && (
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
    );
}

function TimecardSourceSummary({
    summary,
    hoursWorked,
    onReload,
    isLoading,
}: {
    summary: TimecardLoadSummary | null;
    hoursWorked: number;
    onReload: () => void;
    isLoading: boolean;
}) {
    return (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                    <p className="text-sm font-semibold">Timecard Source</p>
                    <p className="text-xs text-[var(--color-muted)] mt-1">
                        Automatically reloads when the pay period dates change. Uses saved payable timecard totals, including unpaid lunch/admin edits, then rounds the final total to the nearest tenth of an hour.
                    </p>
                </div>
                <Button variant="secondary" onClick={onReload} isLoading={isLoading}>
                    Refresh Hours
                </Button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3 text-sm">
                <SummaryBox label="Payable Hours" value={formatPayoutHours(hoursWorked)} detail="Rounded to nearest 0.1 hour." />
                <SummaryBox label="Source Total" value={summary ? `${summary.rawHours.toFixed(3)} h` : 'Manual'} detail="Payable hours before tenth-hour rounding." />
                <SummaryBox label="Entries Loaded" value={summary ? String(summary.entryCount) : 'Manual'} />
                <SummaryBox label="Loaded At" value={summary ? new Date(summary.loadedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }) : 'Not loaded'} />
            </div>

            {summary && (
                <div className="mt-2 text-xs text-[var(--color-muted)]">
                    {summary.savedHoursEntryCount} saved entr{summary.savedHoursEntryCount === 1 ? 'y' : 'ies'} used
                    {summary.proratedSavedHoursEntryCount > 0 ? `, ${summary.proratedSavedHoursEntryCount} prorated at period boundary` : ''}
                    {summary.computedHoursEntryCount > 0 ? `, ${summary.computedHoursEntryCount} computed from timestamps` : ''}
                    .
                </div>
            )}

            {summary && (summary.openEntryCount > 0 || summary.clippedEntryCount > 0) && (
                <div className="mt-3 rounded-lg border border-[var(--color-warning)] bg-[var(--color-warning-bg)] p-2 text-xs text-[var(--color-warning)]">
                    {summary.openEntryCount > 0 && (
                        <p>{summary.openEntryCount} open timecard entr{summary.openEntryCount === 1 ? 'y is' : 'ies are'} included through the load time.</p>
                    )}
                    {summary.clippedEntryCount > 0 && (
                        <p>{summary.clippedEntryCount} entr{summary.clippedEntryCount === 1 ? 'y was' : 'ies were'} clipped to the selected pay period boundary.</p>
                    )}
                </div>
            )}
        </div>
    );
}

function RateAndTaxSourceSummary({
    employee,
    businessProfile,
    employeePayrollProfile,
    hourlyRate,
    ytdTotals,
    onEditBusinessSetup,
    onEditTaxSetup,
}: {
    employee: EmployeeWithStats | null;
    businessProfile: PayrollBusinessProfile | null;
    employeePayrollProfile: EmployeePayrollProfile | null;
    hourlyRate: number;
    ytdTotals: PayrollYtdTotals;
    onEditBusinessSetup: () => void;
    onEditTaxSetup: () => void;
}) {
    return (
        <Card variant="outlined">
            <CardHeader>
                <CardTitle className="text-base">2. Rates & Tax Sources</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                    <SummaryBox
                        label="Hourly Rate Used"
                        value={`${formatCurrency(hourlyRate)}/hr`}
                        detail={employee ? `Employee profile default: ${formatCurrency(employee.hourly_rate)}/hr` : undefined}
                    />
                    <SummaryBox
                        label="Federal Source"
                        value={getFederalSourceLabel(businessProfile)}
                        detail={employeePayrollProfile?.federal_exempt ? 'Federal withholding marked exempt' : undefined}
                    />
                    <SummaryBox
                        label="State Source"
                        value={getStateSourceLabel(businessProfile)}
                        detail={employeePayrollProfile?.state_exempt ? 'State/local withholding marked exempt' : undefined}
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                    <SummaryBox label="Tax Classification" value={employeePayrollProfile?.tax_classification === '1099' ? '1099 Contractor' : 'W-2 Employee'} />
                    <SummaryBox label="Current-Year Wages" value={formatCurrency(ytdTotals.wages)} detail="From recorded payroll runs for this employee." />
                    <SummaryBox label="FICA Wage Base" value="$184,500" detail="2026 Social Security contribution and benefit base." />
                </div>

                <div className="flex flex-col gap-3 border-t border-[var(--color-border)] pt-3 md:flex-row md:items-center md:justify-between">
                    <div className="max-w-2xl text-xs text-[var(--color-muted)]">
                        Federal withholding follows IRS Publication 15-T 2026. Social Security wage base follows SSA 2026 limits.
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                            <span className="font-semibold uppercase text-[var(--color-muted)]">Sources</span>
                            <a
                                href="https://www.irs.gov/publications/p15t"
                                target="_blank"
                                rel="noreferrer"
                                className="font-medium text-[var(--color-primary)] underline-offset-2 hover:underline"
                            >
                                IRS Pub. 15-T
                            </a>
                            <a
                                href="https://www.ssa.gov/OACT/COLA/cbb.html"
                                target="_blank"
                                rel="noreferrer"
                                className="font-medium text-[var(--color-primary)] underline-offset-2 hover:underline"
                            >
                                SSA wage base
                            </a>
                        </div>
                        <div className="flex flex-wrap gap-2 sm:justify-end">
                            <Button size="sm" variant="secondary" onClick={onEditBusinessSetup}>
                                Business Setup
                            </Button>
                            <Button size="sm" variant="secondary" onClick={onEditTaxSetup}>
                                Employee Tax Setup
                            </Button>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

function SummaryBox({ label, value, detail }: { label: string; value: string; detail?: string }) {
    return (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2">
            <div className="text-[11px] font-semibold uppercase text-[var(--color-muted)]">{label}</div>
            <div className="mt-1 font-semibold text-[var(--color-foreground)]">{value}</div>
            {detail && <div className="mt-1 text-xs text-[var(--color-muted)]">{detail}</div>}
        </div>
    );
}

function getPayoutMethodLabel(method: EmployeePayoutMethod): string {
    if (method === 'direct_deposit') return 'Direct Deposit';
    if (method === 'check') return 'Check';
    if (method === 'cash') return 'Cash';
    return 'Other';
}
