// Admin Employees Page - Manage employees and view time clock data

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Header } from '../components/layout/Header';
import { Button } from '../components/ui/Button';
import { Card, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Modal, ModalFooter } from '../components/ui/Modal';
import { Textarea } from '../components/ui/Input';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { DeleteConfirmationModal } from '../components/ui/DeleteConfirmationModal';
import { AddEmployeeModal } from '../components/employees/AddEmployeeModal';
import { AuthorizeDeviceModal } from '../components/employees/AuthorizeDeviceModal';
import { EmployeeCredentials } from '../components/employees/EmployeeCredentials';
import { TimeEntriesTable } from '../components/employees/TimeEntriesTable';
import { InactiveEmployeeToggle } from '../components/employees/InactiveEmployeeToggle';
import { EditTimeEntryModal, type TimeEntryUpdate } from '../components/employees/EditTimeEntryModal';
import { useEmployees } from '../hooks/useEmployees';
import { useEmployeeRoles } from '../hooks/useEmployeeRoles';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency } from '../lib/utils';
import { formatDecimalHours } from '../lib/timeCalculations';
import { supabase } from '../lib/supabase';
import { Lock, Mail, UserRound, UserRoundPlus } from 'lucide-react';
import type { Employee, EmployeeWithStats, TimeEntry, EmployeeInput } from '../types/employee';

type ScheduleWeekOffset = 0 | 1;
type SchedulePreview = {
    html: string;
    subject: string;
    weekStart: string;
    weekEnd: string;
    recipientCount: number;
    previewRecipient: string | null;
};

export function Employees() {
    const { user } = useAuth();
    const {
        employees,
        isLoading,
        error,
        createEmployee,
        updateEmployee,
        archiveEmployee,
        getTimeEntries,
        manualClockIn,
        manualClockOut,
        getEmployeeSales,
        updateTimeEntry,
    } = useEmployees();
    const { roles: employeeRoles } = useEmployeeRoles();

    const [showAddModal, setShowAddModal] = useState(false);
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
    const [viewingEmployee, setViewingEmployee] = useState<EmployeeWithStats | null>(null);
    const [viewingEntries, setViewingEntries] = useState<TimeEntry[]>([]);
    const [isLoadingEntries, setIsLoadingEntries] = useState(false);
    const [salesCount, setSalesCount] = useState(0);
    const [employeeActionError, setEmployeeActionError] = useState<string | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<EmployeeWithStats | null>(null);
    const [isDeletingEmployee, setIsDeletingEmployee] = useState(false);
    const [deleteEmployeeError, setDeleteEmployeeError] = useState<string | null>(null);
    const [timeEntryCount, setTimeEntryCount] = useState(0);
    const [editingTimeEntry, setEditingTimeEntry] = useState<TimeEntry | null>(null);
    const [showSensitiveNumbers, setShowSensitiveNumbers] = useState(false);
    const [showInactiveEmployees, setShowInactiveEmployees] = useState(false);
    const [isSendingSchedules, setIsSendingSchedules] = useState(false);
    const [scheduleSendMessage, setScheduleSendMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [isScheduleEmailModalOpen, setIsScheduleEmailModalOpen] = useState(false);
    const [scheduleWeekOffset, setScheduleWeekOffset] = useState<ScheduleWeekOffset>(1);
    const [scheduleEmailBody, setScheduleEmailBody] = useState('');
    const [isLoadingSchedulePreview, setIsLoadingSchedulePreview] = useState(false);
    const [schedulePreviewError, setSchedulePreviewError] = useState<string | null>(null);
    const [schedulePreview, setSchedulePreview] = useState<SchedulePreview | null>(null);

    const inactiveEmployeeCount = useMemo(
        () => employees.filter((employee) => !employee.is_active).length,
        [employees]
    );
    const visibleEmployees = useMemo(
        () => showInactiveEmployees ? employees : employees.filter((employee) => employee.is_active),
        [employees, showInactiveEmployees]
    );

    const handleAddEmployee = async (input: EmployeeInput): Promise<{ error: string | null }> => {
        const { error } = await createEmployee(input);
        return { error };
    };

    const handleEditEmployee = async (input: EmployeeInput, newPin?: string): Promise<{ error: string | null }> => {
        if (!editingEmployee) return { error: 'No employee selected' };

        const { error } = await updateEmployee(
            editingEmployee.id,
            {
                name: input.name,
                hourly_rate: input.hourly_rate,
                is_active: input.is_active,
                employer: input.employer,
                employment_type: input.employment_type,
            },
            newPin
        );
        return { error };
    };

    const handleViewEmployee = async (emp: EmployeeWithStats) => {
        setEmployeeActionError(null);
        setViewingEmployee(emp);
        setIsLoadingEntries(true);
        initialLoadDoneRef.current = false;

        const { data: entries } = await getTimeEntries(emp.id);
        setViewingEntries(entries);

        const { data: sales } = await getEmployeeSales(emp.id);
        setSalesCount(sales.length);

        setIsLoadingEntries(false);
        initialLoadDoneRef.current = true;
    };

    // Track if initial load is complete to prevent double-fetch from TimeEntriesTable
    const initialLoadDoneRef = useRef(false);

    const handleDateRangeChange = useCallback(async (start: Date, end: Date) => {
        if (!viewingEmployee) return;
        // Skip if this is triggered during initial load (we already fetched all entries)
        if (!initialLoadDoneRef.current) return;

        setIsLoadingEntries(true);
        const { data } = await getTimeEntries(viewingEmployee.id, start, end);
        setViewingEntries(data);
        setIsLoadingEntries(false);
    }, [viewingEmployee, getTimeEntries]);

    const handleManualClockIn = async (emp: EmployeeWithStats) => {
        setEmployeeActionError(null);
        const { error: clockInError } = await manualClockIn(emp.id);

        if (clockInError) {
            setEmployeeActionError(clockInError);
            return;
        }

        if (viewingEmployee?.id === emp.id) {
            const { data } = await getTimeEntries(emp.id);
            const openEntry = data.find((entry) => !entry.clock_out);
            setViewingEmployee({
                ...viewingEmployee,
                clockStatus: 'clocked_in',
                currentEntryId: openEntry?.id || viewingEmployee.currentEntryId,
            });
            setViewingEntries(data);
        }
    };

    const handleManualClockOut = async (emp: EmployeeWithStats) => {
        if (!emp.currentEntryId) return;
        setEmployeeActionError(null);
        const { error: clockOutError } = await manualClockOut(emp.currentEntryId);

        if (clockOutError) {
            setEmployeeActionError(clockOutError);
            return;
        }

        if (viewingEmployee?.id === emp.id) {
            setViewingEmployee({ ...viewingEmployee, clockStatus: 'clocked_out', currentEntryId: null });
            const { data } = await getTimeEntries(emp.id);
            setViewingEntries(data);
        }
    };

    useEffect(() => {
        if (!deleteTarget) {
            setTimeEntryCount(0);
            return;
        }

        const fetchTimeEntryCount = async () => {
            const { count } = await supabase
                .from('time_entries')
                .select('id', { count: 'exact', head: true })
                .eq('employee_id', deleteTarget.id);
            setTimeEntryCount(count || 0);
        };

        void fetchTimeEntryCount();
    }, [deleteTarget]);

    const handleDeleteEmployee = async () => {
        if (!deleteTarget) return;
        setDeleteEmployeeError(null);
        setIsDeletingEmployee(true);

        const { error: deletionError } = await archiveEmployee(deleteTarget.id);

        setIsDeletingEmployee(false);
        if (deletionError) {
            setDeleteEmployeeError(deletionError);
            return;
        }

        setDeleteTarget(null);
        setTimeEntryCount(0);
    };

    const handleEditTimeEntry = async (updates: TimeEntryUpdate): Promise<{ error: string | null }> => {
        if (!user?.id) return { error: 'Not authenticated' };

        const result = await updateTimeEntry(updates.id, user.id, {
            clock_in: updates.clock_in,
            clock_out: updates.clock_out,
            lunch_break_minutes: updates.lunch_break_minutes,
            notes: updates.notes,
        });

        if (!result.error && viewingEmployee) {
            // Refresh entries after update
            const { data } = await getTimeEntries(viewingEmployee.id);
            setViewingEntries(data);
        }

        return result;
    };

    const fetchSchedulePreview = useCallback(async (weekOffset: ScheduleWeekOffset, customMessage: string) => {
        setIsLoadingSchedulePreview(true);
        setSchedulePreviewError(null);
        setSchedulePreview(null);

        const { data, error: invokeError } = await supabase.functions.invoke('send-employee-weekly-schedules', {
            body: {
                previewOnly: true,
                weekOffset,
                customMessage: customMessage.trim() || null,
            },
        });

        setIsLoadingSchedulePreview(false);

        if (invokeError || data?.error) {
            setSchedulePreviewError(invokeError?.message || data?.error || 'Failed to load email preview');
            return;
        }

        setSchedulePreview({
            html: data?.previewHtml || '',
            subject: data?.previewSubject || '',
            weekStart: data?.weekStart || '',
            weekEnd: data?.weekEnd || '',
            recipientCount: data?.recipientCount ?? 0,
            previewRecipient: data?.previewRecipient || null,
        });
    }, []);

    const handleOpenScheduleEmailModal = () => {
        setScheduleSendMessage(null);
        setIsScheduleEmailModalOpen(true);
        void fetchSchedulePreview(scheduleWeekOffset, scheduleEmailBody);
    };

    const handleSendScheduleEmails = async () => {
        setIsSendingSchedules(true);
        setScheduleSendMessage(null);
        setSchedulePreviewError(null);

        const { data, error: invokeError } = await supabase.functions.invoke('send-employee-weekly-schedules', {
            body: {
                weekOffset: scheduleWeekOffset,
                customMessage: scheduleEmailBody.trim() || null,
            },
        });

        setIsSendingSchedules(false);

        if (invokeError || data?.error) {
            setScheduleSendMessage({
                type: 'error',
                text: invokeError?.message || data?.error || 'Failed to send schedule emails',
            });
            return;
        }

        const sentCount = data?.sentCount ?? 0;
        const failedCount = data?.failedCount ?? 0;
        const weekStart = data?.weekStart ?? '';
        const weekEnd = data?.weekEnd ?? '';
        setScheduleSendMessage({
            type: 'success',
            text: `Schedule emails sent: ${sentCount} sent, ${failedCount} failed (${weekStart} to ${weekEnd}).`,
        });
        setIsScheduleEmailModalOpen(false);
    };

    return (
        <div className="animate-fadeIn">
            <Header
                title="Timecards"
                description="Manage employee accounts and review time clock activity"
                actions={
                    <div className="flex flex-wrap gap-2">
                        <InactiveEmployeeToggle
                            showInactive={showInactiveEmployees}
                            inactiveCount={inactiveEmployeeCount}
                            onChange={setShowInactiveEmployees}
                        />
                        <Button
                            variant="secondary"
                            onClick={() => setShowSensitiveNumbers((prev) => !prev)}
                        >
                            {showSensitiveNumbers ? 'Hide Numbers' : 'Unhide Numbers'}
                        </Button>
                        <Button variant="secondary" onClick={() => setShowAuthModal(true)}>
                            <Lock size={16} />
                            Authorize Device
                        </Button>
                        <Button
                            variant="secondary"
                            onClick={handleOpenScheduleEmailModal}
                            isLoading={isSendingSchedules}
                        >
                            <Mail size={16} />
                            Send Schedule Emails
                        </Button>
                        <Button onClick={() => setShowAddModal(true)}>
                            <UserRoundPlus size={16} />
                            Add Employee
                        </Button>
                    </div>
                }
            />

            {scheduleSendMessage && (
                <div className={`mb-4 p-3 rounded-lg text-sm ${scheduleSendMessage.type === 'success'
                    ? 'bg-[var(--color-success-bg)] text-[var(--color-success)]'
                    : 'bg-[var(--color-danger-bg)] text-[var(--color-danger)]'
                    }`}>
                    {scheduleSendMessage.text}
                </div>
            )}

            {error && (
                <div className="mb-4 p-3 rounded-lg bg-[var(--color-danger-bg)] text-[var(--color-danger)]">
                    {error}
                </div>
            )}

            {employeeActionError && (
                <div className="mb-4 p-3 rounded-lg bg-[var(--color-danger-bg)] text-[var(--color-danger)]">
                    {employeeActionError}
                </div>
            )}

            {isLoading ? (
                <div className="flex items-center justify-center py-12">
                    <LoadingSpinner size={32} />
                </div>
            ) : employees.length === 0 ? (
                <Card variant="outlined">
                    <CardContent className="py-12 text-center">
                        <div className="mb-4 flex justify-center text-[var(--color-muted)]">
                            <UserRound size={44} />
                        </div>
                        <h3 className="text-lg font-medium mb-2">No Employees Yet</h3>
                        <p className="text-[var(--color-muted)] mb-4">
                            Add your first employee to enable PIN-based clock-in
                        </p>
                        <Button onClick={() => setShowAddModal(true)}>
                            <UserRoundPlus size={16} />
                            Add Employee
                        </Button>
                    </CardContent>
                </Card>
            ) : visibleEmployees.length === 0 ? (
                <Card variant="outlined">
                    <CardContent className="py-12 text-center">
                        <div className="mb-4 flex justify-center text-[var(--color-muted)]">
                            <UserRound size={44} />
                        </div>
                        <h3 className="text-lg font-medium mb-2">No active employees</h3>
                        <p className="text-[var(--color-muted)]">
                            Use “Show inactive employees” above to review archived employee timecards.
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <Card variant="outlined">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-[var(--color-surface)]">
                                <tr>
                                    <th className="text-left px-4 py-3 text-sm font-medium text-[var(--color-muted)]">Name</th>
                                    <th className="text-left px-4 py-3 text-sm font-medium text-[var(--color-muted)]">Status</th>
                                    <th className="text-right px-4 py-3 text-sm font-medium text-[var(--color-muted)]">Hourly Rate</th>
                                    <th className="text-right px-4 py-3 text-sm font-medium text-[var(--color-muted)]">This Week</th>
                                    <th className="text-left px-4 py-3 text-sm font-medium text-[var(--color-muted)]">Active</th>
                                    <th className="text-right px-4 py-3 text-sm font-medium text-[var(--color-muted)]">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visibleEmployees.map((emp) => (
                                    <tr key={emp.id} className="border-t border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]">
                                        <td className="px-4 py-3">
                                            <p className="font-medium">{emp.name}</p>
                                        </td>
                                        <td className="px-4 py-3">
                                            {emp.clockStatus === 'clocked_in' ? (
                                                <Badge variant="success">
                                                    <span className="inline-flex items-center gap-1.5">
                                                        <span className="h-2 w-2 rounded-full bg-current" />
                                                        Clocked In
                                                    </span>
                                                </Badge>
                                            ) : (
                                                <Badge variant="secondary">
                                                    <span className="inline-flex items-center gap-1.5">
                                                        <span className="h-2 w-2 rounded-full border border-current" />
                                                        Clocked Out
                                                    </span>
                                                </Badge>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono">
                                            <span className={showSensitiveNumbers ? '' : 'blur-sm select-none'}>
                                                {formatCurrency(emp.hourly_rate)}/hr
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <span className={showSensitiveNumbers ? '' : 'blur-sm select-none'}>
                                                {formatDecimalHours(emp.weeklyHours)}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            {emp.is_active ? (
                                                <Badge variant="success">Active</Badge>
                                            ) : (
                                                <Badge variant="secondary">Inactive</Badge>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex gap-2 justify-end">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleViewEmployee(emp)}
                                                >
                                                    View
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setEditingEmployee(emp)}
                                                >
                                                    Edit
                                                </Button>
                                                {emp.is_active && (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => {
                                                            setDeleteEmployeeError(null);
                                                            setDeleteTarget(emp);
                                                        }}
                                                    >
                                                        Archive
                                                    </Button>
                                                )}
                                                {emp.clockStatus === 'clocked_in' && (
                                                    <Button
                                                        variant="secondary"
                                                        size="sm"
                                                        onClick={() => handleManualClockOut(emp)}
                                                    >
                                                        Clock Out
                                                    </Button>
                                                )}
                                                {emp.clockStatus === 'clocked_out' && emp.is_active && (
                                                    <Button
                                                        variant="secondary"
                                                        size="sm"
                                                        onClick={() => handleManualClockIn(emp)}
                                                    >
                                                        Clock In
                                                    </Button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}

            {/* Add Employee Modal */}
            <AddEmployeeModal
                isOpen={showAddModal}
                onClose={() => setShowAddModal(false)}
                onSubmit={handleAddEmployee}
                roleOptions={employeeRoles}
            />

            {/* Edit Employee Modal */}
            <AddEmployeeModal
                isOpen={!!editingEmployee}
                onClose={() => setEditingEmployee(null)}
                onSubmit={handleEditEmployee}
                employee={editingEmployee}
                roleOptions={employeeRoles}
            />

            {/* View Employee Detail Modal */}
            <Modal
                isOpen={!!viewingEmployee}
                onClose={() => setViewingEmployee(null)}
                title={viewingEmployee?.name || 'Employee Details'}
                size="3xl"
            >
                {viewingEmployee && (
                    <div className="space-y-6">
                        {/* Employee Info */}
                        <div className="grid grid-cols-3 gap-4">
                            <div className="p-4 rounded-lg bg-[var(--color-surface)]">
                                <p className="text-sm text-[var(--color-muted)]">Hourly Rate</p>
                                <p className={`text-xl font-bold ${showSensitiveNumbers ? '' : 'blur-sm select-none'}`}>
                                    {formatCurrency(viewingEmployee.hourly_rate)}
                                </p>
                            </div>
                            <div className="p-4 rounded-lg bg-[var(--color-surface)]">
                                <p className="text-sm text-[var(--color-muted)]">This Week</p>
                                <p className={`text-xl font-bold text-[var(--color-primary)] ${showSensitiveNumbers ? '' : 'blur-sm select-none'}`}>
                                    {formatDecimalHours(viewingEmployee.weeklyHours)}
                                </p>
                            </div>
                            <div className="p-4 rounded-lg bg-[var(--color-surface)]">
                                <p className="text-sm text-[var(--color-muted)]">Sales Processed</p>
                                <p className="text-xl font-bold">{salesCount}</p>
                            </div>
                        </div>

                        {/* Status */}
                        <div className="flex items-center gap-3">
                            <span className="text-sm text-[var(--color-muted)]">Current Status:</span>
                            {viewingEmployee.clockStatus === 'clocked_in' ? (
                                <Badge variant="success">
                                    <span className="inline-flex items-center gap-1.5">
                                        <span className="h-2 w-2 rounded-full bg-current" />
                                        Clocked In
                                    </span>
                                </Badge>
                            ) : (
                                <Badge variant="secondary">
                                    <span className="inline-flex items-center gap-1.5">
                                        <span className="h-2 w-2 rounded-full border border-current" />
                                        Clocked Out
                                    </span>
                                </Badge>
                            )}
                            {!viewingEmployee.is_active && (
                                <Badge variant="warning">Account Inactive</Badge>
                            )}
                            {viewingEmployee.clockStatus === 'clocked_in' ? (
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => handleManualClockOut(viewingEmployee)}
                                >
                                    Clock Out
                                </Button>
                            ) : viewingEmployee.is_active ? (
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => handleManualClockIn(viewingEmployee)}
                                >
                                    Clock In
                                </Button>
                            ) : null}
                        </div>

                        {/* Time Entries */}
                        <div>
                            <h3 className="text-lg font-medium mb-4">Time Clock History</h3>
                            <TimeEntriesTable
                                entries={viewingEntries}
                                isLoading={isLoadingEntries}
                                onDateRangeChange={handleDateRangeChange}
                                onEditEntry={setEditingTimeEntry}
                                hideSensitiveValues={!showSensitiveNumbers}
                            />
                        </div>

                        <EmployeeCredentials employeeId={viewingEmployee.id} employeeName={viewingEmployee.name} />
                    </div>
                )}
            </Modal>

            {/* Edit Time Entry Modal */}
            <EditTimeEntryModal
                isOpen={!!editingTimeEntry}
                onClose={() => setEditingTimeEntry(null)}
                onSubmit={handleEditTimeEntry}
                entry={editingTimeEntry}
            />

            {/* Authorize Device Modal */}
            <AuthorizeDeviceModal
                isOpen={showAuthModal}
                onClose={() => setShowAuthModal(false)}
            />

            <DeleteConfirmationModal
                isOpen={!!deleteTarget}
                onClose={() => {
                    setDeleteTarget(null);
                    setDeleteEmployeeError(null);
                }}
                onConfirm={handleDeleteEmployee}
                isLoading={isDeletingEmployee}
                targetName={deleteTarget?.name || ''}
                itemCount={timeEntryCount}
                title="Archive Employee"
                warningLabel="This removes active access but keeps historical records"
                warningIntro={`Archiving ${deleteTarget?.name || 'this employee'} will:`}
                consequences={[
                    `Keep ${timeEntryCount} saved time entr${timeEntryCount === 1 ? 'y' : 'ies'}, payroll records, payouts, and past history for reference`,
                    'Mark the employee inactive so they no longer appear as an active worker',
                    'Remove PIN sessions and employee portal access',
                    'Close any open shift and clear future schedule assignments',
                ]}
                confirmActionLabel="Archive"
                confirmButtonLabel="Archive Employee"
                description={deleteEmployeeError || undefined}
            />

            <Modal
                isOpen={isScheduleEmailModalOpen}
                onClose={() => setIsScheduleEmailModalOpen(false)}
                title="Send Schedule Emails"
                description="Choose this week or next week, add an optional message, preview, then send."
                size="4xl"
            >
                <div className="space-y-4">
                    <div>
                        <p className="mb-2 text-sm font-medium text-[var(--color-foreground)]">Week to Send</p>
                        <div className="flex gap-2">
                            <Button
                                variant={scheduleWeekOffset === 0 ? 'primary' : 'secondary'}
                                size="sm"
                                onClick={() => {
                                    setScheduleWeekOffset(0);
                                    void fetchSchedulePreview(0, scheduleEmailBody);
                                }}
                            >
                                This Week
                            </Button>
                            <Button
                                variant={scheduleWeekOffset === 1 ? 'primary' : 'secondary'}
                                size="sm"
                                onClick={() => {
                                    setScheduleWeekOffset(1);
                                    void fetchSchedulePreview(1, scheduleEmailBody);
                                }}
                            >
                                Next Week
                            </Button>
                        </div>
                    </div>

                    <Textarea
                        label="Optional Message in Email Body"
                        value={scheduleEmailBody}
                        onChange={(event) => setScheduleEmailBody(event.target.value)}
                        rows={4}
                        placeholder="Add a note for the team (e.g. meeting reminders or policy updates)."
                        maxLength={2000}
                        hint="This message is added above the schedule table in each email."
                    />

                    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">Preview</p>
                        {isLoadingSchedulePreview ? (
                            <div className="flex items-center justify-center py-10">
                                <LoadingSpinner size={24} />
                            </div>
                        ) : schedulePreviewError ? (
                            <p className="mt-2 text-sm text-[var(--color-danger)]">{schedulePreviewError}</p>
                        ) : schedulePreview ? (
                            <div className="mt-2 space-y-2">
                                <p className="text-sm text-[var(--color-foreground)]">
                                    <span className="font-semibold">Subject:</span> {schedulePreview.subject}
                                </p>
                                <p className="text-xs text-[var(--color-muted)]">
                                    Range: {schedulePreview.weekStart} to {schedulePreview.weekEnd} • Recipients with linked employee logins: {schedulePreview.recipientCount}
                                    {schedulePreview.previewRecipient ? ` • Previewing: ${schedulePreview.previewRecipient}` : ''}
                                </p>
                                <iframe
                                    title="schedule-email-preview"
                                    srcDoc={schedulePreview.html}
                                    className="h-[420px] w-full rounded-lg border border-[var(--color-border)] bg-white"
                                />
                            </div>
                        ) : (
                            <p className="mt-2 text-sm text-[var(--color-muted)]">No preview available yet.</p>
                        )}
                    </div>
                </div>

                <ModalFooter>
                    <Button
                        variant="secondary"
                        onClick={() => void fetchSchedulePreview(scheduleWeekOffset, scheduleEmailBody)}
                        isLoading={isLoadingSchedulePreview}
                    >
                        Refresh Preview
                    </Button>
                    <Button variant="ghost" onClick={() => setIsScheduleEmailModalOpen(false)}>
                        Cancel
                    </Button>
                    <Button onClick={handleSendScheduleEmails} isLoading={isSendingSchedules}>
                        Send Emails
                    </Button>
                </ModalFooter>
            </Modal>
        </div>
    );
}
