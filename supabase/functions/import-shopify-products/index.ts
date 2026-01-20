// Supabase Edge Function: import-shopify-products
// Imports products from Shopify and creates items in RavenPOS

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { getShopifyConfigFromDB, getShopifyToken, fetchAllProducts, type ShopifyProduct, type ShopifyVariant } from '../_shared/shopify.ts'

interface ImportResult {
    success: boolean;
    imported: number;
    skipped: number;
    errors: string[];
    consignor_id: string;
    consignor_created: boolean;
    consignor_name: string;
    store_name: string;
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

        // Get consignor name from database config, or use default
        let consignorName = 'Shopify Import'
        const { data: dbConfig } = await supabase
            .from('shopify_config')
            .select('consignor_name')
            .eq('is_active', true)
            .single()

        if (dbConfig?.consignor_name) {
            consignorName = dbConfig.consignor_name
        }

        let consignorCreated = false

        let { data: consignor, error: consignorError } = await supabase
            .from('consignors')
            .select('id')
            .eq('name', consignorName)
            .single()

        if (consignorError || !consignor) {
            // Create the consignor
            const { data: newConsignor, error: createError } = await supabase
                .from('consignors')
                .insert({
                    name: consignorName,
                    consignor_number: `SHOP-${config.storeName.slice(0, 8).toUpperCase()}`,
                    commission_split: 0.60,
                    is_active: true,
                    notes: `Auto-created for Shopify imports from ${config.storeName}`
                })
                .select('id')
                .single()

            if (createError) {
                throw new Error(`Failed to create consignor: ${createError.message}`)
            }
            consignor = newConsignor
            consignorCreated = true
            console.log('Created consignor:', consignorName)
        }

        // Get existing Shopify variant IDs to avoid duplicates
        const { data: existingItems } = await supabase
            .from('items')
            .select('shopify_variant_id')
            .not('shopify_variant_id', 'is', null)

        const existingVariantIds = new Set(
            existingItems?.map(item => item.shopify_variant_id) || []
        )
        console.log(`Found ${existingVariantIds.size} existing Shopify items`)

        // Process each product and its variants
        let imported = 0
        let skipped = 0
        const errors: string[] = []

        for (const product of products) {
            for (const variant of product.variants) {
                const variantId = String(variant.id)

                // Skip if already imported
                if (existingVariantIds.has(variantId)) {
                    skipped++
                    continue
                }

                // Generate item name (Product Title - Variant Title, unless variant is "Default Title")
                const itemName = variant.title === 'Default Title'
                    ? product.title
                    : `${product.title} - ${variant.title}`

                // Get first image if available
                const imageUrl = product.images?.[0]?.src || null

                // Create the item
                const { error: insertError } = await supabase
                    .from('items')
                    .insert({
                        consignor_id: consignor.id,
                        name: itemName,
                        sku: variant.sku || `SHOP-${variant.id}`,
                        category: product.product_type || 'Other',
                        price: parseFloat(variant.price),
                        quantity: variant.inventory_quantity,
                        image_url: imageUrl,
                        is_listed: true,
                        shopify_product_id: String(product.id),
                        shopify_variant_id: variantId,
                        shopify_inventory_item_id: String(variant.inventory_item_id),
                        sync_enabled: true,
                        last_sync_source: 'shopify',
                        last_synced_at: new Date().toISOString()
                    })

                if (insertError) {
                    console.error(`Failed to import variant ${variantId}:`, insertError.message)
                    errors.push(`${itemName}: ${insertError.message}`)
                } else {
                    imported++

                    // Log the import
                    await supabase.from('sync_log').insert({
                        direction: 'import',
                        old_quantity: 0,
                        new_quantity: variant.inventory_quantity,
                        success: true
                    })
                }
            }
        }

        console.log(`Import complete: ${imported} imported, ${skipped} skipped, ${errors.length} errors`)

        const result: ImportResult = {
            success: true,
            imported,
            skipped,
            errors,
            consignor_id: consignor.id,
            consignor_created: consignorCreated,
            consignor_name: consignorName,
            store_name: config.storeName
        }

        return new Response(
            JSON.stringify(result),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error) {
        console.error('Import error:', error)
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
