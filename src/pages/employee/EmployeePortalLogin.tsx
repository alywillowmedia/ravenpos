import { useState, useEffect, FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { AuthShell } from '../../components/layout/AuthShell';
import { isDeviceAuthorized } from '../../lib/deviceAuth';

export function EmployeePortalLogin() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { signIn, isLoading, user, userRecord, resolveHomePath } = useAuth();
    const [isCheckingDeviceAuth, setIsCheckingDeviceAuth] = useState(true);

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const forceEmailLogin = searchParams.get('email') === '1';

    useEffect(() => {
        if (!isLoading && user && userRecord) {
            navigate(resolveHomePath(), { replace: true });
        }
    }, [isLoading, user, userRecord, navigate, resolveHomePath]);

    useEffect(() => {
        const checkDeviceAndRouteDefault = async () => {
            if (forceEmailLogin || user) {
                setIsCheckingDeviceAuth(false);
                return;
            }

            const authorization = await isDeviceAuthorized();
            if (authorization.authorized) {
                navigate('/employee/login', { replace: true });
                return;
            }

            setIsCheckingDeviceAuth(false);
        };

        void checkDeviceAndRouteDefault();
    }, [forceEmailLogin, navigate, user]);

    if ((!isLoading && user && userRecord) || isCheckingDeviceAuth) {
        return null;
    }

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!email.trim() || !password.trim()) {
            setError('Please enter both email and password');
            return;
        }

        setIsSubmitting(true);
        const result = await signIn(email, password);
        setIsSubmitting(false);

        if (result.error) {
            setError(result.error);
        }
    };

    return (
        <AuthShell
            eyebrow="Employee access"
            title="Employee portal"
            description="Use your employee account when this device is not set up for PIN access."
        >
                        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                            {error && (
                                <div className="p-3 rounded-lg border border-[var(--color-danger)]/20 bg-[var(--color-danger-bg)] text-[var(--color-danger)] text-sm" role="alert">
                                    {error}
                                </div>
                            )}

                            <Input
                                label="Email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="employee@example.com"
                                autoComplete="email"
                                required
                            />

                            <Input
                                label="Password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                autoComplete="current-password"
                                required
                            />

                            <Button
                                type="submit"
                                className="w-full"
                                isLoading={isSubmitting}
                            >
                                Sign in
                            </Button>
                        </form>

                <div className="mt-5 border-t border-[var(--color-border)] pt-5 space-y-3">
                    <Link
                        to="/employee/login"
                        className="block min-h-11 w-full rounded-lg border border-[var(--color-input)] bg-[var(--color-surface)] px-4 py-2.5 text-center text-sm font-medium text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-surface-hover)]"
                    >
                        Back to PIN Clock-In
                    </Link>
                    <Link
                        to="/login"
                        className="block min-h-11 py-3 text-center text-sm text-[var(--color-muted)] hover:text-[var(--color-foreground)]"
                    >
                        Admin/Vendor sign in
                    </Link>
                </div>
        </AuthShell>
    );
}
