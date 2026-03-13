import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

type UserRow = {
    id: string
    email: string
    full_name: string | null
    employee_id: string | null
}

type EmployeeRow = {
    id: string
    name: string
    hourly_rate: number
    is_active: boolean
}

type OneTimeShift = {
    employee_id: string
    shift_date: string
    start_time: string
    end_time: string
    notes: string | null
}

type RecurringShift = {
    employee_id: string
    weekday: number
    start_time: string
    end_time: string
    notes: string | null
    active_from: string
    active_until: string | null
}

type DisplayShift = {
    date: string
    start_time: string
    end_time: string
    notes: string | null
}

type SendResult = {
    recipientCount: number
    sentCount: number
    failedCount: number
    failures: string[]
    weekStart: string
    weekEnd: string
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DEFAULT_FROM_NAME = 'Ravenlia'
const DEFAULT_FROM_EMAIL = 'email@ravenlia.com'
const DEFAULT_LOGIN_URL = 'https://ravenpos.vercel.app/employee/portal-login'

function normalizeEmail(value: string): string {
    return value.trim().toLowerCase()
}

function isValidEmail(value: string): boolean {
    return EMAIL_REGEX.test(value)
}

function toDateKey(date: Date): string {
    const year = date.getUTCFullYear()
    const month = String(date.getUTCMonth() + 1).padStart(2, '0')
    const day = String(date.getUTCDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

function parseDateKey(value: string): Date {
    return new Date(`${value}T00:00:00.000Z`)
}

function addDays(date: Date, days: number): Date {
    const next = new Date(date)
    next.setUTCDate(next.getUTCDate() + days)
    return next
}

function getNextWeekRange(): { monday: string; sunday: string; dates: string[] } {
    const now = new Date()
    const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    const day = todayUtc.getUTCDay()
    const daysUntilNextMonday = ((8 - day) % 7) || 7
    const monday = addDays(todayUtc, daysUntilNextMonday)
    const sunday = addDays(monday, 6)
    const dates = Array.from({ length: 7 }, (_, index) => toDateKey(addDays(monday, index)))

    return {
        monday: toDateKey(monday),
        sunday: toDateKey(sunday),
        dates,
    }
}

function formatTimeLabel(time: string): string {
    const [hours = '0', minutes = '0'] = time.split(':')
    const date = new Date()
    date.setHours(Number.parseInt(hours, 10), Number.parseInt(minutes, 10), 0, 0)
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function formatDateLabel(dateKey: string): string {
    const date = parseDateKey(dateKey)
    return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}

function getShiftHours(startTime: string, endTime: string): number {
    const [startHour = '0', startMinute = '0'] = startTime.split(':')
    const [endHour = '0', endMinute = '0'] = endTime.split(':')
    const start = Number.parseInt(startHour, 10) * 60 + Number.parseInt(startMinute, 10)
    const end = Number.parseInt(endHour, 10) * 60 + Number.parseInt(endMinute, 10)
    return Math.max(0, end - start) / 60
}

function buildEmailHtml(params: {
    employeeName: string
    weekStart: string
    weekEnd: string
    shifts: DisplayShift[]
    totalHours: number
    loginUrl: string
}) {
    const { employeeName, weekStart, weekEnd, shifts, totalHours, loginUrl } = params

    const rows = shifts.length === 0
        ? '<tr><td colspan="3" style="padding:12px;border:1px solid #ddd;">No shifts scheduled for next week.</td></tr>'
        : shifts.map((shift) => {
            const notes = shift.notes?.trim() ? ` (${shift.notes.trim()})` : ''
            return `<tr>
<td style="padding:12px;border:1px solid #ddd;">${formatDateLabel(shift.date)}</td>
<td style="padding:12px;border:1px solid #ddd;">${formatTimeLabel(shift.start_time)} - ${formatTimeLabel(shift.end_time)}</td>
<td style="padding:12px;border:1px solid #ddd;">${notes || '-'}</td>
</tr>`
        }).join('')

    return `
<!doctype html>
<html>
  <body style="font-family:Arial,sans-serif;line-height:1.4;color:#111;">
    <h2 style="margin:0 0 12px;">Your Schedule for Next Week</h2>
    <p style="margin:0 0 16px;">Hi ${employeeName}, here is your schedule for <strong>${formatDateLabel(weekStart)}</strong> through <strong>${formatDateLabel(weekEnd)}</strong>.</p>

    <table style="width:100%;border-collapse:collapse;margin:0 0 16px;">
      <thead>
        <tr>
          <th style="text-align:left;padding:12px;border:1px solid #ddd;background:#f6f6f6;">Date</th>
          <th style="text-align:left;padding:12px;border:1px solid #ddd;background:#f6f6f6;">Shift</th>
          <th style="text-align:left;padding:12px;border:1px solid #ddd;background:#f6f6f6;">Notes</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <p style="margin:0 0 16px;"><strong>Total scheduled hours:</strong> ${totalHours.toFixed(2)}</p>

    <p style="margin:0 0 12px;">View your full schedule, hours worked, and estimated pay here:</p>
    <p style="margin:0 0 20px;"><a href="${loginUrl}" style="display:inline-block;padding:10px 14px;background:#111;color:#fff;text-decoration:none;border-radius:6px;">Employee Portal Login</a></p>

    <p style="margin:0;color:#666;font-size:12px;">This is an automated message from RavenPOS.</p>
  </body>
</html>
`.trim()
}

function buildShiftMap(
    employeeIds: string[],
    dates: string[],
    oneTimeShifts: OneTimeShift[],
    recurringShifts: RecurringShift[]
): Map<string, DisplayShift[]> {
    const byEmployee = new Map<string, DisplayShift[]>()
    const dateSet = new Set(dates)

    for (const employeeId of employeeIds) {
        byEmployee.set(employeeId, [])
    }

    for (const shift of oneTimeShifts) {
        if (!dateSet.has(shift.shift_date)) continue
        if (!byEmployee.has(shift.employee_id)) continue
        byEmployee.get(shift.employee_id)!.push({
            date: shift.shift_date,
            start_time: shift.start_time,
            end_time: shift.end_time,
            notes: shift.notes,
        })
    }

    for (const recurring of recurringShifts) {
        if (!byEmployee.has(recurring.employee_id)) continue

        for (const dateKey of dates) {
            const date = parseDateKey(dateKey)
            if (date.getUTCDay() !== recurring.weekday) continue
            if (dateKey < recurring.active_from) continue
            if (recurring.active_until && dateKey > recurring.active_until) continue

            byEmployee.get(recurring.employee_id)!.push({
                date: dateKey,
                start_time: recurring.start_time,
                end_time: recurring.end_time,
                notes: recurring.notes,
            })
        }
    }

    for (const [, shifts] of byEmployee) {
        shifts.sort((a, b) => {
            if (a.date !== b.date) return a.date.localeCompare(b.date)
            return a.start_time.localeCompare(b.start_time)
        })
    }

    return byEmployee
}

async function validateInvocation(
    adminClient: ReturnType<typeof createClient>,
    req: Request,
    cronSecret: string | null
): Promise<{ allowed: boolean; reason?: string }> {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
        return { allowed: false, reason: 'Missing authorization header' }
    }

    const token = authHeader.replace('Bearer ', '').trim()

    if (cronSecret && token === cronSecret) {
        return { allowed: true }
    }

    const { data: authData, error: authError } = await adminClient.auth.getUser(token)
    if (authError || !authData.user) {
        return { allowed: false, reason: 'Invalid token' }
    }

    const { data: requester, error: requesterError } = await adminClient
        .from('users')
        .select('role')
        .eq('id', authData.user.id)
        .maybeSingle()

    if (requesterError || !requester || requester.role !== 'admin') {
        return { allowed: false, reason: 'Admin access required' }
    }

    return { allowed: true }
}

async function sendEmails(params: {
    resendApiKey: string
    fromName: string
    fromEmail: string
    loginUrl: string
    weekStart: string
    weekEnd: string
    users: UserRow[]
    employeesById: Map<string, EmployeeRow>
    shiftsByEmployeeId: Map<string, DisplayShift[]>
}): Promise<SendResult> {
    const { resendApiKey, fromName, fromEmail, loginUrl, weekStart, weekEnd, users, employeesById, shiftsByEmployeeId } = params

    let sentCount = 0
    let failedCount = 0
    const failures: string[] = []

    for (const user of users) {
        if (!user.employee_id) continue

        const employee = employeesById.get(user.employee_id)
        if (!employee || !employee.is_active) continue

        const shifts = shiftsByEmployeeId.get(user.employee_id) || []
        const totalHours = shifts.reduce((sum, shift) => sum + getShiftHours(shift.start_time, shift.end_time), 0)
        const html = buildEmailHtml({
            employeeName: user.full_name?.trim() || employee.name,
            weekStart,
            weekEnd,
            shifts,
            totalHours,
            loginUrl,
        })

        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${resendApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: `${fromName} <${fromEmail}>`,
                to: [user.email],
                subject: `Your work schedule for ${formatDateLabel(weekStart)} - ${formatDateLabel(weekEnd)}`,
                html,
            }),
        })

        if (response.ok) {
            sentCount += 1
            continue
        }

        failedCount += 1
        let reason = `HTTP ${response.status}`
        try {
            const body = await response.json() as { message?: string }
            if (body.message) reason = body.message
        } catch {
            // no-op
        }

        if (failures.length < 25) {
            failures.push(`${user.email}: ${reason}`)
        }
    }

    return {
        recipientCount: users.length,
        sentCount,
        failedCount,
        failures,
        weekStart,
        weekEnd,
    }
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')
        const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
        const resendApiKey = Deno.env.get('RESEND_API_KEY')
        const cronSecret = Deno.env.get('EMPLOYEE_SCHEDULE_CRON_SECRET')

        if (!supabaseUrl || !supabaseServiceRoleKey) {
            return new Response(
                JSON.stringify({ error: 'Supabase service role is not configured' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        if (!resendApiKey) {
            return new Response(
                JSON.stringify({ error: 'Email service not configured' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
            auth: { autoRefreshToken: false, persistSession: false },
        })

        const authResult = await validateInvocation(adminClient, req, cronSecret)
        if (!authResult.allowed) {
            return new Response(
                JSON.stringify({ error: authResult.reason || 'Unauthorized' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const { monday, sunday, dates } = getNextWeekRange()
        const loginUrl = Deno.env.get('EMPLOYEE_PORTAL_LOGIN_URL') || DEFAULT_LOGIN_URL
        const fromEmail = normalizeEmail(Deno.env.get('EMPLOYEE_SCHEDULE_FROM_EMAIL') || DEFAULT_FROM_EMAIL)
        const fromName = (Deno.env.get('EMPLOYEE_SCHEDULE_FROM_NAME') || DEFAULT_FROM_NAME).trim()

        if (!isValidEmail(fromEmail)) {
            return new Response(
                JSON.stringify({ error: 'Invalid sender email configured' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const { data: usersData, error: usersError } = await adminClient
            .from('users')
            .select('id, email, full_name, employee_id')
            .eq('role', 'employee')
            .not('email', 'is', null)
            .not('employee_id', 'is', null)

        if (usersError) {
            return new Response(
                JSON.stringify({ error: usersError.message }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const users = ((usersData || []) as UserRow[])
            .map((user) => ({ ...user, email: normalizeEmail(user.email) }))
            .filter((user) => user.employee_id && isValidEmail(user.email))

        if (users.length === 0) {
            return new Response(
                JSON.stringify({ success: true, recipientCount: 0, sentCount: 0, failedCount: 0, weekStart: monday, weekEnd: sunday }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const employeeIds = Array.from(new Set(users.map((user) => user.employee_id!).filter(Boolean)))

        const [{ data: employeesData, error: employeesError }, { data: oneTimeData, error: oneTimeError }, { data: recurringData, error: recurringError }] = await Promise.all([
            adminClient
                .from('employees')
                .select('id, name, hourly_rate, is_active')
                .in('id', employeeIds),
            adminClient
                .from('employee_schedules')
                .select('employee_id, shift_date, start_time, end_time, notes')
                .in('employee_id', employeeIds)
                .gte('shift_date', monday)
                .lte('shift_date', sunday),
            adminClient
                .from('employee_recurring_schedules')
                .select('employee_id, weekday, start_time, end_time, notes, active_from, active_until')
                .in('employee_id', employeeIds)
                .lte('active_from', sunday)
                .or(`active_until.is.null,active_until.gte.${monday}`),
        ])

        if (employeesError || oneTimeError || recurringError) {
            const error = employeesError || oneTimeError || recurringError
            return new Response(
                JSON.stringify({ error: error?.message || 'Failed to load schedule data' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const employeesById = new Map<string, EmployeeRow>((employeesData || []).map((employee) => [employee.id, employee as EmployeeRow]))
        const shiftsByEmployeeId = buildShiftMap(
            employeeIds,
            dates,
            (oneTimeData || []) as OneTimeShift[],
            (recurringData || []) as RecurringShift[]
        )

        const result = await sendEmails({
            resendApiKey,
            fromName,
            fromEmail,
            loginUrl,
            weekStart: monday,
            weekEnd: sunday,
            users,
            employeesById,
            shiftsByEmployeeId,
        })

        return new Response(
            JSON.stringify({ success: true, ...result }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    } catch (error) {
        console.error('send-employee-weekly-schedules error:', error)
        return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
