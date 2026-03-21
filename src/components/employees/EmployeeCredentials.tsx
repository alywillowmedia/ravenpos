import { useEffect, useState } from 'react';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import { supabase } from '../../lib/supabase';

interface EmployeeCredentialsProps {
    employeeId: string;
    employeeName: string;
}

interface ExistingEmployeeUser {
    id: string;
    email: string;
    created_at: string;
    role: 'employee' | 'vendor' | 'admin';
}

export function EmployeeCredentials({ employeeId, employeeName }: EmployeeCredentialsProps) {
    const [existingUser, setExistingUser] = useState<ExistingEmployeeUser | null>(null);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [emailConflictChoice, setEmailConflictChoice] = useState<{ id: string; email: string; role: 'vendor' | 'admin' } | null>(null);

    useEffect(() => {
        const loadExisting = async () => {
            setIsLoading(true);
            const { data } = await supabase
                .from('users')
                .select('id, email, created_at, role')
                .or(`and(role.eq.employee,employee_id.eq.${employeeId}),and(role.in.(vendor,admin),linked_employee_id.eq.${employeeId})`)
                .maybeSingle();

            if (data) {
                setExistingUser(data);
                setEmail(data.email);
            } else {
                setExistingUser(null);
                setEmail('');
            }

            setPassword('');
            setIsLoading(false);
        };

        void loadExisting();
    }, [employeeId]);

    const callFunction = async (body: object) => {
        const invoke = () => supabase.functions.invoke('manage-employee-account', { body });

        let { data, error } = await invoke();

        // Session can occasionally go stale between account-management calls.
        // If we receive 401, refresh once and retry.
        if (error instanceof FunctionsHttpError && error.context.status === 401) {
            const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
            if (!refreshError && refreshData.session) {
                const retry = await invoke();
                data = retry.data;
                error = retry.error;
            }
        }

        if (error) {
            if (error instanceof FunctionsHttpError) {
                try {
                    const payload = await error.context.clone().json();
                    if (payload?.error) {
                        throw new Error(payload.error);
                    }
                } catch {
                    try {
                        const text = await error.context.clone().text();
                        if (text) {
                            throw new Error(text);
                        }
                    } catch {
                        // Ignore and fall through to default error.
                    }
                }
            }
            throw new Error(error.message || 'Request failed');
        }

        if (data?.error) {
            throw new Error(data.error);
        }

        return data;
    };

    const handleCreate = async () => {
        setMessage(null);

        if (!email.trim()) {
            setMessage({ type: 'error', text: 'Email is required' });
            return;
        }

        if (!password.trim() || password.length < 6) {
            setMessage({ type: 'error', text: 'Password must be at least 6 characters' });
            return;
        }

        setIsProcessing(true);

        try {
            const result = await callFunction({
                action: 'create',
                employeeId,
                email,
                password,
            });

            if (result?.requiresChoice && result?.existingUser) {
                setEmailConflictChoice(result.existingUser);
                setIsProcessing(false);
                return;
            }

            setExistingUser({
                id: result.user.id,
                email: result.user.email,
                created_at: result.user.created_at,
                role: result.user.role ?? 'employee',
            });
            setEmail(result.user.email);
            setPassword('');
            const successText = result.linkedExistingLogin
                ? 'Employee portal access linked to existing login.'
                : 'Employee portal login created.';
            setMessage({ type: 'success', text: successText });
        } catch (err) {
            setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to create login' });
        }

        setIsProcessing(false);
    };

    const handleUseExistingLogin = async () => {
        if (!emailConflictChoice) return;

        setMessage(null);
        setIsProcessing(true);

        try {
            const result = await callFunction({
                action: 'create',
                employeeId,
                email,
                password,
                useExistingLogin: true,
            });

            setExistingUser({
                id: result.user.id,
                email: result.user.email,
                created_at: result.user.created_at || new Date().toISOString(),
                role: result.user.role ?? emailConflictChoice.role,
            });
            setEmail(result.user.email);
            setPassword('');
            setEmailConflictChoice(null);
            setMessage({ type: 'success', text: 'Employee portal access linked to existing login.' });
        } catch (err) {
            setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to link login' });
        }

        setIsProcessing(false);
    };

    const handleUpdatePassword = async () => {
        if (!existingUser) return;
        setMessage(null);

        if (!password.trim() || password.length < 6) {
            setMessage({ type: 'error', text: 'Password must be at least 6 characters' });
            return;
        }

        setIsProcessing(true);

        try {
            await callFunction({
                action: 'update_password',
                userId: existingUser.id,
                password,
            });
            setPassword('');
            setMessage({ type: 'success', text: 'Password updated.' });
        } catch (err) {
            setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to update password' });
        }

        setIsProcessing(false);
    };

    const handleRemove = async () => {
        if (!existingUser) return;
        if (!confirm(`Remove portal login for ${employeeName}?`)) return;

        setMessage(null);
        setIsProcessing(true);

        try {
            await callFunction({
                action: 'delete',
                userId: existingUser.id,
                employeeId,
            });
            setExistingUser(null);
            setPassword('');
            setEmail('');
            setMessage({ type: 'success', text: 'Employee portal login removed.' });
        } catch (err) {
            setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to remove login' });
        }

        setIsProcessing(false);
    };

    if (isLoading) {
        return (
            <Card variant="outlined">
                <CardContent className="py-4 text-center text-sm text-[var(--color-muted)]">
                    Loading portal credentials...
                </CardContent>
            </Card>
        );
    }

    return (
        <Card variant="outlined">
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-sm">Employee Portal Access</CardTitle>
                {existingUser && <Badge variant="success">Login Exists</Badge>}
            </CardHeader>
            <CardContent className="space-y-4">
                {message && (
                    <div className={`p-3 rounded-lg text-sm ${message.type === 'success'
                        ? 'bg-[var(--color-success-bg)] text-[var(--color-success)]'
                        : 'bg-[var(--color-danger-bg)] text-[var(--color-danger)]'
                        }`}>
                        {message.text}
                    </div>
                )}

                {existingUser ? (
                    <>
                        <div className="text-sm">
                            <p className="text-[var(--color-muted)]">Current login email:</p>
                            <p className="font-medium">{existingUser.email}</p>
                            {existingUser.role !== 'employee' && (
                                <p className="text-xs text-[var(--color-muted)] mt-1">
                                    Shared with existing {existingUser.role} login
                                </p>
                            )}
                        </div>

                        <Input
                            label="New Password"
                            type="text"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Enter new password"
                            hint={existingUser.role === 'employee'
                                ? 'Visible so you can share with employee'
                                : 'This updates the shared login password for both portals'}
                        />

                        <div className="flex gap-3">
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={handleUpdatePassword}
                                isLoading={isProcessing}
                            >
                                Update Password
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={handleRemove}
                                isLoading={isProcessing}
                                className="text-[var(--color-danger)]"
                            >
                                {existingUser.role === 'employee' ? 'Remove Login' : 'Remove Employee Access'}
                            </Button>
                        </div>
                    </>
                ) : (
                    <>
                        <p className="text-sm text-[var(--color-muted)]">
                            Create a login so this employee can view schedule, hours worked, and estimated pay remotely.
                        </p>

                        <Input
                            label="Login Email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="employee@example.com"
                        />

                        <Input
                            label="Password"
                            type="text"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Create a password"
                            hint="Visible so you can share with employee (min 6 characters)"
                        />

                        <Button
                            type="button"
                            onClick={handleCreate}
                            isLoading={isProcessing}
                        >
                            Create Employee Login
                        </Button>
                    </>
                )}
            </CardContent>
            <Modal
                isOpen={!!emailConflictChoice}
                onClose={() => setEmailConflictChoice(null)}
                title="Email Already Exists"
                size="md"
            >
                <div className="space-y-4">
                    <p className="text-sm text-[var(--color-muted)]">
                        This email already exists as a {emailConflictChoice?.role}. Do you want to use the same login for this employee portal account, or use a different email?
                    </p>
                    <div className="flex gap-3 pt-2">
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={handleUseExistingLogin}
                            isLoading={isProcessing}
                            className="flex-1"
                        >
                            Use Same Login
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => setEmailConflictChoice(null)}
                            className="flex-1"
                        >
                            Use Different Email
                        </Button>
                    </div>
                </div>
            </Modal>
        </Card>
    );
}
