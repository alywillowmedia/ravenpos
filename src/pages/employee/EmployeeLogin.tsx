// Employee PIN Login Page
// Full-screen interface for employee clock-in
// Requires device authorization before showing PIN pad

import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useEmployee } from '../../contexts/EmployeeContext';
import { NumberPad } from '../../components/employee/NumberPad';
import { isDeviceAuthorized } from '../../lib/deviceAuth';
import { AuthShell } from '../../components/layout/AuthShell';
import { LockKeyhole, ShieldCheck } from 'lucide-react';

export function EmployeeLogin() {
    const [pin, setPin] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [shake, setShake] = useState(false);
    const [isCheckingAuth, setIsCheckingAuth] = useState(true);
    const [isAuthorized, setIsAuthorized] = useState(false);
    const [expiresAt, setExpiresAt] = useState<string | null>(null);
    const { employee, login, isLoading: contextLoading } = useEmployee();
    const navigate = useNavigate();

    // Check device authorization on mount
    useEffect(() => {
        const checkAuth = async () => {
            const result = await isDeviceAuthorized();
            setIsAuthorized(result.authorized);
            setExpiresAt(result.expiresAt);
            setIsCheckingAuth(false);
        };
        checkAuth();
    }, []);

    // Redirect if already logged in
    useEffect(() => {
        if (employee && !contextLoading) {
            navigate('/employee/action-selection');
        }
    }, [employee, contextLoading, navigate]);

    const handleLogin = useCallback(async (pinValue: string) => {
        if (pinValue.length !== 4 || isLoading) return;

        setIsLoading(true);
        setError(null);

        const { success, error: loginError } = await login(pinValue);

        if (success) {
            navigate('/employee/action-selection');
        } else {
            setError(loginError || 'Invalid PIN');
            setShake(true);
            setPin('');
            setTimeout(() => setShake(false), 500);
        }

        setIsLoading(false);
    }, [isLoading, login, navigate]);

    const handleDigit = useCallback((digit: string) => {
        if (pin.length >= 4 || isLoading) return;

        const newPin = pin + digit;
        setPin(newPin);
        setError(null);

        // Auto-submit on 4 digits
        if (newPin.length === 4) {
            handleLogin(newPin);
        }
    }, [handleLogin, isLoading, pin]);

    const handleClear = useCallback(() => {
        setPin('');
        setError(null);
    }, []);

    const handleBackspace = useCallback(() => {
        setPin(prev => prev.slice(0, -1));
        setError(null);
    }, []);

    // Keyboard support
    useEffect(() => {
        if (!isAuthorized) return; // Don't listen for keys if not authorized

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key >= '0' && e.key <= '9') {
                handleDigit(e.key);
            } else if (e.key === 'Backspace') {
                handleBackspace();
            } else if (e.key === 'Escape') {
                handleClear();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleBackspace, handleClear, handleDigit, isAuthorized]);

    // Loading state while checking authorization
    if (contextLoading || isCheckingAuth) {
        return (
            <main className="flex min-h-dvh items-center justify-center bg-[var(--color-background)]" aria-busy="true">
                <div className="flex items-center gap-3 text-sm font-medium text-[var(--color-muted)]" role="status">
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-primary)]" aria-hidden="true" />
                    Checking this device…
                </div>
            </main>
        );
    }

    // Device not authorized - show message
    if (!isAuthorized) {
        return (
            <AuthShell
                eyebrow="PIN terminal"
                title="Device authorization needed"
                description="An administrator must authorize this device before employees can use PIN clock-in. Account sign-in is still available."
            >
                <div className="mb-5 flex justify-center" aria-hidden="true">
                    <span className="flex h-16 w-16 items-center justify-center rounded-full border border-[var(--color-warning)]/25 bg-[var(--color-warning-bg)] text-[var(--color-warning)]">
                        <LockKeyhole size={30} />
                    </span>
                </div>
                <div className="space-y-3">
                    <Link
                        to="/employee/portal-login"
                        className="flex min-h-12 w-full items-center justify-center rounded-lg bg-[var(--color-primary)] px-4 py-3 text-sm font-semibold text-[var(--color-primary-foreground)] transition-colors hover:bg-[var(--color-primary-hover)]"
                    >
                        Sign in to the employee portal
                    </Link>
                    <Link
                        to="/login"
                        className="flex min-h-12 w-full items-center justify-center rounded-lg border border-[var(--color-input)] bg-[var(--color-surface)] px-4 py-3 text-sm font-semibold text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-surface-hover)]"
                    >
                        Admin or vendor sign in
                    </Link>
                </div>
                <p className="mt-5 rounded-lg bg-[var(--color-surface)] p-3 text-center text-xs text-[var(--color-muted)]">
                    Setup path: Employees → Authorize Device
                </p>
            </AuthShell>
        );
    }

    // Device is authorized - show PIN pad
    return (
        <AuthShell
            eyebrow="Employee terminal"
            title="Clock in with your PIN"
            description="Enter your four-digit employee PIN. The terminal submits automatically after the fourth digit."
        >
            <div className="mb-5 flex items-center justify-center gap-2 text-xs font-medium text-[var(--color-success)]">
                <ShieldCheck size={15} aria-hidden="true" />
                {expiresAt
                    ? `Authorized until ${new Date(expiresAt).toLocaleDateString()}`
                    : 'Authorized terminal'}
            </div>

            <div
                className={`mb-6 flex justify-center gap-4 ${shake ? 'animate-shake' : ''}`}
                aria-label={`${pin.length} of 4 PIN digits entered`}
                role="status"
            >
                {[0, 1, 2, 3].map(i => (
                    <div
                        key={i}
                        className={`h-4 w-4 rounded-full border transition-colors ${pin.length > i ? 'border-[var(--color-primary)] bg-[var(--color-primary)]' : 'border-[var(--color-border-strong)] bg-[var(--color-surface)]'}`}
                        aria-hidden="true"
                    />
                ))}
            </div>

            {/* Error Message */}
            {error && (
                <div className="mb-4 rounded-lg border border-[var(--color-danger)]/20 bg-[var(--color-danger-bg)] px-4 py-2 text-center text-sm text-[var(--color-danger)]" role="alert">
                    {error}
                </div>
            )}

            {/* Loading indicator */}
            {isLoading && (
                <div className="mb-4 text-center text-sm font-medium text-[var(--color-primary)]" role="status">
                    Verifying…
                </div>
            )}

            {/* Number Pad */}
            <NumberPad
                onDigit={handleDigit}
                onClear={handleClear}
                onBackspace={handleBackspace}
                disabled={isLoading}
            />

            <div className="mt-6 space-y-1 border-t border-[var(--color-border)] pt-4 text-center">
                <Link
                    to="/employee/portal-login?email=1"
                    className="block min-h-11 py-3 text-sm font-medium text-[var(--color-foreground)] hover:text-[var(--color-primary)]"
                >
                    Use employee email and password
                </Link>
                <Link
                    to="/login"
                    className="block min-h-11 py-3 text-sm text-[var(--color-muted)] hover:text-[var(--color-foreground)]"
                >
                    Admin or vendor sign in
                </Link>
            </div>

            {/* Shake animation styles */}
        </AuthShell>
    );
}
