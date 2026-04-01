-- Add a W-9 completion flag for consignors so admins can track payout readiness.
ALTER TABLE consignors
ADD COLUMN IF NOT EXISTS has_w9_filled_out BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN consignors.has_w9_filled_out IS 'True when an active W-9 is on file for this consignor.';
