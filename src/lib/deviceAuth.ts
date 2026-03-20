// Device Authorization utilities
// Manages device tokens for employee login access

import { supabase } from './supabase';

const DEVICE_TOKEN_KEY = 'deviceAuthToken';
const LEGACY_PERMANENT_EXPIRY_ISO = '9999-12-31T23:59:59.999Z';

function isEffectivelyPermanentExpiry(expiresAt: string | null | undefined): boolean {
    if (!expiresAt) return true;

    const expiryDate = new Date(expiresAt);
    if (Number.isNaN(expiryDate.getTime())) {
        return false;
    }

    return expiryDate.getUTCFullYear() >= 9999;
}

function normalizeExpiry(expiresAt: string | null | undefined): string | null {
    return isEffectivelyPermanentExpiry(expiresAt) ? null : (expiresAt ?? null);
}

async function ensureAnonymousAuthSession(): Promise<void> {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
        throw sessionError;
    }

    if (session?.access_token) {
        return;
    }

    const { error: signInError } = await supabase.auth.signInAnonymously();
    if (signInError) {
        throw signInError;
    }
}

async function invokeVerifyDeviceToken(token: string): Promise<{
    data: { authorized?: boolean; expiresAt?: string | null } | null;
    error: unknown;
}> {
    const { data, error } = await supabase.functions.invoke('verify-device-token', {
        body: { token },
    });
    return {
        data: (data as { authorized?: boolean; expiresAt?: string | null } | null) ?? null,
        error,
    };
}

export interface DeviceAuthorization {
    id: string;
    device_token: string;
    authorized_by: string;
    authorized_at: string;
    expires_at: string | null;
    device_name: string | null;
    revoked_at: string | null;
    created_at: string;
}

// Get stored device token from localStorage
export function getDeviceToken(): string | null {
    try {
        return localStorage.getItem(DEVICE_TOKEN_KEY);
    } catch {
        return null;
    }
}

// Store device token in localStorage
export function setDeviceToken(token: string): void {
    localStorage.setItem(DEVICE_TOKEN_KEY, token);
}

// Clear device token from localStorage
export function clearDeviceToken(): void {
    localStorage.removeItem(DEVICE_TOKEN_KEY);
}

// Generate a secure random token
export function generateDeviceToken(): string {
    return crypto.randomUUID();
}

// Check if the current device is authorized
export async function isDeviceAuthorized(): Promise<{ authorized: boolean; expiresAt: string | null }> {
    const token = getDeviceToken();

    if (!token) {
        return { authorized: false, expiresAt: null };
    }

    try {
        let { data, error } = await invokeVerifyDeviceToken(token);

        if (error) {
            // Retry once after establishing an anonymous session to tolerate
            // function deployments that still require JWTs.
            try {
                await ensureAnonymousAuthSession();
                const retryResult = await invokeVerifyDeviceToken(token);
                data = retryResult.data;
                error = retryResult.error;
            } catch (retryErr) {
                console.error('Error establishing anonymous session for device check:', retryErr);
            }
        }

        if (error) {
            console.error('Device authorization check failed:', error);
            return { authorized: false, expiresAt: null };
        }

        if (!data?.authorized) {
            clearDeviceToken();
            return { authorized: false, expiresAt: null };
        }
        return { authorized: true, expiresAt: normalizeExpiry(data.expiresAt) };
    } catch (err) {
        console.error('Error checking device authorization:', err);
        return { authorized: false, expiresAt: null };
    }
}

// Create a new device authorization
export async function authorizeDevice(
    durationHours: number | null,
    deviceName?: string
): Promise<{ success: boolean; error: string | null; expiresAt: string | null }> {
    const token = generateDeviceToken();
    const requestedExpiresAt = durationHours === null
        ? null
        : new Date(Date.now() + durationHours * 60 * 60 * 1000);

    try {
        const storedExpiresAtIso = requestedExpiresAt?.toISOString() ?? LEGACY_PERMANENT_EXPIRY_ISO;

        const { error } = await supabase
            .from('device_authorizations')
            .insert({
                device_token: token,
                expires_at: storedExpiresAtIso,
                device_name: deviceName || null,
            });

        if (error) {
            console.error('Error authorizing device:', error);
            return { success: false, error: 'Failed to authorize device', expiresAt: null };
        }

        // Store token in localStorage
        setDeviceToken(token);

        return { success: true, error: null, expiresAt: normalizeExpiry(storedExpiresAtIso) };
    } catch (err) {
        console.error('Exception authorizing device:', err);
        return { success: false, error: 'Failed to authorize device', expiresAt: null };
    }
}

// Get all active device authorizations (for admin view)
export async function getActiveAuthorizations(): Promise<DeviceAuthorization[]> {
    try {
        const { data, error } = await supabase
            .from('device_authorizations')
            .select('*')
            .is('revoked_at', null)
            .or(`expires_at.gt.${new Date().toISOString()},expires_at.is.null`)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching authorizations:', error);
            return [];
        }

        return (data || []).map((auth) => ({
            ...auth,
            expires_at: normalizeExpiry(auth.expires_at),
        }));
    } catch (err) {
        console.error('Exception fetching authorizations:', err);
        return [];
    }
}

// Revoke a device authorization
export async function revokeAuthorization(id: string): Promise<{ success: boolean; error: string | null }> {
    try {
        const { error } = await supabase
            .from('device_authorizations')
            .update({ revoked_at: new Date().toISOString() })
            .eq('id', id);

        if (error) {
            console.error('Error revoking authorization:', error);
            return { success: false, error: 'Failed to revoke authorization' };
        }

        return { success: true, error: null };
    } catch (err) {
        console.error('Exception revoking authorization:', err);
        return { success: false, error: 'Failed to revoke authorization' };
    }
}

// Duration presets for the UI
export const DURATION_PRESETS = [
    { label: 'Permanent', hours: null },
    { label: '1 hour', hours: 1 },
    { label: '4 hours', hours: 4 },
    { label: '8 hours', hours: 8 },
    { label: '1 day', hours: 24 },
    { label: '3 days', hours: 72 },
    { label: '7 days', hours: 168 },
] as const;
