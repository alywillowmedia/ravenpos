import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Header } from '../components/layout/Header';
import { Button } from '../components/ui/Button';
import { Card, CardContent } from '../components/ui/Card';
import { Input, Textarea } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { Modal, ModalFooter } from '../components/ui/Modal';
import { useEmployees } from '../hooks/useEmployees';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

type ScheduleShift = {
    id: string;
    employee_id: string;
    shift_date: string;
    start_time: string;
    end_time: string;
    notes: string | null;
};

type TimeOffRequestStatus = 'pending' | 'approved' | 'denied';

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

function startOfWeekMonday(date: Date) {
    const next = new Date(date);
    next.setHours(0, 0, 0, 0);
    const day = next.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    next.setDate(next.getDate() + diff);
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

function formatHours(hours: number) {
    return `${Math.round(hours * 10) / 10}h`;
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
    const { user } = useAuth();
    const { employees, isLoading: isLoadingEmployees, error: employeeError } = useEmployees();
    const [weekStart, setWeekStart] = useState(() => startOfWeekMonday(new Date()));
    const [shifts, setShifts] = useState<ScheduleShift[]>([]);
    const [timeOffRequests, setTimeOffRequests] = useState<TimeOffRequest[]>([]);
    const [isLoadingShifts, setIsLoadingShifts] = useState(true);
    const [isLoadingRequests, setIsLoadingRequests] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [deletingShiftId, setDeletingShiftId] = useState<string | null>(null);
    const [reviewingRequestId, setReviewingRequestId] = useState<string | null>(null);
    const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
    const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
    const [notice, setNotice] = useState<Notice>(null);
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

    const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);

    const daysInWeek = useMemo(
        () => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)),
        [weekStart]
    );

    const fetchWeekData = useCallback(async () => {
        setIsLoadingShifts(true);
        setIsLoadingRequests(true);
        setNotice(null);

        const weekStartKey = toDateKey(weekStart);
        const weekEndKey = toDateKey(weekEnd);

        const [shiftsResult, requestsResult] = await Promise.all([
            supabase
                .from('employee_schedules')
                .select('id, employee_id, shift_date, start_time, end_time, notes')
                .gte('shift_date', weekStartKey)
                .lte('shift_date', weekEndKey)
                .order('shift_date')
                .order('start_time'),
            supabase
                .from('employee_time_off_requests')
                .select('id, employee_id, start_date, end_date, reason, status, reviewed_by, reviewed_at, review_notes, created_at')
                .order('status', { ascending: true })
                .order('start_date', { ascending: false }),
        ]);

        if (shiftsResult.error) {
            setNotice({ type: 'error', message: shiftsResult.error.message });
            setShifts([]);
        } else {
            setShifts((shiftsResult.data || []) as ScheduleShift[]);
        }

        if (requestsResult.error) {
            setNotice({ type: 'error', message: requestsResult.error.message });
            setTimeOffRequests([]);
        } else {
            setTimeOffRequests((requestsResult.data || []) as TimeOffRequest[]);
        }

        setIsLoadingShifts(false);
        setIsLoadingRequests(false);
    }, [weekStart, weekEnd]);

    useEffect(() => {
        fetchWeekData();
    }, [fetchWeekData]);

    useEffect(() => {
        if (!formState.employeeId && activeEmployees.length > 0) {
            setFormState((prev) => ({ ...prev, employeeId: activeEmployees[0].id }));
        }
    }, [activeEmployees, formState.employeeId]);

    const scheduledHours = useMemo(
        () => shifts.reduce((sum, shift) => sum + getShiftDurationHours(shift.start_time, shift.end_time), 0),
        [shifts]
    );

    const scheduledEmployeesCount = useMemo(
        () => new Set(shifts.map((shift) => shift.employee_id)).size,
        [shifts]
    );

    const pendingRequestCount = useMemo(
        () => timeOffRequests.filter((request) => request.status === 'pending').length,
        [timeOffRequests]
    );

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

    const openAddModalForToday = () => {
        openAddModalForDay(toDateKey(new Date()));
    };

    const startEdit = (shift: ScheduleShift) => {
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
        await fetchWeekData();
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
        await fetchWeekData();
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
        await fetchWeekData();
    };

    return (
        <div className="animate-fadeIn">
            <Header
                title="Schedule"
                description="Click any day to add a shift. Review day-off requests below."
                actions={(
                    <div className="flex flex-wrap gap-2">
                        <Button
                            variant="secondary"
                            onClick={() => setWeekStart((prev) => addDays(prev, -7))}
                        >
                            Previous Week
                        </Button>
                        <Button variant="ghost" onClick={() => setWeekStart(startOfWeekMonday(new Date()))}>
                            This Week
                        </Button>
                        <Button
                            variant="secondary"
                            onClick={() => setWeekStart((prev) => addDays(prev, 7))}
                        >
                            Next Week
                        </Button>
                        <Button onClick={openAddModalForToday}>+ Add Shift</Button>
                    </div>
                )}
            />

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

            <div className="mb-6 grid gap-3 sm:grid-cols-4">
                <Card variant="outlined" className="bg-white">
                    <CardContent>
                        <p className="text-sm text-[var(--color-muted)]">Week Range</p>
                        <p className="text-base font-semibold text-[var(--color-foreground)]">
                            {weekStart.toLocaleDateString([], { month: 'short', day: 'numeric' })} - {weekEnd.toLocaleDateString([], { month: 'short', day: 'numeric' })}
                        </p>
                    </CardContent>
                </Card>
                <Card variant="outlined" className="bg-white">
                    <CardContent>
                        <p className="text-sm text-[var(--color-muted)]">Scheduled Shifts</p>
                        <p className="text-2xl font-bold text-[var(--color-foreground)]">{shifts.length}</p>
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
                        <p className="text-sm text-[var(--color-muted)]">Pending Requests</p>
                        <p className="text-2xl font-bold text-[var(--color-foreground)]">{pendingRequestCount}</p>
                    </CardContent>
                </Card>
            </div>

            <Card variant="outlined" className="mb-6 bg-white" padding="none">
                <div className="border-b border-[var(--color-border)] px-4 py-3">
                    <h2 className="text-base font-semibold text-[var(--color-foreground)]">Time Off Requests</h2>
                    <p className="text-xs text-[var(--color-muted)]">All requests, with pending requests first.</p>
                </div>
                {isLoadingRequests ? (
                    <div className="flex items-center justify-center py-8">
                        <LoadingSpinner size={24} />
                    </div>
                ) : timeOffRequests.length === 0 ? (
                    <div className="px-4 py-6 text-sm text-[var(--color-muted)]">No requests yet.</div>
                ) : (
                    <div className="divide-y divide-[var(--color-border)]">
                        {timeOffRequests.map((request) => (
                            <div key={request.id} className="space-y-2 px-4 py-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                        <p className="text-sm font-semibold text-[var(--color-foreground)]">
                                            {employeeNameById.get(request.employee_id) || 'Unknown employee'}
                                        </p>
                                        <p className="text-xs text-[var(--color-muted)]">
                                            {formatDateRange(request.start_date, request.end_date)}
                                        </p>
                                    </div>
                                    <span className={`rounded-full px-2 py-1 text-xs font-semibold uppercase ${getStatusBadgeClass(request.status)}`}>
                                        {request.status}
                                    </span>
                                </div>
                                {request.reason && (
                                    <p className="text-sm text-[var(--color-muted)]">{request.reason}</p>
                                )}
                                {request.status === 'pending' && (
                                    <div className="flex gap-2">
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
                )}
            </Card>

            {isLoadingShifts ? (
                <div className="flex items-center justify-center py-12">
                    <LoadingSpinner size={28} />
                </div>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-7">
                    {daysInWeek.map((day) => {
                        const dayKey = toDateKey(day);
                        const dayShifts = shifts.filter((shift) => shift.shift_date === dayKey);
                        const totalDayHours = dayShifts.reduce(
                            (sum, shift) => sum + getShiftDurationHours(shift.start_time, shift.end_time),
                            0
                        );

                        return (
                            <button
                                key={dayKey}
                                type="button"
                                onClick={() => openAddModalForDay(dayKey)}
                                className="text-left"
                            >
                                <Card
                                    variant="outlined"
                                    className="h-full bg-white transition-colors hover:border-[var(--color-primary)] hover:bg-[var(--color-surface)]"
                                >
                                    <CardContent className="space-y-3">
                                        <div className="flex items-start justify-between gap-2 border-b border-[var(--color-border)] pb-2">
                                            <div>
                                                <p className="text-sm font-semibold text-[var(--color-foreground)]">
                                                    {day.toLocaleDateString([], { weekday: 'short' })}
                                                </p>
                                                <p className="text-xs text-[var(--color-muted)]">
                                                    {day.toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                                </p>
                                            </div>
                                            <span className="rounded-full bg-[var(--color-surface)] px-2 py-1 text-xs font-medium text-[var(--color-muted)]">
                                                {formatHours(totalDayHours)}
                                            </span>
                                        </div>

                                        {dayShifts.length === 0 ? (
                                            <div className="rounded-lg border border-dashed border-[var(--color-border)] p-3 text-xs text-[var(--color-muted)]">
                                                Click to add a shift.
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                {dayShifts.map((shift) => (
                                                    <button
                                                        key={shift.id}
                                                        type="button"
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            startEdit(shift);
                                                        }}
                                                        className="w-full text-left"
                                                    >
                                                        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 transition-colors hover:border-[var(--color-primary)]">
                                                            <p className="text-sm font-semibold text-[var(--color-foreground)]">
                                                                {employeeNameById.get(shift.employee_id) || 'Unknown employee'}
                                                            </p>
                                                            <p className="text-xs text-[var(--color-muted)]">
                                                                {formatTimeLabel(shift.start_time)} - {formatTimeLabel(shift.end_time)} ({formatHours(getShiftDurationHours(shift.start_time, shift.end_time))})
                                                            </p>
                                                            {shift.notes && (
                                                                <p className="mt-1 text-xs text-[var(--color-muted)]">
                                                                    {shift.notes}
                                                                </p>
                                                            )}
                                                            <div className="mt-2">
                                                                <Button
                                                                    type="button"
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    className="text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)]"
                                                                    onClick={(event) => {
                                                                        event.stopPropagation();
                                                                        handleDeleteShift(shift.id);
                                                                    }}
                                                                    isLoading={deletingShiftId === shift.id}
                                                                >
                                                                    Delete
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            </button>
                        );
                    })}
                </div>
            )}

            <Modal
                isOpen={isShiftModalOpen}
                onClose={closeShiftModal}
                title={editingShiftId ? 'Edit Shift' : 'Add Shift'}
                description="Set employee, day, and time block."
                size="lg"
            >
                <form className="space-y-3" onSubmit={handleSubmit}>
                    <Select
                        label="Employee"
                        value={formState.employeeId}
                        onChange={(event) => setFormState((prev) => ({ ...prev, employeeId: event.target.value }))}
                        options={activeEmployees.map((employee) => ({
                            value: employee.id,
                            label: employee.name,
                        }))}
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
