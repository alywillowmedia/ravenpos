-- Shopify Sync Support
-- Adds columns for Shopify product/variant tracking and sync logging

-- Add Shopify sync columns to items table
ALTER TABLE items
ADD COLUMN IF NOT EXISTS shopify_product_id TEXT,
ADD COLUMN IF NOT EXISTS shopify_variant_id TEXT,
ADD COLUMN IF NOT EXISTS shopify_inventory_item_id TEXT,
ADD COLUMN IF NOT EXISTS sync_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS last_sync_source TEXT,
ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

-- Index for efficient lookups by Shopify variant ID
CREATE INDEX IF NOT EXISTS idx_items_shopify_variant ON items(shopify_variant_id);

-- Sync log table for tracking inventory changes
CREATE TABLE IF NOT EXISTS sync_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id UUID REFERENCES items(id) ON DELETE SET NULL,
  direction TEXT NOT NULL, -- 'import', 'force_sync_from_shopify', 'push_to_shopify'
  old_quantity INTEGER,
  new_quantity INTEGER,
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying sync logs by item
CREATE INDEX IF NOT EXISTS idx_sync_log_item ON sync_log(item_id);
CREATE INDEX IF NOT EXISTS idx_sync_log_created ON sync_log(created_at);

-- RLS for sync_log (admin only for now)
ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on sync_log" ON sync_log FOR ALL USING (true) WITH CHECK (true);
