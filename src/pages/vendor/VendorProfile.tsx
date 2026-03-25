import { useState, useEffect, FormEvent } from 'react';
import { Header } from '../../components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { ProfilePhotoUpload } from '../../components/ui/ProfilePhotoUpload';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { getConsignorDisplayName, getConsignorPayToName } from '../../lib/consignors';
import type { Consignor } from '../../types';

export function VendorProfile() {
    const { userRecord, refreshUserRecord } = useAuth();
    const [consignor, setConsignor] = useState<Consignor | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Editable fields
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [address, setAddress] = useState('');
    const [addressLine2, setAddressLine2] = useState('');
    const [city, setCity] = useState('');
    const [state, setState] = useState('');
    const [postalCode, setPostalCode] = useState('');
    const [country, setCountry] = useState('');
    const [dealerDiscountPercent, setDealerDiscountPercent] = useState('0');
    const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);

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
                setAddressLine2(data.address_line_2 || '');
                setCity(data.city || '');
                setState(data.state || '');
                setPostalCode(data.postal_code || '');
                setCountry(data.country || '');
                setDealerDiscountPercent(String(Number(data.dealer_discount_percent || 0)));
            }

            setIsLoading(false);
        };

        fetchConsignor();
    }, [userRecord?.consignor_id]);

    useEffect(() => {
        setProfileImageUrl(userRecord?.profile_image_url ?? null);
    }, [userRecord?.profile_image_url]);

    const handleProfilePhotoChange = async (url: string | null) => {
        if (!userRecord?.id) return;
        setMessage(null);

        const { error } = await supabase
            .from('users')
            .update({ profile_image_url: url })
            .eq('id', userRecord.id);

        if (error) {
            setMessage({ type: 'error', text: error.message });
            return;
        }

        setProfileImageUrl(url);
        await refreshUserRecord();
        setMessage({ type: 'success', text: 'Profile photo updated.' });
    };

    const handleSaveContact = async (e: FormEvent) => {
        e.preventDefault();
        setMessage(null);
        setIsSaving(true);

        const parsedDealerDiscount = Number(dealerDiscountPercent);
        if (!Number.isFinite(parsedDealerDiscount) || parsedDealerDiscount < 0 || parsedDealerDiscount > 100) {
            setIsSaving(false);
            setMessage({ type: 'error', text: 'Dealer discount must be between 0 and 100.' });
            return;
        }

        const { error } = await supabase
            .from('consignors')
            .update({
                email,
                phone,
                address,
                address_line_2: addressLine2 || null,
                city: city || null,
                state: state || null,
                postal_code: postalCode || null,
                country: country || null,
                dealer_discount_percent: Math.round(parsedDealerDiscount * 100) / 100,
            })
            .eq('id', userRecord?.consignor_id);

        setIsSaving(false);

        if (error) {
            setMessage({ type: 'error', text: error.message });
        } else {
            setConsignor((prev) => prev ? ({
                ...prev,
                email,
                phone,
                address,
                address_line_2: addressLine2 || null,
                city: city || null,
                state: state || null,
                postal_code: postalCode || null,
                country: country || null,
                dealer_discount_percent: Math.round(parsedDealerDiscount * 100) / 100,
            }) : prev);
            setMessage({ type: 'success', text: 'Profile updated!' });
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
                    <CardTitle className="text-sm">Profile Photo</CardTitle>
                </CardHeader>
                <CardContent>
                    <ProfilePhotoUpload
                        value={profileImageUrl}
                        onChange={handleProfilePhotoChange}
                        uploadKey={userRecord?.id || 'vendor'}
                        disabled={isSaving || isChangingPassword}
                    />
                </CardContent>
            </Card>

            {/* Account Info (Read-only) */}
            <Card variant="outlined" className="mb-6">
                <CardHeader>
                    <CardTitle className="text-sm">Account Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <p className="text-xs text-[var(--color-muted)] uppercase">Display Name</p>
                            <p className="font-medium">{consignor ? getConsignorDisplayName(consignor) : '—'}</p>
                        </div>
                        <div>
                            <p className="text-xs text-[var(--color-muted)] uppercase">Pay To</p>
                            <p className="font-medium">{consignor ? getConsignorPayToName(consignor) : '—'}</p>
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
                        <div>
                            <p className="text-xs text-[var(--color-muted)] uppercase">Dealer Discount</p>
                            <p>{Number(consignor?.dealer_discount_percent || 0).toFixed(2)}%</p>
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
                            label="Street Address"
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
                            placeholder="123 Main St"
                        />
                        <Input
                            label="Address Line 2"
                            value={addressLine2}
                            onChange={(e) => setAddressLine2(e.target.value)}
                            placeholder="Suite, Apt, Unit (optional)"
                        />
                        <div className="grid grid-cols-3 gap-4">
                            <Input
                                label="City"
                                value={city}
                                onChange={(e) => setCity(e.target.value)}
                                placeholder="Nashville"
                            />
                            <Input
                                label="State"
                                value={state}
                                onChange={(e) => setState(e.target.value)}
                                placeholder="TN"
                            />
                            <Input
                                label="ZIP"
                                value={postalCode}
                                onChange={(e) => setPostalCode(e.target.value)}
                                placeholder="37201"
                            />
                        </div>
                        <Input
                            label="Country"
                            value={country}
                            onChange={(e) => setCountry(e.target.value)}
                            placeholder="USA"
                        />
                        <Input
                            label="Dealer Discount (%)"
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={dealerDiscountPercent}
                            onChange={(e) => setDealerDiscountPercent(e.target.value)}
                            hint="Applied only when POS dealer-discount mode is enabled."
                        />
                        <div className="pt-2">
                            <Button type="submit" isLoading={isSaving}>
                                Save Profile
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
