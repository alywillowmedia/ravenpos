import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

interface SendCampaignRequest {
    templateId?: string | null
    templateName?: string | null
    subject: string
    html: string
    text?: string
    fromName?: string | null
    fromEmail?: string | null
    replyTo?: string | null
    recipientSource: 'customers_with_email' | 'manual'
    manualRecipients?: string[]
    metadata?: Record<string, unknown>
}

interface CampaignResult {
    recipientCount: number
    sentCount: number
    failedCount: number
    status: 'sent' | 'partial' | 'failed'
    sampleFailures: string[]
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DEFAULT_FROM_NAME = 'Ravenlia'
const DEFAULT_FROM_EMAIL = 'email@ravenlia.com'
const MAX_RECIPIENTS = 1000
const SEND_CHUNK_SIZE = 25

function normalizeEmail(value: string): string | null {
    const email = value.trim().toLowerCase()
    if (!EMAIL_REGEX.test(email)) return null
    return email
}

function dedupeValidEmails(values: string[]): string[] {
    const unique = new Set<string>()
    for (const value of values) {
        const normalized = normalizeEmail(value)
        if (normalized) unique.add(normalized)
    }
    return Array.from(unique)
}

async function resolveRecipients(
    adminClient: ReturnType<typeof createClient>,
    source: SendCampaignRequest['recipientSource'],
    manualRecipients: string[] | undefined
): Promise<string[]> {
    if (source === 'manual') {
        return dedupeValidEmails(manualRecipients ?? [])
    }

    const { data, error } = await adminClient
        .from('customers')
        .select('email')
        .eq('accepts_marketing', true)
        .not('email', 'is', null)

    if (error) {
        throw new Error(`Failed to load recipients: ${error.message}`)
    }

    const emails = (data ?? [])
        .map((row) => row.email)
        .filter((email): email is string => Boolean(email))

    return dedupeValidEmails(emails)
}

async function sendThroughResend(
    resendApiKey: string,
    payload: {
        subject: string
        html: string
        text?: string
        fromName: string
        fromEmail: string
        replyTo?: string | null
    },
    recipients: string[]
): Promise<CampaignResult> {
    let sentCount = 0
    let failedCount = 0
    const sampleFailures: string[] = []

    for (let i = 0; i < recipients.length; i += SEND_CHUNK_SIZE) {
        const chunk = recipients.slice(i, i + SEND_CHUNK_SIZE)

        const results = await Promise.all(
            chunk.map(async (recipient) => {
                const resendResponse = await fetch('https://api.resend.com/emails', {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${resendApiKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        from: `${payload.fromName} <${payload.fromEmail}>`,
                        to: [recipient],
                        reply_to: payload.replyTo || undefined,
                        subject: payload.subject,
                        html: payload.html,
                        text: payload.text,
                    }),
                })

                if (!resendResponse.ok) {
                    let reason = `HTTP ${resendResponse.status}`
                    try {
                        const json = await resendResponse.json() as { message?: string }
                        if (json.message) reason = json.message
                    } catch {
                        // no-op
                    }
                    return { ok: false, recipient, reason }
                }

                return { ok: true, recipient }
            })
        )

        for (const result of results) {
            if (result.ok) {
                sentCount += 1
            } else {
                failedCount += 1
                if (sampleFailures.length < 10) {
                    sampleFailures.push(`${result.recipient}: ${result.reason}`)
                }
            }
        }
    }

    const status: CampaignResult['status'] = failedCount === 0 ? 'sent' : sentCount === 0 ? 'failed' : 'partial'

    return {
        recipientCount: recipients.length,
        sentCount,
        failedCount,
        status,
        sampleFailures,
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

        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            return new Response(
                JSON.stringify({ error: 'Missing authorization header' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
            auth: { autoRefreshToken: false, persistSession: false },
        })

        const token = authHeader.replace('Bearer ', '')
        const { data: authData, error: authError } = await adminClient.auth.getUser(token)

        if (authError || !authData.user) {
            return new Response(
                JSON.stringify({ error: 'Invalid token' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const requesterId = authData.user.id
        const { data: requester, error: requesterError } = await adminClient
            .from('users')
            .select('role')
            .eq('id', requesterId)
            .single()

        if (requesterError || !requester) {
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

        const body = await req.json() as SendCampaignRequest

        if (!body.subject?.trim() || !body.html?.trim()) {
            return new Response(
                JSON.stringify({ error: 'Subject and HTML are required' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const fromEmail = normalizeEmail(body.fromEmail || DEFAULT_FROM_EMAIL)
        if (!fromEmail) {
            return new Response(
                JSON.stringify({ error: 'Invalid from email address' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const replyTo = body.replyTo ? normalizeEmail(body.replyTo) : null
        if (body.replyTo && !replyTo) {
            return new Response(
                JSON.stringify({ error: 'Invalid reply-to email address' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const recipients = await resolveRecipients(adminClient, body.recipientSource, body.manualRecipients)

        if (recipients.length === 0) {
            return new Response(
                JSON.stringify({ error: 'No valid recipients found' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        if (recipients.length > MAX_RECIPIENTS) {
            return new Response(
                JSON.stringify({ error: `Recipient count exceeds max of ${MAX_RECIPIENTS}` }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const sendResult = await sendThroughResend(
            resendApiKey,
            {
                subject: body.subject.trim(),
                html: body.html,
                text: body.text,
                fromName: body.fromName?.trim() || DEFAULT_FROM_NAME,
                fromEmail,
                replyTo,
            },
            recipients
        )

        const failureReason = sendResult.sampleFailures.length > 0
            ? sendResult.sampleFailures.join(' | ')
            : null

        const { error: insertError } = await adminClient
            .from('email_campaign_sends')
            .insert({
                template_id: body.templateId || null,
                template_name: body.templateName?.trim() || null,
                subject: body.subject.trim(),
                recipient_source: body.recipientSource,
                recipient_count: sendResult.recipientCount,
                sent_count: sendResult.sentCount,
                failed_count: sendResult.failedCount,
                status: sendResult.status,
                failure_reason: failureReason,
                initiated_by: requesterId,
                metadata: body.metadata ?? {},
            })

        if (insertError) {
            console.error('Failed to insert campaign log:', insertError)
        }

        return new Response(
            JSON.stringify({ success: true, ...sendResult }),
            {
                status: sendResult.status === 'failed' ? 502 : 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
        )
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        return new Response(
            JSON.stringify({ error: message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
