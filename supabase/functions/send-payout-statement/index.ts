// Supabase Edge Function: send-payout-statement
// Emails a vendor their statement after a payout is marked paid.
// Input is { payoutId } only. The recipient is always consignors.email.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import {
    buildStatementEmail,
    isUsableEmail,
    normalizePortalUrl,
    rollsForwardAmount,
    scopeLabelFor,
} from './statement.ts'

declare const Deno: {
    serve: (handler: (req: Request) => Response | Promise<Response>) => void;
    env: {
        get: (key: string) => string | undefined;
    };
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
}

function toNumber(value: unknown): number | null {
    if (value === null || value === undefined) return null
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
}

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            return json({ error: 'Missing authorization header' }, 401)
        }

        const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
            auth: { autoRefreshToken: false, persistSession: false },
        })

        const token = authHeader.replace('Bearer ', '')
        const { data: { user }, error: authError } = await adminClient.auth.getUser(token)
        if (authError || !user) {
            console.error('Auth error:', authError?.status, authError?.name)
            return json({ error: 'Invalid token' }, 401)
        }

        const { data: userData, error: userError } = await adminClient
            .from('users')
            .select('role')
            .eq('id', user.id)
            .single()
        if (userError) {
            console.error('User lookup error:', userError.code)
            return json({ error: 'User not found in system' }, 403)
        }
        if (userData.role !== 'admin') {
            return json({ error: 'Admin access required' }, 403)
        }

        let body: { payoutId?: unknown }
        try {
            body = await req.json()
        } catch {
            return json({ error: 'Invalid request body' }, 400)
        }
        const payoutId = typeof body?.payoutId === 'string' ? body.payoutId : ''
        if (!UUID_REGEX.test(payoutId)) {
            return json({ error: 'A valid payoutId is required' }, 400)
        }

        const { data: payout, error: payoutError } = await adminClient
            .from('payouts')
            .select('id, consignor_id, amount, status, payment_method, payment_reference, payment_date, cutoff_at, range_mode, source_range_start, source_range_end, carried_in_snapshot, earned_snapshot, original_amount_due')
            .eq('id', payoutId)
            .maybeSingle()
        if (payoutError) {
            console.error('Payout lookup error:', payoutError.code)
            return json({ error: 'Failed to load payout' }, 500)
        }
        if (!payout) {
            return json({ error: 'Payout not found' }, 404)
        }
        if (payout.status !== 'paid') {
            return json({ error: 'Statements can only be sent for paid payouts' }, 400)
        }

        const { data: consignor, error: consignorError } = await adminClient
            .from('consignors')
            .select('name, business_name, email')
            .eq('id', payout.consignor_id)
            .maybeSingle()
        if (consignorError || !consignor) {
            console.error('Vendor lookup error:', consignorError?.code)
            return json({ error: 'Failed to load vendor' }, 500)
        }

        const recipient = isUsableEmail(consignor.email)
        if (!recipient) {
            return json({ status: 'no_email' })
        }

        const resendApiKey = Deno.env.get('RESEND_API_KEY')

        const { data: adjustments, error: adjustmentsError } = await adminClient
            .from('payout_adjustments')
            .select('description, amount')
            .eq('payout_id', payoutId)
            .lt('amount', 0)
            .order('created_at', { ascending: true })
        if (adjustmentsError) {
            console.error('Adjustments lookup error:', adjustmentsError.code)
            return json({ error: 'Failed to load deductions' }, 500)
        }

        const amount = toNumber(payout.amount) ?? 0
        const portalUrl = normalizePortalUrl(Deno.env.get('PORTAL_URL'))
        const email = buildStatementEmail({
            vendorName: consignor.business_name || consignor.name || 'Vendor',
            amount,
            paidDate: payout.payment_date ?? '',
            method: payout.payment_method,
            reference: payout.payment_reference || null,
            scopeLabel: scopeLabelFor(payout),
            carriedIn: toNumber(payout.carried_in_snapshot),
            earned: toNumber(payout.earned_snapshot),
            deductions: (adjustments ?? []).map((row: { description: string | null; amount: unknown }) => ({
                label: row.description || 'Deduction',
                amount: Math.abs(toNumber(row.amount) ?? 0),
            })),
            rollsForward: rollsForwardAmount(toNumber(payout.original_amount_due), amount),
            statementUrl: portalUrl ? `${portalUrl}/vendor/payouts/${payoutId}` : null,
        })

        let status: 'sent' | 'failed' = 'failed'
        let providerId: string | null = null
        let errorMessage: string | null = null
        if (!resendApiKey) {
            errorMessage = 'Email service not configured'
            console.error('RESEND_API_KEY not configured')
        } else try {
            const resendResponse = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${resendApiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    from: 'Ravenlia <email@ravenlia.com>',
                    to: [recipient],
                    subject: email.subject,
                    html: email.html,
                }),
                signal: AbortSignal.timeout(10000),
            })
            const result = await resendResponse.json().catch(() => ({}))
            if (resendResponse.ok) {
                status = 'sent'
                providerId = typeof result?.id === 'string' ? result.id : null
            } else {
                errorMessage = String(result?.message || `Resend responded with ${resendResponse.status}`)
                console.error('Resend API error:', resendResponse.status, result?.name)
            }
        } catch (sendError: unknown) {
            errorMessage = sendError instanceof Error ? sendError.message : 'Failed to reach the email service'
            console.error('Resend request failed:', sendError instanceof Error ? sendError.name : 'unknown')
        }

        const { error: logError } = await adminClient.from('payout_statement_emails').insert({
            payout_id: payoutId,
            recipient,
            status,
            provider_id: providerId,
            error: errorMessage,
            sent_by: user.id,
        })
        if (logError) {
            console.error('Failed to record statement email attempt:', logError.code)
        }

        return json({ status })
    } catch (error: unknown) {
        console.error('Unhandled error:', error instanceof Error ? error.name : 'unknown')
        return json({ error: 'Failed to send payout statement' }, 500)
    }
})
