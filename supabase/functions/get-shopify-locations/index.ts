// Supabase Edge Function: get-shopify-locations
// Fetches available locations from a Shopify store

import { corsHeaders } from '../_shared/cors.ts'
import { getShopifyToken } from '../_shared/shopify.ts'

interface LocationsRequest {
    store_name: string;
}

interface ShopifyLocation {
    id: number;
    name: string;
    address1: string | null;
    city: string | null;
    province: string | null;
    country: string;
    active: boolean;
}

Deno.serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const body: LocationsRequest = await req.json()

        if (!body.store_name) {
            return new Response(
                JSON.stringify({ error: 'Missing store_name' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Get OAuth token using stored client credentials
        const clientId = Deno.env.get('SHOPIFY_CLIENT_ID')
        const clientSecret = Deno.env.get('SHOPIFY_CLIENT_SECRET')
        const apiVersion = Deno.env.get('SHOPIFY_API_VERSION') || '2024-01'

        if (!clientId || !clientSecret) {
            return new Response(
                JSON.stringify({ error: 'Shopify app credentials not configured' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Get token for the specified store
        const tokenResponse = await fetch(
            `https://${body.store_name}.myshopify.com/admin/oauth/access_token`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_id: clientId,
                    client_secret: clientSecret,
                    grant_type: 'client_credentials',
                }),
            }
        )

        if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text()
            console.error('Token error:', errorText)
            return new Response(
                JSON.stringify({
                    error: 'Failed to connect to store. Make sure the store name is correct and the app is installed.',
                    details: tokenResponse.status === 404 ? 'Store not found' : 'Authentication failed'
                }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const tokenData = await tokenResponse.json()
        const accessToken = tokenData.access_token

        // Fetch locations
        const locationsResponse = await fetch(
            `https://${body.store_name}.myshopify.com/admin/api/${apiVersion}/locations.json`,
            {
                headers: {
                    'X-Shopify-Access-Token': accessToken,
                    'Content-Type': 'application/json',
                },
            }
        )

        if (!locationsResponse.ok) {
            const errorText = await locationsResponse.text()
            console.error('Locations error:', errorText)
            return new Response(
                JSON.stringify({ error: 'Failed to fetch locations' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const locationsData = await locationsResponse.json()

        // Filter to active locations and format response
        const locations = locationsData.locations
            .filter((loc: ShopifyLocation) => loc.active)
            .map((loc: ShopifyLocation) => ({
                id: String(loc.id),
                name: loc.name,
                address: [loc.address1, loc.city, loc.province, loc.country]
                    .filter(Boolean)
                    .join(', ')
            }))

        return new Response(
            JSON.stringify({
                success: true,
                store_name: body.store_name,
                locations
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error) {
        console.error('Error:', error)
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
