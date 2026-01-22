// Employee system types for RavenPOS
// Separate from admin/vendor auth system

export interface Employee {
    id: string;
    name: string;
    hourly_rate: number;
    is_active: boolean;
    employer?: 'Ravenlia' | 'Alywillow' | null;
    employment_type?: 'Production' | 'Sales' | 'Shipping Dept.' | null;
    created_at: string;
    updated_at: string;
}

// Full employee record including PIN data (admin only)
export interface EmployeeRecord extends Employee {
    pin_hash: string;
    pin_salt: string;
}

export interface TimeEntry {
    id: string;
    employee_id: string;
    clock_in: string;
    clock_out: string | null;
    total_hours: number | null;
    lunch_break_minutes?: number | null;
    notes: string | null;
    edited_by_admin_id?: string | null;
    edited_at?: string | null;
    created_at: string;
}

// Session stored in localStorage/context
export interface EmployeeSession {
    employee: Employee;
    clockedInAt: string | null;
    sessionStart: string;
    expiresAt: string;
}

// Form input types
export interface EmployeeInput {
    name: string;
    pin: string;
    hourly_rate: number;
    is_active: boolean;
    employer?: 'Ravenlia' | 'Alywillow' | null;
    employment_type?: 'Production' | 'Sales' | 'Shipping Dept.' | null;
}

export interface TimeEntryInput {
    employee_id: string;
    clock_in: string;
    clock_out?: string;
    notes?: string;
}

// Clock status for UI
export interface ClockStatus {
    isClockedIn: boolean;
    currentEntry: TimeEntry | null;
    duration: string; // Formatted duration like "3h 42m"
    startTime: string | null;
}

// Employee with calculated fields for admin list
export interface EmployeeWithStats extends Employee {
    clockStatus: 'clocked_in' | 'clocked_out';
    weeklyHours: number;
    currentEntryId: string | null;
}
