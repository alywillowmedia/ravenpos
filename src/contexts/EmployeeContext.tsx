// Employee Context - Separate from Admin/Vendor Auth
// Manages employee PIN sessions and clock status

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { Employee, EmployeeSession, ClockStatus, TimeEntry } from '../types/employee';
import {
    getEmployeeSession,
    setEmployeeSession,
    clearEmployeeSession,
    verifyEmployeePIN,
    updateSessionClockIn,
    updateSessionClockOut
} from '../lib/employeeAuth';
import { supabase } from '../lib/supabase';

interface EmployeeContextValue {
    employee: Employee | null;
    session: EmployeeSession | null;
    isLoading: boolean;
    clockStatus: ClockStatus;
    login: (pin: string) => Promise<{ success: boolean; error: string | null }>;
    logout: () => Promise<void>;
    clockIn: () => Promise<{ success: boolean; error: string | null }>;
    clockOut: () => Promise<{ success: boolean; hoursWorked: number | null; error: string | null }>;
    refreshClockStatus: () => Promise<void>;
}

const defaultClockStatus: ClockStatus = {
    isClockedIn: false,
    currentEntry: null,
    duration: '0h 0m',
    startTime: null,
};

const EmployeeContext = createContext<EmployeeContextValue | null>(null);

interface EmployeeProviderProps {
    children: ReactNode;
}

export function EmployeeProvider({ children }: EmployeeProviderProps) {
    const [employee, setEmployee] = useState<Employee | null>(null);
    const [session, setSession] = useState<EmployeeSession | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [clockStatus, setClockStatus] = useState<ClockStatus>(defaultClockStatus);

    // Calculate duration string from clock-in time
    const calculateDuration = useCallback((clockInTime: string): string => {
        const start = new Date(clockInTime);
        const now = new Date();
        const diffMs = now.getTime() - start.getTime();
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        return `${hours}h ${minutes}m`;
    }, []);

    // Fetch current clock status from database
    const fetchClockStatus = useCallback(async (employeeId: string) => {
        try {
            const { data: openEntry, error } = await supabase
                .from('time_entries')
                .select('*')
                .eq('employee_id', employeeId)
                .is('clock_out', null)
                .order('clock_in', { ascending: false })
                .limit(1)
                .single();

            if (error && error.code !== 'PGRST116') {
                // PGRST116 = no rows returned, which is fine
                console.error('Error fetching clock status:', error);
            }

            if (openEntry) {
                setClockStatus({
                    isClockedIn: true,
                    currentEntry: openEntry as TimeEntry,
                    duration: calculateDuration(openEntry.clock_in),
                    startTime: openEntry.clock_in,
                });
                updateSessionClockIn(openEntry.clock_in);
            } else {
                setClockStatus(defaultClockStatus);
                updateSessionClockOut();
            }
        } catch (err) {
            console.error('Exception fetching clock status:', err);
        }
    }, [calculateDuration]);

    // Initialize from stored session
    useEffect(() => {
        const storedSession = getEmployeeSession();
        if (storedSession) {
            setSession(storedSession);
            setEmployee(storedSession.employee);
            fetchClockStatus(storedSession.employee.id);
        }
        setIsLoading(false);
    }, [fetchClockStatus]);

    // Update duration every minute when clocked in
    useEffect(() => {
        if (!clockStatus.isClockedIn || !clockStatus.startTime) return;

        const interval = setInterval(() => {
            setClockStatus(prev => ({
                ...prev,
                duration: calculateDuration(prev.startTime!),
            }));
        }, 60000); // Update every minute

        return () => clearInterval(interval);
    }, [clockStatus.isClockedIn, clockStatus.startTime, calculateDuration]);

    // Login with PIN
    const login = async (pin: string): Promise<{ success: boolean; error: string | null }> => {
        const { employee: verifiedEmployee, error } = await verifyEmployeePIN(pin);

        if (error || !verifiedEmployee) {
            return { success: false, error: error || 'Invalid PIN' };
        }

        // Set session
        const newSession = setEmployeeSession(verifiedEmployee);
        setEmployee(verifiedEmployee);
        setSession(newSession);

        // Fetch current clock status (don't auto clock-in, let employee choose)
        await fetchClockStatus(verifiedEmployee.id);

        return { success: true, error: null };
    };

    // Internal clock-in (doesn't require employee param)
    const clockInInternal = async (employeeId: string): Promise<{ success: boolean; error: string | null }> => {
        try {
            // Check for existing open entry
            const { data: existing } = await supabase
                .from('time_entries')
                .select('id')
                .eq('employee_id', employeeId)
                .is('clock_out', null)
                .limit(1);

            if (existing && existing.length > 0) {
                // Already clocked in
                return { success: true, error: null };
            }

            // Create new time entry
            const { error } = await supabase
                .from('time_entries')
                .insert({
                    employee_id: employeeId,
                    clock_in: new Date().toISOString(),
                });

            if (error) {
                console.error('Clock in error:', error);
                return { success: false, error: 'Failed to clock in' };
            }

            return { success: true, error: null };
        } catch (err) {
            console.error('Clock in exception:', err);
            return { success: false, error: 'Failed to clock in' };
        }
    };

    // Clock in (exposed)
    const clockIn = async (): Promise<{ success: boolean; error: string | null }> => {
        if (!employee) {
            return { success: false, error: 'Not logged in' };
        }

        const result = await clockInInternal(employee.id);
        if (result.success) {
            await fetchClockStatus(employee.id);
        }
        return result;
    };

    // Clock out
    const clockOut = async (): Promise<{ success: boolean; hoursWorked: number | null; error: string | null }> => {
        if (!employee) {
            return { success: false, hoursWorked: null, error: 'Not logged in' };
        }

        try {
            // Find open time entry
            const { data: openEntry, error: fetchError } = await supabase
                .from('time_entries')
                .select('*')
                .eq('employee_id', employee.id)
                .is('clock_out', null)
                .order('clock_in', { ascending: false })
                .limit(1)
                .single();

            if (fetchError || !openEntry) {
                return { success: false, hoursWorked: null, error: 'No open clock-in found' };
            }

            // Calculate total hours
            const clockIn = new Date(openEntry.clock_in);
            const clockOutTime = new Date();
            const totalHours = (clockOutTime.getTime() - clockIn.getTime()) / (1000 * 60 * 60);
            const roundedHours = Math.round(totalHours * 100) / 100;

            // Update time entry
            const { error: updateError } = await supabase
                .from('time_entries')
                .update({
                    clock_out: clockOutTime.toISOString(),
                    total_hours: roundedHours,
                })
                .eq('id', openEntry.id);

            if (updateError) {
                console.error('Clock out error:', updateError);
                return { success: false, hoursWorked: null, error: 'Failed to clock out' };
            }

            // Update local state
            setClockStatus(defaultClockStatus);
            updateSessionClockOut();

            return { success: true, hoursWorked: roundedHours, error: null };
        } catch (err) {
            console.error('Clock out exception:', err);
            return { success: false, hoursWorked: null, error: 'Failed to clock out' };
        }
    };

    // Logout (does NOT clock out - clock status persists independently)
    const logout = async () => {
        // Clear session only, don't clock out
        clearEmployeeSession();
        setEmployee(null);
        setSession(null);
        // Reset local clock status display (actual DB status persists)
        setClockStatus(defaultClockStatus);
    };

    // Refresh clock status
    const refreshClockStatus = async () => {
        if (employee) {
            await fetchClockStatus(employee.id);
        }
    };

    const value: EmployeeContextValue = {
        employee,
        session,
        isLoading,
        clockStatus,
        login,
        logout,
        clockIn,
        clockOut,
        refreshClockStatus,
    };

    return (
        <EmployeeContext.Provider value={value}>
            {children}
        </EmployeeContext.Provider>
    );
}

export function useEmployee() {
    const context = useContext(EmployeeContext);
    if (!context) {
        throw new Error('useEmployee must be used within an EmployeeProvider');
    }
    return context;
}
