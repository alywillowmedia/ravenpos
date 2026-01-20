// Shopify API helpers for Edge Functions
// Uses OAuth Client Credentials flow for access token

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export interface ShopifyConfig {
    storeName: string;
    clientId: string;
    clientSecret: string;
    apiVersion: string;
    locationId: string;
    webhookSecret?: string;
}

/**
 * Get Shopify config from environment variables (original method)
 */
export function getShopifyConfig(): ShopifyConfig {
    const storeName = Deno.env.get('SHOPIFY_STORE_NAME');
    const clientId = Deno.env.get('SHOPIFY_CLIENT_ID');
    const clientSecret = Deno.env.get('SHOPIFY_CLIENT_SECRET');
    const apiVersion = Deno.env.get('SHOPIFY_API_VERSION') || '2024-01';
    const locationId = Deno.env.get('SHOPIFY_LOCATION_ID');

    if (!storeName || !clientId || !clientSecret || !locationId) {
        throw new Error('Missing Shopify configuration. Required: SHOPIFY_STORE_NAME, SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET, SHOPIFY_LOCATION_ID');
    }

    return { storeName, clientId, clientSecret, apiVersion, locationId };
}

/**
 * Get Shopify config from database first, fall back to environment variables.
 * This allows UI-based store configuration while preserving backward compatibility.
 */
export async function getShopifyConfigFromDB(): Promise<ShopifyConfig> {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (supabaseUrl && supabaseServiceKey) {
        try {
            const supabase = createClient(supabaseUrl, supabaseServiceKey);

            const { data: dbConfig } = await supabase
                .from('shopify_config')
                .select('store_name, location_id, webhook_secret')
                .eq('is_active', true)
                .single();

            if (dbConfig) {
                const clientId = Deno.env.get('SHOPIFY_CLIENT_ID');
                const clientSecret = Deno.env.get('SHOPIFY_CLIENT_SECRET');
                const apiVersion = Deno.env.get('SHOPIFY_API_VERSION') || '2024-01';

                if (clientId && clientSecret) {
                    console.log('Using Shopify config from database:', dbConfig.store_name);
                    return {
                        storeName: dbConfig.store_name,
                        clientId,
                        clientSecret,
                        apiVersion,
                        locationId: dbConfig.location_id,
                        webhookSecret: dbConfig.webhook_secret,
                    };
                }
            }
        } catch (err) {
            console.log('No database config found, falling back to env vars');
        }
    }

    // Fall back to environment variables
    return getShopifyConfig();
}

/**
 * Get OAuth access token from Shopify using client credentials flow.
 * Token is valid for 24 hours.
 */
export async function getShopifyToken(config: ShopifyConfig): Promise<string> {
    const response = await fetch(
        `https://${config.storeName}.myshopify.com/admin/oauth/access_token`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: config.clientId,
                client_secret: config.clientSecret,
                grant_type: 'client_credentials',
            }),
        }
    );

    if (!response.ok) {
        const errorText = await response.text();
        console.error('Shopify OAuth error:', errorText);
        throw new Error(`Failed to get Shopify token: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.access_token;
}

/**
 * Get base URL for Shopify Admin API
 */
export function getShopifyApiUrl(config: ShopifyConfig): string {
    return `https://${config.storeName}.myshopify.com/admin/api/${config.apiVersion}`;
}

/**
 * Fetch all products from Shopify (handles pagination)
 */
export interface ShopifyVariant {
    id: number;
    product_id: number;
    title: string;
    sku: string;
    price: string;
    inventory_item_id: number;
    inventory_quantity: number;
    barcode: string | null;
}

export interface ShopifyProduct {
    id: number;
    title: string;
    product_type: string;
    variants: ShopifyVariant[];
    images: Array<{ src: string }>;
}

export async function fetchAllProducts(
    config: ShopifyConfig,
    accessToken: string
): Promise<ShopifyProduct[]> {
    const allProducts: ShopifyProduct[] = [];
    let url: string | null = `${getShopifyApiUrl(config)}/products.json?limit=250`;

    while (url) {
        const response = await fetch(url, {
            headers: {
                'X-Shopify-Access-Token': accessToken,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Shopify API error:', errorText);
            throw new Error(`Failed to fetch products: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        allProducts.push(...data.products);

        // Check for pagination via Link header
        const linkHeader = response.headers.get('Link');
        url = null;
        if (linkHeader) {
            const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
            if (nextMatch) {
                url = nextMatch[1];
            }
        }
    }

    return allProducts;
}

/**
 * Verify Shopify webhook HMAC signature
 * Checks database config first, falls back to env var
 */
export async function verifyShopifyWebhook(
    payload: string,
    hmacHeader: string
): Promise<boolean> {
    let secret = Deno.env.get('SHOPIFY_WEBHOOK_SECRET');

    // Try to get webhook secret from database config
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (supabaseUrl && supabaseServiceKey) {
        try {
            const supabase = createClient(supabaseUrl, supabaseServiceKey);
            const { data: dbConfig } = await supabase
                .from('shopify_config')
                .select('webhook_secret')
                .eq('is_active', true)
                .single();

            if (dbConfig?.webhook_secret) {
                secret = dbConfig.webhook_secret;
            }
        } catch (err) {
            // Fall through to env var
        }
    }

    if (!secret) {
        console.error('SHOPIFY_WEBHOOK_SECRET not configured');
        return false;
    }

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );

    const signature = await crypto.subtle.sign(
        'HMAC',
        key,
        encoder.encode(payload)
    );

    // Convert to base64
    const computedHmac = btoa(String.fromCharCode(...new Uint8Array(signature)));

    return computedHmac === hmacHeader;
}

/**
 * Set absolute inventory level for an item at a location
 */
export async function setInventoryLevel(
    config: ShopifyConfig,
    accessToken: string,
    inventoryItemId: string,
    locationId: string,
    available: number
): Promise<void> {
    const url = `${getShopifyApiUrl(config)}/inventory_levels/set.json`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'X-Shopify-Access-Token': accessToken,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            location_id: locationId,
            inventory_item_id: inventoryItemId,
            available: available,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('Shopify inventory set error:', errorText);
        throw new Error(`Failed to set inventory: ${response.status} ${response.statusText}`);
    }
}

/**
 * Adjust inventory level by a delta amount (positive or negative)
 */
export async function adjustInventory(
    config: ShopifyConfig,
    accessToken: string,
    inventoryItemId: string,
    locationId: string,
    adjustment: number
): Promise<void> {
    const url = `${getShopifyApiUrl(config)}/inventory_levels/adjust.json`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'X-Shopify-Access-Token': accessToken,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            location_id: locationId,
            inventory_item_id: inventoryItemId,
            available_adjustment: adjustment,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('Shopify inventory adjust error:', errorText);
        throw new Error(`Failed to adjust inventory: ${response.status} ${response.statusText}`);
    }
}
