// Employee Action Selection Page
// Shown after PIN entry - allows choosing between clock in/out and POS access

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEmployee } from '../../contexts/EmployeeContext';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';

export function EmployeeActionSelection() {
    const navigate = useNavigate();
    const { employee, clockStatus, clockIn, clockOut, logout } = useEmployee();
    const [isProcessing, setIsProcessing] = useState(false);
    const [showConfirmation, setShowConfirmation] = useState<{ type: 'in' | 'out'; hours?: number } | null>(null);
    const [showClockInPrompt, setShowClockInPrompt] = useState(false);

    // Redirect if not logged in
    if (!employee) {
        navigate('/employee/login');
        return null;
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
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'var(--color-gray-900)',
            padding: '20px',
        }}>
            {/* Header */}
            <div style={{ marginBottom: '48px', textAlign: 'center' }}>
                <h1 style={{
                    fontSize: '36px',
                    fontWeight: 700,
                    background: 'linear-gradient(135deg, var(--color-primary), #a855f7)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    marginBottom: '8px',
                }}>
                    Welcome, {employee.name}
                </h1>
                <p style={{ color: 'var(--color-gray-400)', fontSize: '16px' }}>
                    {clockStatus.isClockedIn
                        ? `Clocked in for ${clockStatus.duration}`
                        : 'Currently clocked out'
                    }
                </p>
            </div>

            {/* Action Buttons */}
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                width: '100%',
                maxWidth: '320px',
            }}>
                <Button
                    size="xl"
                    onClick={handleClockAction}
                    isLoading={isProcessing}
                    style={{
                        width: '100%',
                        padding: '20px',
                        fontSize: '18px',
                        backgroundColor: clockStatus.isClockedIn
                            ? 'var(--color-warning)'
                            : 'var(--color-success)',
                    }}
                >
                    {clockStatus.isClockedIn ? '⏱ Clock Out' : '⏱ Clock In'}
                </Button>

                <Button
                    size="xl"
                    variant="secondary"
                    onClick={handleGoToPOS}
                    disabled={isProcessing}
                    style={{
                        width: '100%',
                        padding: '20px',
                        fontSize: '18px',
                    }}
                >
                    🛒 Go to POS
                </Button>
            </div>

            {/* Logout link */}
            <button
                onClick={handleLogout}
                style={{
                    marginTop: '48px',
                    color: 'var(--color-gray-400)',
                    fontSize: '14px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                }}
            >
                Switch Employee
            </button>

            {/* Clock In/Out Confirmation Modal */}
            <Modal
                isOpen={!!showConfirmation}
                onClose={handleConfirmationClose}
                title={showConfirmation?.type === 'in' ? 'Clocked In!' : 'Clocked Out!'}
                size="sm"
            >
                <div style={{ textAlign: 'center', padding: '24px 0' }}>
                    <div style={{ fontSize: '64px', marginBottom: '16px' }}>
                        {showConfirmation?.type === 'in' ? '✓' : '👋'}
                    </div>
                    {showConfirmation?.type === 'in' ? (
                        <p style={{ fontSize: '18px', marginBottom: '24px' }}>
                            You're now clocked in. Have a great shift!
                        </p>
                    ) : (
                        <>
                            <p style={{ fontSize: '18px', marginBottom: '8px' }}>
                                You've been clocked out.
                            </p>
                            <p style={{
                                fontSize: '24px',
                                fontWeight: 'bold',
                                color: 'var(--color-primary)',
                                marginBottom: '24px'
                            }}>
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
                <div style={{ textAlign: 'center', padding: '24px 0' }}>
                    <p style={{ fontSize: '16px', marginBottom: '24px', color: 'var(--color-gray-300)' }}>
                        You're not currently clocked in. Would you like to clock in before going to the POS?
                    </p>
                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                        <Button
                            variant="secondary"
                            onClick={() => handleClockInPromptResponse(false)}
                            style={{ minWidth: '100px' }}
                        >
                            No
                        </Button>
                        <Button
                            onClick={() => handleClockInPromptResponse(true)}
                            style={{ minWidth: '100px' }}
                        >
                            Yes, Clock In
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
