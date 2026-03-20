// Edge Function: verify-employee-pin
// Verifies employee PIN and returns employee data if valid

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-device-token',
};

// Simple SHA-256 hash function using Web Crypto API
async function sha256(message: string): Promise<string> {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

interface Employee {
    id: string;
    name: string;
    pin_hash: string;
    pin_salt: string;
    hourly_rate: number;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

const SESSION_DURATION_HOURS = 8;
const MAX_PIN_ATTEMPTS = 10;
const LOCKOUT_MINUTES = 15;

function isAnonymousUser(user: Record<string, unknown> | null | undefined): boolean {
    if (!user) return false;

    const isAnonymousFlag = user.is_anonymous;
    if (isAnonymousFlag === true) return true;

    const appMetadata = user.app_metadata;
    if (appMetadata && typeof appMetadata === 'object') {
        const provider = (appMetadata as Record<string, unknown>).provider;
        if (provider === 'anonymous') return true;
    }

    return false;
}

Deno.serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const nowIso = new Date().toISOString();
        const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return new Response(
                JSON.stringify({ error: 'Authentication required' }),
                {
                    status: 401,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                }
            );
        }

        const accessToken = authHeader.replace('Bearer ', '').trim();

        const { pin } = await req.json();
        const deviceToken = req.headers.get('x-device-token')?.trim() ?? '';

        // Validate PIN format
        if (!pin || typeof pin !== 'string' || !/^\d{4,6}$/.test(pin)) {
            return new Response(
                JSON.stringify({ error: 'Invalid PIN format' }),
                {
                    status: 400,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                }
            );
        }
        if (!deviceToken) {
            return new Response(
                JSON.stringify({ error: 'Authorized device required' }),
                {
                    status: 403,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                }
            );
        }

        // Create Supabase client with service role key (bypasses RLS)
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
        if (authError || !authData?.user) {
            console.error('Auth validation error:', authError);
            return new Response(
                JSON.stringify({ error: 'Authentication required' }),
                {
                    status: 401,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                }
            );
        }

        if (!isAnonymousUser(authData.user as unknown as Record<string, unknown>)) {
            return new Response(
                JSON.stringify({ error: 'Employee PIN login requires an anonymous session' }),
                {
                    status: 403,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                }
            );
        }

        const { data: deviceAuth, error: deviceAuthError } = await supabase
            .from('device_authorizations')
            .select('expires_at, revoked_at')
            .eq('device_token', deviceToken)
            .is('revoked_at', null)
            .maybeSingle();

        const isDeviceAuthExpired = deviceAuth?.expires_at ? new Date(deviceAuth.expires_at) <= new Date() : false;

        if (deviceAuthError || !deviceAuth || isDeviceAuthExpired) {
            return new Response(
                JSON.stringify({ error: 'Authorized device required' }),
                {
                    status: 403,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                }
            );
        }

        const { data: attemptState, error: attemptFetchError } = await supabase
            .from('employee_pin_attempts')
            .select('attempts, locked_until')
            .eq('auth_user_id', authData.user.id)
            .maybeSingle();

        if (attemptFetchError) {
            console.error('PIN attempt fetch error:', attemptFetchError);
            return new Response(
                JSON.stringify({ error: 'Internal server error' }),
                {
                    status: 500,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                }
            );
        }

        if (attemptState?.locked_until && new Date(attemptState.locked_until) > new Date()) {
            return new Response(
                JSON.stringify({ error: 'Too many attempts. Try again later.' }),
                {
                    status: 429,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                }
            );
        }

        // Fetch all active employees
        const { data: employees, error } = await supabase
            .from('employees')
            .select('*')
            .eq('is_active', true);

        if (error) {
            console.error('Database error:', error);
            return new Response(
                JSON.stringify({ error: 'Internal server error' }),
                {
                    status: 500,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                }
            );
        }

        if (!employees || employees.length === 0) {
            // Generic error to not reveal if employees exist
            return new Response(
                JSON.stringify({ error: 'Invalid PIN' }),
                {
                    status: 401,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                }
            );
        }

        // Check PIN against each employee
        for (const employee of employees as Employee[]) {
            const hashedPin = await sha256(pin + employee.pin_salt);

            if (hashedPin === employee.pin_hash) {
                await supabase
                    .from('employee_pin_attempts')
                    .delete()
                    .eq('auth_user_id', authData.user.id);

                const expiresAt = new Date(Date.now() + SESSION_DURATION_HOURS * 60 * 60 * 1000).toISOString();

                const { error: upsertError } = await supabase
                    .from('employee_sessions')
                    .upsert(
                        {
                            auth_user_id: authData.user.id,
                            employee_id: employee.id,
                            expires_at: expiresAt,
                            updated_at: new Date().toISOString(),
                        },
                        { onConflict: 'auth_user_id' }
                    );

                if (upsertError) {
                    console.error('Employee session upsert error:', upsertError);
                    return new Response(
                        JSON.stringify({ error: 'Unable to establish employee session' }),
                        {
                            status: 500,
                            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                        }
                    );
                }

                // Found matching employee - return without sensitive data
                return new Response(
                    JSON.stringify({
                        employee: {
                            id: employee.id,
                            name: employee.name,
                            hourly_rate: employee.hourly_rate,
                            is_active: employee.is_active,
                        }
                    }),
                    {
                        status: 200,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    }
                );
            }
        }

        const nextAttempts = (attemptState?.attempts ?? 0) + 1;
        const lockedUntil =
            nextAttempts >= MAX_PIN_ATTEMPTS
                ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000).toISOString()
                : null;

        const { error: attemptUpsertError } = await supabase
            .from('employee_pin_attempts')
            .upsert(
                {
                    auth_user_id: authData.user.id,
                    attempts: lockedUntil ? 0 : nextAttempts,
                    last_attempt_at: nowIso,
                    locked_until: lockedUntil,
                },
                { onConflict: 'auth_user_id' }
            );

        if (attemptUpsertError) {
            console.error('PIN attempt upsert error:', attemptUpsertError);
        }

        // No match found
        return new Response(
            JSON.stringify({ error: 'Invalid PIN' }),
            {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
        );

    } catch (err) {
        console.error('Error:', err);
        return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
        );
    }
});
