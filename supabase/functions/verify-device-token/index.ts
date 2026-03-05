import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

interface VerifyRequest {
    token?: string
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const body = await req.json() as VerifyRequest
        const token = body.token?.trim()

        if (!token) {
            return new Response(
                JSON.stringify({ authorized: false }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        const supabase = createClient(supabaseUrl, supabaseServiceKey, {
            auth: { autoRefreshToken: false, persistSession: false }
        })

        const nowIso = new Date().toISOString()
        const { data, error } = await supabase
            .from('device_authorizations')
            .select('expires_at, revoked_at')
            .eq('device_token', token)
            .is('revoked_at', null)
            .gt('expires_at', nowIso)
            .maybeSingle()

        if (error || !data) {
            return new Response(
                JSON.stringify({ authorized: false }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        return new Response(
            JSON.stringify({ authorized: true, expiresAt: data.expires_at }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    } catch (error) {
        console.error('verify-device-token error:', error)
        return new Response(
            JSON.stringify({ authorized: false }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
