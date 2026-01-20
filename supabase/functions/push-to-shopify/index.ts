// Supabase Edge Function: push-to-shopify
// Pushes inventory changes from RavenPOS to Shopify

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { getShopifyConfigFromDB, getShopifyToken, setInventoryLevel, adjustInventory } from '../_shared/shopify.ts'

interface PushRequest {
    item_id: string;
    // Either provide absolute quantity OR adjustment (not both)
    quantity?: number;      // Set absolute quantity
    adjustment?: number;    // Adjust by this amount (negative for decrease)
}

Deno.serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const body: PushRequest = await req.json()
        console.log('Push to Shopify request:', body)

        if (!body.item_id) {
            return new Response(
                JSON.stringify({ error: 'Missing item_id' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        if (body.quantity === undefined && body.adjustment === undefined) {
            return new Response(
                JSON.stringify({ error: 'Must provide either quantity or adjustment' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Initialize Supabase client
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        // Get the item
        const { data: item, error: fetchError } = await supabase
            .from('items')
            .select('id, sku, name, quantity, shopify_inventory_item_id, sync_enabled')
            .eq('id', body.item_id)
            .single()

        if (fetchError || !item) {
            return new Response(
                JSON.stringify({ error: 'Item not found' }),
                { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        if (!item.sync_enabled || !item.shopify_inventory_item_id) {
            return new Response(
                JSON.stringify({
                    success: true,
                    message: 'Item not synced with Shopify',
                    skipped: true
                }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const oldQuantity = item.quantity

        // Mark as syncing from RavenPOS BEFORE calling Shopify API
        // This prevents the webhook from creating a loop
        await supabase
            .from('items')
            .update({
                last_sync_source: 'ravenpos',
                last_synced_at: new Date().toISOString()
            })
            .eq('id', item.id)

        // Get Shopify config from database (falls back to env vars)
        const config = await getShopifyConfigFromDB()
        const accessToken = await getShopifyToken(config)

        try {
            if (body.quantity !== undefined) {
                // Set absolute quantity
                await setInventoryLevel(
                    config,
                    accessToken,
                    item.shopify_inventory_item_id,
                    config.locationId,
                    body.quantity
                )
            } else if (body.adjustment !== undefined) {
                // Adjust by delta
                await adjustInventory(
                    config,
                    accessToken,
                    item.shopify_inventory_item_id,
                    config.locationId,
                    body.adjustment
                )
            }

            // Log successful sync
            const newQuantity = body.quantity !== undefined
                ? body.quantity
                : oldQuantity + (body.adjustment || 0)

            await supabase.from('sync_log').insert({
                item_id: item.id,
                direction: 'push_to_shopify',
                old_quantity: oldQuantity,
                new_quantity: newQuantity,
                success: true
            })

            console.log(`Pushed ${item.sku} to Shopify: ${oldQuantity} → ${newQuantity}`)

            return new Response(
                JSON.stringify({
                    success: true,
                    item_id: item.id,
                    sku: item.sku,
                    old_quantity: oldQuantity,
                    new_quantity: newQuantity
                }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )

        } catch (shopifyError) {
            // Log failed sync
            await supabase.from('sync_log').insert({
                item_id: item.id,
                direction: 'push_to_shopify',
                old_quantity: oldQuantity,
                new_quantity: body.quantity ?? oldQuantity + (body.adjustment || 0),
                success: false,
                error_message: shopifyError.message
            })

            throw shopifyError
        }

    } catch (error) {
        console.error('Push to Shopify error:', error)
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
