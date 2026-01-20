// Supabase Edge Function: process-stripe-refund
// Handles Stripe refund processing for card payments

import { corsHeaders } from '../_shared/cors.ts'

const STRIPE_API_BASE = 'https://api.stripe.com/v1'

interface RefundRequest {
    payment_intent_id: string
    amount: number // Amount in cents
}

// Helper to make Stripe API requests
async function stripeRequest(
    endpoint: string,
    method: 'GET' | 'POST',
    secretKey: string,
    body?: Record<string, string | number>
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
            params.append(key, String(value))
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

        const body: RefundRequest = await req.json()
        const { payment_intent_id, amount } = body

        if (!payment_intent_id) {
            return new Response(
                JSON.stringify({ error: 'Missing payment_intent_id' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        if (!amount || amount <= 0) {
            return new Response(
                JSON.stringify({ error: 'Invalid refund amount' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Create refund through Stripe API
        const refund = await stripeRequest(
            '/refunds',
            'POST',
            stripeSecretKey,
            {
                payment_intent: payment_intent_id,
                amount: amount,
            }
        )

        console.log('Stripe refund created:', refund.id)

        return new Response(
            JSON.stringify({
                stripe_refund_id: refund.id,
                status: refund.status,
                amount: refund.amount,
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error) {
        console.error('Stripe Refund error:', error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        return new Response(
            JSON.stringify({ error: errorMessage }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
