// Device Authorization utilities
// Manages device tokens for employee login access

import { supabase } from './supabase';

const DEVICE_TOKEN_KEY = 'deviceAuthToken';

export interface DeviceAuthorization {
    id: string;
    device_token: string;
    authorized_by: string;
    authorized_at: string;
    expires_at: string;
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
        const { data, error } = await supabase
            .from('device_authorizations')
            .select('expires_at, revoked_at')
            .eq('device_token', token)
            .single();

        if (error || !data) {
            // Token not found in database
            clearDeviceToken();
            return { authorized: false, expiresAt: null };
        }

        // Check if revoked
        if (data.revoked_at) {
            clearDeviceToken();
            return { authorized: false, expiresAt: null };
        }

        // Check if expired
        const expiresAt = new Date(data.expires_at);
        if (expiresAt < new Date()) {
            clearDeviceToken();
            return { authorized: false, expiresAt: null };
        }

        return { authorized: true, expiresAt: data.expires_at };
    } catch (err) {
        console.error('Error checking device authorization:', err);
        return { authorized: false, expiresAt: null };
    }
}

// Create a new device authorization
export async function authorizeDevice(
    durationHours: number,
    deviceName?: string
): Promise<{ success: boolean; error: string | null; expiresAt: string | null }> {
    const token = generateDeviceToken();
    const expiresAt = new Date(Date.now() + durationHours * 60 * 60 * 1000);

    try {
        const { error } = await supabase
            .from('device_authorizations')
            .insert({
                device_token: token,
                expires_at: expiresAt.toISOString(),
                device_name: deviceName || null,
            });

        if (error) {
            console.error('Error authorizing device:', error);
            return { success: false, error: 'Failed to authorize device', expiresAt: null };
        }

        // Store token in localStorage
        setDeviceToken(token);

        return { success: true, error: null, expiresAt: expiresAt.toISOString() };
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
            .gt('expires_at', new Date().toISOString())
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching authorizations:', error);
            return [];
        }

        return data || [];
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
    { label: '1 hour', hours: 1 },
    { label: '4 hours', hours: 4 },
    { label: '8 hours', hours: 8 },
    { label: '1 day', hours: 24 },
    { label: '3 days', hours: 72 },
    { label: '7 days', hours: 168 },
] as const;
