import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEmployee } from '../../contexts/EmployeeContext';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { ProfilePhotoUpload } from '../../components/ui/ProfilePhotoUpload';

type EmployeeAccountRow = {
    id: string;
    email: string;
    full_name: string | null;
    profile_image_url: string | null;
};

export function EmployeePinProfile() {
    const navigate = useNavigate();
    const { employee } = useEmployee();
    const { userRecord, user, refreshUserRecord } = useAuth();

    const [accountUserId, setAccountUserId] = useState<string | null>(null);
    const [accountEmail, setAccountEmail] = useState('');
    const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isLoadingAccount, setIsLoadingAccount] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const canEditLinkedAccount = useMemo(
        () => Boolean(userRecord?.id && accountUserId && userRecord.id === accountUserId),
        [accountUserId, userRecord?.id]
    );

    useEffect(() => {
        const loadAccount = async () => {
            setIsLoadingAccount(true);
            setMessage(null);

            if (!employee?.id) {
                setAccountUserId(null);
                setAccountEmail('');
                setProfileImageUrl(null);
                setIsLoadingAccount(false);
                return;
            }

            // If the current auth user already maps to an employee account, prefer it.
            if (userRecord?.id && (userRecord.employee_id === employee.id || userRecord.linked_employee_id === employee.id)) {
                setAccountUserId(userRecord.id);
                setAccountEmail(userRecord.email || user?.email || '');
                setProfileImageUrl(userRecord.profile_image_url ?? employee.profile_image_url ?? null);
                setIsLoadingAccount(false);
                return;
            }

            const { data, error } = await supabase
                .from('users')
                .select('id, email, full_name, profile_image_url')
                .or(`employee_id.eq.${employee.id},linked_employee_id.eq.${employee.id}`)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (error) {
                setAccountUserId(null);
                setAccountEmail('');
                setProfileImageUrl(employee.profile_image_url ?? null);
                setIsLoadingAccount(false);
                return;
            }

            const account = (data || null) as EmployeeAccountRow | null;
            setAccountUserId(account?.id ?? null);
            setAccountEmail(account?.email ?? '');
            setProfileImageUrl(account?.profile_image_url ?? employee.profile_image_url ?? null);
            setIsLoadingAccount(false);
        };

        void loadAccount();
    }, [employee?.id, refreshUserRecord, user?.email, userRecord]);

    const handleProfilePhotoChange = async (url: string | null) => {
        if (!accountUserId || !canEditLinkedAccount) {
            setMessage({
                type: 'error',
                text: 'Sign in through Employee Portal to update your profile photo.',
            });
            return;
        }

        setMessage(null);
        const { error } = await supabase
            .from('users')
            .update({ profile_image_url: url })
            .eq('id', accountUserId);

        if (error) {
            setMessage({ type: 'error', text: error.message });
            return;
        }

        setProfileImageUrl(url);
        await refreshUserRecord();
        setMessage({ type: 'success', text: 'Profile photo updated.' });
    };

    const handleSave = async (event: FormEvent) => {
        event.preventDefault();
        setMessage(null);

        if (!accountUserId || !canEditLinkedAccount) {
            setMessage({
                type: 'error',
                text: 'Use Employee Portal login to update email or password.',
            });
            return;
        }

        const trimmedEmail = accountEmail.trim().toLowerCase();
        const currentEmail = (userRecord?.email || user?.email || '').toLowerCase();
        const emailChanged = trimmedEmail.length > 0 && trimmedEmail !== currentEmail;
        const passwordChanged = newPassword.trim().length > 0;

        if (!trimmedEmail) {
            setMessage({ type: 'error', text: 'Email is required.' });
            return;
        }

        if (passwordChanged && newPassword !== confirmPassword) {
            setMessage({ type: 'error', text: 'Passwords do not match.' });
            return;
        }

        if (passwordChanged && newPassword.length < 6) {
            setMessage({ type: 'error', text: 'Password must be at least 6 characters.' });
            return;
        }

        if (!emailChanged && !passwordChanged) {
            setMessage({ type: 'error', text: 'No account changes to save.' });
            return;
        }

        setIsSaving(true);

        if (emailChanged) {
            const { error: authError } = await supabase.auth.updateUser({ email: trimmedEmail });
            if (authError) {
                setIsSaving(false);
                setMessage({ type: 'error', text: authError.message });
                return;
            }

            const { error: emailError } = await supabase
                .from('users')
                .update({ email: trimmedEmail })
                .eq('id', accountUserId);

            if (emailError) {
                setIsSaving(false);
                setMessage({ type: 'error', text: emailError.message });
                return;
            }
        }

        if (passwordChanged) {
            const { error: passwordError } = await supabase.auth.updateUser({ password: newPassword });
            if (passwordError) {
                setIsSaving(false);
                setMessage({ type: 'error', text: passwordError.message });
                return;
            }
        }

        await refreshUserRecord();
        setNewPassword('');
        setConfirmPassword('');
        setIsSaving(false);
        setMessage({
            type: 'success',
            text: emailChanged
                ? 'Account updated. Check your inbox if email confirmation is required.'
                : 'Account updated successfully.',
        });
    };

    const employeeName = employee?.name || userRecord?.full_name || 'Employee';

    return (
        <div className="max-w-3xl space-y-4">
            <div>
                <h1 className="text-2xl font-semibold text-[var(--color-foreground)]">Profile</h1>
                <p className="text-sm text-[var(--color-muted)]">
                    Manage your account details from the employee workspace.
                </p>
            </div>

            <Card variant="outlined">
                <CardHeader>
                    <CardTitle className="text-base">My Account</CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoadingAccount ? (
                        <p className="text-sm text-[var(--color-muted)]">Loading account details...</p>
                    ) : (
                        <>
                            {!canEditLinkedAccount && (
                                <div className="mb-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm text-[var(--color-muted)]">
                                    Email/password edits require your Employee Portal login.
                                    <div className="mt-2">
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            onClick={() => navigate('/employee/portal-login?email=1')}
                                        >
                                            Open Employee Portal Login
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {message && (
                                <div
                                    className={`mb-4 rounded-lg p-3 text-sm ${
                                        message.type === 'success'
                                            ? 'bg-[var(--color-success-bg)] text-[var(--color-success)]'
                                            : 'bg-[var(--color-danger-bg)] text-[var(--color-danger)]'
                                    }`}
                                >
                                    {message.text}
                                </div>
                            )}

                            <form onSubmit={handleSave} className="space-y-4">
                                <div>
                                    <p className="mb-2 text-sm font-medium text-[var(--color-foreground)]">Profile Photo</p>
                                    <ProfilePhotoUpload
                                        value={profileImageUrl}
                                        onChange={handleProfilePhotoChange}
                                        uploadKey={accountUserId || employee?.id || 'employee'}
                                        disabled={!canEditLinkedAccount || isSaving}
                                    />
                                </div>

                                <Input
                                    label="Name"
                                    value={employeeName}
                                    disabled
                                />

                                <Input
                                    label="Email"
                                    type="email"
                                    value={accountEmail}
                                    onChange={(event) => setAccountEmail(event.target.value)}
                                    placeholder="employee@example.com"
                                    autoComplete="email"
                                    disabled={!canEditLinkedAccount || isSaving}
                                />

                                <Input
                                    label="New Password"
                                    type="password"
                                    value={newPassword}
                                    onChange={(event) => setNewPassword(event.target.value)}
                                    placeholder="Leave blank to keep current password"
                                    autoComplete="new-password"
                                    disabled={!canEditLinkedAccount || isSaving}
                                />

                                <Input
                                    label="Confirm New Password"
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(event) => setConfirmPassword(event.target.value)}
                                    placeholder="Re-enter new password"
                                    autoComplete="new-password"
                                    disabled={!canEditLinkedAccount || isSaving}
                                />

                                <Button type="submit" isLoading={isSaving} disabled={!canEditLinkedAccount || isSaving}>
                                    Save Account
                                </Button>
                            </form>
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
