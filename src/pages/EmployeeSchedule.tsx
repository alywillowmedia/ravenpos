import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Header } from '../components/layout/Header';
import { Button } from '../components/ui/Button';
import { Card, CardContent } from '../components/ui/Card';
import { Input, Textarea } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { Modal, ModalFooter } from '../components/ui/Modal';
import { Tabs } from '../components/ui/Tabs';
import { useEmployees } from '../hooks/useEmployees';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

type ViewMode = 'week' | 'month';
type AdminTab = 'schedule' | 'templates' | 'requests';
type RequestStatusTab = 'pending' | 'approved' | 'denied';
type ShiftSource = 'one_time' | 'recurring';
type TimeOffRequestStatus = 'pending' | 'approved' | 'denied';
type ShiftTimeOffImpact = 'none' | 'partial' | 'full';
type RepeatCycleOption = 7 | 14 | 28;

type OneTimeShift = {
    id: string;
    employee_id: string;
    shift_date: string;
    start_time: string;
    end_time: string;
    notes: string | null;
};

type RecurringSchedule = {
    id: string;
    employee_id: string;
    weekday: number;
    cycle_length_days: number | null;
    day_offset: number | null;
    start_time: string;
    end_time: string;
    notes: string | null;
    active_from: string;
    active_until: string | null;
};

type DisplayShift = {
    id: string;
    source: ShiftSource;
    employee_id: string;
    shift_date: string;
    start_time: string;
    end_time: string;
    notes: string | null;
};

type TimeOffRequest = {
    id: string;
    employee_id: string;
    start_date: string;
    end_date: string;
    is_full_day: boolean;
    start_time: string | null;
    end_time: string | null;
    reason: string | null;
    status: TimeOffRequestStatus;
    reviewed_by: string | null;
    reviewed_at: string | null;
    review_notes: string | null;
    created_at: string;
};

type Notice = {
    type: 'success' | 'error';
    message: string;
} | null;

type ShiftFormState = {
    employeeId: string;
    shiftDate: string;
    startTime: string;
    endTime: string;
    notes: string;
};

type DayOffOverride = {
    id: string;
    employee_id: string;
    shift_date: string;
    is_day_off: boolean;
    notes: string | null;
};

type ShiftModalMode = 'add' | 'edit' | 'override';

type TemplateDay = {
    offset: number;
    dateKey: string;
    weekday: number;
    label: string;
    enabled: boolean;
    startTime: string;
    endTime: string;
    notes: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const TEMPLATE_CYCLE_OPTIONS: Array<{ value: RepeatCycleOption; label: string }> = [
    { value: 7, label: '1 week repeating' },
    { value: 14, label: '2 week repeating' },
    { value: 28, label: '1 month repeating' },
];

function addDays(base: Date, days: number) {
    const next = new Date(base);
    next.setDate(next.getDate() + days);
    return next;
}

function toDateKey(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function parseDateKey(value: string) {
    const [year, month, day] = value.split('-').map((part) => Number.parseInt(part, 10));
    return new Date(year, month - 1, day);
}

function toDateKeyDayNumber(value: string) {
    const [year, month, day] = value.split('-').map((part) => Number.parseInt(part, 10));
    return Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
}

function startOfWeekMonday(date: Date) {
    const next = new Date(date);
    next.setHours(0, 0, 0, 0);
    const day = next.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    next.setDate(next.getDate() + diff);
    return next;
}

function startOfMonthGridMonday(date: Date) {
    const first = new Date(date.getFullYear(), date.getMonth(), 1);
    return startOfWeekMonday(first);
}

function parseTimeToMinutes(time: string) {
    const [hours = '0', minutes = '0'] = time.split(':');
    return Number.parseInt(hours, 10) * 60 + Number.parseInt(minutes, 10);
}

function formatTimeLabel(time: string) {
    const [hours = '0', minutes = '0'] = time.split(':');
    const date = new Date();
    date.setHours(Number.parseInt(hours, 10), Number.parseInt(minutes, 10), 0, 0);
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatHours(hours: number) {
    return `${hours.toFixed(2)}h`;
}

function formatDateLabel(value: string) {
    return parseDateKey(value).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatDateRange(startDate: string, endDate: string) {
    if (startDate === endDate) return formatDateLabel(startDate);
    return `${formatDateLabel(startDate)} - ${formatDateLabel(endDate)}`;
}

function getShiftDurationHours(startTime: string, endTime: string) {
    const start = parseTimeToMinutes(startTime);
    const end = parseTimeToMinutes(endTime);
    return Math.max(0, end - start) / 60;
}

function getStatusBadgeClass(status: TimeOffRequestStatus) {
    if (status === 'approved') {
        return 'bg-[var(--color-success-bg)] text-[var(--color-success)]';
    }
    if (status === 'denied') {
        return 'bg-[var(--color-danger-bg)] text-[var(--color-danger)]';
    }
    return 'bg-[var(--color-surface)] text-[var(--color-muted)]';
}

function shiftKey(employeeId: string, shiftDate: string) {
    return `${employeeId}|${shiftDate}`;
}

function timeRangesOverlap(startA: string, endA: string, startB: string, endB: string) {
    return parseTimeToMinutes(startA) < parseTimeToMinutes(endB)
        && parseTimeToMinutes(endA) > parseTimeToMinutes(startB);
}

function getRequestShiftImpact(request: TimeOffRequest, shiftDate: string, shiftStart: string, shiftEnd: string): ShiftTimeOffImpact {
    if (request.status !== 'approved') return 'none';
    if (shiftDate < request.start_date || shiftDate > request.end_date) return 'none';
    if (request.is_full_day) return 'full';
    if (shiftDate !== request.start_date || !request.start_time || !request.end_time) return 'none';
    if (!timeRangesOverlap(shiftStart, shiftEnd, request.start_time, request.end_time)) return 'none';

    const fullyCovered =
        parseTimeToMinutes(request.start_time) <= parseTimeToMinutes(shiftStart)
        && parseTimeToMinutes(request.end_time) >= parseTimeToMinutes(shiftEnd);

    return fullyCovered ? 'full' : 'partial';
}

function formatRequestDateTimeRange(request: TimeOffRequest) {
    if (request.is_full_day) {
        if (request.start_date === request.end_date) {
            return `${formatDateLabel(request.start_date)} (Full day)`;
        }
        return `${formatDateRange(request.start_date, request.end_date)} (Full day)`;
    }

    const startTime = request.start_time ? formatTimeLabel(request.start_time) : '--';
    const endTime = request.end_time ? formatTimeLabel(request.end_time) : '--';
    return `${formatDateLabel(request.start_date)} ${startTime} - ${endTime}`;
}

function previousDateKey(dateKey: string) {
    return toDateKey(addDays(parseDateKey(dateKey), -1));
}

function getDayOffsetFromWeekday(activeFrom: string, weekday: number) {
    const anchorWeekday = parseDateKey(activeFrom).getDay();
    return (weekday - anchorWeekday + 7) % 7;
}

function matchesRecurringOnDate(schedule: RecurringSchedule, day: Date, dayKey: string) {
    if (dayKey < schedule.active_from) return false;
    if (schedule.active_until && dayKey > schedule.active_until) return false;

    if (schedule.cycle_length_days && schedule.day_offset !== null && schedule.day_offset !== undefined) {
        const deltaDays = toDateKeyDayNumber(dayKey) - toDateKeyDayNumber(schedule.active_from);
        if (deltaDays < 0) return false;
        return deltaDays % schedule.cycle_length_days === schedule.day_offset;
    }

    return day.getDay() === schedule.weekday;
}

function defaultTemplateDays(effectiveFrom: string, cycleLengthDays: RepeatCycleOption): TemplateDay[] {
    const start = parseDateKey(effectiveFrom);
    return Array.from({ length: cycleLengthDays }, (_, offset) => {
        const day = addDays(start, offset);
        return {
            offset,
            dateKey: toDateKey(day),
            weekday: day.getDay(),
            label: `Week ${Math.floor(offset / 7) + 1} • ${day.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}`,
            enabled: false,
            startTime: '09:00',
            endTime: '17:00',
            notes: '',
        };
    });
}

function getCycleLabel(cycleLengthDays: number | null) {
    if (cycleLengthDays === 14) return 'Repeats every 2 weeks';
    if (cycleLengthDays === 28) return 'Repeats monthly (4-week cycle)';
    return 'Repeats weekly';
}

function normalizeCycleLength(value: number | null | undefined): RepeatCycleOption {
    if (value === 14 || value === 28) return value;
    return 7;
}

function resolveDayOffset(schedule: RecurringSchedule) {
    if (schedule.day_offset !== null && schedule.day_offset !== undefined) {
        return schedule.day_offset;
    }
    return getDayOffsetFromWeekday(schedule.active_from, schedule.weekday);
}

function getWeekIndexFromOffset(offset: number) {
    return Math.floor(offset / 7);
}

function getOffsetFromWeekdayAndWeekIndex(
    effectiveFrom: string,
    weekday: number,
    weekIndex: number
) {
    const anchorWeekday = parseDateKey(effectiveFrom).getDay();
    return weekIndex * 7 + ((weekday - anchorWeekday + 7) % 7);
}

function resolveDisplayOffsetForSchedule(
    schedule: RecurringSchedule,
    effectiveFrom: string
) {
    const normalizedCycle = normalizeCycleLength(schedule.cycle_length_days);
    if (normalizedCycle === 7) {
        return getOffsetFromWeekdayAndWeekIndex(effectiveFrom, schedule.weekday, 0);
    }

    const sourceOffset = resolveDayOffset(schedule);
    const sourceWeekIndex = getWeekIndexFromOffset(sourceOffset);
    return getOffsetFromWeekdayAndWeekIndex(effectiveFrom, schedule.weekday, sourceWeekIndex);
}

function buildTemplateDaysFromSchedules(
    schedules: RecurringSchedule[],
    effectiveFrom: string,
    cycleLengthDays: RepeatCycleOption
): TemplateDay[] {
    const nextDays = defaultTemplateDays(effectiveFrom, cycleLengthDays);
    const byOffset = new Map<number, RecurringSchedule>();
    for (const schedule of schedules) {
        const offset = resolveDisplayOffsetForSchedule(schedule, effectiveFrom);
        if (offset < 0 || offset >= cycleLengthDays) continue;
        if (!byOffset.has(offset)) {
            byOffset.set(offset, schedule);
        }
    }

    for (const day of nextDays) {
        const matching = byOffset.get(day.offset);
        if (!matching) continue;
        day.enabled = true;
        day.startTime = matching.start_time.slice(0, 5);
        day.endTime = matching.end_time.slice(0, 5);
        day.notes = matching.notes || '';
    }

    return nextDays;
}

function remapTemplateDays(
    templateDays: TemplateDay[],
    effectiveFrom: string,
    cycleLengthDays: RepeatCycleOption
): TemplateDay[] {
    const nextDays = defaultTemplateDays(effectiveFrom, cycleLengthDays);
    const byWeekAndWeekday = new Map<string, TemplateDay>(
        templateDays.map((day) => [`${getWeekIndexFromOffset(day.offset)}|${day.weekday}`, day] as const)
    );

    for (const day of nextDays) {
        const key = `${getWeekIndexFromOffset(day.offset)}|${day.weekday}`;
        const existing = byWeekAndWeekday.get(key);
        if (!existing) continue;
        day.enabled = existing.enabled;
        day.startTime = existing.startTime;
        day.endTime = existing.endTime;
        day.notes = existing.notes;
    }

    return nextDays;
}

export function EmployeeSchedule() {
    const { user } = useAuth();
    const { employees, isLoading: isLoadingEmployees, error: employeeError } = useEmployees();
    const [activeTab, setActiveTab] = useState<AdminTab>('schedule');
    const [requestStatusTab, setRequestStatusTab] = useState<RequestStatusTab>('pending');
    const [viewMode, setViewMode] = useState<ViewMode>('week');
    const [anchorDate, setAnchorDate] = useState(() => new Date());
    const [oneTimeShifts, setOneTimeShifts] = useState<OneTimeShift[]>([]);
    const [recurringSchedules, setRecurringSchedules] = useState<RecurringSchedule[]>([]);
    const [dayOffOverrides, setDayOffOverrides] = useState<DayOffOverride[]>([]);
    const [timeOffRequests, setTimeOffRequests] = useState<TimeOffRequest[]>([]);
    const [isLoadingSchedule, setIsLoadingSchedule] = useState(true);
    const [isLoadingRequests, setIsLoadingRequests] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isSavingTemplate, setIsSavingTemplate] = useState(false);
    const [deletingShiftId, setDeletingShiftId] = useState<string | null>(null);
    const [reviewingRequestId, setReviewingRequestId] = useState<string | null>(null);
    const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
    const [shiftModalMode, setShiftModalMode] = useState<ShiftModalMode>('add');
    const [processingOverrideId, setProcessingOverrideId] = useState<string | null>(null);
    const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
    const [notice, setNotice] = useState<Notice>(null);
    const [templateEmployeeId, setTemplateEmployeeId] = useState('');
    const [templateEffectiveFrom, setTemplateEffectiveFrom] = useState(toDateKey(new Date()));
    const [templateCycleLengthDays, setTemplateCycleLengthDays] = useState<RepeatCycleOption>(7);
    const [templateDays, setTemplateDays] = useState<TemplateDay[]>(() => defaultTemplateDays(toDateKey(new Date()), 7));
    const [formState, setFormState] = useState<ShiftFormState>({
        employeeId: '',
        shiftDate: toDateKey(new Date()),
        startTime: '09:00',
        endTime: '17:00',
        notes: '',
    });

    const activeEmployees = useMemo(
        () => employees.filter((employee) => employee.is_active),
        [employees]
    );

    const employeeNameById = useMemo(
        () => new Map(activeEmployees.map((employee) => [employee.id, employee.name])),
        [activeEmployees]
    );

    useEffect(() => {
        if (!templateEmployeeId && activeEmployees.length > 0) {
            setTemplateEmployeeId(activeEmployees[0].id);
        }
    }, [activeEmployees, templateEmployeeId]);

    const rangeStart = useMemo(
        () => (viewMode === 'week' ? startOfWeekMonday(anchorDate) : startOfMonthGridMonday(anchorDate)),
        [anchorDate, viewMode]
    );

    const visibleDays = useMemo(() => {
        const count = viewMode === 'week' ? 7 : 42;
        return Array.from({ length: count }, (_, index) => addDays(rangeStart, index));
    }, [rangeStart, viewMode]);

    const rangeEnd = visibleDays[visibleDays.length - 1];
    const rangeStartKey = toDateKey(rangeStart);
    const rangeEndKey = toDateKey(rangeEnd);

    const fetchRangeData = useCallback(async () => {
        setIsLoadingSchedule(true);
        setIsLoadingRequests(true);
        setNotice(null);

        const [oneTimeResult, recurringResult, dayOffOverridesResult, requestsResult] = await Promise.all([
            supabase
                .from('employee_schedules')
                .select('id, employee_id, shift_date, start_time, end_time, notes')
                .gte('shift_date', rangeStartKey)
                .lte('shift_date', rangeEndKey)
                .order('shift_date')
                .order('start_time'),
            supabase
                .from('employee_recurring_schedules')
                .select('id, employee_id, weekday, cycle_length_days, day_offset, start_time, end_time, notes, active_from, active_until')
                .lte('active_from', rangeEndKey)
                .or(`active_until.is.null,active_until.gte.${rangeStartKey}`)
                .order('employee_id')
                .order('cycle_length_days')
                .order('day_offset')
                .order('active_from', { ascending: false }),
            supabase
                .from('employee_schedule_day_overrides')
                .select('id, employee_id, shift_date, is_day_off, notes')
                .eq('is_day_off', true)
                .gte('shift_date', rangeStartKey)
                .lte('shift_date', rangeEndKey)
                .order('shift_date'),
            supabase
                .from('employee_time_off_requests')
                .select('id, employee_id, start_date, end_date, is_full_day, start_time, end_time, reason, status, reviewed_by, reviewed_at, review_notes, created_at')
                .order('status', { ascending: true })
                .order('start_date', { ascending: false }),
        ]);

        if (oneTimeResult.error) {
            setNotice({ type: 'error', message: oneTimeResult.error.message });
            setOneTimeShifts([]);
        } else {
            setOneTimeShifts((oneTimeResult.data || []) as OneTimeShift[]);
        }

        if (recurringResult.error) {
            setNotice({ type: 'error', message: recurringResult.error.message });
            setRecurringSchedules([]);
        } else {
            setRecurringSchedules((recurringResult.data || []) as RecurringSchedule[]);
        }

        if (dayOffOverridesResult.error) {
            setNotice({ type: 'error', message: dayOffOverridesResult.error.message });
            setDayOffOverrides([]);
        } else {
            setDayOffOverrides((dayOffOverridesResult.data || []) as DayOffOverride[]);
        }

        if (requestsResult.error) {
            setNotice({ type: 'error', message: requestsResult.error.message });
            setTimeOffRequests([]);
        } else {
            setTimeOffRequests((requestsResult.data || []) as TimeOffRequest[]);
        }

        setIsLoadingSchedule(false);
        setIsLoadingRequests(false);
    }, [rangeEndKey, rangeStartKey]);

    useEffect(() => {
        fetchRangeData();
    }, [fetchRangeData]);

    useEffect(() => {
        if (!formState.employeeId && activeEmployees.length > 0) {
            setFormState((prev) => ({ ...prev, employeeId: activeEmployees[0].id }));
        }
    }, [activeEmployees, formState.employeeId]);

    useEffect(() => {
        if (templateEmployeeId) return;
        setTemplateDays(defaultTemplateDays(templateEffectiveFrom, templateCycleLengthDays));
    }, [templateCycleLengthDays, templateEffectiveFrom, templateEmployeeId]);

    useEffect(() => {
        if (!templateEmployeeId) return;

        const activeTemplateSchedules = recurringSchedules.filter((schedule) => (
            schedule.employee_id === templateEmployeeId
            && schedule.active_from <= templateEffectiveFrom
            && (schedule.active_until === null || schedule.active_until >= templateEffectiveFrom)
        ));

        if (activeTemplateSchedules.length === 0) {
            setTemplateDays(defaultTemplateDays(templateEffectiveFrom, 7));
            setTemplateCycleLengthDays(7);
            return;
        }

        const inferredCycle = normalizeCycleLength(activeTemplateSchedules[0].cycle_length_days);
        setTemplateCycleLengthDays(inferredCycle);
        setTemplateDays(buildTemplateDaysFromSchedules(activeTemplateSchedules, templateEffectiveFrom, inferredCycle));
    }, [templateEffectiveFrom, templateEmployeeId, recurringSchedules]);

    const getTimeOffImpactForShift = useCallback(
        (employeeId: string, shiftDate: string, shiftStart: string, shiftEnd: string): ShiftTimeOffImpact => {
            let hasPartial = false;

            for (const request of timeOffRequests) {
                if (request.employee_id !== employeeId) continue;

                const impact = getRequestShiftImpact(request, shiftDate, shiftStart, shiftEnd);
                if (impact === 'full') return 'full';
                if (impact === 'partial') hasPartial = true;
            }

            return hasPartial ? 'partial' : 'none';
        },
        [timeOffRequests]
    );

    const displayShifts = useMemo(() => {
        const specificDayOverrides = new Set(oneTimeShifts.map((shift) => shiftKey(shift.employee_id, shift.shift_date)));
        const dayOffOverrideKeys = new Set<string>();
        for (const dayOff of dayOffOverrides) {
            if (!dayOff.is_day_off) continue;
            const key = shiftKey(dayOff.employee_id, dayOff.shift_date);
            dayOffOverrideKeys.add(key);
            specificDayOverrides.add(key);
        }

        const generatedRecurring: DisplayShift[] = [];

        for (const schedule of recurringSchedules) {
            for (const day of visibleDays) {
                const dayKey = toDateKey(day);
                if (!matchesRecurringOnDate(schedule, day, dayKey)) continue;
                if (specificDayOverrides.has(shiftKey(schedule.employee_id, dayKey))) continue;

                generatedRecurring.push({
                    id: `recurring-${schedule.id}-${dayKey}`,
                    source: 'recurring',
                    employee_id: schedule.employee_id,
                    shift_date: dayKey,
                    start_time: schedule.start_time,
                    end_time: schedule.end_time,
                    notes: schedule.notes,
                });
            }
        }

        const specificShifts: DisplayShift[] = oneTimeShifts
            .filter((shift) => !dayOffOverrideKeys.has(shiftKey(shift.employee_id, shift.shift_date)))
            .map((shift) => ({
                id: shift.id,
                source: 'one_time',
                employee_id: shift.employee_id,
                shift_date: shift.shift_date,
                start_time: shift.start_time,
                end_time: shift.end_time,
                notes: shift.notes,
            }));

        return [...specificShifts, ...generatedRecurring].sort((a, b) => {
            if (a.shift_date !== b.shift_date) return a.shift_date.localeCompare(b.shift_date);
            return a.start_time.localeCompare(b.start_time);
        });
    }, [dayOffOverrides, oneTimeShifts, recurringSchedules, visibleDays]);

    const shiftsByDate = useMemo(() => {
        const map = new Map<string, DisplayShift[]>();

        for (const shift of displayShifts) {
            const list = map.get(shift.shift_date) || [];
            list.push(shift);
            map.set(shift.shift_date, list);
        }

        return map;
    }, [displayShifts]);

    const scheduledHours = useMemo(
        () => displayShifts.reduce((sum, shift) => sum + getShiftDurationHours(shift.start_time, shift.end_time), 0),
        [displayShifts]
    );

    const scheduledEmployeesCount = useMemo(
        () => new Set(displayShifts.map((shift) => shift.employee_id)).size,
        [displayShifts]
    );

    const pendingRequestCount = useMemo(
        () => timeOffRequests.filter((request) => request.status === 'pending').length,
        [timeOffRequests]
    );

    const filteredRequests = useMemo(
        () => timeOffRequests.filter((request) => request.status === requestStatusTab),
        [requestStatusTab, timeOffRequests]
    );

    const groupedRequests = useMemo(() => {
        const grouped = new Map<string, TimeOffRequest[]>();

        for (const request of filteredRequests) {
            const list = grouped.get(request.employee_id) || [];
            list.push(request);
            grouped.set(request.employee_id, list);
        }

        return Array.from(grouped.entries())
            .map(([employeeId, requests]) => ({
                employeeId,
                employeeName: employeeNameById.get(employeeId) || 'Unknown employee',
                requests: requests.sort((a, b) => b.start_date.localeCompare(a.start_date)),
            }))
            .sort((a, b) => a.employeeName.localeCompare(b.employeeName));
    }, [employeeNameById, filteredRequests]);

    const approvedTimeOffByDate = useMemo(() => {
        const map = new Map<string, Set<string>>();

        for (const request of timeOffRequests) {
            if (request.status !== 'approved') continue;

            const start = parseDateKey(request.start_date);
            const end = parseDateKey(request.end_date);

            for (const day of visibleDays) {
                if (day < start || day > end) continue;
                const dayKey = toDateKey(day);
                const current = map.get(dayKey) || new Set<string>();
                const employeeName = employeeNameById.get(request.employee_id) || 'Unknown employee';
                if (request.is_full_day) {
                    current.add(`${employeeName} (Full day)`);
                } else if (request.start_time && request.end_time && dayKey === request.start_date) {
                    current.add(`${employeeName} (${formatTimeLabel(request.start_time)} - ${formatTimeLabel(request.end_time)})`);
                }
                map.set(dayKey, current);
            }
        }

        return map;
    }, [employeeNameById, timeOffRequests, visibleDays]);

    const dayOffOverridesByDate = useMemo(() => {
        const map = new Map<string, DayOffOverride[]>();
        for (const override of dayOffOverrides) {
            if (!override.is_day_off) continue;
            const list = map.get(override.shift_date) || [];
            list.push(override);
            map.set(override.shift_date, list);
        }
        return map;
    }, [dayOffOverrides]);

    const blockedEmployeesForFormDate = useMemo(() => {
        const blocked = new Set<string>();

        for (const request of timeOffRequests) {
            if (
                getRequestShiftImpact(
                    request,
                    formState.shiftDate,
                    formState.startTime,
                    formState.endTime
                ) === 'full'
            ) {
                blocked.add(request.employee_id);
            }
        }
        for (const override of dayOffOverrides) {
            if (!override.is_day_off) continue;
            if (override.shift_date !== formState.shiftDate) continue;
            blocked.add(override.employee_id);
        }

        return blocked;
    }, [dayOffOverrides, formState.endTime, formState.shiftDate, formState.startTime, timeOffRequests]);

    useEffect(() => {
        if (!isShiftModalOpen || editingShiftId) return;
        if (!formState.employeeId || !blockedEmployeesForFormDate.has(formState.employeeId)) return;

        const firstAvailable = activeEmployees.find((employee) => !blockedEmployeesForFormDate.has(employee.id));
        setFormState((prev) => ({
            ...prev,
            employeeId: firstAvailable?.id || '',
        }));
    }, [activeEmployees, blockedEmployeesForFormDate, editingShiftId, formState.employeeId, isShiftModalOpen]);

    const closeShiftModal = () => {
        setIsShiftModalOpen(false);
        setEditingShiftId(null);
        setShiftModalMode('add');
    };

    const openAddModalForDay = (dateKey: string) => {
        setEditingShiftId(null);
        setShiftModalMode('add');
        setFormState((prev) => ({
            employeeId: prev.employeeId || (activeEmployees[0]?.id ?? ''),
            shiftDate: dateKey,
            startTime: '09:00',
            endTime: '17:00',
            notes: '',
        }));
        setIsShiftModalOpen(true);
    };

    const startEdit = (shift: DisplayShift) => {
        if (shift.source !== 'one_time') return;

        setEditingShiftId(shift.id);
        setShiftModalMode('edit');
        setFormState({
            employeeId: shift.employee_id,
            shiftDate: shift.shift_date,
            startTime: shift.start_time.slice(0, 5),
            endTime: shift.end_time.slice(0, 5),
            notes: shift.notes || '',
        });
        setIsShiftModalOpen(true);
    };

    const openOverrideModalFromRecurring = (shift: DisplayShift) => {
        if (shift.source !== 'recurring') return;

        setEditingShiftId(null);
        setShiftModalMode('override');
        setFormState({
            employeeId: shift.employee_id,
            shiftDate: shift.shift_date,
            startTime: shift.start_time.slice(0, 5),
            endTime: shift.end_time.slice(0, 5),
            notes: shift.notes || '',
        });
        setIsShiftModalOpen(true);
    };

    const handleEditFromCalendar = (shift: DisplayShift) => {
        if (shift.source === 'one_time') {
            startEdit(shift);
            return;
        }

        setTemplateEmployeeId(shift.employee_id);
        setTemplateEffectiveFrom(shift.shift_date);
        setActiveTab('templates');
        setNotice({ type: 'success', message: 'Opened template editor for this recurring shift.' });
    };

    const handleMarkDayOffForEmployeeDate = async (employeeId: string, shiftDate: string, loadingKey: string) => {
        setNotice(null);
        setProcessingOverrideId(loadingKey);

        const { error: upsertError } = await supabase
            .from('employee_schedule_day_overrides')
            .upsert({
                employee_id: employeeId,
                shift_date: shiftDate,
                is_day_off: true,
                notes: 'Day-level override from recurring template',
                created_by: user?.id ?? null,
            }, { onConflict: 'employee_id,shift_date' });

        if (upsertError) {
            setNotice({ type: 'error', message: upsertError.message });
            setProcessingOverrideId(null);
            return false;
        }

        await supabase
            .from('employee_schedules')
            .delete()
            .eq('employee_id', employeeId)
            .eq('shift_date', shiftDate);

        setNotice({ type: 'success', message: 'Recurring shift removed for this date only.' });
        setProcessingOverrideId(null);
        await fetchRangeData();
        return true;
    };

    const handleRestoreDayOffOverride = async (overrideId: string) => {
        setNotice(null);
        setProcessingOverrideId(overrideId);

        const { error } = await supabase
            .from('employee_schedule_day_overrides')
            .delete()
            .eq('id', overrideId);

        if (error) {
            setNotice({ type: 'error', message: error.message });
            setProcessingOverrideId(null);
            return;
        }

        setNotice({ type: 'success', message: 'Day override removed. Template shift will show again.' });
        setProcessingOverrideId(null);
        await fetchRangeData();
    };

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        setNotice(null);

        if (!formState.employeeId) {
            setNotice({ type: 'error', message: 'Select an employee first.' });
            return;
        }

        if (parseTimeToMinutes(formState.endTime) <= parseTimeToMinutes(formState.startTime)) {
            setNotice({ type: 'error', message: 'Shift end time must be after start time.' });
            return;
        }

        if (getTimeOffImpactForShift(formState.employeeId, formState.shiftDate, formState.startTime, formState.endTime) === 'full') {
            setNotice({ type: 'error', message: 'This employee has approved time off covering the full shift.' });
            return;
        }

        setIsSaving(true);

        await supabase
            .from('employee_schedule_day_overrides')
            .delete()
            .eq('employee_id', formState.employeeId)
            .eq('shift_date', formState.shiftDate);

        if (editingShiftId) {
            const { error } = await supabase
                .from('employee_schedules')
                .update({
                    employee_id: formState.employeeId,
                    shift_date: formState.shiftDate,
                    start_time: formState.startTime,
                    end_time: formState.endTime,
                    notes: formState.notes.trim() || null,
                })
                .eq('id', editingShiftId);

            if (error) {
                setNotice({ type: 'error', message: error.message });
                setIsSaving(false);
                return;
            }

            setNotice({ type: 'success', message: 'Shift updated.' });
        } else {
            const { error } = await supabase
                .from('employee_schedules')
                .insert({
                    employee_id: formState.employeeId,
                    shift_date: formState.shiftDate,
                    start_time: formState.startTime,
                    end_time: formState.endTime,
                    notes: formState.notes.trim() || null,
                    created_by: user?.id ?? null,
                });

            if (error) {
                setNotice({ type: 'error', message: error.message });
                setIsSaving(false);
                return;
            }

            setNotice({ type: 'success', message: shiftModalMode === 'override' ? 'Day override saved.' : 'Shift added.' });
        }

        setIsSaving(false);
        closeShiftModal();
        await fetchRangeData();
    };

    const handleDeleteShift = async (shiftId: string) => {
        setNotice(null);
        setDeletingShiftId(shiftId);

        const { error } = await supabase
            .from('employee_schedules')
            .delete()
            .eq('id', shiftId);

        if (error) {
            setNotice({ type: 'error', message: error.message });
            setDeletingShiftId(null);
            return;
        }

        if (editingShiftId === shiftId) {
            closeShiftModal();
        }

        setNotice({ type: 'success', message: 'Shift deleted.' });
        setDeletingShiftId(null);
        await fetchRangeData();
    };

    const handleSaveTemplate = async () => {
        if (!templateEmployeeId) {
            setNotice({ type: 'error', message: 'Select an employee first.' });
            return;
        }

        const invalidDay = templateDays.find(
            (day) => day.enabled && parseTimeToMinutes(day.endTime) <= parseTimeToMinutes(day.startTime)
        );

        if (invalidDay) {
            setNotice({ type: 'error', message: `${invalidDay.label}: end time must be after start time.` });
            return;
        }

        setNotice(null);
        setIsSavingTemplate(true);

        const { data: existingRows, error: existingError } = await supabase
            .from('employee_recurring_schedules')
            .select('id, active_from')
            .eq('employee_id', templateEmployeeId)
            .or(`active_until.is.null,active_until.gte.${templateEffectiveFrom}`);

        if (existingError) {
            setNotice({ type: 'error', message: existingError.message });
            setIsSavingTemplate(false);
            return;
        }

        const idsToDelete = (existingRows || [])
            .filter((row) => row.active_from >= templateEffectiveFrom)
            .map((row) => row.id as string);

        const idsToClose = (existingRows || [])
            .filter((row) => row.active_from < templateEffectiveFrom)
            .map((row) => row.id as string);

        if (idsToDelete.length > 0) {
            const { error } = await supabase
                .from('employee_recurring_schedules')
                .delete()
                .in('id', idsToDelete);

            if (error) {
                setNotice({ type: 'error', message: error.message });
                setIsSavingTemplate(false);
                return;
            }
        }

        if (idsToClose.length > 0) {
            const { error } = await supabase
                .from('employee_recurring_schedules')
                .update({ active_until: previousDateKey(templateEffectiveFrom) })
                .in('id', idsToClose);

            if (error) {
                setNotice({ type: 'error', message: error.message });
                setIsSavingTemplate(false);
                return;
            }
        }

        const rowsToInsert = templateDays
            .filter((day) => day.enabled)
            .map((day) => ({
                employee_id: templateEmployeeId,
                weekday: day.weekday,
                cycle_length_days: templateCycleLengthDays,
                day_offset: day.offset,
                start_time: day.startTime,
                end_time: day.endTime,
                notes: day.notes.trim() || null,
                active_from: templateEffectiveFrom,
                active_until: null,
                created_by: user?.id ?? null,
            }));

        if (rowsToInsert.length > 0) {
            const { error } = await supabase
                .from('employee_recurring_schedules')
                .insert(rowsToInsert);

            if (error) {
                setNotice({ type: 'error', message: error.message });
                setIsSavingTemplate(false);
                return;
            }
        }

        setNotice({ type: 'success', message: `${getCycleLabel(templateCycleLengthDays)} template saved.` });
        setIsSavingTemplate(false);
        await fetchRangeData();
    };

    const handleReviewTimeOffRequest = async (requestId: string, status: Exclude<TimeOffRequestStatus, 'pending'>) => {
        setNotice(null);
        setReviewingRequestId(requestId);

        const { error } = await supabase
            .from('employee_time_off_requests')
            .update({
                status,
                reviewed_by: user?.id ?? null,
                reviewed_at: new Date().toISOString(),
            })
            .eq('id', requestId)
            .eq('status', 'pending');

        if (error) {
            setNotice({ type: 'error', message: error.message });
            setReviewingRequestId(null);
            return;
        }

        setNotice({ type: 'success', message: `Request ${status}.` });
        setReviewingRequestId(null);
        await fetchRangeData();
    };

    const rangeLabel =
        viewMode === 'week'
            ? `${rangeStart.toLocaleDateString([], { month: 'short', day: 'numeric' })} - ${rangeEnd.toLocaleDateString([], { month: 'short', day: 'numeric' })}`
            : anchorDate.toLocaleDateString([], { month: 'long', year: 'numeric' });

    const moveRange = (direction: -1 | 1) => {
        if (viewMode === 'week') {
            setAnchorDate((prev) => addDays(prev, direction * 7));
            return;
        }

        setAnchorDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + direction, 1));
    };

    return (
        <div className="animate-fadeIn">
            <Header
                title="Schedule"
                description={activeTab === 'schedule'
                    ? 'Edit one-time calendar shifts. Recurring shifts come from templates.'
                    : activeTab === 'templates'
                        ? 'Edit repeating templates per employee. Choose a 1-week, 2-week, or 1-month cycle.'
                        : 'Review and approve employee time-off requests.'}
                actions={(
                    <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" onClick={() => moveRange(-1)}>
                            Previous
                        </Button>
                        <Button variant="ghost" onClick={() => setAnchorDate(new Date())}>
                            Today
                        </Button>
                        <Button variant="secondary" onClick={() => moveRange(1)}>
                            Next
                        </Button>
                        <Button variant={viewMode === 'week' ? 'primary' : 'ghost'} onClick={() => setViewMode('week')}>
                            Week
                        </Button>
                        <Button variant={viewMode === 'month' ? 'primary' : 'ghost'} onClick={() => setViewMode('month')}>
                            Month
                        </Button>
                        {activeTab === 'schedule' && (
                            <Button onClick={() => openAddModalForDay(toDateKey(new Date()))}>+ Add Day Shift</Button>
                        )}
                    </div>
                )}
            />

            <div className="mb-4">
                <Tabs
                    tabs={[
                        { id: 'schedule', label: 'Schedule' },
                        { id: 'templates', label: 'Templates' },
                        { id: 'requests', label: `Requests (${pendingRequestCount})` },
                    ]}
                    activeTab={activeTab}
                    onChange={(tabId) => setActiveTab(tabId as AdminTab)}
                />
            </div>

            {notice && (
                <div
                    className={`mb-4 rounded-lg p-3 ${notice.type === 'error'
                        ? 'bg-[var(--color-danger-bg)] text-[var(--color-danger)]'
                        : 'bg-[var(--color-success-bg)] text-[var(--color-success)]'
                        }`}
                >
                    {notice.message}
                </div>
            )}

            {employeeError && (
                <div className="mb-4 rounded-lg bg-[var(--color-danger-bg)] p-3 text-[var(--color-danger)]">
                    {employeeError}
                </div>
            )}

            {activeTab === 'schedule' && (
                <>
                    <div className="mb-6 grid gap-3 sm:grid-cols-4">
                        <Card variant="outlined">
                            <CardContent>
                                <p className="text-sm text-[var(--color-muted)]">Range</p>
                                <p className="text-base font-semibold text-[var(--color-foreground)]">{rangeLabel}</p>
                            </CardContent>
                        </Card>
                        <Card variant="outlined">
                            <CardContent>
                                <p className="text-sm text-[var(--color-muted)]">Visible Shifts</p>
                                <p className="text-2xl font-bold text-[var(--color-foreground)]">{displayShifts.length}</p>
                            </CardContent>
                        </Card>
                        <Card variant="outlined">
                            <CardContent>
                                <p className="text-sm text-[var(--color-muted)]">Scheduled Hours</p>
                                <p className="text-2xl font-bold text-[var(--color-primary)]">{formatHours(scheduledHours)}</p>
                                <p className="text-xs text-[var(--color-muted)]">{scheduledEmployeesCount} team members</p>
                            </CardContent>
                        </Card>
                        <Card variant="outlined">
                            <CardContent>
                                <p className="text-sm text-[var(--color-muted)]">Template Rules</p>
                                <p className="text-2xl font-bold text-[var(--color-foreground)]">{recurringSchedules.length}</p>
                            </CardContent>
                        </Card>
                    </div>

                    {isLoadingSchedule ? (
                        <div className="flex items-center justify-center py-12">
                            <LoadingSpinner size={28} />
                        </div>
                    ) : (
                        <>
                            {viewMode === 'month' && (
                                <div className="mb-2 grid grid-cols-7 gap-2 px-1">
                                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label) => (
                                        <p key={label} className="text-center text-xs font-semibold uppercase text-[var(--color-muted)]">
                                            {label}
                                        </p>
                                    ))}
                                </div>
                            )}

                            <div className={viewMode === 'week' ? 'grid gap-2 md:grid-cols-2 xl:grid-cols-7' : 'grid gap-1.5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-7'}>
                                {visibleDays.map((day) => {
                                    const dayKey = toDateKey(day);
                                    const dayShifts = shiftsByDate.get(dayKey) || [];
                                    const approvedEntries = approvedTimeOffByDate.get(dayKey);
                                    const dayOffEntries = dayOffOverridesByDate.get(dayKey) || [];
                                    const totalDayHours = dayShifts.reduce(
                                        (sum, shift) => sum + getShiftDurationHours(shift.start_time, shift.end_time),
                                        0
                                    );
                                    const isOutsideMonth = viewMode === 'month' && day.getMonth() !== anchorDate.getMonth();
                                    const renderedShifts = viewMode === 'month' ? dayShifts.slice(0, 3) : dayShifts;

                                    return (
                                        <Card
                                            key={dayKey}
                                            variant="outlined"
                                            padding="none"
                                            className={isOutsideMonth ? 'opacity-60' : ''}
                                        >
                                            <CardContent className="space-y-1 p-1.5">
                                                <div className="flex items-start justify-between gap-1.5 border-b border-[var(--color-border)] pb-1">
                                                    <div>
                                                        <p className="text-sm font-semibold text-[var(--color-foreground)]">
                                                            {day.toLocaleDateString([], { weekday: 'short' })}
                                                        </p>
                                                        <p className="text-xs text-[var(--color-muted)]">
                                                            {day.toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                                        </p>
                                                    </div>
                                                    <div className="flex flex-col items-end gap-0.5">
                                                        <span className="rounded-full bg-[var(--color-surface)] px-2 py-1 text-xs font-medium text-[var(--color-muted)]">
                                                            {formatHours(totalDayHours)}
                                                        </span>
                                                        <Button size="sm" variant="ghost" className="px-1.5 py-0.5" onClick={() => openAddModalForDay(dayKey)}>
                                                            + Day Shift
                                                        </Button>
                                                    </div>
                                                </div>

                                                {approvedEntries && approvedEntries.size > 0 && (
                                                    <div className="rounded-lg bg-[var(--color-surface)] px-2 py-1.5 text-xs text-[var(--color-muted)]">
                                                        <span className="font-semibold text-[var(--color-danger)]">Approved time off:</span>{' '}
                                                        {Array.from(approvedEntries).join(', ')}
                                                    </div>
                                                )}

                                                {dayOffEntries.length > 0 && (
                                                    <div className="space-y-1">
                                                        {dayOffEntries.map((override) => (
                                                            <div key={override.id} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-xs">
                                                                <p className="font-semibold text-[var(--color-muted)]">
                                                                    {employeeNameById.get(override.employee_id) || 'Unknown employee'}: day-level off override
                                                                </p>
                                                                <div className="mt-1">
                                                                    <Button
                                                                        type="button"
                                                                        size="sm"
                                                                        variant="ghost"
                                                                        onClick={() => handleRestoreDayOffOverride(override.id)}
                                                                        isLoading={processingOverrideId === override.id}
                                                                    >
                                                                        Restore Template Day
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                {renderedShifts.length === 0 ? (
                                                    <div className="rounded-lg border border-dashed border-[var(--color-border)] p-2 text-xs text-[var(--color-muted)]">
                                                        No shifts.
                                                    </div>
                                                ) : (
                                                    <div className="space-y-1.5">
                                                        {renderedShifts.map((shift) => {
                                                            const timeOffImpact = getTimeOffImpactForShift(
                                                                shift.employee_id,
                                                                shift.shift_date,
                                                                shift.start_time,
                                                                shift.end_time
                                                            );
                                                            const isFullyBlocked = timeOffImpact === 'full';
                                                            const isPartiallyBlocked = timeOffImpact === 'partial';

                                                            return (
                                                                <div
                                                                    key={shift.id}
                                                                    className={`group relative rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 ${isFullyBlocked ? 'opacity-80' : ''}`}
                                                                >
                                                                    <p className={`text-sm font-semibold text-[var(--color-foreground)] ${isFullyBlocked ? 'line-through' : ''}`}>
                                                                        {employeeNameById.get(shift.employee_id) || 'Unknown employee'}
                                                                        <span className="ml-1 font-normal text-[var(--color-muted)]">
                                                                            ({formatHours(getShiftDurationHours(shift.start_time, shift.end_time))})
                                                                        </span>
                                                                    </p>
                                                                    <p className={`mt-1 text-xs text-[var(--color-muted)] ${isFullyBlocked ? 'line-through' : ''}`}>
                                                                        {formatTimeLabel(shift.start_time)} - {formatTimeLabel(shift.end_time)}
                                                                    </p>
                                                                    {shift.source === 'recurring' && (
                                                                        <span className="absolute right-1.5 top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-border)] text-[var(--color-muted)]" title="From template">
                                                                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                                                <path d="M3 7h18M3 12h18M3 17h18" />
                                                                            </svg>
                                                                        </span>
                                                                    )}
                                                                    {isFullyBlocked && (
                                                                        <p className="mt-1 text-[11px] font-semibold text-[var(--color-danger)]">Approved time off</p>
                                                                    )}
                                                                    {isPartiallyBlocked && (
                                                                        <p className="mt-1 text-[11px] font-semibold text-[var(--color-warning)]">Partial time-off overlap</p>
                                                                    )}
                                                                    {shift.notes && (
                                                                        <p className={`mt-2 text-xs text-[var(--color-muted)] ${isFullyBlocked ? 'line-through' : ''}`}>{shift.notes}</p>
                                                                    )}

                                                                    {shift.source === 'recurring' && (
                                                                        <div className="mt-2">
                                                                            <Button
                                                                                type="button"
                                                                                size="sm"
                                                                                variant="ghost"
                                                                                className="h-7 px-2 text-[11px]"
                                                                                onClick={() => openOverrideModalFromRecurring(shift)}
                                                                            >
                                                                                Edit This Day
                                                                            </Button>
                                                                        </div>
                                                                    )}

                                                                    {shift.source === 'one_time' && (
                                                                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-black/35 opacity-0 transition-opacity group-hover:opacity-100">
                                                                            <Button
                                                                                type="button"
                                                                                size="sm"
                                                                                className="pointer-events-auto"
                                                                                onClick={() => handleEditFromCalendar(shift)}
                                                                            >
                                                                                Edit Shift
                                                                            </Button>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                        {viewMode === 'month' && dayShifts.length > renderedShifts.length && (
                                                            <p className="text-xs text-[var(--color-muted)]">+{dayShifts.length - renderedShifts.length} more</p>
                                                        )}
                                                    </div>
                                                )}
                                            </CardContent>
                                        </Card>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </>
            )}

            {activeTab === 'templates' && (
                <Card variant="outlined">
                    <CardContent className="space-y-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                            <Select
                                label="Employee"
                                value={templateEmployeeId}
                                onChange={(event) => setTemplateEmployeeId(event.target.value)}
                                options={activeEmployees.map((employee) => ({
                                    value: employee.id,
                                    label: employee.name,
                                }))}
                                disabled={isLoadingEmployees || activeEmployees.length === 0}
                                required
                            />
                            <Input
                                label="Template Effective From"
                                type="date"
                                value={templateEffectiveFrom}
                                onChange={(event) => setTemplateEffectiveFrom(event.target.value)}
                                required
                            />
                        </div>

                        <Select
                            label="Repeating Cycle"
                            value={String(templateCycleLengthDays)}
                            onChange={(event) => {
                                const nextCycle = normalizeCycleLength(Number.parseInt(event.target.value, 10));
                                setTemplateCycleLengthDays(nextCycle);
                                setTemplateDays((prev) => remapTemplateDays(prev, templateEffectiveFrom, nextCycle));
                            }}
                            options={TEMPLATE_CYCLE_OPTIONS.map((option) => ({
                                value: String(option.value),
                                label: option.label,
                            }))}
                        />

                        <p className="text-xs text-[var(--color-muted)]">
                            Save a repeating template for the selected employee. This updates recurring shifts from the effective date forward.
                            One-time day edits in the calendar remain one-time overrides.
                        </p>

                        <div className="space-y-2">
                            <div className="hidden min-w-[980px] grid-cols-7 gap-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)] lg:grid">
                                {Array.from({ length: 7 }, (_, index) => {
                                    const day = templateDays[index];
                                    if (!day) return <span key={index}>Day {index + 1}</span>;
                                    return (
                                        <span key={day.dateKey}>
                                            {parseDateKey(day.dateKey).toLocaleDateString([], { weekday: 'short' })}
                                        </span>
                                    );
                                })}
                            </div>

                            <div className="overflow-x-auto pb-1">
                                <div className="grid min-w-[980px] grid-cols-7 gap-2">
                                    {templateDays.map((day, index) => {
                                        const date = parseDateKey(day.dateKey);
                                        return (
                                            <div
                                                key={`${day.offset}-${day.dateKey}`}
                                                className={`rounded-lg border border-[var(--color-border)] p-2 lg:aspect-square ${day.enabled ? 'bg-[var(--color-surface)]' : 'bg-[var(--color-surface-elevated)]'}`}
                                            >
                                                <label className="mb-2 flex items-start gap-2 text-xs font-medium text-[var(--color-foreground)]">
                                                    <input
                                                        type="checkbox"
                                                        checked={day.enabled}
                                                        onChange={(event) => {
                                                            const checked = event.target.checked;
                                                            setTemplateDays((prev) => prev.map((item, itemIndex) => itemIndex === index
                                                                ? { ...item, enabled: checked }
                                                                : item));
                                                        }}
                                                        className="mt-0.5"
                                                    />
                                                    <span className="leading-tight">
                                                        <span className="block text-[10px] uppercase tracking-wide text-[var(--color-muted)]">
                                                            Week {Math.floor(day.offset / 7) + 1}
                                                        </span>
                                                        <span>
                                                            {date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                                                        </span>
                                                    </span>
                                                </label>

                                                <div className="space-y-1.5">
                                                    <label className="block text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                                                        Start
                                                        <input
                                                            type="time"
                                                            value={day.startTime}
                                                            onChange={(event) => {
                                                                const value = event.target.value;
                                                                setTemplateDays((prev) => prev.map((item, itemIndex) => itemIndex === index
                                                                    ? { ...item, startTime: value }
                                                                    : item));
                                                            }}
                                                            disabled={!day.enabled}
                                                            className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-2 py-1 text-xs text-[var(--color-foreground)] disabled:cursor-not-allowed disabled:opacity-50"
                                                        />
                                                    </label>

                                                    <label className="block text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                                                        End
                                                        <input
                                                            type="time"
                                                            value={day.endTime}
                                                            onChange={(event) => {
                                                                const value = event.target.value;
                                                                setTemplateDays((prev) => prev.map((item, itemIndex) => itemIndex === index
                                                                    ? { ...item, endTime: value }
                                                                    : item));
                                                            }}
                                                            disabled={!day.enabled}
                                                            className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-2 py-1 text-xs text-[var(--color-foreground)] disabled:cursor-not-allowed disabled:opacity-50"
                                                        />
                                                    </label>

                                                    <label className="block text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                                                        Notes
                                                        <input
                                                            value={day.notes}
                                                            onChange={(event) => {
                                                                const value = event.target.value;
                                                                setTemplateDays((prev) => prev.map((item, itemIndex) => itemIndex === index
                                                                    ? { ...item, notes: value }
                                                                    : item));
                                                            }}
                                                            disabled={!day.enabled}
                                                            placeholder="Optional"
                                                            className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-2 py-1 text-xs text-[var(--color-foreground)] placeholder:text-[var(--color-muted)] disabled:cursor-not-allowed disabled:opacity-50"
                                                        />
                                                    </label>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end">
                            <Button onClick={handleSaveTemplate} isLoading={isSavingTemplate}>
                                Save Template
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {activeTab === 'requests' && (
                <Card variant="outlined">
                    <CardContent className="space-y-4">
                        <div>
                            <h2 className="text-base font-semibold text-[var(--color-foreground)]">Time Off Requests</h2>
                            <p className="text-xs text-[var(--color-muted)]">Grouped by employee. Supports full-day and partial-hour requests.</p>
                        </div>

                        <Tabs
                            tabs={[
                                { id: 'pending', label: `Pending (${pendingRequestCount})` },
                                { id: 'approved', label: `Approved (${timeOffRequests.filter((request) => request.status === 'approved').length})` },
                                { id: 'denied', label: `Denied (${timeOffRequests.filter((request) => request.status === 'denied').length})` },
                            ]}
                            activeTab={requestStatusTab}
                            onChange={(tabId) => setRequestStatusTab(tabId as RequestStatusTab)}
                        />

                        {isLoadingRequests ? (
                            <div className="flex items-center justify-center py-8">
                                <LoadingSpinner size={24} />
                            </div>
                        ) : groupedRequests.length === 0 ? (
                            <div className="rounded-lg border border-dashed border-[var(--color-border)] p-4 text-sm text-[var(--color-muted)]">
                                No {requestStatusTab} requests.
                            </div>
                        ) : (
                            <div className="space-y-5">
                                {groupedRequests.map((group) => (
                                    <div key={group.employeeId} className="space-y-2">
                                        <p className="text-sm font-semibold text-[var(--color-foreground)]">{group.employeeName}</p>
                                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                            {group.requests.map((request) => (
                                                <div key={request.id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                                                    <div className="mb-2 flex items-center justify-between gap-2">
                                                        <p className="text-sm font-semibold text-[var(--color-foreground)]">
                                                            {formatRequestDateTimeRange(request)}
                                                        </p>
                                                        <span className={`rounded-full px-2 py-1 text-[11px] font-semibold uppercase ${getStatusBadgeClass(request.status)}`}>
                                                            {request.status}
                                                        </span>
                                                    </div>
                                                    {request.reason && (
                                                        <p className="mb-2 text-sm text-[var(--color-muted)]">{request.reason}</p>
                                                    )}
                                                    {request.review_notes && (
                                                        <p className="mb-2 text-xs text-[var(--color-muted)]">Review note: {request.review_notes}</p>
                                                    )}
                                                    {request.status === 'pending' && (
                                                        <div className="mt-2 flex gap-2">
                                                            <Button
                                                                type="button"
                                                                size="sm"
                                                                variant="secondary"
                                                                onClick={() => handleReviewTimeOffRequest(request.id, 'approved')}
                                                                isLoading={reviewingRequestId === request.id}
                                                            >
                                                                Approve
                                                            </Button>
                                                            <Button
                                                                type="button"
                                                                size="sm"
                                                                variant="ghost"
                                                                className="text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)]"
                                                                onClick={() => handleReviewTimeOffRequest(request.id, 'denied')}
                                                                isLoading={reviewingRequestId === request.id}
                                                            >
                                                                Deny
                                                            </Button>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            <Modal
                isOpen={isShiftModalOpen}
                onClose={closeShiftModal}
                title={editingShiftId ? 'Edit Day Shift' : shiftModalMode === 'override' ? 'Override Template Day' : 'Add Day Shift'}
                description={shiftModalMode === 'override'
                    ? 'This changes only this date and leaves the recurring template untouched.'
                    : 'This only affects the selected date. Use Templates tab for recurring cycle changes.'}
                size="lg"
            >
                <form className="space-y-3" onSubmit={handleSubmit}>
                    <Select
                        label="Employee"
                        value={formState.employeeId}
                        onChange={(event) => setFormState((prev) => ({ ...prev, employeeId: event.target.value }))}
                        options={activeEmployees.map((employee) => ({
                            value: employee.id,
                            label: blockedEmployeesForFormDate.has(employee.id)
                                ? `${employee.name} (full shift blocked)`
                                : employee.name,
                            disabled: blockedEmployeesForFormDate.has(employee.id),
                        }))}
                        hint="Employees whose approved time off fully covers this shift are disabled."
                        disabled={isLoadingEmployees || activeEmployees.length === 0}
                        required
                    />
                    <div className="grid gap-3 sm:grid-cols-3">
                        <Input
                            label="Date"
                            type="date"
                            value={formState.shiftDate}
                            onChange={(event) => setFormState((prev) => ({ ...prev, shiftDate: event.target.value }))}
                            required
                        />
                        <Input
                            label="Start"
                            type="time"
                            value={formState.startTime}
                            onChange={(event) => setFormState((prev) => ({ ...prev, startTime: event.target.value }))}
                            required
                        />
                        <Input
                            label="End"
                            type="time"
                            value={formState.endTime}
                            onChange={(event) => setFormState((prev) => ({ ...prev, endTime: event.target.value }))}
                            required
                        />
                    </div>
                    <Textarea
                        label="Notes (optional)"
                        rows={2}
                        value={formState.notes}
                        onChange={(event) => setFormState((prev) => ({ ...prev, notes: event.target.value }))}
                        placeholder="Opening, closing, break coverage, etc."
                    />

                    <ModalFooter>
                        {shiftModalMode === 'override' && (
                            <>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    className="mr-auto"
                                    onClick={async () => {
                                        const loadingKey = shiftKey(formState.employeeId, formState.shiftDate);
                                        const success = await handleMarkDayOffForEmployeeDate(formState.employeeId, formState.shiftDate, loadingKey);
                                        if (success) closeShiftModal();
                                    }}
                                    isLoading={processingOverrideId === shiftKey(formState.employeeId, formState.shiftDate)}
                                >
                                    Off This Day
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() => {
                                        setTemplateEmployeeId(formState.employeeId);
                                        setTemplateEffectiveFrom(formState.shiftDate);
                                        closeShiftModal();
                                        setActiveTab('templates');
                                        setNotice({ type: 'success', message: 'Opened template editor for this recurring shift.' });
                                    }}
                                >
                                    Edit Template
                                </Button>
                            </>
                        )}
                        {editingShiftId && (
                            <Button
                                type="button"
                                variant="ghost"
                                className="mr-auto text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)]"
                                onClick={() => handleDeleteShift(editingShiftId)}
                                isLoading={deletingShiftId === editingShiftId}
                            >
                                Delete Shift
                            </Button>
                        )}
                        <Button type="button" variant="secondary" onClick={closeShiftModal}>
                            Cancel
                        </Button>
                        <Button type="submit" isLoading={isSaving}>
                            {editingShiftId ? 'Save Shift' : 'Add Shift'}
                        </Button>
                    </ModalFooter>
                </form>
            </Modal>
        </div>
    );
}
