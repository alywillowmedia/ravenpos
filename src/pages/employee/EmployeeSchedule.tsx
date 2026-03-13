import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Header } from '../../components/layout/Header';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input, Textarea } from '../../components/ui/Input';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { Tabs } from '../../components/ui/Tabs';
import { useEmployee } from '../../contexts/EmployeeContext';
import { supabase } from '../../lib/supabase';

type ViewMode = 'week' | 'month';
type EmployeeTab = 'schedule' | 'requests';
type TimeOffRequestStatus = 'pending' | 'approved' | 'denied';
type ShiftTimeOffImpact = 'none' | 'partial' | 'full';

type OneTimeShift = {
    id: string;
    shift_date: string;
    start_time: string;
    end_time: string;
    notes: string | null;
};

type RecurringSchedule = {
    id: string;
    weekday: number;
    start_time: string;
    end_time: string;
    notes: string | null;
    active_from: string;
    active_until: string | null;
};

type DisplayShift = {
    id: string;
    shift_date: string;
    start_time: string;
    end_time: string;
    notes: string | null;
    source: 'one_time' | 'recurring';
};

type TimeOffRequest = {
    id: string;
    start_date: string;
    end_date: string;
    is_full_day: boolean;
    start_time: string | null;
    end_time: string | null;
    reason: string | null;
    status: TimeOffRequestStatus;
    review_notes: string | null;
    created_at: string;
};

type RequestFormState = {
    startDate: string;
    endDate: string;
    isFullDay: boolean;
    startTime: string;
    endTime: string;
    reason: string;
};

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

function startOfWeekSunday(date: Date) {
    const next = new Date(date);
    next.setHours(0, 0, 0, 0);
    next.setDate(next.getDate() - next.getDay());
    return next;
}

function startOfMonthGridSunday(date: Date) {
    const first = new Date(date.getFullYear(), date.getMonth(), 1);
    return startOfWeekSunday(first);
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
        if (request.start_date === request.end_date) return `${formatDateLabel(request.start_date)} (Full day)`;
        return `${formatDateRange(request.start_date, request.end_date)} (Full day)`;
    }

    const startTime = request.start_time ? formatTimeLabel(request.start_time) : '--';
    const endTime = request.end_time ? formatTimeLabel(request.end_time) : '--';
    return `${formatDateLabel(request.start_date)} ${startTime} - ${endTime}`;
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

export function EmployeeSchedule() {
    const { employee } = useEmployee();
    const [activeTab, setActiveTab] = useState<EmployeeTab>('schedule');
    const [viewMode, setViewMode] = useState<ViewMode>('week');
    const [anchorDate, setAnchorDate] = useState(() => new Date());
    const [oneTimeShifts, setOneTimeShifts] = useState<OneTimeShift[]>([]);
    const [recurringSchedules, setRecurringSchedules] = useState<RecurringSchedule[]>([]);
    const [timeOffRequests, setTimeOffRequests] = useState<TimeOffRequest[]>([]);
    const [isLoadingSchedule, setIsLoadingSchedule] = useState(true);
    const [isLoadingRequests, setIsLoadingRequests] = useState(true);
    const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
    const [deletingRequestId, setDeletingRequestId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [requestError, setRequestError] = useState<string | null>(null);
    const [requestSuccess, setRequestSuccess] = useState<string | null>(null);
    const [requestForm, setRequestForm] = useState<RequestFormState>({
        startDate: toDateKey(new Date()),
        endDate: toDateKey(new Date()),
        isFullDay: true,
        startTime: '09:00',
        endTime: '17:00',
        reason: '',
    });

    const rangeStart = useMemo(
        () => (viewMode === 'week' ? startOfWeekSunday(anchorDate) : startOfMonthGridSunday(anchorDate)),
        [anchorDate, viewMode]
    );

    const visibleDays = useMemo(() => {
        const count = viewMode === 'week' ? 7 : 42;
        return Array.from({ length: count }, (_, index) => addDays(rangeStart, index));
    }, [rangeStart, viewMode]);

    const rangeEnd = visibleDays[visibleDays.length - 1];
    const rangeStartKey = toDateKey(rangeStart);
    const rangeEndKey = toDateKey(rangeEnd);

    const fetchSchedule = useCallback(async () => {
        if (!employee?.id) return;

        setIsLoadingSchedule(true);
        setError(null);

        const [oneTimeResult, recurringResult] = await Promise.all([
            supabase
                .from('employee_schedules')
                .select('id, shift_date, start_time, end_time, notes')
                .eq('employee_id', employee.id)
                .gte('shift_date', rangeStartKey)
                .lte('shift_date', rangeEndKey)
                .order('shift_date')
                .order('start_time'),
            supabase
                .from('employee_recurring_schedules')
                .select('id, weekday, start_time, end_time, notes, active_from, active_until')
                .eq('employee_id', employee.id)
                .lte('active_from', rangeEndKey)
                .or(`active_until.is.null,active_until.gte.${rangeStartKey}`)
                .order('weekday')
                .order('start_time'),
        ]);

        if (oneTimeResult.error) {
            setError(oneTimeResult.error.message);
            setOneTimeShifts([]);
        } else {
            setOneTimeShifts((oneTimeResult.data || []) as OneTimeShift[]);
        }

        if (recurringResult.error) {
            setError(recurringResult.error.message);
            setRecurringSchedules([]);
        } else {
            setRecurringSchedules((recurringResult.data || []) as RecurringSchedule[]);
        }

        setIsLoadingSchedule(false);
    }, [employee?.id, rangeEndKey, rangeStartKey]);

    const fetchTimeOffRequests = useCallback(async () => {
        if (!employee?.id) return;

        setIsLoadingRequests(true);
        setRequestError(null);

        const { data, error: queryError } = await supabase
            .from('employee_time_off_requests')
            .select('id, start_date, end_date, is_full_day, start_time, end_time, reason, status, review_notes, created_at')
            .eq('employee_id', employee.id)
            .order('start_date', { ascending: false });

        if (queryError) {
            setRequestError(queryError.message);
            setTimeOffRequests([]);
            setIsLoadingRequests(false);
            return;
        }

        setTimeOffRequests((data || []) as TimeOffRequest[]);
        setIsLoadingRequests(false);
    }, [employee?.id]);

    useEffect(() => {
        fetchSchedule();
    }, [fetchSchedule]);

    useEffect(() => {
        fetchTimeOffRequests();
    }, [fetchTimeOffRequests]);

    const getTimeOffImpactForShift = useCallback(
        (shiftDate: string, shiftStart: string, shiftEnd: string): ShiftTimeOffImpact => {
            let hasPartial = false;
            for (const request of timeOffRequests) {
                const impact = getRequestShiftImpact(request, shiftDate, shiftStart, shiftEnd);
                if (impact === 'full') return 'full';
                if (impact === 'partial') hasPartial = true;
            }
            return hasPartial ? 'partial' : 'none';
        },
        [timeOffRequests]
    );

    const displayShifts = useMemo(() => {
        const overrides = new Set(oneTimeShifts.map((shift) => shift.shift_date));

        const recurringShifts: DisplayShift[] = [];
        for (const schedule of recurringSchedules) {
            for (const day of visibleDays) {
                const dayKey = toDateKey(day);
                if (day.getDay() !== schedule.weekday) continue;
                if (dayKey < schedule.active_from) continue;
                if (schedule.active_until && dayKey > schedule.active_until) continue;
                if (overrides.has(dayKey)) continue;

                recurringShifts.push({
                    id: `recurring-${schedule.id}-${dayKey}`,
                    shift_date: dayKey,
                    start_time: schedule.start_time,
                    end_time: schedule.end_time,
                    notes: schedule.notes,
                    source: 'recurring',
                });
            }
        }

        const specificShifts: DisplayShift[] = oneTimeShifts.map((shift) => ({
            id: shift.id,
            shift_date: shift.shift_date,
            start_time: shift.start_time,
            end_time: shift.end_time,
            notes: shift.notes,
            source: 'one_time',
        }));

        return [...specificShifts, ...recurringShifts].sort((a, b) => {
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

    const pendingRequestCount = useMemo(
        () => timeOffRequests.filter((request) => request.status === 'pending').length,
        [timeOffRequests]
    );

    const handleSubmitRequest = async (event: FormEvent) => {
        event.preventDefault();

        if (!employee?.id) return;

        setRequestError(null);
        setRequestSuccess(null);

        if (requestForm.endDate < requestForm.startDate) {
            setRequestError('End date must be on or after start date.');
            return;
        }

        if (!requestForm.isFullDay && requestForm.startDate !== requestForm.endDate) {
            setRequestError('Hourly requests must be a single day.');
            return;
        }

        if (!requestForm.isFullDay && parseTimeToMinutes(requestForm.endTime) <= parseTimeToMinutes(requestForm.startTime)) {
            setRequestError('End time must be after start time for hourly requests.');
            return;
        }

        setIsSubmittingRequest(true);

        const { error: insertError } = await supabase
            .from('employee_time_off_requests')
            .insert({
                employee_id: employee.id,
                start_date: requestForm.startDate,
                end_date: requestForm.endDate,
                is_full_day: requestForm.isFullDay,
                start_time: requestForm.isFullDay ? null : requestForm.startTime,
                end_time: requestForm.isFullDay ? null : requestForm.endTime,
                reason: requestForm.reason.trim() || null,
            });

        if (insertError) {
            setRequestError(insertError.message);
            setIsSubmittingRequest(false);
            return;
        }

        setRequestSuccess('Request submitted.');
        setRequestForm({
            startDate: toDateKey(new Date()),
            endDate: toDateKey(new Date()),
            isFullDay: true,
            startTime: '09:00',
            endTime: '17:00',
            reason: '',
        });
        setIsSubmittingRequest(false);
        await fetchTimeOffRequests();
    };

    const handleDeleteRequest = async (requestId: string) => {
        setRequestError(null);
        setRequestSuccess(null);
        setDeletingRequestId(requestId);

        const { error: deleteError } = await supabase
            .from('employee_time_off_requests')
            .delete()
            .eq('id', requestId)
            .eq('status', 'pending');

        if (deleteError) {
            setRequestError(deleteError.message);
            setDeletingRequestId(null);
            return;
        }

        setRequestSuccess('Request canceled.');
        setDeletingRequestId(null);
        await fetchTimeOffRequests();
    };

    const moveRange = (direction: -1 | 1) => {
        if (viewMode === 'week') {
            setAnchorDate((prev) => addDays(prev, direction * 7));
            return;
        }

        setAnchorDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + direction, 1));
    };

    const rangeLabel =
        viewMode === 'week'
            ? `${rangeStart.toLocaleDateString([], { month: 'short', day: 'numeric' })} - ${rangeEnd.toLocaleDateString([], { month: 'short', day: 'numeric' })}`
            : anchorDate.toLocaleDateString([], { month: 'long', year: 'numeric' });

    return (
        <div className="animate-fadeIn max-w-5xl">
            <Header
                title="Schedule"
                description={activeTab === 'schedule' ? 'Your assigned shifts with weekly repeat rules.' : 'Submit and track full-day or hourly time-off requests.'}
                actions={(
                    <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="secondary" onClick={() => moveRange(-1)}>
                            Previous
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setAnchorDate(new Date())}>
                            Today
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => moveRange(1)}>
                            Next
                        </Button>
                        <Button size="sm" variant={viewMode === 'week' ? 'primary' : 'ghost'} onClick={() => setViewMode('week')}>
                            Week
                        </Button>
                        <Button size="sm" variant={viewMode === 'month' ? 'primary' : 'ghost'} onClick={() => setViewMode('month')}>
                            Month
                        </Button>
                    </div>
                )}
            />

            <div className="mb-4">
                <Tabs
                    tabs={[
                        { id: 'schedule', label: 'Schedule' },
                        { id: 'requests', label: `Requests (${pendingRequestCount})` },
                    ]}
                    activeTab={activeTab}
                    onChange={(tabId) => setActiveTab(tabId as EmployeeTab)}
                />
            </div>

            {error && (
                <div className="mb-4 rounded-lg bg-[var(--color-danger-bg)] p-3 text-[var(--color-danger)]">
                    {error}
                </div>
            )}

            {activeTab === 'schedule' && (
                <>
                    <Card variant="outlined" className="mb-3 bg-white">
                        <CardContent className="py-3">
                            <p className="text-sm font-semibold text-[var(--color-foreground)]">{rangeLabel}</p>
                        </CardContent>
                    </Card>

                    {isLoadingSchedule ? (
                        <div className="flex items-center justify-center py-10">
                            <LoadingSpinner size={28} />
                        </div>
                    ) : (
                        <>
                            {viewMode === 'month' && (
                                <div className="mb-2 grid grid-cols-7 gap-2 px-1">
                                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label) => (
                                        <p key={label} className="text-center text-xs font-semibold uppercase text-[var(--color-muted)]">
                                            {label}
                                        </p>
                                    ))}
                                </div>
                            )}

                            <div className={viewMode === 'week' ? 'grid gap-3 md:grid-cols-2 xl:grid-cols-7' : 'grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-7'}>
                                {visibleDays.map((day) => {
                                    const dayKey = toDateKey(day);
                                    const dayShifts = shiftsByDate.get(dayKey) || [];
                                    const isOutsideMonth = viewMode === 'month' && day.getMonth() !== anchorDate.getMonth();
                                    const renderedShifts = viewMode === 'month' ? dayShifts.slice(0, 3) : dayShifts;

                                    return (
                                        <Card key={dayKey} variant="outlined" className={`bg-white ${isOutsideMonth ? 'opacity-60' : ''}`}>
                                            <CardContent className="space-y-2">
                                                <div className="border-b border-[var(--color-border)] pb-2">
                                                    <p className="text-sm font-semibold text-[var(--color-foreground)]">
                                                        {day.toLocaleDateString([], { weekday: 'short' })}
                                                    </p>
                                                    <p className="text-xs text-[var(--color-muted)]">
                                                        {day.toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                                    </p>
                                                </div>

                                                {renderedShifts.length === 0 ? (
                                                    <p className="text-xs text-[var(--color-muted)]">No shifts</p>
                                                ) : (
                                                    <div className="space-y-1.5">
                                                        {renderedShifts.map((shift) => {
                                                            const timeOffImpact = getTimeOffImpactForShift(
                                                                shift.shift_date,
                                                                shift.start_time,
                                                                shift.end_time
                                                            );
                                                            const isFullyBlocked = timeOffImpact === 'full';
                                                            const isPartiallyBlocked = timeOffImpact === 'partial';
                                                            return (
                                                                <div key={shift.id} className="rounded-lg border border-[var(--color-border)] px-2 py-1.5">
                                                                    <p className={`text-xs font-medium text-[var(--color-foreground)] ${isFullyBlocked ? 'line-through opacity-70' : ''}`}>
                                                                        {formatTimeLabel(shift.start_time)} - {formatTimeLabel(shift.end_time)}
                                                                        <span className="ml-1 text-[var(--color-muted)]">({getShiftDurationHours(shift.start_time, shift.end_time).toFixed(2)}h)</span>
                                                                    </p>
                                                                    {shift.source === 'recurring' && (
                                                                        <p className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">Repeats weekly</p>
                                                                    )}
                                                                    {isFullyBlocked && (
                                                                        <p className="text-[10px] font-semibold text-[var(--color-danger)]">Approved time off</p>
                                                                    )}
                                                                    {isPartiallyBlocked && (
                                                                        <p className="text-[10px] font-semibold text-[var(--color-warning)]">Partial time-off overlap</p>
                                                                    )}
                                                                    {shift.notes && (
                                                                        <p className={`text-[11px] text-[var(--color-muted)] ${isFullyBlocked ? 'line-through opacity-70' : ''}`}>{shift.notes}</p>
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

            {activeTab === 'requests' && (
                <>
                    <Card variant="outlined" className="mb-4 bg-white">
                        <CardContent>
                            <h2 className="mb-1 text-base font-semibold text-[var(--color-foreground)]">Request Time Off</h2>
                            <p className="mb-3 text-xs text-[var(--color-muted)]">Submit full days or specific hours you cannot work. Admins can approve or deny.</p>
                            <form className="space-y-3" onSubmit={handleSubmitRequest}>
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <Input
                                        label="Start Date"
                                        type="date"
                                        value={requestForm.startDate}
                                        onChange={(event) => setRequestForm((prev) => ({ ...prev, startDate: event.target.value }))}
                                        required
                                    />
                                    <Input
                                        label="End Date"
                                        type="date"
                                        value={requestForm.endDate}
                                        onChange={(event) => setRequestForm((prev) => ({ ...prev, endDate: event.target.value }))}
                                        required
                                    />
                                </div>
                                <label className="inline-flex items-center gap-2 text-sm text-[var(--color-foreground)]">
                                    <input
                                        type="checkbox"
                                        checked={requestForm.isFullDay}
                                        onChange={(event) => setRequestForm((prev) => ({ ...prev, isFullDay: event.target.checked }))}
                                    />
                                    Full day
                                </label>
                                {!requestForm.isFullDay && (
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <Input
                                            label="Start Time"
                                            type="time"
                                            value={requestForm.startTime}
                                            onChange={(event) => setRequestForm((prev) => ({ ...prev, startTime: event.target.value }))}
                                            required
                                        />
                                        <Input
                                            label="End Time"
                                            type="time"
                                            value={requestForm.endTime}
                                            onChange={(event) => setRequestForm((prev) => ({ ...prev, endTime: event.target.value }))}
                                            required
                                        />
                                    </div>
                                )}
                                <Textarea
                                    label="Reason (optional)"
                                    rows={2}
                                    value={requestForm.reason}
                                    onChange={(event) => setRequestForm((prev) => ({ ...prev, reason: event.target.value }))}
                                    placeholder="Appointment, travel, event, etc."
                                />
                                <div className="flex justify-end">
                                    <Button type="submit" isLoading={isSubmittingRequest}>Submit Request</Button>
                                </div>
                            </form>
                        </CardContent>
                    </Card>

                    {requestError && (
                        <div className="mb-4 rounded-lg bg-[var(--color-danger-bg)] p-3 text-[var(--color-danger)]">
                            {requestError}
                        </div>
                    )}
                    {requestSuccess && (
                        <div className="mb-4 rounded-lg bg-[var(--color-success-bg)] p-3 text-[var(--color-success)]">
                            {requestSuccess}
                        </div>
                    )}

                    <Card variant="outlined" className="bg-white" padding="none">
                        <div className="border-b border-[var(--color-border)] px-4 py-3">
                            <h2 className="text-base font-semibold text-[var(--color-foreground)]">Your Requests</h2>
                        </div>
                        {isLoadingRequests ? (
                            <div className="flex items-center justify-center py-8">
                                <LoadingSpinner size={24} />
                            </div>
                        ) : timeOffRequests.length === 0 ? (
                            <div className="px-4 py-6 text-sm text-[var(--color-muted)]">No time-off requests submitted yet.</div>
                        ) : (
                            <div className="divide-y divide-[var(--color-border)]">
                                {timeOffRequests.map((request) => (
                                    <div key={request.id} className="space-y-2 px-4 py-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="text-sm font-semibold text-[var(--color-foreground)]">
                                                {formatRequestDateTimeRange(request)}
                                            </p>
                                            <span className={`rounded-full px-2 py-1 text-xs font-semibold uppercase ${getStatusBadgeClass(request.status)}`}>
                                                {request.status}
                                            </span>
                                        </div>
                                        {request.reason && (
                                            <p className="text-sm text-[var(--color-muted)]">{request.reason}</p>
                                        )}
                                        {request.review_notes && (
                                            <p className="text-xs text-[var(--color-muted)]">Admin note: {request.review_notes}</p>
                                        )}
                                        {request.status === 'pending' && (
                                            <div>
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="ghost"
                                                    className="text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)]"
                                                    onClick={() => handleDeleteRequest(request.id)}
                                                    isLoading={deletingRequestId === request.id}
                                                >
                                                    Cancel Request
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>
                </>
            )}
        </div>
    );
}
