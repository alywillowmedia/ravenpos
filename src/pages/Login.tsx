import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';

export function Login() {
    const navigate = useNavigate();
    const { signIn, isLoading, userRecord } = useAuth();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // If already logged in, redirect based on role (in useEffect, not during render)
    useEffect(() => {
        if (!isLoading && userRecord) {
            const redirectPath = userRecord.role === 'admin' ? '/admin' : '/vendor';
            navigate(redirectPath, { replace: true });
        }
    }, [isLoading, userRecord, navigate]);

    // Show nothing while redirecting (already logged in)
    if (!isLoading && userRecord) {
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
        // Auth state change will trigger redirect via useEffect in auth context
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-[var(--color-surface)] p-4">
            <div className="w-full max-w-md animate-fadeIn">
                {/* Logo */}
                <div className="text-center mb-8">
                    <img
                        src="/ravenpos_logo.svg"
                        alt="RavenPOS"
                        className="h-16 mx-auto mb-4"
                    />
                    <p className="text-[var(--color-muted)]">
                        Sign in to your account
                    </p>
                </div>

                <Card variant="elevated">
                    <CardHeader>
                        <CardTitle>Welcome Back</CardTitle>
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
                                placeholder="you@example.com"
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

                <p className="text-center text-xs text-[var(--color-muted)] mt-6">
                    Contact your administrator if you need access
                </p>
            </div>
        </div>
    );
}
