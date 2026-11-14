// Clock Status Widget - Shows employee clock in/out status
// Always visible in the employee sidebar: a full card when the sidebar is open,
// a compact button when it is collapsed to its rail (as it always is on the register).

import { useState, type ReactNode } from 'react';
import { useEmployee } from '../../contexts/EmployeeContext';
import { formatTime } from '../../lib/timeCalculations';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { cn } from '../../lib/utils';
import { CheckCircle2, Clock3 } from 'lucide-react';

export function ClockStatusWidget({ compact = false }: { compact?: boolean }) {
    const { employee, clockStatus, clockIn, clockOut } = useEmployee();
    const [showConfirm, setShowConfirm] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [result, setResult] = useState<{ hoursWorked: number } | null>(null);

    if (!employee) return null;

    const handleClockIn = async () => {
        setIsProcessing(true);
        await clockIn();
        setIsProcessing(false);
    };

    const handleClockOut = async () => {
        setIsProcessing(true);
        const { success, hoursWorked } = await clockOut();
        setIsProcessing(false);

        if (success && hoursWorked !== null) {
            setResult({ hoursWorked });
        }
        setShowConfirm(false);
    };

    const formatHoursWorked = (hours: number): string => {
        const h = Math.floor(hours);
        const m = Math.round((hours - h) * 60);
        return `${h} hour${h !== 1 ? 's' : ''} ${m} minute${m !== 1 ? 's' : ''}`;
    };

    let trigger: ReactNode;
    if (compact) {
        const isClockedIn = clockStatus.isClockedIn;
        const status = isClockedIn
            ? `Clocked in since ${formatTime(clockStatus.startTime!)} (${clockStatus.duration})`
            : 'Not clocked in';
        trigger = (
            <button
                type="button"
                onClick={isClockedIn ? () => setShowConfirm(true) : handleClockIn}
                disabled={isProcessing}
                title={`${status}. ${isClockedIn ? 'Clock out' : 'Clock in'}`}
                aria-label={`${status}. ${isClockedIn ? 'Clock out' : 'Clock in'}`}
                className={cn(
                    'flex h-11 w-full items-center justify-center rounded-lg border transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                    isClockedIn
                        ? 'border-[var(--color-success)]/25 bg-[var(--color-success-bg)] text-[var(--color-success)] hover:brightness-95'
                        : 'border-transparent bg-[var(--color-primary)] text-[var(--color-primary-foreground)] hover:bg-[var(--color-primary-hover)]'
                )}
            >
                <span className="relative">
                    <Clock3 className="h-5 w-5" aria-hidden="true" />
                    {isClockedIn && (
                        <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-[var(--color-success)]" aria-hidden="true" />
                    )}
                </span>
            </button>
        );
    } else {
        // Full widget
        trigger = (
            <div className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${clockStatus.isClockedIn ? 'border-[var(--color-success)]/25 bg-[var(--color-success-bg)]' : 'border-[var(--color-border)] bg-[var(--color-surface)]'}`} role="status">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${clockStatus.isClockedIn ? 'bg-[var(--color-success)]' : 'bg-[var(--color-muted-foreground)]'}`} aria-hidden="true" />

                <div className="min-w-0 flex-1">
                    {clockStatus.isClockedIn ? (
                        <div>
                            <p className="text-sm font-semibold text-[var(--color-success)]">Clocked in</p>
                            <p className="truncate text-xs text-[var(--color-muted)]">Started {formatTime(clockStatus.startTime!)} · {clockStatus.duration}</p>
                        </div>
                    ) : (
                        <p className="text-sm font-medium text-[var(--color-muted)]">Not clocked in</p>
                    )}
                </div>

                {/* Action button */}
                {clockStatus.isClockedIn ? (
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setShowConfirm(true)}
                        disabled={isProcessing}
                        isLoading={isProcessing}
                    >
                        Clock out
                    </Button>
                ) : (
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={handleClockIn}
                        disabled={isProcessing}
                        isLoading={isProcessing}
                    >
                        Clock in
                    </Button>
                )}
            </div>
        );
    }

    return (
        <>
            {trigger}

            {/* Clock Out Confirmation Modal */}
            <Modal
                isOpen={showConfirm}
                onClose={() => setShowConfirm(false)}
                title="Clock out?"
                description="This closes the employee's current time entry."
                size="sm"
            >
                <div>
                    <p className="mb-4 text-sm text-[var(--color-muted)]">
                        Are you sure you want to clock out?
                    </p>
                    {clockStatus.startTime && (
                        <div className="mb-5 flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                            <Clock3 className="text-[var(--color-primary)]" size={22} aria-hidden="true" />
                            <div>
                                <p className="text-xs text-[var(--color-muted)]">Time worked today</p>
                                <p className="font-display text-2xl tabular-nums text-[var(--color-primary)]">{clockStatus.duration}</p>
                            </div>
                        </div>
                    )}
                    <div className="flex flex-col-reverse justify-end gap-2 sm:flex-row">
                        <Button variant="secondary" onClick={() => setShowConfirm(false)}>
                            Cancel
                        </Button>
                        <Button variant="primary" onClick={handleClockOut} disabled={isProcessing} isLoading={isProcessing}>
                            Clock out
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Result Modal */}
            <Modal
                isOpen={!!result}
                onClose={() => setResult(null)}
                title="Clocked out"
                size="sm"
            >
                <div className="py-4 text-center">
                    <CheckCircle2 size={52} className="mx-auto mb-4 text-[var(--color-success)]" aria-hidden="true" />
                    <p className="mb-1 text-base text-[var(--color-muted)]">
                        You worked
                    </p>
                    <p className="mb-6 font-display text-2xl text-[var(--color-primary)]">
                        {result && formatHoursWorked(result.hoursWorked)}
                    </p>
                    <Button variant="primary" onClick={() => setResult(null)}>
                        Done
                    </Button>
                </div>
            </Modal>
        </>
    );
}
