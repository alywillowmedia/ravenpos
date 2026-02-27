import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Header } from '../../components/layout/Header';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input, Textarea } from '../../components/ui/Input';
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

type TimeOffRequestStatus = 'pending' | 'approved' | 'denied';

type TimeOffRequest = {
    id: string;
    start_date: string;
    end_date: string;
    reason: string | null;
    status: TimeOffRequestStatus;
    review_notes: string | null;
    created_at: string;
};

type RequestFormState = {
    startDate: string;
    endDate: string;
    reason: string;
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

function formatDateLabel(value: string) {
    return new Date(`${value}T00:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric' });
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

export function EmployeeSchedule() {
    const { employee } = useEmployee();
    const [weekStart, setWeekStart] = useState(() => startOfWeekSunday(new Date()));
    const [shifts, setShifts] = useState<ScheduleShift[]>([]);
    const [timeOffRequests, setTimeOffRequests] = useState<TimeOffRequest[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingRequests, setIsLoadingRequests] = useState(true);
    const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
    const [deletingRequestId, setDeletingRequestId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [requestError, setRequestError] = useState<string | null>(null);
    const [requestSuccess, setRequestSuccess] = useState<string | null>(null);
    const [requestForm, setRequestForm] = useState<RequestFormState>({
        startDate: toDateKey(new Date()),
        endDate: toDateKey(new Date()),
        reason: '',
    });

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

    const fetchTimeOffRequests = useCallback(async () => {
        if (!employee?.id) return;

        setIsLoadingRequests(true);
        setRequestError(null);

        const { data, error: queryError } = await supabase
            .from('employee_time_off_requests')
            .select('id, start_date, end_date, reason, status, review_notes, created_at')
            .eq('employee_id', employee.id)
            .order('start_date', { ascending: false })
            .limit(20);

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

    const handleSubmitRequest = async (event: FormEvent) => {
        event.preventDefault();

        if (!employee?.id) return;

        setRequestError(null);
        setRequestSuccess(null);

        if (requestForm.endDate < requestForm.startDate) {
            setRequestError('End date must be on or after start date.');
            return;
        }

        setIsSubmittingRequest(true);

        const { error: insertError } = await supabase
            .from('employee_time_off_requests')
            .insert({
                employee_id: employee.id,
                start_date: requestForm.startDate,
                end_date: requestForm.endDate,
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

    return (
        <div className="animate-fadeIn max-w-4xl">
            <Header
                title="Schedule"
                description="Your assigned shifts and day-off requests."
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
                <Card variant="outlined" className="mb-6 bg-white" padding="none">
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

            <Card variant="outlined" className="mb-4 bg-white">
                <CardContent>
                    <h2 className="mb-1 text-base font-semibold text-[var(--color-foreground)]">Request Time Off</h2>
                    <p className="mb-3 text-xs text-[var(--color-muted)]">Submit days you cannot work. Admins will approve or deny.</p>
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
                    <div className="px-4 py-6 text-sm text-[var(--color-muted)]">No day-off requests submitted yet.</div>
                ) : (
                    <div className="divide-y divide-[var(--color-border)]">
                        {timeOffRequests.map((request) => (
                            <div key={request.id} className="space-y-2 px-4 py-3">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-sm font-semibold text-[var(--color-foreground)]">
                                        {formatDateRange(request.start_date, request.end_date)}
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
        </div>
    );
}
