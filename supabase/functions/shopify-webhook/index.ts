// Supabase Edge Function: shopify-webhook
// Receives inventory update webhooks from Shopify and updates RavenPOS

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { verifyShopifyWebhook } from '../_shared/shopify.ts'

interface InventoryLevelUpdate {
    inventory_item_id: number;
    location_id: number;
    available: number;
    updated_at: string;
}

Deno.serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // Get the raw body for HMAC verification
        const payload = await req.text()

        // Verify webhook signature
        const hmacHeader = req.headers.get('X-Shopify-Hmac-SHA256')
        if (!hmacHeader) {
            console.error('Missing HMAC header')
            return new Response(
                JSON.stringify({ error: 'Missing signature' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const isValid = await verifyShopifyWebhook(payload, hmacHeader)
        if (!isValid) {
            console.error('Invalid webhook signature')
            return new Response(
                JSON.stringify({ error: 'Invalid signature' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Parse the webhook payload
        const data: InventoryLevelUpdate = JSON.parse(payload)
        console.log('Received inventory update:', data)

        // Initialize Supabase client
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        // Find the item by shopify_inventory_item_id
        const { data: item, error: fetchError } = await supabase
            .from('items')
            .select('id, sku, name, quantity, sync_enabled, last_sync_source, last_synced_at')
            .eq('shopify_inventory_item_id', String(data.inventory_item_id))
            .single()

        if (fetchError || !item) {
            console.log('Item not found for inventory_item_id:', data.inventory_item_id)
            // Not an error - item might not be synced
            return new Response(
                JSON.stringify({ success: true, message: 'Item not found, skipping' }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        if (!item.sync_enabled) {
            console.log('Sync disabled for item:', item.sku)
            return new Response(
                JSON.stringify({ success: true, message: 'Sync disabled for item' }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Loop prevention: Skip if this is an echo of our own push
        if (item.last_sync_source === 'ravenpos' && item.last_synced_at) {
            const lastSyncTime = new Date(item.last_synced_at).getTime()
            const now = Date.now()
            const timeSinceSync = now - lastSyncTime

            // If last sync was from RavenPOS and within 10 seconds, skip
            if (timeSinceSync < 10000) {
                console.log('Skipping webhook - appears to be echo of RavenPOS push')
                return new Response(
                    JSON.stringify({ success: true, message: 'Skipped - echo prevention' }),
                    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }
        }

        // Check if quantity actually changed
        if (item.quantity === data.available) {
            console.log('Quantity unchanged, skipping')
            return new Response(
                JSON.stringify({ success: true, message: 'Quantity unchanged' }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const oldQuantity = item.quantity

        // Update the item
        const { error: updateError } = await supabase
            .from('items')
            .update({
                quantity: data.available,
                last_sync_source: 'shopify',
                last_synced_at: new Date().toISOString()
            })
            .eq('id', item.id)

        if (updateError) {
            console.error('Failed to update item:', updateError.message)

            // Log failed sync
            await supabase.from('sync_log').insert({
                item_id: item.id,
                direction: 'webhook_from_shopify',
                old_quantity: oldQuantity,
                new_quantity: data.available,
                success: false,
                error_message: updateError.message
            })

            return new Response(
                JSON.stringify({ error: updateError.message }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Log successful sync
        await supabase.from('sync_log').insert({
            item_id: item.id,
            direction: 'webhook_from_shopify',
            old_quantity: oldQuantity,
            new_quantity: data.available,
            success: true
        })

        console.log(`Updated ${item.sku}: ${oldQuantity} → ${data.available}`)

        return new Response(
            JSON.stringify({
                success: true,
                item_id: item.id,
                sku: item.sku,
                old_quantity: oldQuantity,
                new_quantity: data.available
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error) {
        console.error('Webhook error:', error)
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
