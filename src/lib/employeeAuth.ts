// Employee authentication utilities
// Employee PIN access now uses Supabase anonymous auth sessions.

import { supabase } from './supabase';
import { getDeviceToken } from './deviceAuth';
import type { Employee, EmployeeSession } from '../types/employee';

const EMPLOYEE_SESSION_KEY = 'employeeSession';
const SESSION_DURATION_HOURS = 8;

async function ensureAnonymousAuthSession(): Promise<{ error: string | null }> {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
        console.error('Unable to get Supabase session:', sessionError);
        return { error: 'Unable to start session. Please try again.' };
    }

    if (session?.user?.is_anonymous) {
        return { error: null };
    }

    if (session) {
        const { error: signOutError } = await supabase.auth.signOut();
        if (signOutError) {
            console.error('Unable to clear existing session:', signOutError);
            return { error: 'Unable to start employee session. Please try again.' };
        }
    }

    const { error: anonError } = await supabase.auth.signInAnonymously();
    if (anonError) {
        console.error('Anonymous sign-in failed:', anonError);
        return { error: 'Employee sign-in is unavailable right now.' };
    }

    return { error: null };
}

async function extractFunctionErrorMessage(error: unknown): Promise<string | null> {
    if (!error || typeof error !== 'object') return null;

    const maybeContext = (error as { context?: Response }).context;
    if (!maybeContext) return null;

    try {
        const data = await maybeContext.clone().json() as { error?: string };
        if (typeof data?.error === 'string' && data.error.trim().length > 0) {
            return data.error;
        }
    } catch {
        // Best effort only
    }

    return null;
}

// SHA-256 hash function for PIN hashing (client-side, for creating employees)
export async function hashPin(pin: string, salt: string): Promise<string> {
    const msgBuffer = new TextEncoder().encode(pin + salt);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Generate a random salt for PIN hashing
export function generateSalt(): string {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Verify employee PIN via Edge Function
export async function verifyEmployeePIN(pin: string): Promise<{ employee: Employee | null; error: string | null }> {
    try {
        const { error: authError } = await ensureAnonymousAuthSession();
        if (authError) {
            return { employee: null, error: authError };
        }

        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !session?.access_token) {
            if (sessionError) {
                console.error('Failed to get anonymous session token:', sessionError);
            }
            return { employee: null, error: 'Unable to start employee session. Please try again.' };
        }
        const deviceToken = await getDeviceToken();
        if (!deviceToken) {
            return { employee: null, error: 'This device is not authorized for employee login.' };
        }

        const { data, error } = await supabase.functions.invoke('verify-employee-pin', {
            body: { pin },
            headers: {
                Authorization: `Bearer ${session.access_token}`,
                'x-device-token': deviceToken,
            },
        });

        if (error) {
            console.error('PIN verification error:', error);
            const functionErrorMessage = await extractFunctionErrorMessage(error);
            if (functionErrorMessage) {
                return { employee: null, error: functionErrorMessage };
            }
            return { employee: null, error: 'Unable to verify PIN. Please try again.' };
        }

        if (data?.employee) {
            return { employee: data.employee as Employee, error: null };
        }

        return { employee: null, error: data?.error || 'Invalid PIN' };
    } catch (err) {
        console.error('PIN verification exception:', err);
        return { employee: null, error: 'Unable to verify PIN. Please try again.' };
    }
}

// Get stored employee session from localStorage
export function getEmployeeSession(): EmployeeSession | null {
    try {
        const stored = localStorage.getItem(EMPLOYEE_SESSION_KEY);
        if (!stored) return null;

        const session: EmployeeSession = JSON.parse(stored);

        // Check if session is expired
        if (isSessionExpired(session)) {
            clearEmployeeSession();
            return null;
        }

        return session;
    } catch {
        return null;
    }
}

// Store employee session in localStorage
export function setEmployeeSession(employee: Employee, clockedInAt: string | null = null): EmployeeSession {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_DURATION_HOURS * 60 * 60 * 1000);

    const session: EmployeeSession = {
        employee,
        clockedInAt,
        sessionStart: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
    };

    localStorage.setItem(EMPLOYEE_SESSION_KEY, JSON.stringify(session));
    return session;
}

// Update clocked-in time in session
export function updateSessionClockIn(clockedInAt: string): void {
    const session = getEmployeeSession();
    if (session) {
        session.clockedInAt = clockedInAt;
        localStorage.setItem(EMPLOYEE_SESSION_KEY, JSON.stringify(session));
    }
}

// Clear clocked-in time in session (on clock out)
export function updateSessionClockOut(): void {
    const session = getEmployeeSession();
    if (session) {
        session.clockedInAt = null;
        localStorage.setItem(EMPLOYEE_SESSION_KEY, JSON.stringify(session));
    }
}

// Clear employee session from localStorage
export function clearEmployeeSession(): void {
    localStorage.removeItem(EMPLOYEE_SESSION_KEY);
}

// Check if session is expired
export function isSessionExpired(session: EmployeeSession): boolean {
    return new Date(session.expiresAt) < new Date();
}

// Refresh session expiration (extend by SESSION_DURATION_HOURS)
export function refreshSession(): void {
    const session = getEmployeeSession();
    if (session) {
        const now = new Date();
        const expiresAt = new Date(now.getTime() + SESSION_DURATION_HOURS * 60 * 60 * 1000);
        session.expiresAt = expiresAt.toISOString();
        localStorage.setItem(EMPLOYEE_SESSION_KEY, JSON.stringify(session));
    }
}
