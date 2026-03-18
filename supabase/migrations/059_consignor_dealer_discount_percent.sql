-- Add per-consignor dealer discount percent for POS toggle-based discounts.

ALTER TABLE consignors
ADD COLUMN IF NOT EXISTS dealer_discount_percent DECIMAL(5,2) NOT NULL DEFAULT 0;

ALTER TABLE consignors
DROP CONSTRAINT IF EXISTS consignors_dealer_discount_percent_check;

ALTER TABLE consignors
ADD CONSTRAINT consignors_dealer_discount_percent_check
CHECK (dealer_discount_percent >= 0 AND dealer_discount_percent <= 100);

COMMENT ON COLUMN consignors.dealer_discount_percent IS 'Dealer discount percentage applied in POS when dealer-discount mode is enabled.';
