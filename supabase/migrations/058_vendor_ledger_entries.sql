-- Vendor ledger entries for one-off payout deductions

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS vendor_ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consignor_id UUID NOT NULL REFERENCES consignors(id) ON DELETE CASCADE,
  description TEXT NOT NULL CHECK (length(trim(description)) > 0),
  amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
  deducted_payout_id UUID REFERENCES payouts(id) ON DELETE SET NULL,
  deducted_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendor_ledger_entries_consignor
  ON vendor_ledger_entries(consignor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_ledger_entries_unpaid
  ON vendor_ledger_entries(consignor_id, deducted_payout_id, created_at)
  WHERE deducted_payout_id IS NULL;

ALTER TABLE vendor_ledger_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage vendor ledger entries" ON vendor_ledger_entries;
CREATE POLICY "Admins can manage vendor ledger entries" ON vendor_ledger_entries
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Vendors can read own vendor ledger entries" ON vendor_ledger_entries;
CREATE POLICY "Vendors can read own vendor ledger entries" ON vendor_ledger_entries
  FOR SELECT
  USING (
    get_user_role() = 'vendor'
    AND consignor_id = get_user_consignor_id()
  );

ALTER TABLE payouts
ADD COLUMN IF NOT EXISTS ledger_deduction DECIMAL(10,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN payouts.ledger_deduction IS 'Total one-off ledger deductions applied to this payout.';
