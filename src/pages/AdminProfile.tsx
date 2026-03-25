import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Header } from '../components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Input, Textarea } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { ImageUpload } from '../components/ui/ImageUpload';
import { ProfilePhotoUpload } from '../components/ui/ProfilePhotoUpload';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
    DEFAULT_PUBLIC_STOREFRONT_SETTINGS,
    normalizePublicStorefrontSettings,
    type PublicStorefrontSettings,
} from '../lib/publicStorefrontSettings';

interface AdminRow {
    id: string;
    email: string;
    full_name: string | null;
    created_at: string;
}

export function AdminProfile() {
    const { user, session, userRecord, refreshUserRecord } = useAuth();
    const [admins, setAdmins] = useState<AdminRow[]>([]);
    const [isLoadingAdmins, setIsLoadingAdmins] = useState(true);
    const [profileMessage, setProfileMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [adminMessage, setAdminMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [isSavingProfile, setIsSavingProfile] = useState(false);
    const [isCreatingAdmin, setIsCreatingAdmin] = useState(false);
    const [isLoadingHomeSettings, setIsLoadingHomeSettings] = useState(true);
    const [isSavingHomeSettings, setIsSavingHomeSettings] = useState(false);

    const [profileName, setProfileName] = useState('');
    const [profileEmail, setProfileEmail] = useState('');
    const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const [createName, setCreateName] = useState('');
    const [createEmail, setCreateEmail] = useState('');
    const [createPassword, setCreatePassword] = useState('');
    const [homeSettings, setHomeSettings] = useState<PublicStorefrontSettings>(DEFAULT_PUBLIC_STOREFRONT_SETTINGS);
    const [homeMessage, setHomeMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const fetchAdmins = useCallback(async () => {
        setIsLoadingAdmins(true);
        const { data, error } = await supabase
            .from('users')
            .select('id, email, full_name, created_at')
            .eq('role', 'admin')
            .order('email', { ascending: true });

        if (error) {
            setAdminMessage({ type: 'error', text: error.message });
            setAdmins([]);
        } else {
            setAdmins((data ?? []) as AdminRow[]);
        }
        setIsLoadingAdmins(false);
    }, []);

    const fetchHomeSettings = useCallback(async () => {
        setIsLoadingHomeSettings(true);
        const { data, error } = await supabase
            .from('storefront_home_settings')
            .select(`
                store_name,
                hero_badge_text,
                hero_heading,
                hero_subheading,
                hero_body,
                hero_search_placeholder,
                hero_primary_cta_label,
                hero_primary_cta_href,
                hero_background_image_url,
                hero_feature_image_url,
                hero_accent_image_url
            `)
            .eq('id', true)
            .maybeSingle();

        if (error) {
            setHomeMessage({ type: 'error', text: error.message });
            setHomeSettings(DEFAULT_PUBLIC_STOREFRONT_SETTINGS);
        } else {
            setHomeSettings(normalizePublicStorefrontSettings(data));
        }

        setIsLoadingHomeSettings(false);
    }, []);

    useEffect(() => {
        setProfileName(userRecord?.full_name ?? '');
        setProfileEmail(userRecord?.email ?? user?.email ?? '');
        setProfileImageUrl(userRecord?.profile_image_url ?? null);
    }, [userRecord?.full_name, userRecord?.email, userRecord?.profile_image_url, user?.email]);

    const handleProfilePhotoChange = useCallback(async (url: string | null) => {
        if (!userRecord?.id) return;

        setProfileMessage(null);
        const { error } = await supabase
            .from('users')
            .update({ profile_image_url: url })
            .eq('id', userRecord.id);

        if (error) {
            setProfileMessage({ type: 'error', text: error.message });
            return;
        }

        setProfileImageUrl(url);
        await refreshUserRecord();
        setProfileMessage({ type: 'success', text: 'Profile photo updated.' });
    }, [refreshUserRecord, userRecord?.id]);

    useEffect(() => {
        void fetchAdmins();
    }, [fetchAdmins]);

    useEffect(() => {
        void fetchHomeSettings();
    }, [fetchHomeSettings]);

    const callManageAdmin = async (body: object) => {
        const headers: Record<string, string> = {};
        if (session?.access_token) {
            headers.Authorization = `Bearer ${session.access_token}`;
        }

        const { data, error } = await supabase.functions.invoke('manage-admin', {
            body,
            headers
        });
        if (error) {
            throw new Error(error.message || 'Request failed');
        }
        if (data?.error) {
            throw new Error(data.error);
        }
        return data;
    };

    const handleSaveProfile = async (e: FormEvent) => {
        e.preventDefault();
        setProfileMessage(null);

        const trimmedName = profileName.trim();
        const trimmedEmail = profileEmail.trim().toLowerCase();
        const baseName = userRecord?.full_name ?? '';
        const baseEmail = (userRecord?.email ?? user?.email ?? '').toLowerCase();
        const nameChanged = trimmedName !== baseName;
        const emailChanged = trimmedEmail !== baseEmail;
        const passwordChanged = newPassword.trim().length > 0;

        if (!trimmedEmail) {
            setProfileMessage({ type: 'error', text: 'Email is required.' });
            return;
        }

        if (passwordChanged && newPassword !== confirmPassword) {
            setProfileMessage({ type: 'error', text: 'Passwords do not match.' });
            return;
        }

        if (passwordChanged && newPassword.length < 6) {
            setProfileMessage({ type: 'error', text: 'Password must be at least 6 characters.' });
            return;
        }

        if (!nameChanged && !emailChanged && !passwordChanged) {
            setProfileMessage({ type: 'error', text: 'No changes to save.' });
            return;
        }

        setIsSavingProfile(true);
        try {
            await callManageAdmin({
                action: 'update_profile',
                fullName: nameChanged ? trimmedName : undefined,
                email: emailChanged ? trimmedEmail : undefined,
                password: passwordChanged ? newPassword : undefined
            });

            setNewPassword('');
            setConfirmPassword('');
            await refreshUserRecord();
            await fetchAdmins();
            setProfileMessage({ type: 'success', text: 'Profile updated successfully.' });
        } catch (err) {
            setProfileMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to update profile.' });
        } finally {
            setIsSavingProfile(false);
        }
    };

    const handleCreateAdmin = async (e: FormEvent) => {
        e.preventDefault();
        setAdminMessage(null);

        const email = createEmail.trim().toLowerCase();
        const password = createPassword.trim();
        const fullName = createName.trim();

        if (!email) {
            setAdminMessage({ type: 'error', text: 'Email is required.' });
            return;
        }

        if (password.length < 6) {
            setAdminMessage({ type: 'error', text: 'Password must be at least 6 characters.' });
            return;
        }

        setIsCreatingAdmin(true);
        try {
            await callManageAdmin({
                action: 'create_admin',
                email,
                password,
                fullName: fullName || undefined
            });

            setCreateName('');
            setCreateEmail('');
            setCreatePassword('');
            await fetchAdmins();
            setAdminMessage({ type: 'success', text: 'Admin account created.' });
        } catch (err) {
            setAdminMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to create admin account.' });
        } finally {
            setIsCreatingAdmin(false);
        }
    };

    const handleSaveHomeSettings = async (e: FormEvent) => {
        e.preventDefault();
        setHomeMessage(null);
        setIsSavingHomeSettings(true);

        const payload = {
            id: true,
            store_name: homeSettings.store_name.trim().slice(0, 120),
            hero_badge_text: homeSettings.hero_badge_text.trim().slice(0, 80),
            hero_heading: homeSettings.hero_heading.trim().slice(0, 120),
            hero_subheading: homeSettings.hero_subheading.trim().slice(0, 240),
            hero_body: homeSettings.hero_body.trim().slice(0, 500),
            hero_search_placeholder: homeSettings.hero_search_placeholder.trim().slice(0, 120),
            hero_primary_cta_label: homeSettings.hero_primary_cta_label?.trim().slice(0, 40) || null,
            hero_primary_cta_href: homeSettings.hero_primary_cta_href?.trim().slice(0, 240) || null,
            hero_background_image_url: homeSettings.hero_background_image_url,
            hero_feature_image_url: homeSettings.hero_feature_image_url,
            hero_accent_image_url: homeSettings.hero_accent_image_url,
        };

        if (!payload.hero_heading) {
            setHomeMessage({ type: 'error', text: 'Hero heading is required.' });
            setIsSavingHomeSettings(false);
            return;
        }

        if (!payload.hero_subheading) {
            setHomeMessage({ type: 'error', text: 'Hero subheading is required.' });
            setIsSavingHomeSettings(false);
            return;
        }

        const { error } = await supabase
            .from('storefront_home_settings')
            .upsert(payload, { onConflict: 'id' });

        setIsSavingHomeSettings(false);

        if (error) {
            setHomeMessage({ type: 'error', text: error.message });
            return;
        }

        setHomeMessage({ type: 'success', text: 'Public home header settings saved.' });
        await fetchHomeSettings();
    };

    return (
        <div className="animate-fadeIn max-w-3xl">
            <Header
                title="Admin Profile"
                description="Manage your account and add other admin users."
            />

            {profileMessage && (
                <div
                    className={`mb-6 rounded-lg p-3 text-sm ${profileMessage.type === 'success'
                        ? 'bg-[var(--color-success-bg)] text-[var(--color-success)]'
                        : 'bg-[var(--color-danger-bg)] text-[var(--color-danger)]'
                        }`}
                >
                    {profileMessage.text}
                </div>
            )}

            <Card variant="outlined" className="mb-6">
                <CardHeader>
                    <CardTitle className="text-sm">My Profile</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSaveProfile} className="space-y-4">
                        <div>
                            <p className="mb-2 text-sm font-medium text-[var(--color-foreground)]">Profile Photo</p>
                            <ProfilePhotoUpload
                                value={profileImageUrl}
                                onChange={handleProfilePhotoChange}
                                uploadKey={userRecord?.id || 'admin'}
                                disabled={isSavingProfile}
                            />
                        </div>
                        <Input
                            id="profile-name"
                            label="Name"
                            value={profileName}
                            onChange={(e) => setProfileName(e.target.value)}
                            placeholder="Your name"
                            autoComplete="name"
                        />
                        <Input
                            id="profile-email"
                            label="Email"
                            type="email"
                            value={profileEmail}
                            onChange={(e) => setProfileEmail(e.target.value)}
                            placeholder="you@company.com"
                            autoComplete="username"
                        />
                        <Input
                            id="profile-password"
                            label="New Password"
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="Leave blank to keep current password"
                            autoComplete="new-password"
                        />
                        <Input
                            id="profile-confirm-password"
                            label="Confirm New Password"
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Re-enter new password"
                            autoComplete="new-password"
                        />
                        <Button type="submit" isLoading={isSavingProfile}>
                            Save Profile
                        </Button>
                    </form>
                </CardContent>
            </Card>

            <Card variant="outlined" className="mb-6">
                <CardHeader>
                    <CardTitle className="text-sm">Public Home Header</CardTitle>
                </CardHeader>
                <CardContent>
                    {homeMessage && (
                        <div
                            className={`mb-4 rounded-lg p-3 text-sm ${homeMessage.type === 'success'
                                ? 'bg-[var(--color-success-bg)] text-[var(--color-success)]'
                                : 'bg-[var(--color-danger-bg)] text-[var(--color-danger)]'
                                }`}
                        >
                            {homeMessage.text}
                        </div>
                    )}

                    {isLoadingHomeSettings ? (
                        <p className="text-sm text-[var(--color-muted)]">Loading home header settings...</p>
                    ) : (
                        <form onSubmit={handleSaveHomeSettings} className="space-y-4">
                            <Input
                                label="Store Name"
                                value={homeSettings.store_name}
                                onChange={(e) => setHomeSettings((prev) => ({ ...prev, store_name: e.target.value }))}
                                maxLength={120}
                            />
                            <Input
                                label="Hero Badge Text"
                                value={homeSettings.hero_badge_text}
                                onChange={(e) => setHomeSettings((prev) => ({ ...prev, hero_badge_text: e.target.value }))}
                                maxLength={80}
                            />
                            <Input
                                label="Hero Heading"
                                value={homeSettings.hero_heading}
                                onChange={(e) => setHomeSettings((prev) => ({ ...prev, hero_heading: e.target.value }))}
                                maxLength={120}
                            />
                            <Input
                                label="Hero Subheading"
                                value={homeSettings.hero_subheading}
                                onChange={(e) => setHomeSettings((prev) => ({ ...prev, hero_subheading: e.target.value }))}
                                maxLength={240}
                            />
                            <Textarea
                                label="Hero Body"
                                value={homeSettings.hero_body}
                                onChange={(e) => setHomeSettings((prev) => ({ ...prev, hero_body: e.target.value }))}
                                maxLength={500}
                                rows={4}
                            />
                            <Input
                                label="Search Placeholder"
                                value={homeSettings.hero_search_placeholder}
                                onChange={(e) => setHomeSettings((prev) => ({ ...prev, hero_search_placeholder: e.target.value }))}
                                maxLength={120}
                            />
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Input
                                    label="Primary CTA Label"
                                    value={homeSettings.hero_primary_cta_label || ''}
                                    onChange={(e) => setHomeSettings((prev) => ({ ...prev, hero_primary_cta_label: e.target.value || null }))}
                                    placeholder="Shop Categories"
                                    maxLength={40}
                                />
                                <Input
                                    label="Primary CTA Link"
                                    value={homeSettings.hero_primary_cta_href || ''}
                                    onChange={(e) => setHomeSettings((prev) => ({ ...prev, hero_primary_cta_href: e.target.value || null }))}
                                    placeholder="#categories or /"
                                    maxLength={240}
                                />
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                <div>
                                    <p className="text-sm font-medium text-[var(--color-foreground)] mb-2">Background Image</p>
                                    <ImageUpload
                                        value={homeSettings.hero_background_image_url}
                                        onChange={(url) => setHomeSettings((prev) => ({ ...prev, hero_background_image_url: url }))}
                                        consignorId={userRecord?.id || 'admin'}
                                        itemId="home-hero-background"
                                    />
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-[var(--color-foreground)] mb-2">Feature Image</p>
                                    <ImageUpload
                                        value={homeSettings.hero_feature_image_url}
                                        onChange={(url) => setHomeSettings((prev) => ({ ...prev, hero_feature_image_url: url }))}
                                        consignorId={userRecord?.id || 'admin'}
                                        itemId="home-hero-feature"
                                    />
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-[var(--color-foreground)] mb-2">Accent Image</p>
                                    <ImageUpload
                                        value={homeSettings.hero_accent_image_url}
                                        onChange={(url) => setHomeSettings((prev) => ({ ...prev, hero_accent_image_url: url }))}
                                        consignorId={userRecord?.id || 'admin'}
                                        itemId="home-hero-accent"
                                    />
                                </div>
                            </div>

                            <Button type="submit" isLoading={isSavingHomeSettings}>
                                Save Home Header
                            </Button>
                        </form>
                    )}
                </CardContent>
            </Card>

            <Card variant="outlined" className="mb-6">
                <CardHeader>
                    <CardTitle className="text-sm">Add Admin</CardTitle>
                </CardHeader>
                <CardContent>
                    {adminMessage && (
                        <div
                            className={`mb-4 rounded-lg p-3 text-sm ${adminMessage.type === 'success'
                                ? 'bg-[var(--color-success-bg)] text-[var(--color-success)]'
                                : 'bg-[var(--color-danger-bg)] text-[var(--color-danger)]'
                                }`}
                        >
                            {adminMessage.text}
                        </div>
                    )}

                    <form onSubmit={handleCreateAdmin} className="space-y-4">
                        <Input
                            id="create-admin-name"
                            label="Name"
                            value={createName}
                            onChange={(e) => setCreateName(e.target.value)}
                            placeholder="Admin name (optional)"
                            autoComplete="name"
                        />
                        <Input
                            id="create-admin-email"
                            label="Email"
                            type="email"
                            value={createEmail}
                            onChange={(e) => setCreateEmail(e.target.value)}
                            placeholder="new-admin@company.com"
                            autoComplete="username"
                        />
                        <Input
                            id="create-admin-password"
                            label="Temporary Password"
                            type="text"
                            value={createPassword}
                            onChange={(e) => setCreatePassword(e.target.value)}
                            placeholder="Set initial password"
                            hint="Share this securely with the new admin."
                            autoComplete="new-password"
                        />
                        <Button type="submit" isLoading={isCreatingAdmin}>
                            Add Admin
                        </Button>
                    </form>
                </CardContent>
            </Card>

            <Card variant="outlined">
                <CardHeader>
                    <CardTitle className="text-sm">Current Admins</CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoadingAdmins ? (
                        <p className="text-sm text-[var(--color-muted)]">Loading admins...</p>
                    ) : admins.length === 0 ? (
                        <p className="text-sm text-[var(--color-muted)]">No admin accounts found.</p>
                    ) : (
                        <div className="space-y-3">
                            {admins.map((admin) => (
                                <div key={admin.id} className="rounded-lg border border-[var(--color-border)] p-3">
                                    <p className="font-medium text-[var(--color-foreground)]">
                                        {admin.full_name || 'Unnamed Admin'}
                                    </p>
                                    <p className="text-sm text-[var(--color-muted)]">{admin.email}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
