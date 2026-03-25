import { useState, useEffect, FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
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
        <div className="min-h-screen flex items-center justify-center bg-[var(--color-surface)] p-4">
            <div className="w-full max-w-md animate-fadeIn">
                <div className="text-center mb-8">
                    <img
                        src="./ravenpos_logo.svg"
                        alt="RavenPOS"
                        className="h-16 mx-auto mb-4"
                    />
                    <p className="text-[var(--color-muted)]">Employee portal sign in</p>
                </div>

                <Card variant="elevated">
                    <CardHeader>
                        <CardTitle>Employee Portal</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            {error && (
                                <div className="p-3 rounded-lg bg-[var(--color-danger-bg)] text-[var(--color-danger)] text-sm">
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
                                Sign In
                            </Button>
                        </form>
                    </CardContent>
                </Card>

                <div className="mt-8 pt-6 border-t border-[var(--color-border)] space-y-3">
                    <Link
                        to="/employee/login"
                        className="block w-full py-2.5 px-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors text-sm font-medium text-center"
                    >
                        Back to PIN Clock-In
                    </Link>
                    <Link
                        to="/login"
                        className="block text-center text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]"
                    >
                        Admin/Vendor sign in
                    </Link>
                </div>
            </div>
        </div>
    );
}
