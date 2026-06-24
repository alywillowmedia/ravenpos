// useEmployees hook - Admin management of employees
// Handles CRUD operations and fetching employee data with stats

import { useState, useCallback, useEffect } from 'react';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { hashPin, generateSalt } from '../lib/employeeAuth';
import { getSundaySaturdayWeekDateRange } from '../lib/timeCalculations';
import type { Employee, EmployeeWithStats, TimeEntry, EmployeeInput } from '../types/employee';

async function getFunctionErrorMessage(error: FunctionsHttpError): Promise<string | null> {
    try {
        const payload = await error.context.clone().json();
        if (payload?.error) {
            return payload.error;
        }
    } catch {
        // Fall through to text parsing.
    }

    try {
        const text = await error.context.clone().text();
        return text || null;
    } catch {
        return null;
    }
}

async function invokeEmployeeAccountManagement(body: object): Promise<{ error: string | null }> {
    const invoke = () => supabase.functions.invoke('manage-employee-account', { body });

    let { data, error } = await invoke();

    if (error instanceof FunctionsHttpError && error.context.status === 401) {
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
        if (!refreshError && refreshData.session) {
            const retry = await invoke();
            data = retry.data;
            error = retry.error;
        }
    }

    if (error) {
        if (error instanceof FunctionsHttpError) {
            return { error: await getFunctionErrorMessage(error) || error.message };
        }

        return { error: error.message || 'Request failed' };
    }

    if (data?.error) {
        return { error: data.error };
    }

    return { error: null };
}

export function useEmployees() {
    const [employees, setEmployees] = useState<EmployeeWithStats[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Fetch all employees with their stats
    const fetchEmployees = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            // Get all employees
            const { data: employeesData, error: empError } = await supabase
                .from('employees')
                .select('*')
                .order('name');

            if (empError) {
                setError(empError.message);
                setIsLoading(false);
                return;
            }

            // Get current week date range
            const { start, end } = getSundaySaturdayWeekDateRange();

            // Get all open time entries (to check who's clocked in)
            const { data: openEntries } = await supabase
                .from('time_entries')
                .select('employee_id, id')
                .is('clock_out', null);

            // Get this week's time entries for hours calculation
            const { data: weekEntries } = await supabase
                .from('time_entries')
                .select('employee_id, total_hours')
                .gte('clock_in', start.toISOString())
                .lte('clock_in', end.toISOString())
                .not('total_hours', 'is', null);

            // Map employees with stats
            const employeesWithStats: EmployeeWithStats[] = (employeesData as Employee[]).map(emp => {
                const openEntry = openEntries?.find(e => e.employee_id === emp.id);
                const weeklyHours = weekEntries
                    ?.filter(e => e.employee_id === emp.id)
                    .reduce((sum, e) => sum + (e.total_hours || 0), 0) || 0;

                return {
                    ...emp,
                    clockStatus: openEntry ? 'clocked_in' : 'clocked_out',
                    weeklyHours: Math.round(weeklyHours * 100) / 100,
                    currentEntryId: openEntry?.id || null,
                };
            });

            setEmployees(employeesWithStats);
        } catch (err) {
            setError('Failed to fetch employees');
            console.error(err);
        }

        setIsLoading(false);
    }, []);

    // Initial fetch
    useEffect(() => {
        fetchEmployees();
    }, [fetchEmployees]);

    // Create new employee
    const createEmployee = async (input: EmployeeInput): Promise<{ data: Employee | null; error: string | null }> => {
        try {
            const salt = generateSalt();
            const pinHash = await hashPin(input.pin, salt);

            const { data, error } = await supabase
                .from('employees')
                .insert({
                    name: input.name,
                    pin_hash: pinHash,
                    pin_salt: salt,
                    hourly_rate: input.hourly_rate,
                    is_active: input.is_active,
                    employer: input.employer,
                    employment_type: input.employment_type,
                    address_line_1: input.address_line_1 || null,
                    address_line_2: input.address_line_2 || null,
                    city: input.city || null,
                    state: input.state || null,
                    postal_code: input.postal_code || null,
                    country: input.country || null,
                })
                .select()
                .single();

            if (error) {
                return { data: null, error: error.message };
            }

            await fetchEmployees();
            return { data: data as Employee, error: null };
        } catch (err) {
            console.error(err);
            return { data: null, error: 'Failed to create employee' };
        }
    };

    // Update employee
    const updateEmployee = async (
        id: string,
        updates: Partial<Pick<Employee, 'name' | 'hourly_rate' | 'is_active' | 'employer' | 'employment_type' | 'address_line_1' | 'address_line_2' | 'city' | 'state' | 'postal_code' | 'country'>>,
        newPin?: string
    ): Promise<{ error: string | null }> => {
        try {
            const updateData: Record<string, unknown> = { ...updates };

            // If new PIN provided, hash it
            if (newPin) {
                const salt = generateSalt();
                const pinHash = await hashPin(newPin, salt);
                updateData.pin_hash = pinHash;
                updateData.pin_salt = salt;
            }

            const { error } = await supabase
                .from('employees')
                .update(updateData)
                .eq('id', id);

            if (error) {
                return { error: error.message };
            }

            await fetchEmployees();
            return { error: null };
        } catch (err) {
            console.error(err);
            return { error: 'Failed to update employee' };
        }
    };

    // Archive employee while preserving historical time/payroll records.
    const archiveEmployee = async (id: string): Promise<{ error: string | null }> => {
        try {
            const { error: archiveError } = await invokeEmployeeAccountManagement({
                action: 'archive_employee',
                employeeId: id,
            });

            if (archiveError) {
                return { error: archiveError };
            }

            await fetchEmployees();
            return { error: null };
        } catch (err) {
            console.error(err);
            return { error: 'Failed to archive employee' };
        }
    };

    // Get single employee with full details
    const getEmployee = async (id: string): Promise<{ data: Employee | null; error: string | null }> => {
        const { data, error } = await supabase
            .from('employees')
            .select('id, name, hourly_rate, is_active, employer, employment_type, address_line_1, address_line_2, city, state, postal_code, country, created_at, updated_at')
            .eq('id', id)
            .single();

        if (error) {
            return { data: null, error: error.message };
        }

        return { data: data as Employee, error: null };
    };

    // Get time entries for an employee
    const getTimeEntries = useCallback(async (
        employeeId: string,
        startDate?: Date,
        endDate?: Date
    ): Promise<{ data: TimeEntry[]; error: string | null }> => {
        let query = supabase
            .from('time_entries')
            .select('*')
            .eq('employee_id', employeeId)
            .order('clock_in', { ascending: false });

        if (startDate) {
            query = query.gte('clock_in', startDate.toISOString());
        }
        if (endDate) {
            query = query.lte('clock_in', endDate.toISOString());
        }

        const { data, error } = await query;

        if (error) {
            return { data: [], error: error.message };
        }

        return { data: data as TimeEntry[], error: null };
    }, []);

    // Manual clock in (admin function)
    const manualClockIn = async (
        employeeId: string,
        notes?: string
    ): Promise<{ error: string | null }> => {
        try {
            const { data: employee, error: employeeError } = await supabase
                .from('employees')
                .select('id, is_active')
                .eq('id', employeeId)
                .single();

            if (employeeError || !employee) {
                return { error: 'Employee not found' };
            }

            if (!employee.is_active) {
                return { error: 'Inactive employees cannot be clocked in' };
            }

            const { data: openEntry, error: openEntryError } = await supabase
                .from('time_entries')
                .select('id')
                .eq('employee_id', employeeId)
                .is('clock_out', null)
                .maybeSingle();

            if (openEntryError) {
                return { error: openEntryError.message };
            }

            if (openEntry) {
                return { error: 'Employee is already clocked in' };
            }

            const { error } = await supabase
                .from('time_entries')
                .insert({
                    employee_id: employeeId,
                    clock_in: new Date().toISOString(),
                    notes: notes || 'Manually clocked in by admin',
                });

            if (error) {
                return { error: error.message };
            }

            await fetchEmployees();
            return { error: null };
        } catch (err) {
            console.error(err);
            return { error: 'Failed to clock in' };
        }
    };

    // Manual clock out (admin function)
    const manualClockOut = async (
        entryId: string,
        notes?: string
    ): Promise<{ error: string | null }> => {
        try {
            // Get the entry first
            const { data: entry, error: fetchError } = await supabase
                .from('time_entries')
                .select('clock_in')
                .eq('id', entryId)
                .single();

            if (fetchError || !entry) {
                return { error: 'Time entry not found' };
            }

            // Calculate hours
            const clockIn = new Date(entry.clock_in);
            const clockOut = new Date();
            const totalHours = (clockOut.getTime() - clockIn.getTime()) / (1000 * 60 * 60);

            const { error } = await supabase
                .from('time_entries')
                .update({
                    clock_out: clockOut.toISOString(),
                    total_hours: Math.round(totalHours * 100) / 100,
                    notes: notes || 'Manually clocked out by admin',
                })
                .eq('id', entryId);

            if (error) {
                return { error: error.message };
            }

            await fetchEmployees();
            return { error: null };
        } catch (err) {
            console.error(err);
            return { error: 'Failed to clock out' };
        }
    };

    // Get sales processed by employee
    const getEmployeeSales = async (
        employeeId: string,
        startDate?: Date,
        endDate?: Date
    ): Promise<{ data: Array<{ id: string; completed_at: string; total: number }>; error: string | null }> => {
        let query = supabase
            .from('sales')
            .select('id, completed_at, total')
            .eq('processed_by_employee', employeeId)
            .order('completed_at', { ascending: false });

        if (startDate) {
            query = query.gte('completed_at', startDate.toISOString());
        }
        if (endDate) {
            query = query.lte('completed_at', endDate.toISOString());
        }

        const { data, error } = await query;

        if (error) {
            return { data: [], error: error.message };
        }

        return { data: data || [], error: null };
    };

    // Update time entry (admin function with audit trail)
    const updateTimeEntry = async (
        entryId: string,
        adminId: string,
        updates: {
            clock_in: string;
            clock_out: string | null;
            lunch_break_minutes: number;
            notes: string | null;
        }
    ): Promise<{ error: string | null }> => {
        try {
            // Calculate total hours if both clock in and out are provided
            let totalHours: number | null = null;
            if (updates.clock_out) {
                const clockIn = new Date(updates.clock_in);
                const clockOut = new Date(updates.clock_out);
                const diffMs = clockOut.getTime() - clockIn.getTime();
                // Subtract lunch break from total
                const lunchMs = (updates.lunch_break_minutes || 0) * 60 * 1000;
                totalHours = Math.round(((diffMs - lunchMs) / (1000 * 60 * 60)) * 100) / 100;
            }

            const { error } = await supabase
                .from('time_entries')
                .update({
                    clock_in: updates.clock_in,
                    clock_out: updates.clock_out,
                    total_hours: totalHours,
                    lunch_break_minutes: updates.lunch_break_minutes,
                    notes: updates.notes,
                    edited_by_admin_id: adminId,
                    edited_at: new Date().toISOString(),
                })
                .eq('id', entryId);

            if (error) {
                return { error: error.message };
            }

            await fetchEmployees();
            return { error: null };
        } catch (err) {
            console.error(err);
            return { error: 'Failed to update time entry' };
        }
    };

    return {
        employees,
        isLoading,
        error,
        fetchEmployees,
        createEmployee,
        updateEmployee,
        archiveEmployee,
        getEmployee,
        getTimeEntries,
        manualClockIn,
        manualClockOut,
        getEmployeeSales,
        updateTimeEntry,
    };
}
