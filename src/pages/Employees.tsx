// Admin Employees Page - Manage employees and view time clock data

import { useState, useCallback, useRef } from 'react';
import { Header } from '../components/layout/Header';
import { Button } from '../components/ui/Button';
import { Card, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { AddEmployeeModal } from '../components/employees/AddEmployeeModal';
import { AuthorizeDeviceModal } from '../components/employees/AuthorizeDeviceModal';
import { TimeEntriesTable } from '../components/employees/TimeEntriesTable';
import { EditTimeEntryModal, type TimeEntryUpdate } from '../components/employees/EditTimeEntryModal';
import { useEmployees } from '../hooks/useEmployees';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency } from '../lib/utils';
import { formatDuration } from '../lib/timeCalculations';
import type { Employee, EmployeeWithStats, TimeEntry, EmployeeInput } from '../types/employee';

export function Employees() {
    const { user } = useAuth();
    const {
        employees,
        isLoading,
        error,
        createEmployee,
        updateEmployee,
        getTimeEntries,
        manualClockOut,
        getEmployeeSales,
        updateTimeEntry,
    } = useEmployees();

    const [showAddModal, setShowAddModal] = useState(false);
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
    const [viewingEmployee, setViewingEmployee] = useState<EmployeeWithStats | null>(null);
    const [viewingEntries, setViewingEntries] = useState<TimeEntry[]>([]);
    const [isLoadingEntries, setIsLoadingEntries] = useState(false);
    const [salesCount, setSalesCount] = useState(0);
    const [editingTimeEntry, setEditingTimeEntry] = useState<TimeEntry | null>(null);

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

    const handleManualClockOut = async (emp: EmployeeWithStats) => {
        if (!emp.currentEntryId) return;
        await manualClockOut(emp.currentEntryId);
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

    return (
        <div className="animate-fadeIn">
            <Header
                title="Employees"
                description="Manage employee accounts and view time clock data"
                actions={
                    <div className="flex gap-2">
                        <Button variant="secondary" onClick={() => setShowAuthModal(true)}>
                            🔒 Authorize Device
                        </Button>
                        <Button onClick={() => setShowAddModal(true)}>
                            + Add Employee
                        </Button>
                    </div>
                }
            />

            {error && (
                <div className="mb-4 p-3 rounded-lg bg-[var(--color-danger-bg)] text-[var(--color-danger)]">
                    {error}
                </div>
            )}

            {isLoading ? (
                <div className="flex items-center justify-center py-12">
                    <LoadingSpinner size={32} />
                </div>
            ) : employees.length === 0 ? (
                <Card variant="outlined">
                    <CardContent className="py-12 text-center">
                        <div style={{ fontSize: '48px', marginBottom: '16px' }}>👤</div>
                        <h3 className="text-lg font-medium mb-2">No Employees Yet</h3>
                        <p className="text-[var(--color-muted)] mb-4">
                            Add your first employee to enable PIN-based clock-in
                        </p>
                        <Button onClick={() => setShowAddModal(true)}>
                            + Add Employee
                        </Button>
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
                                {employees.map((emp) => (
                                    <tr key={emp.id} className="border-t border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]">
                                        <td className="px-4 py-3">
                                            <p className="font-medium">{emp.name}</p>
                                        </td>
                                        <td className="px-4 py-3">
                                            {emp.clockStatus === 'clocked_in' ? (
                                                <Badge variant="success">
                                                    🟢 Clocked In
                                                </Badge>
                                            ) : (
                                                <Badge variant="secondary">
                                                    ⚪ Clocked Out
                                                </Badge>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono">
                                            {formatCurrency(emp.hourly_rate)}/hr
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            {formatDuration(emp.weeklyHours)}
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
                                                {emp.clockStatus === 'clocked_in' && (
                                                    <Button
                                                        variant="secondary"
                                                        size="sm"
                                                        onClick={() => handleManualClockOut(emp)}
                                                    >
                                                        Clock Out
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
            />

            {/* Edit Employee Modal */}
            <AddEmployeeModal
                isOpen={!!editingEmployee}
                onClose={() => setEditingEmployee(null)}
                onSubmit={handleEditEmployee}
                employee={editingEmployee}
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
                                <p className="text-xl font-bold">{formatCurrency(viewingEmployee.hourly_rate)}</p>
                            </div>
                            <div className="p-4 rounded-lg bg-[var(--color-surface)]">
                                <p className="text-sm text-[var(--color-muted)]">This Week</p>
                                <p className="text-xl font-bold text-[var(--color-primary)]">
                                    {formatDuration(viewingEmployee.weeklyHours)}
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
                                <Badge variant="success">🟢 Clocked In</Badge>
                            ) : (
                                <Badge variant="secondary">⚪ Clocked Out</Badge>
                            )}
                            {!viewingEmployee.is_active && (
                                <Badge variant="warning">Account Inactive</Badge>
                            )}
                        </div>

                        {/* Time Entries */}
                        <div>
                            <h3 className="text-lg font-medium mb-4">Time Clock History</h3>
                            <TimeEntriesTable
                                entries={viewingEntries}
                                isLoading={isLoadingEntries}
                                onDateRangeChange={handleDateRangeChange}
                                onEditEntry={setEditingTimeEntry}
                            />
                        </div>
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
        </div>
    );
}
