# Shopify Inventory Sync - System Documentation

RavenPOS ↔ Shopify bi-directional inventory sync.

---

## How It Works

### Direction 1: Shopify → RavenPOS

When inventory changes in Shopify:
1. Shopify sends a webhook to `shopify-webhook` edge function
2. Function verifies HMAC signature for security
3. Finds matching item by `shopify_inventory_item_id`
4. Updates RavenPOS quantity
5. Sets `last_sync_source = 'shopify'` to prevent loop

### Direction 2: RavenPOS → Shopify

When inventory changes in RavenPOS (sale or manual edit):
1. Frontend calls `push-to-shopify` edge function
2. First sets `last_sync_source = 'ravenpos'` (loop prevention)
3. Calls Shopify Inventory Levels API
4. Shopify sends webhook back, but we skip it (source was 'ravenpos')

### Loop Prevention

The `last_sync_source` and `last_synced_at` fields prevent infinite sync loops:
- If a change came FROM Shopify, don't push it BACK to Shopify
- If a change came FROM RavenPOS and webhook arrives within 10 seconds, skip it

---

## File Locations

### Edge Functions (Supabase)

| File | Purpose |
|------|---------|
| `supabase/functions/_shared/shopify.ts` | OAuth token, API helpers, HMAC verification |
| `supabase/functions/_shared/cors.ts` | CORS headers |
| `supabase/functions/import-shopify-products/index.ts` | Import products from Shopify |
| `supabase/functions/force-sync-from-shopify/index.ts` | Force sync all quantities from Shopify |
| `supabase/functions/push-to-shopify/index.ts` | Push single item change to Shopify |
| `supabase/functions/shopify-webhook/index.ts` | Receive Shopify webhooks |

### Frontend (React)

| File | Purpose |
|------|---------|
| `src/pages/Integrations.tsx` | Admin integrations page |
| `src/components/integrations/ShopifySync.tsx` | Import/force-sync UI controls |
| `src/hooks/useSales.ts` | Syncs to Shopify after sales |
| `src/hooks/useInventory.ts` | Syncs to Shopify after manual edits |

### Database

| File | Purpose |
|------|---------|
| `supabase/migrations/013_shopify_sync.sql` | Adds sync columns and `sync_log` table |

### Items Table Columns

```sql
shopify_product_id       -- Shopify product ID
shopify_variant_id       -- Shopify variant ID (unique per SKU)
shopify_inventory_item_id -- Used for inventory API calls
sync_enabled             -- Boolean, whether to sync this item
last_sync_source         -- 'shopify' or 'ravenpos' (loop prevention)
last_synced_at           -- Timestamp of last sync
```

---

## Environment Variables

Set these in Supabase Dashboard → Settings → Edge Functions → Secrets:

| Variable | Description |
|----------|-------------|
| `SHOPIFY_STORE_NAME` | Store subdomain (e.g., `alywillow-ravenlia-test`) |
| `SHOPIFY_CLIENT_ID` | OAuth app client ID |
| `SHOPIFY_CLIENT_SECRET` | OAuth app client secret |
| `SHOPIFY_LOCATION_ID` | Inventory location ID |
| `SHOPIFY_API_VERSION` | API version (e.g., `2024-01`) |
| `SHOPIFY_WEBHOOK_SECRET` | Webhook signing secret for HMAC verification |

---

## Switching to a Different Shopify Store

### Step 1: Create Shopify Custom App

1. Go to Shopify Admin → Settings → Apps and sales channels → Develop apps
2. Create a new app
3. Configure API scopes:
   - `read_products`
   - `write_products`
   - `read_inventory`
   - `write_inventory`
4. Install the app and get:
   - **Client ID** and **Client Secret** (from API credentials)
   - **Webhook signing secret** (from Notifications → Webhooks)

### Step 2: Get Location ID

Run this curl command (replace with your store and token):

```bash
curl "https://YOUR-STORE.myshopify.com/admin/api/2024-01/locations.json" \
  -H "X-Shopify-Access-Token: YOUR_ACCESS_TOKEN"
```

Find the ID of the location you want to sync inventory for.

### Step 3: Update Environment Variables

In Supabase Dashboard → Settings → Edge Functions → Secrets:

```
SHOPIFY_STORE_NAME=your-new-store
SHOPIFY_CLIENT_ID=new_client_id
SHOPIFY_CLIENT_SECRET=new_client_secret
SHOPIFY_LOCATION_ID=new_location_id
SHOPIFY_WEBHOOK_SECRET=new_webhook_secret
```

### Step 4: Register Webhook in New Store

In Shopify Admin → Settings → Notifications → Webhooks:

- **Event:** Inventory levels update
- **URL:** `https://YOUR-PROJECT.supabase.co/functions/v1/shopify-webhook`
- **Format:** JSON

### Step 5: Delete Old Data (Optional)

If switching stores completely, clear existing synced items:

```sql
-- Remove Shopify data from all items
UPDATE items SET 
  shopify_product_id = NULL,
  shopify_variant_id = NULL,
  shopify_inventory_item_id = NULL,
  sync_enabled = false,
  last_sync_source = NULL,
  last_synced_at = NULL
WHERE sync_enabled = true;

-- Clear sync log
TRUNCATE sync_log;
```

### Step 6: Import New Products

Go to Integrations page and click "Import Products" to import from the new store.

---

## Consignor for Shopify Items

All Shopify-imported items are assigned to the **"Alywillow_Test_V1"** consignor (created automatically if it doesn't exist).

To change this, edit `supabase/functions/import-shopify-products/index.ts`:

```typescript
const consignorName = 'Alywillow_Test_V1'; // Change this
```

---

## Sync Log

All sync operations are logged to the `sync_log` table:

```sql
SELECT * FROM sync_log ORDER BY created_at DESC LIMIT 50;
```

Columns:
- `item_id` - Item that was synced
- `direction` - 'import', 'force_sync_from_shopify', 'push_to_shopify', 'webhook_from_shopify'
- `old_quantity`, `new_quantity` - Before/after values
- `success` - Whether sync succeeded
- `error_message` - Error details if failed

---

## Troubleshooting

### Webhook not working?

1. Check webhook is registered in Shopify (Settings → Notifications → Webhooks)
2. Verify `SHOPIFY_WEBHOOK_SECRET` matches the secret shown in Shopify
3. Check Supabase Edge Function logs for errors

### Sync loop?

If quantities keep changing back and forth:
1. Check `last_sync_source` on affected items
2. Ensure webhook handler and push function are both setting source correctly
3. Check for multiple webhooks registered

### Items not syncing?

1. Verify `sync_enabled = true` on the item
2. Verify `shopify_inventory_item_id` is populated
3. Check sync_log for errors

---

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/functions/v1/import-shopify-products` | POST | Import all products from Shopify |
| `/functions/v1/force-sync-from-shopify` | POST | Force update all RavenPOS quantities |
| `/functions/v1/push-to-shopify` | POST | Push single item change to Shopify |
| `/functions/v1/shopify-webhook` | POST | Receive Shopify inventory webhooks |

### push-to-shopify Request Body

```json
{
  "item_id": "uuid",
  "quantity": 10       // Set absolute quantity
  // OR
  "adjustment": -2     // Relative change
}
```
