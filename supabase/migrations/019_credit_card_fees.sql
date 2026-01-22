-- Add credit card fees tracking to payouts
-- This migration adds a column to store the credit card processing fees deducted from vendor payouts

ALTER TABLE payouts ADD COLUMN IF NOT EXISTS credit_card_fees DECIMAL(10,2) NOT NULL DEFAULT 0;

-- Add index for analytics queries
CREATE INDEX IF NOT EXISTS idx_payouts_credit_card_fees ON payouts(credit_card_fees) WHERE credit_card_fees > 0;

COMMENT ON COLUMN payouts.credit_card_fees IS 'Total Stripe Terminal fees deducted from this payout (2.7% + $0.05 per transaction, split proportionally across items)';
