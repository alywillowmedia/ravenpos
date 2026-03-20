import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

interface CreateEmployeeAccountRequest {
    action: 'create'
    employeeId: string
    email: string
    password: string
    useExistingLogin?: boolean
}

interface UpdateEmployeePasswordRequest {
    action: 'update_password'
    userId: string
    password: string
}

interface DeleteEmployeeAccountRequest {
    action: 'delete'
    userId: string
    employeeId?: string
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
            const useExistingLogin = body.useExistingLogin === true

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
                .or(`employee_id.eq.${employeeId},linked_employee_id.eq.${employeeId}`)
                .maybeSingle()

            if (existingEmployeeAccount) {
                return new Response(
                    JSON.stringify({ error: 'Employee already has a portal account' }),
                    { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            const { data: existingEmailUser, error: existingEmailUserError } = await adminClient
                .from('users')
                .select('id, email, role, employee_id, linked_employee_id')
                .eq('email', email)
                .maybeSingle()

            if (existingEmailUserError) {
                return new Response(
                    JSON.stringify({ error: existingEmailUserError.message }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            if (existingEmailUser) {
                if (existingEmailUser.role === 'employee') {
                    return new Response(
                        JSON.stringify({ error: 'This email is already used by an employee portal account' }),
                        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    )
                }

                if (!useExistingLogin) {
                    return new Response(
                        JSON.stringify({
                            requiresChoice: true,
                            conflictType: 'existing_vendor_or_admin_login',
                            message: `This email already exists as a ${existingEmailUser.role}. Use the same login for employee portal access or enter a different email.`,
                            existingUser: {
                                id: existingEmailUser.id,
                                email: existingEmailUser.email,
                                role: existingEmailUser.role,
                            },
                        }),
                        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    )
                }

                if (existingEmailUser.linked_employee_id) {
                    return new Response(
                        JSON.stringify({ error: 'This login is already linked to an employee portal account' }),
                        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    )
                }

                const { error: linkError } = await adminClient
                    .from('users')
                    .update({ linked_employee_id: employeeId })
                    .eq('id', existingEmailUser.id)

                if (linkError) {
                    return new Response(
                        JSON.stringify({ error: linkError.message }),
                        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    )
                }

                return new Response(
                    JSON.stringify({
                        success: true,
                        linkedExistingLogin: true,
                        user: {
                            id: existingEmailUser.id,
                            email: existingEmailUser.email,
                            role: existingEmailUser.role,
                            employee_id: employeeId,
                        },
                    }),
                    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
                        role: 'employee',
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
                .select('id, role, employee_id, linked_employee_id')
                .eq('id', userId)
                .maybeSingle()

            if (
                targetUserError ||
                !targetUser ||
                (targetUser.role === 'employee' && !targetUser.employee_id) ||
                (targetUser.role !== 'employee' && !targetUser.linked_employee_id)
            ) {
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
            const employeeId = body.employeeId?.trim() || null
            if (!userId) {
                return new Response(
                    JSON.stringify({ error: 'Missing userId' }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            const { data: targetUser, error: targetUserError } = await adminClient
                .from('users')
                .select('id, role, employee_id, linked_employee_id')
                .eq('id', userId)
                .maybeSingle()

            if (targetUserError || !targetUser) {
                return new Response(
                    JSON.stringify({ error: 'Employee account not found' }),
                    { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            if (targetUser.role !== 'employee') {
                if (!targetUser.linked_employee_id) {
                    return new Response(
                        JSON.stringify({ error: 'Employee portal access not found on this login' }),
                        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    )
                }

                if (employeeId && targetUser.linked_employee_id !== employeeId) {
                    return new Response(
                        JSON.stringify({ error: 'Employee portal link mismatch' }),
                        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    )
                }

                const { error: unlinkError } = await adminClient
                    .from('users')
                    .update({ linked_employee_id: null })
                    .eq('id', userId)

                if (unlinkError) {
                    return new Response(
                        JSON.stringify({ error: unlinkError.message }),
                        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    )
                }

                return new Response(
                    JSON.stringify({ success: true, unlinkedExistingLogin: true }),
                    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
