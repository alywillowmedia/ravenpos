// Clock Status Widget - Shows employee clock in/out status
// Always visible in employee interface header

import { useState } from 'react';
import { useEmployee } from '../../contexts/EmployeeContext';
import { formatTime } from '../../lib/timeCalculations';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

export function ClockStatusWidget() {
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

    return (
        <>
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '8px 16px',
                backgroundColor: clockStatus.isClockedIn ? 'rgba(34, 197, 94, 0.1)' : 'rgba(156, 163, 175, 0.1)',
                borderRadius: '8px',
                border: `1px solid ${clockStatus.isClockedIn ? 'rgba(34, 197, 94, 0.3)' : 'rgba(156, 163, 175, 0.3)'}`,
            }}>
                {/* Status indicator */}
                <div style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    backgroundColor: clockStatus.isClockedIn ? '#22c55e' : '#9ca3af',
                }} />

                {/* Status text */}
                <div style={{ flex: 1 }}>
                    {clockStatus.isClockedIn ? (
                        <div>
                            <div style={{ fontSize: '14px', fontWeight: 600, color: '#22c55e' }}>
                                Clocked In
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--color-gray-400)' }}>
                                Started: {formatTime(clockStatus.startTime!)} • {clockStatus.duration}
                            </div>
                        </div>
                    ) : (
                        <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--color-gray-400)' }}>
                            Not Clocked In
                        </div>
                    )}
                </div>

                {/* Action button */}
                {clockStatus.isClockedIn ? (
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setShowConfirm(true)}
                        disabled={isProcessing}
                    >
                        {isProcessing ? 'Processing...' : 'Clock Out'}
                    </Button>
                ) : (
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={handleClockIn}
                        disabled={isProcessing}
                    >
                        {isProcessing ? 'Processing...' : 'Clock In'}
                    </Button>
                )}
            </div>

            {/* Clock Out Confirmation Modal */}
            <Modal
                isOpen={showConfirm}
                onClose={() => setShowConfirm(false)}
                title="Clock Out"
            >
                <div style={{ padding: '16px' }}>
                    <p style={{ marginBottom: '16px', color: 'var(--color-muted)' }}>
                        Are you sure you want to clock out?
                    </p>
                    {clockStatus.startTime && (
                        <div style={{
                            padding: '12px',
                            backgroundColor: 'var(--color-surface)',
                            borderRadius: '8px',
                            marginBottom: '20px',
                            border: '1px solid var(--color-border)',
                        }}>
                            <div style={{ fontSize: '14px', color: 'var(--color-muted)' }}>
                                Time worked today
                            </div>
                            <div style={{ fontSize: '24px', fontWeight: 600, color: 'var(--color-primary)' }}>
                                {clockStatus.duration}
                            </div>
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                        <Button variant="secondary" onClick={() => setShowConfirm(false)}>
                            Cancel
                        </Button>
                        <Button variant="primary" onClick={handleClockOut} disabled={isProcessing}>
                            {isProcessing ? 'Processing...' : 'Clock Out'}
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Result Modal */}
            <Modal
                isOpen={!!result}
                onClose={() => setResult(null)}
                title="Clocked Out"
            >
                <div style={{ padding: '16px', textAlign: 'center' }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>✓</div>
                    <p style={{ fontSize: '18px', marginBottom: '8px', color: 'var(--color-foreground)' }}>
                        You worked
                    </p>
                    <p style={{ fontSize: '24px', fontWeight: 600, color: 'var(--color-primary)', marginBottom: '24px' }}>
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
