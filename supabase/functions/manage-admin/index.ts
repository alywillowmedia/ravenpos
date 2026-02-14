// Supabase Edge Function: manage-admin
// Handles admin account creation and self-profile updates.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

interface CreateAdminRequest {
    action: 'create_admin'
    email: string
    password: string
    fullName?: string
}

interface UpdateProfileRequest {
    action: 'update_profile'
    email?: string
    password?: string
    fullName?: string
}

type RequestBody = CreateAdminRequest | UpdateProfileRequest

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            return new Response(
                JSON.stringify({ error: 'Missing authorization header' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
            auth: { autoRefreshToken: false, persistSession: false }
        })

        const token = authHeader.replace('Bearer ', '')
        const { data: { user }, error: authError } = await adminClient.auth.getUser(token)

        if (authError || !user) {
            console.error('Auth error:', authError)
            return new Response(
                JSON.stringify({ error: 'Invalid token' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const { data: requester, error: requesterError } = await adminClient
            .from('users')
            .select('id, role, email, full_name')
            .eq('id', user.id)
            .single()

        if (requesterError || !requester) {
            console.error('Requester lookup error:', requesterError)
            return new Response(
                JSON.stringify({ error: 'User not found in system' }),
                { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        if (requester.role !== 'admin') {
            return new Response(
                JSON.stringify({ error: 'Admin access required' }),
                { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const body: RequestBody = await req.json()

        if (body.action === 'create_admin') {
            const email = body.email?.trim().toLowerCase()
            const password = body.password
            const fullName = body.fullName?.trim() || null

            if (!email || !password) {
                return new Response(
                    JSON.stringify({ error: 'Missing required fields' }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            if (password.length < 6) {
                return new Response(
                    JSON.stringify({ error: 'Password must be at least 6 characters' }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            const { data: authData, error: createAuthError } = await adminClient.auth.admin.createUser({
                email,
                password,
                email_confirm: true,
                user_metadata: fullName ? { full_name: fullName } : undefined
            })

            if (createAuthError) {
                console.error('Create auth error:', createAuthError)
                return new Response(
                    JSON.stringify({ error: createAuthError.message }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            const { error: insertError } = await adminClient
                .from('users')
                .insert({
                    id: authData.user.id,
                    email,
                    role: 'admin',
                    full_name: fullName
                })

            if (insertError) {
                console.error('Insert error:', insertError)
                await adminClient.auth.admin.deleteUser(authData.user.id)
                return new Response(
                    JSON.stringify({ error: insertError.message }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            return new Response(
                JSON.stringify({
                    success: true,
                    user: {
                        id: authData.user.id,
                        email,
                        full_name: fullName,
                        created_at: authData.user.created_at
                    }
                }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        if (body.action === 'update_profile') {
            const nextEmail = body.email?.trim().toLowerCase()
            const nextPassword = body.password
            const nextFullName = body.fullName?.trim()

            if (nextPassword && nextPassword.length < 6) {
                return new Response(
                    JSON.stringify({ error: 'Password must be at least 6 characters' }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            const resolvedEmail = nextEmail ?? requester.email
            const resolvedFullName = nextFullName === undefined ? requester.full_name : (nextFullName || null)

            const hasAnyChange = Boolean(nextEmail || nextPassword || nextFullName !== undefined)
            if (!hasAnyChange) {
                return new Response(
                    JSON.stringify({ error: 'No profile changes provided' }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            const authUpdatePayload: Record<string, unknown> = {}
            if (nextEmail) authUpdatePayload.email = nextEmail
            if (nextPassword) authUpdatePayload.password = nextPassword
            if (nextFullName !== undefined) authUpdatePayload.user_metadata = { full_name: resolvedFullName }

            if (Object.keys(authUpdatePayload).length > 0) {
                const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(user.id, authUpdatePayload)
                if (authUpdateError) {
                    console.error('Auth profile update error:', authUpdateError)
                    return new Response(
                        JSON.stringify({ error: authUpdateError.message }),
                        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    )
                }
            }

            const { error: rowUpdateError } = await adminClient
                .from('users')
                .update({
                    email: resolvedEmail,
                    full_name: resolvedFullName
                })
                .eq('id', user.id)

            if (rowUpdateError) {
                console.error('User row update error:', rowUpdateError)
                return new Response(
                    JSON.stringify({ error: rowUpdateError.message }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            return new Response(
                JSON.stringify({
                    success: true,
                    profile: {
                        id: user.id,
                        email: resolvedEmail,
                        full_name: resolvedFullName
                    }
                }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        return new Response(
            JSON.stringify({ error: 'Invalid action' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    } catch (error) {
        console.error('Unhandled error:', error)
        return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
