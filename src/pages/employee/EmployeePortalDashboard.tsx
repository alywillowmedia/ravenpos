import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input, Textarea } from '../../components/ui/Input';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { Tabs } from '../../components/ui/Tabs';
import { ProfilePhotoUpload } from '../../components/ui/ProfilePhotoUpload';
import { EmployeeSalesSummary } from '../../components/employee/EmployeeSalesSummary';

type OneTimeShift = {
    id: string;
    shift_date: string;
    start_time: string;
    end_time: string;
    notes: string | null;
};

type RecurringShift = {
    id: string;
    weekday: number;
    cycle_length_days: number | null;
    day_offset: number | null;
    start_time: string;
    end_time: string;
    notes: string | null;
    active_from: string;
    active_until: string | null;
};

type DayOffOverride = {
    id: string;
    shift_date: string;
    is_day_off: boolean;
};

type TimeEntry = {
    id: string;
    clock_in: string;
    clock_out: string | null;
    total_hours: number | null;
};

type DisplayShift = {
    id: string;
    shift_date: string;
    start_time: string;
    end_time: string;
    notes: string | null;
    source: 'one_time' | 'recurring';
};

type EmployeeProfile = {
    id: string;
    name: string;
    hourly_rate: number;
};

type TimeOffRequestStatus = 'pending' | 'approved' | 'denied';

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

type EmployeeHubTab = 'schedule' | 'sales' | 'requests' | 'profile';

function toDateKey(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
}

function parseDateKey(value: string) {
    const [year, month, day] = value.split('-').map((part) => Number.parseInt(part, 10));
    return new Date(year, month - 1, day);
}

function toDateKeyDayNumber(value: string) {
    const [year, month, day] = value.split('-').map((part) => Number.parseInt(part, 10));
    return Math.floor(Date.UTC(year, month - 1, day) / (24 * 60 * 60 * 1000));
}

function startOfWeekMonday(date: Date) {
    const next = new Date(date);
    next.setHours(0, 0, 0, 0);
    const day = next.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    next.setDate(next.getDate() + diff);
    return next;
}

function formatTime(time: string) {
    const [hours = '0', minutes = '0'] = time.split(':');
    const date = new Date();
    date.setHours(Number.parseInt(hours, 10), Number.parseInt(minutes, 10), 0, 0);
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatDate(dateKey: string) {
    return parseDateKey(dateKey).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatWeekRange(startDateKey: string, endDateKey: string) {
    const start = parseDateKey(startDateKey);
    const end = parseDateKey(endDateKey);
    const startLabel = start.toLocaleDateString([], { month: 'short', day: 'numeric' });
    const endLabel = end.toLocaleDateString([], { month: 'short', day: 'numeric' });
    return `${startLabel} - ${endLabel}`;
}

function toHours(start: string, end: string) {
    const [sh = '0', sm = '0'] = start.split(':');
    const [eh = '0', em = '0'] = end.split(':');
    const startMinutes = Number.parseInt(sh, 10) * 60 + Number.parseInt(sm, 10);
    const endMinutes = Number.parseInt(eh, 10) * 60 + Number.parseInt(em, 10);
    return Math.max(0, endMinutes - startMinutes) / 60;
}

function matchesRecurringOnDate(shift: RecurringShift, date: Date, dateKey: string) {
    if (dateKey < shift.active_from) return false;
    if (shift.active_until && dateKey > shift.active_until) return false;

    if (shift.cycle_length_days && shift.day_offset !== null && shift.day_offset !== undefined) {
        const deltaDays = toDateKeyDayNumber(dateKey) - toDateKeyDayNumber(shift.active_from);
        if (deltaDays < 0) return false;
        return deltaDays % shift.cycle_length_days === shift.day_offset;
    }

    return date.getDay() === shift.weekday;
}

function formatRequestDateTimeRange(request: TimeOffRequest) {
    if (request.is_full_day) {
        if (request.start_date === request.end_date) {
            return `${formatDate(request.start_date)} (Full day)`;
        }
        return `${formatDate(request.start_date)} - ${formatDate(request.end_date)} (Full day)`;
    }

    const startTime = request.start_time ? formatTime(request.start_time) : '--';
    const endTime = request.end_time ? formatTime(request.end_time) : '--';
    return `${formatDate(request.start_date)} ${startTime} - ${endTime}`;
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

export function EmployeePortalDashboard() {
    const navigate = useNavigate();
    const { user, userRecord, portalChoices, setActivePortal, signOut, refreshUserRecord } = useAuth();
    const [profile, setProfile] = useState<EmployeeProfile | null>(null);
    const [oneTimeShifts, setOneTimeShifts] = useState<OneTimeShift[]>([]);
    const [recurringShifts, setRecurringShifts] = useState<RecurringShift[]>([]);
    const [dayOffOverrides, setDayOffOverrides] = useState<DayOffOverride[]>([]);
    const [weekHoursWorked, setWeekHoursWorked] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [accountEmail, setAccountEmail] = useState('');
    const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [accountMessage, setAccountMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [isSavingAccount, setIsSavingAccount] = useState(false);

    const [timeOffRequests, setTimeOffRequests] = useState<TimeOffRequest[]>([]);
    const [isLoadingRequests, setIsLoadingRequests] = useState(true);
    const [requestError, setRequestError] = useState<string | null>(null);
    const [requestSuccess, setRequestSuccess] = useState<string | null>(null);
    const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
    const [deletingRequestId, setDeletingRequestId] = useState<string | null>(null);
    const [requestForm, setRequestForm] = useState<RequestFormState>({
        startDate: toDateKey(new Date()),
        endDate: toDateKey(new Date()),
        isFullDay: true,
        startTime: '09:00',
        endTime: '17:00',
        reason: '',
    });
    const [activeHubTab, setActiveHubTab] = useState<EmployeeHubTab>('schedule');
    const [selectedWeekStartKey, setSelectedWeekStartKey] = useState(() => toDateKey(startOfWeekMonday(new Date())));

    const employeeId = userRecord?.employee_id || userRecord?.linked_employee_id || null;
    const canSwitchViews = portalChoices.length > 1;

    const today = useMemo(() => new Date(), []);
    const todayKey = toDateKey(today);
    const currentWeekStartKey = toDateKey(startOfWeekMonday(today));
    const scheduleRangeStart = parseDateKey(selectedWeekStartKey);
    const scheduleRangeEnd = addDays(scheduleRangeStart, 6);
    const scheduleRangeStartKey = toDateKey(scheduleRangeStart);
    const scheduleRangeEndKey = toDateKey(scheduleRangeEnd);
    const weekRangeLabel = formatWeekRange(scheduleRangeStartKey, scheduleRangeEndKey);
    const selectedWeekOffset = Math.round((toDateKeyDayNumber(selectedWeekStartKey) - toDateKeyDayNumber(currentWeekStartKey)) / 7);
    const selectedWeekLabel = selectedWeekOffset === 0
        ? 'This Week'
        : selectedWeekOffset === 1
            ? 'Next Week'
            : selectedWeekOffset === -1
                ? 'Last Week'
                : 'Selected Week';

    const displayedDays = useMemo(
        () => Array.from({ length: 7 }, (_, index) => toDateKey(addDays(parseDateKey(selectedWeekStartKey), index))),
        [selectedWeekStartKey]
    );

    useEffect(() => {
        setAccountEmail(userRecord?.email || user?.email || '');
        setProfileImageUrl(userRecord?.profile_image_url ?? null);
    }, [user?.email, userRecord?.email, userRecord?.profile_image_url]);

    const displayShifts = useMemo(() => {
        const shifts: DisplayShift[] = [];
        const dayOffOverrideDates = new Set(
            dayOffOverrides.filter((override) => override.is_day_off).map((override) => override.shift_date)
        );
        const oneTimeOverrideDates = new Set(oneTimeShifts.map((shift) => shift.shift_date));

        for (const shift of oneTimeShifts) {
            if (dayOffOverrideDates.has(shift.shift_date)) continue;
            shifts.push({
                id: shift.id,
                shift_date: shift.shift_date,
                start_time: shift.start_time,
                end_time: shift.end_time,
                notes: shift.notes,
                source: 'one_time',
            });
        }

        for (const recurring of recurringShifts) {
            for (const dateKey of displayedDays) {
                const date = parseDateKey(dateKey);
                if (!matchesRecurringOnDate(recurring, date, dateKey)) continue;
                if (dayOffOverrideDates.has(dateKey)) continue;
                if (oneTimeOverrideDates.has(dateKey)) continue;

                shifts.push({
                    id: `${recurring.id}-${dateKey}`,
                    shift_date: dateKey,
                    start_time: recurring.start_time,
                    end_time: recurring.end_time,
                    notes: recurring.notes,
                    source: 'recurring',
                });
            }
        }

        shifts.sort((a, b) => {
            if (a.shift_date !== b.shift_date) return a.shift_date.localeCompare(b.shift_date);
            return a.start_time.localeCompare(b.start_time);
        });

        return shifts;
    }, [dayOffOverrides, oneTimeShifts, recurringShifts, displayedDays]);

    const shiftsByDate = useMemo(() => {
        const map = new Map<string, DisplayShift[]>();
        for (const day of displayedDays) {
            map.set(day, []);
        }

        for (const shift of displayShifts) {
            const existing = map.get(shift.shift_date);
            if (existing) {
                existing.push(shift);
            }
        }

        return map;
    }, [displayShifts, displayedDays]);

    const weekdayHeaders = useMemo(
        () => displayedDays.slice(0, 7).map((day) => parseDateKey(day).toLocaleDateString([], { weekday: 'short' })),
        [displayedDays]
    );

    const mobileScheduleDays = useMemo(
        () => displayedDays.filter((day) => (shiftsByDate.get(day)?.length || 0) > 0),
        [displayedDays, shiftsByDate]
    );

    const scheduledHoursSelectedWeek = useMemo(
        () => displayShifts.reduce((sum, shift) => sum + toHours(shift.start_time, shift.end_time), 0),
        [displayShifts]
    );

    const estimatedPay = useMemo(() => {
        const hourlyRate = profile?.hourly_rate || 0;
        return weekHoursWorked * hourlyRate;
    }, [profile?.hourly_rate, weekHoursWorked]);

    const loadTimeOffRequests = useCallback(async () => {
        if (!employeeId) {
            setTimeOffRequests([]);
            setIsLoadingRequests(false);
            return;
        }

        setIsLoadingRequests(true);

        const { data, error: requestsError } = await supabase
            .from('employee_time_off_requests')
            .select('id, start_date, end_date, is_full_day, start_time, end_time, reason, status, review_notes, created_at')
            .eq('employee_id', employeeId)
            .order('start_date', { ascending: false });

        if (requestsError) {
            setRequestError(requestsError.message);
            setIsLoadingRequests(false);
            return;
        }

        setTimeOffRequests((data || []) as TimeOffRequest[]);
        setIsLoadingRequests(false);
    }, [employeeId]);

    const loadDashboard = useCallback(async () => {
        if (!employeeId) {
            setError('Missing employee identity for this account.');
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        setError(null);

        const weekStart = startOfWeekMonday(new Date());
        const nowIso = new Date().toISOString();

        const [profileResult, oneTimeResult, recurringResult, dayOffOverridesResult, timeEntriesResult] = await Promise.all([
            supabase
                .from('employees')
                .select('id, name, hourly_rate')
                .eq('id', employeeId)
                .single(),
            supabase
                .from('employee_schedules')
                .select('id, shift_date, start_time, end_time, notes')
                .eq('employee_id', employeeId)
                .gte('shift_date', scheduleRangeStartKey)
                .lte('shift_date', scheduleRangeEndKey)
                .order('shift_date')
                .order('start_time'),
            supabase
                .from('employee_recurring_schedules')
                .select('id, weekday, cycle_length_days, day_offset, start_time, end_time, notes, active_from, active_until')
                .eq('employee_id', employeeId)
                .lte('active_from', scheduleRangeEndKey)
                .or(`active_until.is.null,active_until.gte.${scheduleRangeStartKey}`)
                .order('cycle_length_days')
                .order('day_offset')
                .order('start_time'),
            supabase
                .from('employee_schedule_day_overrides')
                .select('id, shift_date, is_day_off')
                .eq('employee_id', employeeId)
                .eq('is_day_off', true)
                .gte('shift_date', scheduleRangeStartKey)
                .lte('shift_date', scheduleRangeEndKey)
                .order('shift_date'),
            supabase
                .from('time_entries')
                .select('id, clock_in, clock_out, total_hours')
                .eq('employee_id', employeeId)
                .gte('clock_in', weekStart.toISOString())
                .lte('clock_in', nowIso),
        ]);

        if (profileResult.error || oneTimeResult.error || recurringResult.error || dayOffOverridesResult.error || timeEntriesResult.error) {
            const firstError = profileResult.error || oneTimeResult.error || recurringResult.error || dayOffOverridesResult.error || timeEntriesResult.error;
            setError(firstError?.message || 'Failed to load dashboard');
            setIsLoading(false);
            return;
        }

        setProfile(profileResult.data as EmployeeProfile);
        setOneTimeShifts((oneTimeResult.data || []) as OneTimeShift[]);
        setRecurringShifts((recurringResult.data || []) as RecurringShift[]);
        setDayOffOverrides((dayOffOverridesResult.data || []) as DayOffOverride[]);

        const entries = (timeEntriesResult.data || []) as TimeEntry[];
        const hours = entries.reduce((sum, entry) => {
            if (entry.total_hours !== null && entry.total_hours !== undefined) {
                return sum + entry.total_hours;
            }

            if (!entry.clock_out) {
                const start = new Date(entry.clock_in);
                const now = new Date();
                return sum + Math.max(0, (now.getTime() - start.getTime()) / (1000 * 60 * 60));
            }

            return sum;
        }, 0);

        setWeekHoursWorked(Math.round(hours * 100) / 100);
        setIsLoading(false);
    }, [employeeId, scheduleRangeEndKey, scheduleRangeStartKey]);

    useEffect(() => {
        void loadDashboard();
        void loadTimeOffRequests();
    }, [loadDashboard, loadTimeOffRequests]);

    const goToPreviousScheduleWeek = () => {
        setSelectedWeekStartKey((current) => toDateKey(addDays(parseDateKey(current), -7)));
    };

    const goToNextScheduleWeek = () => {
        setSelectedWeekStartKey((current) => toDateKey(addDays(parseDateKey(current), 7)));
    };

    const goToCurrentScheduleWeek = () => {
        setSelectedWeekStartKey(currentWeekStartKey);
    };

    const handleProfilePhotoChange = async (url: string | null) => {
        if (!userRecord?.id) return;

        setAccountMessage(null);
        const { error: updateError } = await supabase
            .from('users')
            .update({ profile_image_url: url })
            .eq('id', userRecord.id);

        if (updateError) {
            setAccountMessage({ type: 'error', text: updateError.message });
            return;
        }

        setProfileImageUrl(url);
        await refreshUserRecord();
        setAccountMessage({ type: 'success', text: 'Profile photo updated.' });
    };

    const handleSaveAccount = async (event: FormEvent) => {
        event.preventDefault();
        if (!userRecord?.id) return;

        setAccountMessage(null);

        const trimmedEmail = accountEmail.trim().toLowerCase();
        const currentEmail = (userRecord.email || user?.email || '').toLowerCase();
        const emailChanged = trimmedEmail.length > 0 && trimmedEmail !== currentEmail;
        const passwordChanged = newPassword.trim().length > 0;

        if (!trimmedEmail) {
            setAccountMessage({ type: 'error', text: 'Email is required.' });
            return;
        }

        if (passwordChanged && newPassword !== confirmPassword) {
            setAccountMessage({ type: 'error', text: 'Passwords do not match.' });
            return;
        }

        if (passwordChanged && newPassword.length < 6) {
            setAccountMessage({ type: 'error', text: 'Password must be at least 6 characters.' });
            return;
        }

        if (!emailChanged && !passwordChanged) {
            setAccountMessage({ type: 'error', text: 'No account changes to save.' });
            return;
        }

        setIsSavingAccount(true);

        if (emailChanged) {
            const { error: emailAuthError } = await supabase.auth.updateUser({ email: trimmedEmail });
            if (emailAuthError) {
                setIsSavingAccount(false);
                setAccountMessage({ type: 'error', text: emailAuthError.message });
                return;
            }

            const { error: emailRecordError } = await supabase
                .from('users')
                .update({ email: trimmedEmail })
                .eq('id', userRecord.id);

            if (emailRecordError) {
                setIsSavingAccount(false);
                setAccountMessage({ type: 'error', text: emailRecordError.message });
                return;
            }
        }

        if (passwordChanged) {
            const { error: passwordError } = await supabase.auth.updateUser({ password: newPassword });
            if (passwordError) {
                setIsSavingAccount(false);
                setAccountMessage({ type: 'error', text: passwordError.message });
                return;
            }
        }

        await refreshUserRecord();
        setNewPassword('');
        setConfirmPassword('');
        setIsSavingAccount(false);
        setAccountMessage({
            type: 'success',
            text: emailChanged
                ? 'Account updated. Check your inbox if email confirmation is required.'
                : 'Account updated successfully.',
        });
    };

    const handleSubmitTimeOffRequest = async (event: FormEvent) => {
        event.preventDefault();
        if (!employeeId || isSubmittingRequest) return;

        setRequestError(null);
        setRequestSuccess(null);

        if (!requestForm.startDate || !requestForm.endDate) {
            setRequestError('Start and end dates are required.');
            return;
        }

        if (requestForm.endDate < requestForm.startDate) {
            setRequestError('End date must be on or after start date.');
            return;
        }

        if (!requestForm.isFullDay && requestForm.startDate !== requestForm.endDate) {
            setRequestError('Partial-day requests must start and end on the same day.');
            return;
        }

        if (!requestForm.isFullDay && requestForm.endTime <= requestForm.startTime) {
            setRequestError('End time must be after start time.');
            return;
        }

        setIsSubmittingRequest(true);

        const payload = {
            employee_id: employeeId,
            start_date: requestForm.startDate,
            end_date: requestForm.endDate,
            is_full_day: requestForm.isFullDay,
            start_time: requestForm.isFullDay ? null : requestForm.startTime,
            end_time: requestForm.isFullDay ? null : requestForm.endTime,
            reason: requestForm.reason.trim() || null,
            status: 'pending' as const,
        };

        const { error: insertError } = await supabase
            .from('employee_time_off_requests')
            .insert(payload);

        setIsSubmittingRequest(false);

        if (insertError) {
            setRequestError(insertError.message);
            return;
        }

        setRequestForm((prev) => ({
            ...prev,
            startDate: toDateKey(new Date()),
            endDate: toDateKey(new Date()),
            reason: '',
        }));
        setRequestSuccess('Time off request submitted.');
        await loadTimeOffRequests();
    };

    const handleDeletePendingRequest = async (requestId: string) => {
        if (deletingRequestId) return;

        setRequestError(null);
        setRequestSuccess(null);
        setDeletingRequestId(requestId);

        const { error: deleteError } = await supabase
            .from('employee_time_off_requests')
            .delete()
            .eq('id', requestId);

        setDeletingRequestId(null);

        if (deleteError) {
            setRequestError(deleteError.message);
            return;
        }

        setRequestSuccess('Pending request canceled.');
        await loadTimeOffRequests();
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-[var(--color-surface)] flex items-center justify-center">
                <LoadingSpinner size={32} />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[var(--color-surface)] p-4 sm:p-6">
            <div className="max-w-5xl mx-auto space-y-6 animate-fadeIn">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <h1 className="text-2xl font-semibold">Employee Portal</h1>
                        <p className="text-sm text-[var(--color-muted)]">
                            {profile ? `Welcome, ${profile.name}` : 'Your schedule and time summary'}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {canSwitchViews && (
                            <Button
                                variant="secondary"
                                onClick={() => {
                                    setActivePortal(null);
                                    navigate('/portal-select');
                                }}
                            >
                                Switch View
                            </Button>
                        )}
                        <Button variant="ghost" onClick={signOut}>Sign Out</Button>
                    </div>
                </div>

                {error && (
                    <div className="p-3 rounded-lg bg-[var(--color-danger-bg)] text-[var(--color-danger)] text-sm">
                        {error}
                    </div>
                )}

                <Tabs
                    tabs={[
                        { id: 'schedule', label: 'Schedule' },
                        { id: 'sales', label: 'My Sales' },
                        { id: 'requests', label: 'Time Off Requests' },
                        { id: 'profile', label: 'Profile' },
                    ]}
                    activeTab={activeHubTab}
                    onChange={(id) => setActiveHubTab(id as EmployeeHubTab)}
                />

                {activeHubTab === 'schedule' && (
                    <>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <Card variant="outlined">
                                <CardContent className="p-4">
                                    <p className="text-xs uppercase tracking-wide text-[var(--color-muted)]">Hours Worked This Week</p>
                                    <p className="text-2xl font-semibold mt-1">{weekHoursWorked.toFixed(2)}</p>
                                </CardContent>
                            </Card>
                            <Card variant="outlined">
                                <CardContent className="p-4">
                                    <p className="text-xs uppercase tracking-wide text-[var(--color-muted)]">Estimated Pay So Far</p>
                                    <p className="text-2xl font-semibold mt-1">${estimatedPay.toFixed(2)}</p>
                                </CardContent>
                            </Card>
                            <Card variant="outlined">
                                <CardContent className="p-4">
                                    <p className="text-xs uppercase tracking-wide text-[var(--color-muted)]">Scheduled {selectedWeekLabel}</p>
                                    <p className="text-2xl font-semibold mt-1">{scheduledHoursSelectedWeek.toFixed(2)}h</p>
                                    <p className="mt-1 text-xs text-[var(--color-muted)]">{weekRangeLabel}</p>
                                </CardContent>
                            </Card>
                        </div>

                        <Card variant="outlined">
                            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <CardTitle className="text-base">Schedule</CardTitle>
                                    <p className="mt-1 text-sm text-[var(--color-muted)]">{selectedWeekLabel} • {weekRangeLabel}</p>
                                </div>
                                <div className="grid grid-cols-[44px_1fr_44px] gap-2 sm:flex sm:items-center">
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        size="sm"
                                        className="px-0"
                                        onClick={goToPreviousScheduleWeek}
                                        aria-label="Previous week"
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        type="button"
                                        variant={selectedWeekStartKey === currentWeekStartKey ? 'primary' : 'secondary'}
                                        size="sm"
                                        onClick={goToCurrentScheduleWeek}
                                        leftIcon={<CalendarDays className="h-4 w-4" />}
                                    >
                                        This Week
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        size="sm"
                                        className="px-0"
                                        onClick={goToNextScheduleWeek}
                                        aria-label="Next week"
                                    >
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent>
                                {displayShifts.length === 0 ? (
                                    <p className="text-sm text-[var(--color-muted)]">No shifts scheduled for this week.</p>
                                ) : (
                                    <>
                                        <div className="hidden md:block">
                                            <div className="mb-2 grid grid-cols-7 gap-2">
                                                {weekdayHeaders.map((label) => (
                                                    <div key={label} className="px-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                                                        {label}
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="grid grid-cols-7 gap-2">
                                                {displayedDays.map((day) => {
                                                    const dayShifts = shiftsByDate.get(day) || [];
                                                    const isToday = day === todayKey;
                                                    const isPast = day < todayKey;
                                                    const dayDate = parseDateKey(day);
                                                    const dayLabel = dayDate.toLocaleDateString([], { month: 'short', day: 'numeric' });

                                                    return (
                                                        <div
                                                            key={day}
                                                            className={`rounded-xl border p-2 min-h-[116px] ${isToday
                                                                ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5'
                                                                : 'border-[var(--color-border)] bg-[var(--color-surface)]'
                                                                } ${isPast ? 'opacity-65' : ''}`}
                                                        >
                                                            <div className="mb-2 flex items-center justify-between">
                                                                <p className="text-xs font-semibold text-[var(--color-foreground)]">{dayLabel}</p>
                                                                {dayShifts.length > 0 && (
                                                                    <span className="rounded-full bg-[var(--color-primary)]/15 px-2 py-0.5 text-[10px] font-semibold text-[var(--color-primary)]">
                                                                        {dayShifts.length}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="space-y-1">
                                                                {dayShifts.length === 0 ? (
                                                                    <p className="text-[11px] text-[var(--color-muted)]">Off</p>
                                                                ) : (
                                                                    <>
                                                                        {dayShifts.slice(0, 2).map((shift) => (
                                                                            <div key={shift.id} className="rounded-md bg-[var(--color-card)] px-2 py-1 text-[11px]">
                                                                                {formatTime(shift.start_time)} - {formatTime(shift.end_time)}
                                                                            </div>
                                                                        ))}
                                                                        {dayShifts.length > 2 && (
                                                                            <p className="text-[11px] text-[var(--color-muted)]">+{dayShifts.length - 2} more</p>
                                                                        )}
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        <div className="space-y-2 md:hidden">
                                            {mobileScheduleDays.length === 0 ? (
                                                <p className="text-sm text-[var(--color-muted)]">No shifts scheduled for this week.</p>
                                            ) : (
                                                mobileScheduleDays.map((day) => {
                                                    const dayShifts = shiftsByDate.get(day) || [];
                                                    return (
                                                        <div key={day} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                                                            <div className="mb-2 flex items-center justify-between gap-2">
                                                                <p className="text-sm font-semibold text-[var(--color-foreground)]">{formatDate(day)}</p>
                                                                <span className="rounded-full bg-[var(--color-primary)]/15 px-2 py-0.5 text-[10px] font-semibold text-[var(--color-primary)]">
                                                                    {dayShifts.length} {dayShifts.length === 1 ? 'shift' : 'shifts'}
                                                                </span>
                                                            </div>
                                                            <div className="space-y-1">
                                                                {dayShifts.map((shift) => (
                                                                    <div key={shift.id} className="flex items-center justify-between rounded-md bg-[var(--color-card)] px-2 py-1.5">
                                                                        <p className="text-xs font-medium text-[var(--color-foreground)]">
                                                                            {formatTime(shift.start_time)} - {formatTime(shift.end_time)}
                                                                        </p>
                                                                        <p className="text-[11px] text-[var(--color-muted)]">
                                                                            {shift.source === 'recurring' ? 'Recurring' : 'One-time'}
                                                                        </p>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    );
                                                })
                                            )}
                                        </div>
                                    </>
                                )}
                            </CardContent>
                        </Card>
                    </>
                )}

                {activeHubTab === 'requests' && (
                    <Card variant="outlined">
                        <CardHeader>
                            <CardTitle className="text-base">Request Days Off</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleSubmitTimeOffRequest} className="space-y-4">
                                <div className="grid grid-cols-2 gap-3">
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
                                        min={requestForm.startDate}
                                        required
                                    />
                                </div>

                                <label className="inline-flex items-center gap-2 text-sm text-[var(--color-foreground)]">
                                    <input
                                        type="checkbox"
                                        checked={requestForm.isFullDay}
                                        onChange={(event) => setRequestForm((prev) => ({ ...prev, isFullDay: event.target.checked }))}
                                    />
                                    Full day request
                                </label>

                                {!requestForm.isFullDay && (
                                    <div className="grid grid-cols-2 gap-3">
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
                                    value={requestForm.reason}
                                    onChange={(event) => setRequestForm((prev) => ({ ...prev, reason: event.target.value }))}
                                    rows={3}
                                    placeholder="Share context for your manager"
                                />

                                {requestError && (
                                    <div className="rounded-lg bg-[var(--color-danger-bg)] p-3 text-sm text-[var(--color-danger)]">
                                        {requestError}
                                    </div>
                                )}

                                {requestSuccess && (
                                    <div className="rounded-lg bg-[var(--color-success-bg)] p-3 text-sm text-[var(--color-success)]">
                                        {requestSuccess}
                                    </div>
                                )}

                                <Button type="submit" isLoading={isSubmittingRequest}>Submit Request</Button>
                            </form>

                            <div className="mt-6">
                                <p className="mb-2 text-sm font-semibold text-[var(--color-foreground)]">My Requests</p>
                                {isLoadingRequests ? (
                                    <div className="py-4"><LoadingSpinner size={20} /></div>
                                ) : timeOffRequests.length === 0 ? (
                                    <p className="text-sm text-[var(--color-muted)]">No requests yet.</p>
                                ) : (
                                    <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                                        {timeOffRequests.map((request) => (
                                            <div key={request.id} className="rounded-lg border border-[var(--color-border)] p-3">
                                                <div className="mb-2 flex items-center justify-between gap-2">
                                                    <p className="text-sm font-medium text-[var(--color-foreground)]">
                                                        {formatRequestDateTimeRange(request)}
                                                    </p>
                                                    <span className={`rounded-full px-2 py-1 text-[11px] font-medium uppercase tracking-wide ${getStatusBadgeClass(request.status)}`}>
                                                        {request.status}
                                                    </span>
                                                </div>
                                                {request.reason && (
                                                    <p className="text-sm text-[var(--color-muted)]">{request.reason}</p>
                                                )}
                                                {request.review_notes && (
                                                    <p className="mt-1 text-xs text-[var(--color-muted)]">Manager note: {request.review_notes}</p>
                                                )}
                                                {request.status === 'pending' && (
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        className="mt-2 text-[var(--color-danger)]"
                                                        isLoading={deletingRequestId === request.id}
                                                        onClick={() => void handleDeletePendingRequest(request.id)}
                                                    >
                                                        Cancel Request
                                                    </Button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                )}

                {activeHubTab === 'sales' && (
                    <EmployeeSalesSummary
                        employeeId={employeeId}
                        employeeName={profile?.name}
                        days={7}
                    />
                )}

                {activeHubTab === 'profile' && (
                    <Card variant="outlined">
                        <CardHeader>
                            <CardTitle className="text-base">My Account</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {accountMessage && (
                                <div className={`mb-4 rounded-lg p-3 text-sm ${accountMessage.type === 'success'
                                    ? 'bg-[var(--color-success-bg)] text-[var(--color-success)]'
                                    : 'bg-[var(--color-danger-bg)] text-[var(--color-danger)]'
                                    }`}>
                                    {accountMessage.text}
                                </div>
                            )}

                            <form onSubmit={handleSaveAccount} className="space-y-4">
                                <div>
                                    <p className="mb-2 text-sm font-medium text-[var(--color-foreground)]">Profile Photo</p>
                                    <ProfilePhotoUpload
                                        value={profileImageUrl}
                                        onChange={handleProfilePhotoChange}
                                        uploadKey={userRecord?.id || 'employee'}
                                        disabled={isSavingAccount}
                                    />
                                </div>

                                <Input
                                    label="Name"
                                    value={profile?.name || ''}
                                    disabled
                                />

                                <Input
                                    label="Email"
                                    type="email"
                                    value={accountEmail}
                                    onChange={(event) => setAccountEmail(event.target.value)}
                                    placeholder="employee@example.com"
                                    autoComplete="email"
                                />

                                <Input
                                    label="New Password"
                                    type="password"
                                    value={newPassword}
                                    onChange={(event) => setNewPassword(event.target.value)}
                                    placeholder="Leave blank to keep current password"
                                    autoComplete="new-password"
                                />

                                <Input
                                    label="Confirm New Password"
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(event) => setConfirmPassword(event.target.value)}
                                    placeholder="Re-enter new password"
                                    autoComplete="new-password"
                                />

                                <Button type="submit" isLoading={isSavingAccount}>Save Account</Button>
                            </form>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}
