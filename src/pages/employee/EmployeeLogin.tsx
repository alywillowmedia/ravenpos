// Employee PIN Login Page
// Full-screen interface for employee clock-in
// Requires device authorization before showing PIN pad

import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useEmployee } from '../../contexts/EmployeeContext';
import { NumberPad } from '../../components/employee/NumberPad';
import { isDeviceAuthorized } from '../../lib/deviceAuth';

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
    }, [pin, isLoading, isAuthorized]);

    // Loading state while checking authorization
    if (contextLoading || isCheckingAuth) {
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

    // Device not authorized - show message
    if (!isAuthorized) {
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
                {/* Lock Icon */}
                <div style={{
                    fontSize: '64px',
                    marginBottom: '24px',
                }}>
                    🔒
                </div>

                {/* Message */}
                <h1 style={{
                    fontSize: '24px',
                    fontWeight: 600,
                    color: 'var(--color-gray-100)',
                    marginBottom: '12px',
                    textAlign: 'center',
                }}>
                    Device Not Authorized
                </h1>
                <p style={{
                    color: 'var(--color-gray-400)',
                    fontSize: '16px',
                    textAlign: 'center',
                    maxWidth: '400px',
                    marginBottom: '32px',
                    lineHeight: 1.5,
                }}>
                    This device needs to be authorized by an administrator before employees can clock in.
                    Please contact your manager or log in as an admin to authorize this device.
                </p>

                {/* Admin Login Link */}
                <Link
                    to="/login"
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '12px 24px',
                        backgroundColor: 'var(--color-primary)',
                        color: 'white',
                        borderRadius: '8px',
                        textDecoration: 'none',
                        fontWeight: 500,
                        transition: 'opacity 0.15s ease',
                    }}
                >
                    Admin Login →
                </Link>

                <p style={{
                    color: 'var(--color-gray-500)',
                    fontSize: '12px',
                    marginTop: '24px',
                    textAlign: 'center',
                }}>
                    Go to Employees → Authorize Device to enable this terminal
                </p>
            </div>
        );
    }

    // Device is authorized - show PIN pad
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
                {expiresAt && (
                    <p style={{
                        color: 'var(--color-gray-500)',
                        fontSize: '12px',
                        marginTop: '8px',
                    }}>
                        Device authorized until {new Date(expiresAt).toLocaleDateString()}
                    </p>
                )}
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
