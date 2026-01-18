import { useState, useEffect, FormEvent } from 'react';
import { Header } from '../../components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import type { Consignor } from '../../types';

export function VendorProfile() {
    const { userRecord } = useAuth();
    const [consignor, setConsignor] = useState<Consignor | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Editable fields
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [address, setAddress] = useState('');

    // Password change
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isChangingPassword, setIsChangingPassword] = useState(false);

    useEffect(() => {
        const fetchConsignor = async () => {
            if (!userRecord?.consignor_id) return;

            const { data } = await supabase
                .from('consignors')
                .select('*')
                .eq('id', userRecord.consignor_id)
                .single();

            if (data) {
                setConsignor(data);
                setEmail(data.email || '');
                setPhone(data.phone || '');
                setAddress(data.address || '');
            }

            setIsLoading(false);
        };

        fetchConsignor();
    }, [userRecord?.consignor_id]);

    const handleSaveContact = async (e: FormEvent) => {
        e.preventDefault();
        setMessage(null);
        setIsSaving(true);

        const { error } = await supabase
            .from('consignors')
            .update({ email, phone, address })
            .eq('id', userRecord?.consignor_id);

        setIsSaving(false);

        if (error) {
            setMessage({ type: 'error', text: error.message });
        } else {
            setMessage({ type: 'success', text: 'Contact info updated!' });
        }
    };

    const handleChangePassword = async (e: FormEvent) => {
        e.preventDefault();
        setMessage(null);

        if (newPassword !== confirmPassword) {
            setMessage({ type: 'error', text: 'Passwords do not match' });
            return;
        }

        if (newPassword.length < 6) {
            setMessage({ type: 'error', text: 'Password must be at least 6 characters' });
            return;
        }

        setIsChangingPassword(true);

        const { error } = await supabase.auth.updateUser({
            password: newPassword,
        });

        setIsChangingPassword(false);

        if (error) {
            setMessage({ type: 'error', text: error.message });
        } else {
            setMessage({ type: 'success', text: 'Password changed successfully!' });
            setNewPassword('');
            setConfirmPassword('');
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-96">
                <LoadingSpinner size={32} />
            </div>
        );
    }

    return (
        <div className="animate-fadeIn max-w-2xl">
            <Header
                title="My Profile"
                description="View and update your account information"
            />

            {message && (
                <div
                    className={`mb-6 p-3 rounded-lg text-sm ${message.type === 'success'
                            ? 'bg-[var(--color-success-bg)] text-[var(--color-success)]'
                            : 'bg-[var(--color-danger-bg)] text-[var(--color-danger)]'
                        }`}
                >
                    {message.text}
                </div>
            )}

            {/* Account Info (Read-only) */}
            <Card variant="outlined" className="mb-6">
                <CardHeader>
                    <CardTitle className="text-sm">Account Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <p className="text-xs text-[var(--color-muted)] uppercase">Name</p>
                            <p className="font-medium">{consignor?.name}</p>
                        </div>
                        <div>
                            <p className="text-xs text-[var(--color-muted)] uppercase">Consignor ID</p>
                            <p className="font-mono">{consignor?.consignor_number}</p>
                        </div>
                        <div>
                            <p className="text-xs text-[var(--color-muted)] uppercase">Booth Location</p>
                            <p>{consignor?.booth_location || '—'}</p>
                        </div>
                        <div>
                            <p className="text-xs text-[var(--color-muted)] uppercase">Commission Split</p>
                            <p>{Math.round(Number(consignor?.commission_split || 0) * 100)}%</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Editable Contact Info */}
            <Card variant="outlined" className="mb-6">
                <CardHeader>
                    <CardTitle className="text-sm">Contact Information</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSaveContact} className="space-y-4">
                        <Input
                            label="Email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="your@email.com"
                        />
                        <Input
                            label="Phone"
                            type="tel"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            placeholder="(555) 123-4567"
                        />
                        <Input
                            label="Address"
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
                            placeholder="123 Main St, City, State"
                        />
                        <div className="pt-2">
                            <Button type="submit" isLoading={isSaving}>
                                Save Contact Info
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>

            {/* Change Password */}
            <Card variant="outlined">
                <CardHeader>
                    <CardTitle className="text-sm">Change Password</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleChangePassword} className="space-y-4">
                        <Input
                            label="New Password"
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="••••••••"
                            autoComplete="new-password"
                        />
                        <Input
                            label="Confirm Password"
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="••••••••"
                            autoComplete="new-password"
                        />
                        <div className="pt-2">
                            <Button type="submit" variant="secondary" isLoading={isChangingPassword}>
                                Change Password
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
