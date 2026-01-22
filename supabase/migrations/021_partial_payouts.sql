-- Add partial payout support to payouts table
-- Allows admins to pay custom amounts with explanations

-- Add columns for partial payout tracking
ALTER TABLE payouts
ADD COLUMN IF NOT EXISTS original_amount_due DECIMAL(10, 2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS is_partial BOOLEAN DEFAULT FALSE NOT NULL,
ADD COLUMN IF NOT EXISTS partial_reason TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS balance_disposition TEXT DEFAULT NULL;

-- Add check constraint for balance_disposition values
ALTER TABLE payouts
ADD CONSTRAINT payouts_balance_disposition_check
CHECK (balance_disposition IS NULL OR balance_disposition IN ('deferred', 'forgiven'));

-- Add comment for documentation
COMMENT ON COLUMN payouts.original_amount_due IS 'The original amount that was due before partial payment';
COMMENT ON COLUMN payouts.is_partial IS 'Whether this was a partial payout (less than full amount due)';
COMMENT ON COLUMN payouts.partial_reason IS 'Explanation for why only a partial amount was paid';
COMMENT ON COLUMN payouts.balance_disposition IS 'What happens to remaining balance: deferred (owed later) or forgiven (written off)';
