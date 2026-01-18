-- Booth Rental Feature Migration
-- Adds monthly booth rental tracking for consignors

-- Add monthly_booth_rent column to consignors table
ALTER TABLE consignors
ADD COLUMN IF NOT EXISTS monthly_booth_rent DECIMAL(10,2) DEFAULT 0;

-- Create booth_rent_payments table for tracking rental payments
CREATE TABLE IF NOT EXISTS booth_rent_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  consignor_id UUID NOT NULL REFERENCES consignors(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  period_month INTEGER NOT NULL CHECK (period_month >= 1 AND period_month <= 12),
  period_year INTEGER NOT NULL CHECK (period_year >= 2000),
  notes TEXT,
  paid_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- Prevent duplicate payments for the same period (optional - allows multiple partial payments if removed)
  UNIQUE(consignor_id, period_month, period_year)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_booth_rent_payments_consignor ON booth_rent_payments(consignor_id);
CREATE INDEX IF NOT EXISTS idx_booth_rent_payments_period ON booth_rent_payments(period_year, period_month);

-- Enable RLS
ALTER TABLE booth_rent_payments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for booth_rent_payments
-- Admins can do everything
CREATE POLICY "Admins full access on booth_rent_payments" ON booth_rent_payments
  FOR ALL USING (is_admin());

-- Vendors can read their own payments
CREATE POLICY "Vendors can read own booth rent payments" ON booth_rent_payments
  FOR SELECT USING (
    get_user_role() = 'vendor' 
    AND consignor_id = get_user_consignor_id()
  );
