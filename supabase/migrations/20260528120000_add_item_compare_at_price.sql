ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS compare_at_price DECIMAL(10,2);

ALTER TABLE public.items
  DROP CONSTRAINT IF EXISTS items_compare_at_price_positive_check;

ALTER TABLE public.items
  ADD CONSTRAINT items_compare_at_price_positive_check
  CHECK (compare_at_price IS NULL OR compare_at_price > 0);
