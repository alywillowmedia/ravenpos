-- Payouts table for tracking consignor payments
CREATE TABLE payouts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  consignor_id UUID NOT NULL REFERENCES consignors(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  sales_count INTEGER NOT NULL DEFAULT 0,
  items_sold INTEGER NOT NULL DEFAULT 0,
  gross_sales DECIMAL(10,2) NOT NULL DEFAULT 0,
  tax_collected DECIMAL(10,2) NOT NULL DEFAULT 0,
  store_share DECIMAL(10,2) NOT NULL DEFAULT 0,
  notes TEXT,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_payouts_consignor ON payouts(consignor_id);
CREATE INDEX idx_payouts_paid_at ON payouts(paid_at);

-- Row Level Security
ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;

-- Policy: Allow all operations for authenticated users (matches existing pattern)
CREATE POLICY "Allow all on payouts" ON payouts FOR ALL USING (true) WITH CHECK (true);
