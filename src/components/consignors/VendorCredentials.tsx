import { useState, useEffect } from 'react';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { supabase } from '../../lib/supabase';

interface VendorCredentialsProps {
    consignorId: string;
    consignorEmail?: string;
}

interface ExistingUser {
    id: string;
    email: string;
    created_at: string;
}

export function VendorCredentials({ consignorId, consignorEmail }: VendorCredentialsProps) {
    const [existingUser, setExistingUser] = useState<ExistingUser | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Form fields
    const [email, setEmail] = useState(consignorEmail || '');
    const [password, setPassword] = useState('');

    // Check if user exists for this consignor
    useEffect(() => {
        const checkExistingUser = async () => {
            try {
                const { data, error } = await supabase
                    .from('users')
                    .select('id, email, created_at')
                    .eq('consignor_id', consignorId)
                    .maybeSingle();

                if (!error && data) {
                    setExistingUser(data);
                    setEmail(data.email);
                }
            } catch {
                // Ignore errors - user just doesn't exist
            }
            setIsLoading(false);
        };

        checkExistingUser();
    }, [consignorId]);

    const callEdgeFunction = async (body: object) => {
        const { data, error } = await supabase.functions.invoke('manage-vendor', {
            body,
        });

        if (error) {
            throw new Error(error.message || 'Request failed');
        }

        if (data?.error) {
            throw new Error(data.error);
        }

        return data;
    };

    const handleCreateLogin = async () => {
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
            const result = await callEdgeFunction({
                action: 'create',
                email,
                password,
                consignorId,
            });

            setExistingUser({
                id: result.user.id,
                email: result.user.email,
                created_at: result.user.created_at,
            });

            setPassword('');
            setMessage({ type: 'success', text: 'Vendor login created successfully!' });
        } catch (err) {
            setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to create login' });
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
            await callEdgeFunction({
                action: 'update_password',
                userId: existingUser.id,
                password,
            });

            setPassword('');
            setMessage({ type: 'success', text: 'Password updated successfully!' });
        } catch (err) {
            setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to update password' });
        }

        setIsProcessing(false);
    };

    const handleRemoveLogin = async () => {
        if (!existingUser) return;
        if (!confirm('Are you sure you want to remove this vendor login? This cannot be undone.')) return;

        setMessage(null);
        setIsProcessing(true);

        try {
            await callEdgeFunction({
                action: 'delete',
                userId: existingUser.id,
            });

            setExistingUser(null);
            setEmail(consignorEmail || '');
            setPassword('');
            setMessage({ type: 'success', text: 'Vendor login removed successfully!' });
        } catch (err) {
            setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to remove login' });
        }

        setIsProcessing(false);
    };

    if (isLoading) {
        return (
            <Card variant="outlined" className="mt-6">
                <CardContent className="p-4 text-center text-[var(--color-muted)]">
                    Loading credentials...
                </CardContent>
            </Card>
        );
    }

    return (
        <Card variant="outlined" className="mt-6">
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-sm">Vendor Portal Access</CardTitle>
                {existingUser && (
                    <Badge variant="success">Login Exists</Badge>
                )}
            </CardHeader>
            <CardContent className="space-y-4">
                {message && (
                    <div
                        className={`p-3 rounded-lg text-sm ${message.type === 'success'
                            ? 'bg-[var(--color-success-bg)] text-[var(--color-success)]'
                            : 'bg-[var(--color-danger-bg)] text-[var(--color-danger)]'
                            }`}
                    >
                        {message.text}
                    </div>
                )}

                {existingUser ? (
                    <>
                        <div className="text-sm">
                            <p className="text-[var(--color-muted)]">Current login email:</p>
                            <p className="font-medium">{existingUser.email}</p>
                        </div>

                        <Input
                            label="New Password"
                            type="text"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Enter new password"
                            hint="Visible so you can share with vendor"
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
                                onClick={handleRemoveLogin}
                                isLoading={isProcessing}
                                className="text-[var(--color-danger)]"
                            >
                                Remove Login
                            </Button>
                        </div>
                    </>
                ) : (
                    <>
                        <p className="text-sm text-[var(--color-muted)]">
                            Create a login so this consignor can access the vendor portal to view their inventory and sales.
                        </p>

                        <Input
                            label="Login Email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="vendor@example.com"
                        />

                        <Input
                            label="Password"
                            type="text"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Create a password"
                            hint="Visible so you can share with vendor (min 6 characters)"
                        />

                        <Button
                            type="button"
                            onClick={handleCreateLogin}
                            isLoading={isProcessing}
                        >
                            Create Vendor Login
                        </Button>
                    </>
                )}
            </CardContent>
        </Card>
    );
}
