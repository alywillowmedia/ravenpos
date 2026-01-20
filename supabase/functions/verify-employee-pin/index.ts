// Edge Function: verify-employee-pin
// Verifies employee PIN and returns employee data if valid

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

Deno.serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { pin } = await req.json();

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

        // Create Supabase client with service role key (bypasses RLS)
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
