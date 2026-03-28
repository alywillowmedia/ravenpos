-- Temporary import unblocker:
-- Increase item text field limits while preserving VARCHAR behavior.

ALTER TABLE public.items
  ALTER COLUMN sku TYPE VARCHAR(500),
  ALTER COLUMN name TYPE VARCHAR(500),
  ALTER COLUMN variant_summary TYPE VARCHAR(500),
  ALTER COLUMN other_details_1 TYPE VARCHAR(500),
  ALTER COLUMN other_details_2 TYPE VARCHAR(500);

