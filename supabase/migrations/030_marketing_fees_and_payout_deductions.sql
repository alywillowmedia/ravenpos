-- Marketing fees and payout deduction tracking

CREATE TABLE IF NOT EXISTS marketing_fees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
  consignor_count INTEGER NOT NULL CHECK (consignor_count > 0),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS marketing_fee_allocations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  marketing_fee_id UUID NOT NULL REFERENCES marketing_fees(id) ON DELETE CASCADE,
  consignor_id UUID NOT NULL REFERENCES consignors(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL CHECK (amount >= 0),
  deducted_payout_id UUID REFERENCES payouts(id) ON DELETE SET NULL,
  deducted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketing_fees_created_at ON marketing_fees(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_fee_allocations_consignor ON marketing_fee_allocations(consignor_id);
CREATE INDEX IF NOT EXISTS idx_marketing_fee_allocations_unpaid ON marketing_fee_allocations(consignor_id, deducted_payout_id) WHERE deducted_payout_id IS NULL;

ALTER TABLE marketing_fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_fee_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage marketing fees" ON marketing_fees;
CREATE POLICY "Admins can manage marketing fees" ON marketing_fees
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins can manage marketing allocations" ON marketing_fee_allocations;
CREATE POLICY "Admins can manage marketing allocations" ON marketing_fee_allocations
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Vendors can read own marketing allocations" ON marketing_fee_allocations;
CREATE POLICY "Vendors can read own marketing allocations" ON marketing_fee_allocations
  FOR SELECT
  USING (
    get_user_role() = 'vendor'
    AND consignor_id = get_user_consignor_id()
  );

ALTER TABLE payouts
ADD COLUMN IF NOT EXISTS booth_rent_deduction DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS marketing_fee_deduction DECIMAL(10,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN payouts.booth_rent_deduction IS 'Booth-rent amount deducted from this payout.';
COMMENT ON COLUMN payouts.marketing_fee_deduction IS 'Marketing-fee amount deducted from this payout.';
