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

type TemplateDay = {
    weekday: number;
    label: string;
    enabled: boolean;
    startTime: string;
    endTime: string;
    notes: string;
};

const TEMPLATE_WEEKDAYS: Array<{ weekday: number; label: string }> = [
    { weekday: 1, label: 'Monday' },
    { weekday: 2, label: 'Tuesday' },
    { weekday: 3, label: 'Wednesday' },
    { weekday: 4, label: 'Thursday' },
    { weekday: 5, label: 'Friday' },
    { weekday: 6, label: 'Saturday' },
    { weekday: 0, label: 'Sunday' },
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
    return `${Math.round(hours * 10) / 10}h`;
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

function previousDateKey(dateKey: string) {
    return toDateKey(addDays(parseDateKey(dateKey), -1));
}

function defaultTemplateDays(): TemplateDay[] {
    return TEMPLATE_WEEKDAYS.map((day) => ({
        weekday: day.weekday,
        label: day.label,
        enabled: false,
        startTime: '09:00',
        endTime: '17:00',
        notes: '',
    }));
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
    const [timeOffRequests, setTimeOffRequests] = useState<TimeOffRequest[]>([]);
    const [isLoadingSchedule, setIsLoadingSchedule] = useState(true);
    const [isLoadingRequests, setIsLoadingRequests] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isSavingTemplate, setIsSavingTemplate] = useState(false);
    const [deletingShiftId, setDeletingShiftId] = useState<string | null>(null);
    const [reviewingRequestId, setReviewingRequestId] = useState<string | null>(null);
    const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
    const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
    const [notice, setNotice] = useState<Notice>(null);
    const [templateEmployeeId, setTemplateEmployeeId] = useState('');
    const [templateEffectiveFrom, setTemplateEffectiveFrom] = useState(toDateKey(new Date()));
    const [templateDays, setTemplateDays] = useState<TemplateDay[]>(defaultTemplateDays());
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

        const [oneTimeResult, recurringResult, requestsResult] = await Promise.all([
            supabase
                .from('employee_schedules')
                .select('id, employee_id, shift_date, start_time, end_time, notes')
                .gte('shift_date', rangeStartKey)
                .lte('shift_date', rangeEndKey)
                .order('shift_date')
                .order('start_time'),
            supabase
                .from('employee_recurring_schedules')
                .select('id, employee_id, weekday, start_time, end_time, notes, active_from, active_until')
                .lte('active_from', rangeEndKey)
                .or(`active_until.is.null,active_until.gte.${rangeStartKey}`)
                .order('employee_id')
                .order('weekday')
                .order('active_from', { ascending: false }),
            supabase
                .from('employee_time_off_requests')
                .select('id, employee_id, start_date, end_date, reason, status, reviewed_by, reviewed_at, review_notes, created_at')
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
        if (!templateEmployeeId) {
            setTemplateDays(defaultTemplateDays());
            return;
        }

        const nextDays = defaultTemplateDays();

        for (const day of nextDays) {
            const matching = recurringSchedules.find((schedule) => (
                schedule.employee_id === templateEmployeeId
                && schedule.weekday === day.weekday
                && schedule.active_from <= templateEffectiveFrom
                && (schedule.active_until === null || schedule.active_until >= templateEffectiveFrom)
            ));

            if (matching) {
                day.enabled = true;
                day.startTime = matching.start_time.slice(0, 5);
                day.endTime = matching.end_time.slice(0, 5);
                day.notes = matching.notes || '';
            }
        }

        setTemplateDays(nextDays);
    }, [templateEffectiveFrom, templateEmployeeId, recurringSchedules]);

    const approvedDayOffSet = useMemo(() => {
        const set = new Set<string>();

        for (const request of timeOffRequests) {
            if (request.status !== 'approved') continue;

            const start = parseDateKey(request.start_date);
            const end = parseDateKey(request.end_date);

            for (const day of visibleDays) {
                if (day >= start && day <= end) {
                    set.add(shiftKey(request.employee_id, toDateKey(day)));
                }
            }
        }

        return set;
    }, [timeOffRequests, visibleDays]);

    const displayShifts = useMemo(() => {
        const specificDayOverrides = new Set(oneTimeShifts.map((shift) => shiftKey(shift.employee_id, shift.shift_date)));

        const generatedRecurring: DisplayShift[] = [];

        for (const schedule of recurringSchedules) {
            for (const day of visibleDays) {
                const dayKey = toDateKey(day);
                if (day.getDay() !== schedule.weekday) continue;
                if (dayKey < schedule.active_from) continue;
                if (schedule.active_until && dayKey > schedule.active_until) continue;
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

        const specificShifts: DisplayShift[] = oneTimeShifts.map((shift) => ({
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
    }, [oneTimeShifts, recurringSchedules, visibleDays]);

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

    const approvedEmployeesByDate = useMemo(() => {
        const map = new Map<string, Set<string>>();

        for (const request of timeOffRequests) {
            if (request.status !== 'approved') continue;

            const start = parseDateKey(request.start_date);
            const end = parseDateKey(request.end_date);

            for (const day of visibleDays) {
                if (day < start || day > end) continue;
                const dayKey = toDateKey(day);
                const current = map.get(dayKey) || new Set<string>();
                current.add(request.employee_id);
                map.set(dayKey, current);
            }
        }

        return map;
    }, [timeOffRequests, visibleDays]);

    const blockedEmployeesForFormDate = useMemo(() => {
        const blocked = new Set<string>();
        const formDate = parseDateKey(formState.shiftDate);

        for (const request of timeOffRequests) {
            if (request.status !== 'approved') continue;
            const start = parseDateKey(request.start_date);
            const end = parseDateKey(request.end_date);
            if (formDate >= start && formDate <= end) {
                blocked.add(request.employee_id);
            }
        }

        return blocked;
    }, [formState.shiftDate, timeOffRequests]);

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
    };

    const openAddModalForDay = (dateKey: string) => {
        setEditingShiftId(null);
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

        if (approvedDayOffSet.has(shiftKey(formState.employeeId, formState.shiftDate))) {
            setNotice({ type: 'error', message: 'This employee has approved time off on that day.' });
            return;
        }

        setIsSaving(true);

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

            setNotice({ type: 'success', message: 'Shift added.' });
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

        setNotice({ type: 'success', message: 'Weekly template saved.' });
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
                        ? 'Edit weekly templates per employee. Changes repeat from the effective date.'
                        : 'Review and approve employee day-off requests.'}
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
                        <Card variant="outlined" className="bg-white">
                            <CardContent>
                                <p className="text-sm text-[var(--color-muted)]">Range</p>
                                <p className="text-base font-semibold text-[var(--color-foreground)]">{rangeLabel}</p>
                            </CardContent>
                        </Card>
                        <Card variant="outlined" className="bg-white">
                            <CardContent>
                                <p className="text-sm text-[var(--color-muted)]">Visible Shifts</p>
                                <p className="text-2xl font-bold text-[var(--color-foreground)]">{displayShifts.length}</p>
                            </CardContent>
                        </Card>
                        <Card variant="outlined" className="bg-white">
                            <CardContent>
                                <p className="text-sm text-[var(--color-muted)]">Scheduled Hours</p>
                                <p className="text-2xl font-bold text-[var(--color-primary)]">{formatHours(scheduledHours)}</p>
                                <p className="text-xs text-[var(--color-muted)]">{scheduledEmployeesCount} team members</p>
                            </CardContent>
                        </Card>
                        <Card variant="outlined" className="bg-white">
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
                                    const approvedEmployees = approvedEmployeesByDate.get(dayKey);
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
                                            className={`bg-white ${isOutsideMonth ? 'opacity-60' : ''}`}
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

                                                {approvedEmployees && approvedEmployees.size > 0 && (
                                                    <div className="rounded-lg bg-[var(--color-surface)] px-2 py-1.5 text-xs text-[var(--color-muted)]">
                                                        <span className="font-semibold text-[var(--color-danger)]">Approved day off:</span>{' '}
                                                        {Array.from(approvedEmployees)
                                                            .map((employeeId) => employeeNameById.get(employeeId) || 'Unknown employee')
                                                            .join(', ')}
                                                    </div>
                                                )}

                                                {renderedShifts.length === 0 ? (
                                                    <div className="rounded-lg border border-dashed border-[var(--color-border)] p-2 text-xs text-[var(--color-muted)]">
                                                        No shifts.
                                                    </div>
                                                ) : (
                                                    <div className="space-y-1.5">
                                                        {renderedShifts.map((shift) => {
                                                            const isBlocked = approvedDayOffSet.has(shiftKey(shift.employee_id, shift.shift_date));

                                                            return (
                                                                <div
                                                                    key={shift.id}
                                                                    className={`group relative rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 ${isBlocked ? 'opacity-80' : ''}`}
                                                                >
                                                                    <p className={`text-sm font-semibold text-[var(--color-foreground)] ${isBlocked ? 'line-through' : ''}`}>
                                                                        {employeeNameById.get(shift.employee_id) || 'Unknown employee'}
                                                                        <span className="ml-1 font-normal text-[var(--color-muted)]">
                                                                            ({formatHours(getShiftDurationHours(shift.start_time, shift.end_time))})
                                                                        </span>
                                                                    </p>
                                                                    <p className={`mt-1 text-xs text-[var(--color-muted)] ${isBlocked ? 'line-through' : ''}`}>
                                                                        {formatTimeLabel(shift.start_time)} - {formatTimeLabel(shift.end_time)}
                                                                    </p>
                                                                    {shift.source === 'recurring' && (
                                                                        <p className="mt-1 text-[11px] uppercase tracking-wide text-[var(--color-muted)]">From template</p>
                                                                    )}
                                                                    {isBlocked && (
                                                                        <p className="mt-1 text-[11px] font-semibold text-[var(--color-danger)]">Approved day off</p>
                                                                    )}
                                                                    {shift.notes && (
                                                                        <p className={`mt-2 text-xs text-[var(--color-muted)] ${isBlocked ? 'line-through' : ''}`}>{shift.notes}</p>
                                                                    )}

                                                                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-black/35 opacity-0 transition-opacity group-hover:opacity-100">
                                                                        <Button
                                                                            type="button"
                                                                            size="sm"
                                                                            className="pointer-events-auto"
                                                                            onClick={() => handleEditFromCalendar(shift)}
                                                                        >
                                                                            {shift.source === 'one_time' ? 'Edit Shift' : 'Edit Template'}
                                                                        </Button>
                                                                    </div>
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
                <Card variant="outlined" className="bg-white">
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

                        <p className="text-xs text-[var(--color-muted)]">
                            Save a weekly template for the selected employee. This updates recurring shifts from the effective date forward.
                            One-time day edits in the calendar remain one-time overrides.
                        </p>

                        <div className="space-y-2">
                            {templateDays.map((day, index) => (
                                <div key={day.weekday} className="rounded-lg border border-[var(--color-border)] p-3">
                                    <div className="mb-2 flex items-center justify-between gap-2">
                                        <label className="flex items-center gap-2 text-sm font-medium text-[var(--color-foreground)]">
                                            <input
                                                type="checkbox"
                                                checked={day.enabled}
                                                onChange={(event) => {
                                                    const checked = event.target.checked;
                                                    setTemplateDays((prev) => prev.map((item, itemIndex) => itemIndex === index
                                                        ? { ...item, enabled: checked }
                                                        : item));
                                                }}
                                            />
                                            {day.label}
                                        </label>
                                    </div>
                                    <div className="grid gap-3 sm:grid-cols-3">
                                        <Input
                                            label="Start"
                                            type="time"
                                            value={day.startTime}
                                            onChange={(event) => {
                                                const value = event.target.value;
                                                setTemplateDays((prev) => prev.map((item, itemIndex) => itemIndex === index
                                                    ? { ...item, startTime: value }
                                                    : item));
                                            }}
                                            disabled={!day.enabled}
                                        />
                                        <Input
                                            label="End"
                                            type="time"
                                            value={day.endTime}
                                            onChange={(event) => {
                                                const value = event.target.value;
                                                setTemplateDays((prev) => prev.map((item, itemIndex) => itemIndex === index
                                                    ? { ...item, endTime: value }
                                                    : item));
                                            }}
                                            disabled={!day.enabled}
                                        />
                                        <Input
                                            label="Notes"
                                            value={day.notes}
                                            onChange={(event) => {
                                                const value = event.target.value;
                                                setTemplateDays((prev) => prev.map((item, itemIndex) => itemIndex === index
                                                    ? { ...item, notes: value }
                                                    : item));
                                            }}
                                            disabled={!day.enabled}
                                            placeholder="Optional"
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="flex justify-end">
                            <Button onClick={handleSaveTemplate} isLoading={isSavingTemplate}>
                                Save Weekly Template
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {activeTab === 'requests' && (
                <Card variant="outlined" className="bg-white">
                    <CardContent className="space-y-4">
                        <div>
                            <h2 className="text-base font-semibold text-[var(--color-foreground)]">Time Off Requests</h2>
                            <p className="text-xs text-[var(--color-muted)]">Grouped by employee.</p>
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
                                                            {formatDateRange(request.start_date, request.end_date)}
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
                title={editingShiftId ? 'Edit Day Shift' : 'Add Day Shift'}
                description="This only affects the selected date. Use Templates tab for recurring weekly changes."
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
                                ? `${employee.name} (approved day off)`
                                : employee.name,
                            disabled: blockedEmployeesForFormDate.has(employee.id),
                        }))}
                        hint="Employees with approved day off on the selected date are disabled."
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
