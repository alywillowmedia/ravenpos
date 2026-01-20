// Employee PIN Login Page
// Full-screen interface for employee clock-in

import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useEmployee } from '../../contexts/EmployeeContext';
import { NumberPad } from '../../components/employee/NumberPad';

export function EmployeeLogin() {
    const [pin, setPin] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [shake, setShake] = useState(false);
    const { employee, login, isLoading: contextLoading } = useEmployee();
    const navigate = useNavigate();

    // Redirect if already logged in
    useEffect(() => {
        if (employee && !contextLoading) {
            navigate('/employee/pos');
        }
    }, [employee, contextLoading, navigate]);

    const handleLogin = useCallback(async (pinValue: string) => {
        if (pinValue.length !== 4 || isLoading) return;

        setIsLoading(true);
        setError(null);

        const { success, error: loginError } = await login(pinValue);

        if (success) {
            navigate('/employee/pos');
        } else {
            setError(loginError || 'Invalid PIN');
            setShake(true);
            setPin('');
            setTimeout(() => setShake(false), 500);
        }

        setIsLoading(false);
    }, [isLoading, login, navigate]);

    const handleDigit = (digit: string) => {
        if (pin.length >= 4 || isLoading) return;

        const newPin = pin + digit;
        setPin(newPin);
        setError(null);

        // Auto-submit on 4 digits
        if (newPin.length === 4) {
            handleLogin(newPin);
        }
    };

    const handleClear = () => {
        setPin('');
        setError(null);
    };

    const handleBackspace = () => {
        setPin(prev => prev.slice(0, -1));
        setError(null);
    };

    // Keyboard support
    useEffect(() => {
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
    }, [pin, isLoading]);

    if (contextLoading) {
        return (
            <div style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'var(--color-gray-900)',
            }}>
                <div style={{ color: 'var(--color-gray-400)' }}>Loading...</div>
            </div>
        );
    }

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
            {/* Logo/Branding */}
            <div style={{ marginBottom: '40px', textAlign: 'center' }}>
                <h1 style={{
                    fontSize: '36px',
                    fontWeight: 700,
                    background: 'linear-gradient(135deg, var(--color-primary), #a855f7)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    marginBottom: '8px',
                }}>
                    Ravenlia
                </h1>
                <p style={{ color: 'var(--color-gray-400)', fontSize: '16px' }}>
                    Employee Clock In
                </p>
            </div>

            {/* PIN Display */}
            <div
                style={{
                    display: 'flex',
                    gap: '16px',
                    marginBottom: '32px',
                    animation: shake ? 'shake 0.5s ease-in-out' : 'none',
                }}
            >
                {[0, 1, 2, 3].map(i => (
                    <div
                        key={i}
                        style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            backgroundColor: pin.length > i
                                ? 'var(--color-primary)'
                                : 'var(--color-gray-700)',
                            transition: 'background-color 0.15s ease',
                        }}
                    />
                ))}
            </div>

            {/* Error Message */}
            {error && (
                <div style={{
                    color: '#ef4444',
                    fontSize: '14px',
                    marginBottom: '16px',
                    padding: '8px 16px',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    borderRadius: '8px',
                }}>
                    {error}
                </div>
            )}

            {/* Loading indicator */}
            {isLoading && (
                <div style={{
                    color: 'var(--color-primary)',
                    fontSize: '14px',
                    marginBottom: '16px',
                }}>
                    Verifying...
                </div>
            )}

            {/* Number Pad */}
            <NumberPad
                onDigit={handleDigit}
                onClear={handleClear}
                onBackspace={handleBackspace}
                disabled={isLoading}
            />

            {/* Link to admin/vendor login */}
            <div style={{ marginTop: '40px' }}>
                <Link
                    to="/login"
                    style={{
                        color: 'var(--color-gray-400)',
                        fontSize: '14px',
                        textDecoration: 'none',
                    }}
                >
                    Admin or Vendor? Sign in here →
                </Link>
            </div>

            {/* Shake animation styles */}
            <style>{`
                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    10%, 30%, 50%, 70%, 90% { transform: translateX(-10px); }
                    20%, 40%, 60%, 80% { transform: translateX(10px); }
                }
            `}</style>
        </div>
    );
}
