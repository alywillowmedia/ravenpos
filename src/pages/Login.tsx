import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { AuthShell } from '../components/layout/AuthShell';

export function Login() {
    const navigate = useNavigate();
    const { signIn, isLoading, user, userRecord, resolveHomePath } = useAuth();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // If already logged in, redirect based on role (in useEffect, not during render)
    useEffect(() => {
        if (!isLoading && user && userRecord) {
            navigate(resolveHomePath(), { replace: true });
        }
    }, [isLoading, user, userRecord, navigate, resolveHomePath]);

    // Show nothing while redirecting (already logged in)
    if (!isLoading && user && userRecord) {
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
        <AuthShell
            eyebrow="Admin & vendor access"
            title="Welcome back"
            description="Sign in to manage the store, your vendor account, or both."
            footer={<span>Employee? Use the dedicated portal below for the right clock and permissions context.</span>}
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
                                Sign in
                            </Button>
                        </form>

                <div className="mt-5 border-t border-[var(--color-border)] pt-5">
                    <button
                        onClick={() => navigate('/employee/portal-login')}
                        className="min-h-11 w-full rounded-lg border border-[var(--color-input)] bg-[var(--color-surface)] px-4 py-2.5 text-sm font-medium text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-surface-hover)]"
                    >
                        Go to employee sign in
                    </button>
                </div>
        </AuthShell>
    );
}
