-- Shopify Configuration Storage
-- Stores the active Shopify store connection settings

CREATE TABLE IF NOT EXISTS shopify_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_name TEXT NOT NULL,           -- e.g. "alywillow-ravenlia-test"
  location_id TEXT NOT NULL,          -- e.g. "79102574701"
  location_name TEXT,                 -- e.g. "Alywillow Test"
  webhook_secret TEXT NOT NULL,       -- For HMAC verification
  consignor_name TEXT DEFAULT 'Shopify Import', -- Consignor for imported items
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Only allow one active config at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_shopify_config_active 
  ON shopify_config(is_active) WHERE is_active = true;

-- RLS
ALTER TABLE shopify_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on shopify_config" ON shopify_config FOR ALL USING (true) WITH CHECK (true);

-- Updated_at trigger
CREATE TRIGGER shopify_config_updated_at
  BEFORE UPDATE ON shopify_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
