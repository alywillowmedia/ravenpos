// Supabase Edge Function: manage-vendor
// Handles vendor account creation, password updates, and deletion
// Uses service role key to bypass RLS and manage auth users

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

interface CreateVendorRequest {
    action: 'create'
    email: string
    password: string
    consignorId: string
}

interface UpdatePasswordRequest {
    action: 'update_password'
    userId: string
    password: string
}

interface DeleteVendorRequest {
    action: 'delete'
    userId: string
}

interface ImpersonateVendorRequest {
    action: 'impersonate'
    consignorId: string
    redirectTo?: string
}

type RequestBody = CreateVendorRequest | UpdatePasswordRequest | DeleteVendorRequest | ImpersonateVendorRequest

function isValidImpersonationRedirect(value: string): boolean {
    try {
        const parsed = new URL(value)
        return parsed.protocol === 'https:' || parsed.protocol === 'http:' || parsed.protocol === 'file:'
    } catch {
        return false
    }
}

Deno.serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

        // Get the authorization header
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            return new Response(
                JSON.stringify({ error: 'Missing authorization header' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Create admin client with service role for operations
        const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
            auth: { autoRefreshToken: false, persistSession: false }
        })

        // Verify the JWT and get user info
        const token = authHeader.replace('Bearer ', '')
        const { data: { user }, error: authError } = await adminClient.auth.getUser(token)

        if (authError || !user) {
            console.error('Auth error:', authError)
            return new Response(
                JSON.stringify({ error: 'Invalid token' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Check if user is admin using the service role client (bypasses RLS)
        const { data: userData, error: userError } = await adminClient
            .from('users')
            .select('role')
            .eq('id', user.id)
            .single()

        if (userError) {
            console.error('User lookup error:', userError)
            return new Response(
                JSON.stringify({ error: 'User not found in system' }),
                { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        if (userData.role !== 'admin') {
            return new Response(
                JSON.stringify({ error: 'Admin access required' }),
                { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const body: RequestBody = await req.json()

        // Handle different actions
        if (body.action === 'create') {
            const { email, password, consignorId } = body as CreateVendorRequest

            if (!email || !password || !consignorId) {
                return new Response(
                    JSON.stringify({ error: 'Missing required fields' }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            // Create auth user using admin API
            const { data: authData, error: createAuthError } = await adminClient.auth.admin.createUser({
                email,
                password,
                email_confirm: true, // Auto-confirm the email
            })

            if (createAuthError) {
                console.error('Create auth error:', createAuthError)
                return new Response(
                    JSON.stringify({ error: createAuthError.message }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            // Create users table record
            const { error: insertError } = await adminClient.from('users').insert({
                id: authData.user.id,
                email,
                role: 'vendor',
                consignor_id: consignorId,
            })

            if (insertError) {
                console.error('Insert error:', insertError)
                // Rollback: delete the auth user if users table insert failed
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
                        email: authData.user.email,
                        created_at: authData.user.created_at
                    }
                }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )

        } else if (body.action === 'update_password') {
            const { userId, password } = body as UpdatePasswordRequest

            if (!userId || !password) {
                return new Response(
                    JSON.stringify({ error: 'Missing required fields' }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            const { error } = await adminClient.auth.admin.updateUserById(userId, {
                password,
            })

            if (error) {
                console.error('Update password error:', error)
                return new Response(
                    JSON.stringify({ error: error.message }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            return new Response(
                JSON.stringify({ success: true }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )

        } else if (body.action === 'delete') {
            const { userId } = body as DeleteVendorRequest

            if (!userId) {
                return new Response(
                    JSON.stringify({ error: 'Missing userId' }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            // Delete from users table first
            const { error: deleteUserError } = await adminClient
                .from('users')
                .delete()
                .eq('id', userId)

            if (deleteUserError) {
                console.error('Delete user error:', deleteUserError)
                return new Response(
                    JSON.stringify({ error: deleteUserError.message }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            // Delete auth user
            const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(userId)

            if (deleteAuthError) {
                console.error('Delete auth error:', deleteAuthError)
                return new Response(
                    JSON.stringify({ error: deleteAuthError.message }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            return new Response(
                JSON.stringify({ success: true }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )

        } else if (body.action === 'impersonate') {
            const { consignorId, redirectTo } = body as ImpersonateVendorRequest

            if (!consignorId) {
                return new Response(
                    JSON.stringify({ error: 'Missing consignorId' }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            const { data: vendorUser, error: vendorLookupError } = await adminClient
                .from('users')
                .select('id, email, role, consignor_id')
                .eq('role', 'vendor')
                .eq('consignor_id', consignorId)
                .maybeSingle()

            if (vendorLookupError) {
                console.error('Vendor lookup error:', vendorLookupError)
                return new Response(
                    JSON.stringify({ error: vendorLookupError.message }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            if (!vendorUser?.email) {
                return new Response(
                    JSON.stringify({ error: 'No vendor login exists for this consignor yet' }),
                    { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            const appUrl = Deno.env.get('APP_URL')
            const fallbackRedirectTo = appUrl ? `${appUrl.replace(/\/+$/, '')}/vendor` : null
            const requestedRedirect = typeof redirectTo === 'string' ? redirectTo.trim() : ''
            const finalRedirectTo = isValidImpersonationRedirect(requestedRedirect)
                ? requestedRedirect
                : fallbackRedirectTo

            if (!finalRedirectTo) {
                return new Response(
                    JSON.stringify({ error: 'No valid redirect URL available for impersonation' }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
                type: 'magiclink',
                email: vendorUser.email,
                options: { redirectTo: finalRedirectTo },
            })

            if (linkError) {
                console.error('Generate link error:', linkError)
                return new Response(
                    JSON.stringify({ error: linkError.message }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            const actionLink = linkData?.properties?.action_link

            if (!actionLink) {
                return new Response(
                    JSON.stringify({ error: 'Unable to create impersonation link' }),
                    { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            return new Response(
                JSON.stringify({
                    success: true,
                    actionLink,
                    vendorEmail: vendorUser.email,
                }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )

        } else {
            return new Response(
                JSON.stringify({ error: 'Invalid action' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

    } catch (error) {
        console.error('Unhandled error:', error)
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
