// Supabase Edge Function: stripe-terminal
// Handles Stripe Terminal operations for in-person card payments
// Uses direct fetch calls to Stripe API to avoid SDK compatibility issues

import { corsHeaders } from '../_shared/cors.ts'

const STRIPE_API_BASE = 'https://api.stripe.com/v1'

interface ConnectionTokenRequest {
    action: 'connection_token'
}

interface CreatePaymentIntentRequest {
    action: 'create_payment_intent'
    amount: number // Amount in cents
}

interface CapturePaymentIntentRequest {
    action: 'capture_payment_intent'
    paymentIntentId: string
}

interface CancelPaymentIntentRequest {
    action: 'cancel_payment_intent'
    paymentIntentId: string
}

type RequestBody =
    | ConnectionTokenRequest
    | CreatePaymentIntentRequest
    | CapturePaymentIntentRequest
    | CancelPaymentIntentRequest

// Helper to make Stripe API requests
async function stripeRequest(
    endpoint: string,
    method: 'GET' | 'POST',
    secretKey: string,
    body?: Record<string, string | number | string[]>
) {
    const headers: Record<string, string> = {
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
    }

    const options: RequestInit = {
        method,
        headers,
    }

    if (body) {
        const params = new URLSearchParams()
        for (const [key, value] of Object.entries(body)) {
            if (Array.isArray(value)) {
                value.forEach((v, i) => params.append(`${key}[${i}]`, v))
            } else {
                params.append(key, String(value))
            }
        }
        options.body = params.toString()
    }

    const response = await fetch(`${STRIPE_API_BASE}${endpoint}`, options)
    const data = await response.json()

    if (!response.ok) {
        throw new Error(data.error?.message || 'Stripe API error')
    }

    return data
}

Deno.serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')

        if (!stripeSecretKey) {
            return new Response(
                JSON.stringify({ error: 'Stripe not configured' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const body: RequestBody = await req.json()

        // Handle different actions
        if (body.action === 'connection_token') {
            // Create a connection token for the Terminal SDK
            const connectionToken = await stripeRequest(
                '/terminal/connection_tokens',
                'POST',
                stripeSecretKey
            )

            return new Response(
                JSON.stringify({ secret: connectionToken.secret }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )

        } else if (body.action === 'create_payment_intent') {
            const { amount } = body as CreatePaymentIntentRequest

            if (!amount || amount <= 0) {
                return new Response(
                    JSON.stringify({ error: 'Invalid amount' }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            // Create a PaymentIntent for Terminal (card_present)
            const paymentIntent = await stripeRequest(
                '/payment_intents',
                'POST',
                stripeSecretKey,
                {
                    amount,
                    currency: 'usd',
                    'payment_method_types[]': 'card_present',
                    capture_method: 'automatic',
                }
            )

            return new Response(
                JSON.stringify({
                    id: paymentIntent.id,
                    client_secret: paymentIntent.client_secret,
                    amount: paymentIntent.amount,
                    status: paymentIntent.status,
                }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )

        } else if (body.action === 'capture_payment_intent') {
            const { paymentIntentId } = body as CapturePaymentIntentRequest

            if (!paymentIntentId) {
                return new Response(
                    JSON.stringify({ error: 'Missing paymentIntentId' }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            const paymentIntent = await stripeRequest(
                `/payment_intents/${paymentIntentId}/capture`,
                'POST',
                stripeSecretKey
            )

            return new Response(
                JSON.stringify({
                    id: paymentIntent.id,
                    status: paymentIntent.status,
                    amount: paymentIntent.amount,
                }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )

        } else if (body.action === 'cancel_payment_intent') {
            const { paymentIntentId } = body as CancelPaymentIntentRequest

            if (!paymentIntentId) {
                return new Response(
                    JSON.stringify({ error: 'Missing paymentIntentId' }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            const paymentIntent = await stripeRequest(
                `/payment_intents/${paymentIntentId}/cancel`,
                'POST',
                stripeSecretKey
            )

            return new Response(
                JSON.stringify({
                    id: paymentIntent.id,
                    status: paymentIntent.status,
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
        console.error('Stripe Terminal error:', error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        return new Response(
            JSON.stringify({ error: errorMessage }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
