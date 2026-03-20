import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';

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

export function EmployeePortalDashboard() {
    const navigate = useNavigate();
    const { userRecord, portalChoices, setActivePortal, signOut } = useAuth();
    const [profile, setProfile] = useState<EmployeeProfile | null>(null);
    const [oneTimeShifts, setOneTimeShifts] = useState<OneTimeShift[]>([]);
    const [recurringShifts, setRecurringShifts] = useState<RecurringShift[]>([]);
    const [weekHoursWorked, setWeekHoursWorked] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const employeeId = userRecord?.employee_id || userRecord?.linked_employee_id || null;
    const canSwitchViews = portalChoices.length > 1;

    const today = useMemo(() => new Date(), []);
    const todayKey = toDateKey(today);
    const scheduleRangeStart = startOfWeekMonday(today);
    const scheduleRangeEnd = addDays(scheduleRangeStart, 27);
    const scheduleRangeStartKey = toDateKey(scheduleRangeStart);
    const scheduleRangeEndKey = toDateKey(scheduleRangeEnd);

    const displayedDays = useMemo(
        () => Array.from({ length: 28 }, (_, index) => toDateKey(addDays(scheduleRangeStart, index))),
        [scheduleRangeStart]
    );

    const displayShifts = useMemo(() => {
        const shifts: DisplayShift[] = [];

        for (const shift of oneTimeShifts) {
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
    }, [oneTimeShifts, recurringShifts, displayedDays]);

    const upcomingShifts = useMemo(
        () => displayShifts.filter((shift) => shift.shift_date >= todayKey),
        [displayShifts, todayKey]
    );

    const scheduledHoursNextWeek = useMemo(() => {
        const nextWeekStart = toDateKey(addDays(startOfWeekMonday(new Date()), 7));
        const nextWeekEnd = toDateKey(addDays(parseDateKey(nextWeekStart), 6));
        return displayShifts
            .filter((shift) => shift.shift_date >= nextWeekStart && shift.shift_date <= nextWeekEnd)
            .reduce((sum, shift) => sum + toHours(shift.start_time, shift.end_time), 0);
    }, [displayShifts]);

    const estimatedPay = useMemo(() => {
        const hourlyRate = profile?.hourly_rate || 0;
        return weekHoursWorked * hourlyRate;
    }, [profile?.hourly_rate, weekHoursWorked]);

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

        const [profileResult, oneTimeResult, recurringResult, timeEntriesResult] = await Promise.all([
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
                .from('time_entries')
                .select('id, clock_in, clock_out, total_hours')
                .eq('employee_id', employeeId)
                .gte('clock_in', weekStart.toISOString())
                .lte('clock_in', nowIso),
        ]);

        if (profileResult.error || oneTimeResult.error || recurringResult.error || timeEntriesResult.error) {
            const firstError = profileResult.error || oneTimeResult.error || recurringResult.error || timeEntriesResult.error;
            setError(firstError?.message || 'Failed to load dashboard');
            setIsLoading(false);
            return;
        }

        setProfile(profileResult.data as EmployeeProfile);
        setOneTimeShifts((oneTimeResult.data || []) as OneTimeShift[]);
        setRecurringShifts((recurringResult.data || []) as RecurringShift[]);

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
    }, [loadDashboard]);

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
                            <p className="text-xs uppercase tracking-wide text-[var(--color-muted)]">Scheduled Next Week</p>
                            <p className="text-2xl font-semibold mt-1">{scheduledHoursNextWeek.toFixed(2)}h</p>
                        </CardContent>
                    </Card>
                </div>

                <Card variant="outlined">
                    <CardHeader>
                        <CardTitle className="text-base">Upcoming Schedule</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {upcomingShifts.length === 0 ? (
                            <p className="text-sm text-[var(--color-muted)]">No upcoming shifts in the next 4 weeks.</p>
                        ) : (
                            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                                {upcomingShifts.map((shift) => (
                                    <div key={shift.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 p-3 rounded-lg bg-[var(--color-surface)]">
                                        <div>
                                            <p className="text-sm font-medium">{formatDate(shift.shift_date)}</p>
                                            <p className="text-xs text-[var(--color-muted)]">
                                                {formatTime(shift.start_time)} - {formatTime(shift.end_time)}
                                            </p>
                                        </div>
                                        <div className="text-xs text-[var(--color-muted)] sm:text-right">
                                            {shift.notes?.trim() || (shift.source === 'recurring' ? 'Recurring shift' : 'One-time shift')}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
