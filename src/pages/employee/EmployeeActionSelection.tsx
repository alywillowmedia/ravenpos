// Employee Action Selection Page
// Shown after PIN entry - allows choosing between clock in/out and POS access

import { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useEmployee } from '../../contexts/EmployeeContext';
import { Button } from '../../components/ui/Button';
import { AuthShell } from '../../components/layout/AuthShell';
import { CheckCircle2, Clock3, LogOut, ShoppingCart } from 'lucide-react';

// How long the clocked in/out confirmation stays up before returning to the PIN pad.
const CONFIRMATION_MS = 3000;

export function EmployeeActionSelection() {
    const navigate = useNavigate();
    const { employee, clockStatus, clockIn, clockOut, logout } = useEmployee();
    const [isProcessing, setIsProcessing] = useState(false);
    const [showConfirmation, setShowConfirmation] = useState<{ type: 'in' | 'out'; hours?: number } | null>(null);

    // Sign out and return to the PIN pad for the next employee
    const handleLogout = useCallback(async () => {
        await logout();
        navigate('/employee/login');
    }, [logout, navigate]);

    // The confirmation dismisses itself; "Done" just skips the wait
    useEffect(() => {
        if (!showConfirmation) return;
        const timer = setTimeout(() => void handleLogout(), CONFIRMATION_MS);
        return () => clearTimeout(timer);
    }, [showConfirmation, handleLogout]);

    // Redirect if not logged in
    if (!employee) {
        return <Navigate to="/employee/login" replace />;
    }

    const handleClockAction = async () => {
        setIsProcessing(true);

        if (clockStatus.isClockedIn) {
            const result = await clockOut();
            if (result.success) {
                setShowConfirmation({ type: 'out', hours: result.hoursWorked || 0 });
            }
        } else {
            const result = await clockIn();
            if (result.success) {
                setShowConfirmation({ type: 'in' });
            }
        }

        setIsProcessing(false);
    };

    const handleOpenRegister = async (clockInFirst: boolean) => {
        if (clockInFirst) {
            setIsProcessing(true);
            await clockIn();
            setIsProcessing(false);
        }
        navigate('/employee/pos');
    };

    const formatHours = (hours: number) => {
        const h = Math.floor(hours);
        const m = Math.round((hours - h) * 60);
        return `${h}h ${m}m`;
    };

    if (showConfirmation) {
        const clockedIn = showConfirmation.type === 'in';
        return (
            <AuthShell
                eyebrow="Employee terminal"
                title={clockedIn ? 'Clocked in' : 'Clocked out'}
                description={clockedIn ? `Have a great shift, ${employee.name}.` : `Thanks, ${employee.name}.`}
            >
                <div className="py-4 text-center" role="status">
                    <CheckCircle2 size={56} className="mx-auto mb-4 text-[var(--color-success)]" aria-hidden="true" />
                    {!clockedIn && (
                        <p className="mb-4 font-display text-3xl tabular-nums text-[var(--color-primary)]">
                            Total: {formatHours(showConfirmation.hours || 0)}
                        </p>
                    )}
                    <p className="mb-5 text-sm text-[var(--color-muted)]">Returning to the PIN pad…</p>
                    <Button onClick={() => void handleLogout()} size="lg" variant="secondary">
                        Done
                    </Button>
                </div>
            </AuthShell>
        );
    }

    return (
        <AuthShell
            eyebrow="Employee terminal"
            title={`Welcome, ${employee.name}`}
            description={clockStatus.isClockedIn ? `Clocked in for ${clockStatus.duration}` : 'You are currently clocked out.'}
        >
            <div className="space-y-3">
                <Button
                    size="xl"
                    onClick={handleClockAction}
                    isLoading={isProcessing}
                    className={`min-h-16 w-full text-base ${clockStatus.isClockedIn ? '!bg-[var(--color-warning)] hover:!brightness-95' : '!bg-[var(--color-success)] hover:!bg-[var(--color-success-hover)]'}`}
                >
                    <Clock3 aria-hidden="true" />
                    {clockStatus.isClockedIn ? 'Clock out' : 'Clock in'}
                </Button>

                <Button
                    size="xl"
                    variant="secondary"
                    onClick={() => void handleOpenRegister(!clockStatus.isClockedIn)}
                    disabled={isProcessing}
                    className="min-h-16 w-full text-base"
                >
                    <ShoppingCart aria-hidden="true" />
                    {clockStatus.isClockedIn ? 'Open register' : 'Clock in & open register'}
                </Button>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-center gap-x-2 border-t border-[var(--color-border)] pt-3">
                {!clockStatus.isClockedIn && (
                    <button
                        onClick={() => void handleOpenRegister(false)}
                        disabled={isProcessing}
                        className="flex min-h-11 items-center justify-center rounded-lg px-3 text-sm font-medium text-[var(--color-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-foreground)]"
                    >
                        Open register without clocking in
                    </button>
                )}
                <button
                    onClick={() => void handleLogout()}
                    className="flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium text-[var(--color-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-foreground)]"
                >
                    <LogOut size={16} aria-hidden="true" /> Switch employee
                </button>
            </div>
        </AuthShell>
    );
}
