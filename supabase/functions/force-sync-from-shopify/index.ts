// Supabase Edge Function: force-sync-from-shopify
// Updates all synced item quantities to match current Shopify inventory

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { getShopifyConfigFromDB, getShopifyToken, fetchAllProducts } from '../_shared/shopify.ts'

interface SyncDetail {
    sku: string;
    name: string;
    old_quantity: number;
    new_quantity: number;
}

interface SyncResult {
    success: boolean;
    updated: number;
    unchanged: number;
    total: number;
    details: SyncDetail[];
    errors: string[];
}

Deno.serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // Initialize Supabase client
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        // Get Shopify config from database (falls back to env vars)
        const config = await getShopifyConfigFromDB()
        console.log('Using Shopify store:', config.storeName)
        console.log('Getting Shopify access token...')
        const accessToken = await getShopifyToken(config)
        console.log('Got access token, fetching products...')

        // Fetch all products from Shopify
        const products = await fetchAllProducts(config, accessToken)
        console.log(`Fetched ${products.length} products from Shopify`)

        // Build map: inventory_item_id -> quantity
        const shopifyQuantities = new Map<string, number>()
        for (const product of products) {
            for (const variant of product.variants) {
                shopifyQuantities.set(String(variant.inventory_item_id), variant.inventory_quantity)
            }
        }
        console.log(`Built quantity map for ${shopifyQuantities.size} variants`)

        // Get all RavenPOS items with sync enabled
        const { data: syncedItems, error: fetchError } = await supabase
            .from('items')
            .select('id, sku, name, quantity, shopify_inventory_item_id')
            .eq('sync_enabled', true)
            .not('shopify_inventory_item_id', 'is', null)

        if (fetchError) {
            throw new Error(`Failed to fetch synced items: ${fetchError.message}`)
        }

        console.log(`Found ${syncedItems?.length || 0} synced items`)

        let updated = 0
        let unchanged = 0
        const details: SyncDetail[] = []
        const errors: string[] = []

        // Update quantities where they differ
        for (const item of syncedItems || []) {
            const shopifyQty = shopifyQuantities.get(item.shopify_inventory_item_id)

            if (shopifyQty === undefined) {
                // Item no longer exists in Shopify
                console.warn(`Item ${item.sku} not found in Shopify`)
                continue
            }

            if (shopifyQty === item.quantity) {
                unchanged++
                continue
            }

            // Update the quantity
            const { error: updateError } = await supabase
                .from('items')
                .update({
                    quantity: shopifyQty,
                    last_sync_source: 'shopify',
                    last_synced_at: new Date().toISOString()
                })
                .eq('id', item.id)

            if (updateError) {
                console.error(`Failed to update ${item.sku}:`, updateError.message)
                errors.push(`${item.sku}: ${updateError.message}`)

                // Log failed sync
                await supabase.from('sync_log').insert({
                    item_id: item.id,
                    direction: 'force_sync_from_shopify',
                    old_quantity: item.quantity,
                    new_quantity: shopifyQty,
                    success: false,
                    error_message: updateError.message
                })
            } else {
                updated++
                details.push({
                    sku: item.sku,
                    name: item.name,
                    old_quantity: item.quantity,
                    new_quantity: shopifyQty
                })

                // Log successful sync
                await supabase.from('sync_log').insert({
                    item_id: item.id,
                    direction: 'force_sync_from_shopify',
                    old_quantity: item.quantity,
                    new_quantity: shopifyQty,
                    success: true
                })
            }
        }

        console.log(`Sync complete: ${updated} updated, ${unchanged} unchanged, ${errors.length} errors`)

        const result: SyncResult = {
            success: true,
            updated,
            unchanged,
            total: syncedItems?.length || 0,
            details,
            errors
        }

        return new Response(
            JSON.stringify(result),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error) {
        console.error('Sync error:', error)
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
