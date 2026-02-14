-- Allow sale line items that are not linked to inventory records (custom POS items)

ALTER TABLE sale_items
ALTER COLUMN item_id DROP NOT NULL;

COMMENT ON COLUMN sale_items.item_id IS
  'Nullable for one-off custom sale items entered directly in POS.';

