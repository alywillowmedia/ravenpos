import { corsHeaders } from '../_shared/cors.ts'

interface SyncKitRequest {
    customerId: string
    email: string | null
    name: string
    acceptsMarketing: boolean
}

interface KitSubscriber {
    id: string
}

interface KitSubscriberListResponse {
    subscribers?: KitSubscriber[]
}

const KIT_API_BASE = 'https://api.kit.com/v4'
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function normalizeEmail(email: string): string {
    return email.trim().toLowerCase()
}

function deriveFirstName(fullName: string): string | undefined {
    const trimmed = fullName.trim()
    if (!trimmed) return undefined
    return trimmed.split(/\s+/)[0]
}

async function kitRequest<T>(
    apiKey: string,
    endpoint: string,
    init: RequestInit
): Promise<T> {
    const response = await fetch(`${KIT_API_BASE}${endpoint}`, {
        ...init,
        headers: {
            'X-Kit-Api-Key': apiKey,
            'Content-Type': 'application/json',
            ...(init.headers ?? {}),
        },
    })

    if (!response.ok) {
        let reason = `HTTP ${response.status}`
        try {
            const errorBody = await response.json() as { message?: string; error?: string }
            if (errorBody.message || errorBody.error) {
                reason = errorBody.message || errorBody.error || reason
            }
        } catch {
            // no-op
        }
        throw new Error(`Kit API error: ${reason}`)
    }

    if (response.status === 204) {
        return {} as T
    }

    return await response.json() as T
}

async function ensureSubscribedToForm(apiKey: string, formId: string, email: string, fullName: string): Promise<void> {
    await kitRequest(apiKey, '/subscribers', {
        method: 'POST',
        body: JSON.stringify({
            email_address: email,
            first_name: deriveFirstName(fullName),
            state: 'active',
        }),
    })

    await kitRequest(apiKey, `/forms/${formId}/subscribers`, {
        method: 'POST',
        body: JSON.stringify({
            email_address: email,
            first_name: deriveFirstName(fullName),
        }),
    })
}

async function findSubscriberIdByEmail(apiKey: string, email: string): Promise<string | null> {
    const encodedEmail = encodeURIComponent(email)
    const result = await kitRequest<KitSubscriberListResponse>(
        apiKey,
        `/subscribers?email_address=${encodedEmail}&status=all&per_page=1`,
        { method: 'GET' }
    )

    return result.subscribers?.[0]?.id ?? null
}

async function unsubscribeSubscriber(apiKey: string, subscriberId: string): Promise<void> {
    await kitRequest(apiKey, `/subscribers/${subscriberId}/unsubscribe`, {
        method: 'POST',
        body: JSON.stringify({}),
    })
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const kitApiKey = Deno.env.get('KIT_API_KEY')
        const kitFormId = Deno.env.get('KIT_FORM_ID')

        if (!kitApiKey || !kitFormId) {
            return new Response(
                JSON.stringify({ error: 'Kit is not configured (missing KIT_API_KEY or KIT_FORM_ID)' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const body = await req.json() as SyncKitRequest

        if (!body.customerId) {
            return new Response(
                JSON.stringify({ error: 'Missing customerId' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        if (!body.email?.trim()) {
            return new Response(
                JSON.stringify({ success: true, action: 'skipped', reason: 'No email provided' }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const normalizedEmail = normalizeEmail(body.email)
        if (!EMAIL_REGEX.test(normalizedEmail)) {
            return new Response(
                JSON.stringify({ error: 'Invalid email address' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        if (body.acceptsMarketing) {
            await ensureSubscribedToForm(kitApiKey, kitFormId, normalizedEmail, body.name)
            return new Response(
                JSON.stringify({ success: true, action: 'subscribed' }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const subscriberId = await findSubscriberIdByEmail(kitApiKey, normalizedEmail)
        if (!subscriberId) {
            return new Response(
                JSON.stringify({ success: true, action: 'skipped', reason: 'Subscriber not found in Kit' }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        await unsubscribeSubscriber(kitApiKey, subscriberId)

        return new Response(
            JSON.stringify({ success: true, action: 'unsubscribed' }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown server error'
        return new Response(
            JSON.stringify({ error: message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
