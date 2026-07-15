// Employee Action Selection Page
// Shown after PIN entry - allows choosing between clock in/out and POS access

import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useEmployee } from '../../contexts/EmployeeContext';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { AuthShell } from '../../components/layout/AuthShell';
import { CheckCircle2, Clock3, LogOut, ShoppingCart } from 'lucide-react';

export function EmployeeActionSelection() {
    const navigate = useNavigate();
    const { employee, clockStatus, clockIn, clockOut, logout } = useEmployee();
    const [isProcessing, setIsProcessing] = useState(false);
    const [showConfirmation, setShowConfirmation] = useState<{ type: 'in' | 'out'; hours?: number } | null>(null);
    const [showClockInPrompt, setShowClockInPrompt] = useState(false);

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

    const handleGoToPOS = () => {
        if (!clockStatus.isClockedIn) {
            // Show prompt asking if they want to clock in
            setShowClockInPrompt(true);
        } else {
            navigate('/employee/pos');
        }
    };

    const handleClockInPromptResponse = async (shouldClockIn: boolean) => {
        setShowClockInPrompt(false);

        if (shouldClockIn) {
            setIsProcessing(true);
            await clockIn();
            setIsProcessing(false);
        }

        navigate('/employee/pos');
    };

    const handleConfirmationClose = async () => {
        setShowConfirmation(null);
        // Log out after clocking out to return to PIN screen
        await logout();
        navigate('/employee/login');
    };

    const handleLogout = async () => {
        await logout();
        navigate('/employee/login');
    };

    const formatHours = (hours: number) => {
        const h = Math.floor(hours);
        const m = Math.round((hours - h) * 60);
        return `${h}h ${m}m`;
    };

    return (
        <AuthShell
            eyebrow="Employee terminal"
            title={`Welcome, ${employee.name}`}
            description={clockStatus.isClockedIn ? `Clocked in for ${clockStatus.duration}` : 'You are currently clocked out.'}
        >
            <div className={`mb-5 flex items-center gap-3 rounded-xl border p-4 ${clockStatus.isClockedIn ? 'border-[var(--color-success)]/20 bg-[var(--color-success-bg)]' : 'border-[var(--color-border)] bg-[var(--color-surface)]'}`} role="status">
                <span className={`flex h-10 w-10 items-center justify-center rounded-full ${clockStatus.isClockedIn ? 'bg-[var(--color-success)] text-white' : 'bg-[var(--color-card)] text-[var(--color-muted)]'}`} aria-hidden="true">
                    <Clock3 size={20} />
                </span>
                <div>
                    <p className="text-sm font-semibold text-[var(--color-foreground)]">{clockStatus.isClockedIn ? 'Shift in progress' : 'Ready to start a shift'}</p>
                    <p className="text-xs text-[var(--color-muted)]">{clockStatus.isClockedIn ? clockStatus.duration : 'Clock in when you begin working.'}</p>
                </div>
            </div>

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
                    onClick={handleGoToPOS}
                    disabled={isProcessing}
                    className="min-h-16 w-full text-base"
                >
                    <ShoppingCart aria-hidden="true" />
                    Open register
                </Button>
            </div>

            <button
                onClick={handleLogout}
                className="mt-6 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg text-sm font-medium text-[var(--color-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-foreground)]"
            >
                <LogOut size={16} aria-hidden="true" /> Switch employee
            </button>

            {/* Clock In/Out Confirmation Modal */}
            <Modal
                isOpen={!!showConfirmation}
                onClose={handleConfirmationClose}
                title={showConfirmation?.type === 'in' ? 'Clocked in' : 'Clocked out'}
                size="sm"
            >
                <div className="py-5 text-center">
                    <CheckCircle2 size={56} className="mx-auto mb-4 text-[var(--color-success)]" aria-hidden="true" />
                    {showConfirmation?.type === 'in' ? (
                        <p className="mb-6 text-base text-[var(--color-muted)]">
                            You're now clocked in. Have a great shift!
                        </p>
                    ) : (
                        <>
                            <p className="mb-2 text-base text-[var(--color-muted)]">
                                You've been clocked out.
                            </p>
                            <p className="mb-6 font-display text-3xl tabular-nums text-[var(--color-primary)]">
                                Total: {formatHours(showConfirmation?.hours || 0)}
                            </p>
                        </>
                    )}
                    <Button onClick={handleConfirmationClose} size="lg">
                        Done
                    </Button>
                </div>
            </Modal>

            {/* Clock In Prompt Modal (when going to POS without clocking in) */}
            <Modal
                isOpen={showClockInPrompt}
                onClose={() => setShowClockInPrompt(false)}
                title="Clock In?"
                size="sm"
            >
                <div className="py-4 text-center">
                    <p className="mb-6 text-sm text-[var(--color-muted)]">
                        You're not currently clocked in. Would you like to clock in before going to the POS?
                    </p>
                    <div className="flex flex-col-reverse justify-center gap-3 sm:flex-row">
                        <Button
                            variant="secondary"
                            onClick={() => handleClockInPromptResponse(false)}
                            className="sm:min-w-28"
                        >
                            No
                        </Button>
                        <Button
                            onClick={() => handleClockInPromptResponse(true)}
                            className="sm:min-w-32"
                        >
                            Yes, Clock In
                        </Button>
                    </div>
                </div>
            </Modal>
        </AuthShell>
    );
}
