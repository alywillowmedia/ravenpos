-- Improve SKU lookup and default inventory ordering performance.

CREATE INDEX IF NOT EXISTS idx_items_sku
  ON public.items (sku);

CREATE INDEX IF NOT EXISTS idx_items_created_at_id
  ON public.items (created_at DESC, id DESC);
