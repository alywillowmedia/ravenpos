import { useCallback, useEffect, useMemo, useState } from 'react';
import { Header } from '../../components/layout/Header';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { useEmployee } from '../../contexts/EmployeeContext';
import { supabase } from '../../lib/supabase';

type ScheduleShift = {
    id: string;
    shift_date: string;
    start_time: string;
    end_time: string;
    notes: string | null;
};

function startOfWeekSunday(date: Date) {
    const next = new Date(date);
    next.setHours(0, 0, 0, 0);
    next.setDate(next.getDate() - next.getDay());
    return next;
}

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

function formatDayLabel(date: Date) {
    return date.toLocaleDateString([], { weekday: 'short', month: 'numeric', day: 'numeric' });
}

function getShiftDurationHours(startTime: string, endTime: string) {
    const start = parseTimeToMinutes(startTime);
    const end = parseTimeToMinutes(endTime);
    return Math.max(0, end - start) / 60;
}

export function EmployeeSchedule() {
    const { employee } = useEmployee();
    const [weekStart, setWeekStart] = useState(() => startOfWeekSunday(new Date()));
    const [shifts, setShifts] = useState<ScheduleShift[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);
    const daysInWeek = useMemo(
        () => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)),
        [weekStart]
    );

    const fetchSchedule = useCallback(async () => {
        if (!employee?.id) return;

        setIsLoading(true);
        setError(null);

        const { data, error: queryError } = await supabase
            .from('employee_schedules')
            .select('id, shift_date, start_time, end_time, notes')
            .eq('employee_id', employee.id)
            .gte('shift_date', toDateKey(weekStart))
            .lte('shift_date', toDateKey(weekEnd))
            .order('shift_date')
            .order('start_time');

        if (queryError) {
            setError(queryError.message);
            setShifts([]);
            setIsLoading(false);
            return;
        }

        setShifts((data || []) as ScheduleShift[]);
        setIsLoading(false);
    }, [employee?.id, weekStart, weekEnd]);

    useEffect(() => {
        fetchSchedule();
    }, [fetchSchedule]);

    return (
        <div className="animate-fadeIn max-w-4xl">
            <Header
                title="Schedule"
                description="Your assigned shifts for the selected week."
                actions={(
                    <div className="flex gap-2">
                        <Button size="sm" variant="secondary" onClick={() => setWeekStart((prev) => addDays(prev, -7))}>
                            Previous
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setWeekStart(startOfWeekSunday(new Date()))}>
                            This Week
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => setWeekStart((prev) => addDays(prev, 7))}>
                            Next
                        </Button>
                    </div>
                )}
            />

            <Card variant="outlined" className="mb-3 bg-white">
                <CardContent className="flex items-center justify-between gap-2 py-2">
                    <Button variant="ghost" size="sm" onClick={() => setWeekStart((prev) => addDays(prev, -7))}>
                        &lt;
                    </Button>
                    <p className="text-sm font-semibold text-[var(--color-foreground)]">
                        {weekStart.toLocaleDateString([], { month: 'numeric', day: 'numeric', year: '2-digit' })}
                        {' - '}
                        {weekEnd.toLocaleDateString([], { month: 'numeric', day: 'numeric', year: '2-digit' })}
                    </p>
                    <Button variant="ghost" size="sm" onClick={() => setWeekStart((prev) => addDays(prev, 7))}>
                        &gt;
                    </Button>
                </CardContent>
            </Card>

            {error && (
                <div className="mb-4 rounded-lg bg-[var(--color-danger-bg)] p-3 text-[var(--color-danger)]">
                    {error}
                </div>
            )}

            {isLoading ? (
                <div className="flex items-center justify-center py-10">
                    <LoadingSpinner size={28} />
                </div>
            ) : (
                <Card variant="outlined" className="bg-white" padding="none">
                    <div className="divide-y divide-[var(--color-border)]">
                        {daysInWeek.map((day) => {
                            const dayKey = toDateKey(day);
                            const dayShifts = shifts.filter((shift) => shift.shift_date === dayKey);

                            return (
                                <div key={dayKey} className="px-4 py-4">
                                    <h3 className="mb-2 text-lg font-semibold text-[var(--color-foreground)]">
                                        {formatDayLabel(day)}
                                    </h3>

                                    {dayShifts.length === 0 ? (
                                        <p className="text-sm text-[var(--color-muted)]">No shifts scheduled</p>
                                    ) : (
                                        <div className="space-y-1.5">
                                            {dayShifts.map((shift) => (
                                                <div key={shift.id} className="rounded-lg border border-[var(--color-border)] px-3 py-2">
                                                    <p className="text-sm font-medium text-[var(--color-foreground)]">
                                                        {formatTimeLabel(shift.start_time)} - {formatTimeLabel(shift.end_time)}
                                                        <span className="ml-1.5 font-normal text-[var(--color-muted)]">
                                                            ({getShiftDurationHours(shift.start_time, shift.end_time).toFixed(1)}h)
                                                        </span>
                                                    </p>
                                                    {shift.notes && (
                                                        <p className="mt-0.5 text-xs text-[var(--color-muted)]">{shift.notes}</p>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </Card>
            )}
        </div>
    );
}
