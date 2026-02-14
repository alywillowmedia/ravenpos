-- Per-consignor card fee responsibility
-- Default behavior: consignor does NOT pay card fees (fee can be passed to customer)

ALTER TABLE consignors
ADD COLUMN IF NOT EXISTS consignor_pays_card_fee BOOLEAN NOT NULL DEFAULT FALSE;

-- Snapshot the setting at time of sale for historical payout accuracy
ALTER TABLE sale_items
ADD COLUMN IF NOT EXISTS consignor_pays_card_fee BOOLEAN NOT NULL DEFAULT FALSE;

-- Track card fee charged to customer on a sale
ALTER TABLE sales
ADD COLUMN IF NOT EXISTS card_fee_amount DECIMAL(10,2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sales_card_fee_amount_non_negative'
  ) THEN
    ALTER TABLE sales
    ADD CONSTRAINT sales_card_fee_amount_non_negative CHECK (card_fee_amount >= 0);
  END IF;
END $$;

COMMENT ON COLUMN consignors.consignor_pays_card_fee IS 'When true, this consignor absorbs their proportional card processing fees.';
COMMENT ON COLUMN sale_items.consignor_pays_card_fee IS 'Snapshot of consignor card-fee setting at time of sale.';
COMMENT ON COLUMN sales.card_fee_amount IS 'Card processing fee charged to customer on this sale.';
