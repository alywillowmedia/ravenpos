import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

interface CreateEmployeeAccountRequest {
    action: 'create'
    employeeId: string
    email: string
    password: string
}

interface UpdateEmployeePasswordRequest {
    action: 'update_password'
    userId: string
    password: string
}

interface DeleteEmployeeAccountRequest {
    action: 'delete'
    userId: string
}

type RequestBody = CreateEmployeeAccountRequest | UpdateEmployeePasswordRequest | DeleteEmployeeAccountRequest

function normalizeEmail(value: string): string {
    return value.trim().toLowerCase()
}

function isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

        const authHeader = req.headers.get('Authorization')
        if (!authHeader?.startsWith('Bearer ')) {
            return new Response(
                JSON.stringify({ error: 'Missing authorization header' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
            auth: { autoRefreshToken: false, persistSession: false },
        })

        const token = authHeader.replace('Bearer ', '').trim()
        const { data: { user }, error: authError } = await adminClient.auth.getUser(token)

        if (authError || !user) {
            return new Response(
                JSON.stringify({ error: 'Invalid token' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const { data: requester, error: requesterError } = await adminClient
            .from('users')
            .select('role')
            .eq('id', user.id)
            .maybeSingle()

        if (requesterError || !requester || requester.role !== 'admin') {
            return new Response(
                JSON.stringify({ error: 'Admin access required' }),
                { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const body = await req.json() as RequestBody

        if (body.action === 'create') {
            const employeeId = body.employeeId?.trim()
            const email = normalizeEmail(body.email || '')
            const password = body.password || ''

            if (!employeeId || !email || !password) {
                return new Response(
                    JSON.stringify({ error: 'Missing required fields' }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            if (!isValidEmail(email)) {
                return new Response(
                    JSON.stringify({ error: 'Invalid email address' }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            if (password.length < 6) {
                return new Response(
                    JSON.stringify({ error: 'Password must be at least 6 characters' }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            const { data: employee, error: employeeError } = await adminClient
                .from('employees')
                .select('id, name, is_active')
                .eq('id', employeeId)
                .maybeSingle()

            if (employeeError || !employee) {
                return new Response(
                    JSON.stringify({ error: 'Employee not found' }),
                    { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            if (!employee.is_active) {
                return new Response(
                    JSON.stringify({ error: 'Cannot create account for inactive employee' }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            const { data: existingEmployeeAccount } = await adminClient
                .from('users')
                .select('id')
                .eq('employee_id', employeeId)
                .eq('role', 'employee')
                .maybeSingle()

            if (existingEmployeeAccount) {
                return new Response(
                    JSON.stringify({ error: 'Employee already has a portal account' }),
                    { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            const { data: authData, error: createAuthError } = await adminClient.auth.admin.createUser({
                email,
                password,
                email_confirm: true,
                user_metadata: { full_name: employee.name },
            })

            if (createAuthError || !authData.user) {
                return new Response(
                    JSON.stringify({ error: createAuthError?.message || 'Failed to create auth user' }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            const { error: insertError } = await adminClient
                .from('users')
                .insert({
                    id: authData.user.id,
                    email,
                    role: 'employee',
                    employee_id: employeeId,
                    full_name: employee.name,
                })

            if (insertError) {
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
                        employee_id: employeeId,
                        created_at: authData.user.created_at,
                    },
                }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        if (body.action === 'update_password') {
            const userId = body.userId?.trim()
            const password = body.password || ''

            if (!userId || !password) {
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

            const { data: targetUser, error: targetUserError } = await adminClient
                .from('users')
                .select('id, role')
                .eq('id', userId)
                .maybeSingle()

            if (targetUserError || !targetUser || targetUser.role !== 'employee') {
                return new Response(
                    JSON.stringify({ error: 'Employee account not found' }),
                    { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            const { error: updateError } = await adminClient.auth.admin.updateUserById(userId, { password })
            if (updateError) {
                return new Response(
                    JSON.stringify({ error: updateError.message }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            return new Response(
                JSON.stringify({ success: true }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        if (body.action === 'delete') {
            const userId = body.userId?.trim()
            if (!userId) {
                return new Response(
                    JSON.stringify({ error: 'Missing userId' }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            const { data: targetUser, error: targetUserError } = await adminClient
                .from('users')
                .select('id, role')
                .eq('id', userId)
                .maybeSingle()

            if (targetUserError || !targetUser || targetUser.role !== 'employee') {
                return new Response(
                    JSON.stringify({ error: 'Employee account not found' }),
                    { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            const { error: deleteUserError } = await adminClient
                .from('users')
                .delete()
                .eq('id', userId)

            if (deleteUserError) {
                return new Response(
                    JSON.stringify({ error: deleteUserError.message }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(userId)
            if (deleteAuthError) {
                return new Response(
                    JSON.stringify({ error: deleteAuthError.message }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            return new Response(
                JSON.stringify({ success: true }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        return new Response(
            JSON.stringify({ error: 'Invalid action' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    } catch (error) {
        console.error('manage-employee-account error:', error)
        return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
