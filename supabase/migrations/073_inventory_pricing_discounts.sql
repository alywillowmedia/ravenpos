-- Inventory pricing discounts
-- Allows admin/vendors to define percentage discounts by vendor category or specific item.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.inventory_pricing_discounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consignor_id UUID NOT NULL REFERENCES public.consignors(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN ('category', 'item')),
  category TEXT,
  item_id UUID REFERENCES public.items(id) ON DELETE CASCADE,
  percent_off DECIMAL(5,2) NOT NULL CHECK (percent_off > 0 AND percent_off <= 100),
  title TEXT,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT inventory_pricing_discounts_scope_target_check CHECK (
    (scope = 'category' AND category IS NOT NULL AND item_id IS NULL)
    OR
    (scope = 'item' AND item_id IS NOT NULL AND category IS NULL)
  ),
  CONSTRAINT inventory_pricing_discounts_date_range_check CHECK (
    ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at
  )
);

CREATE INDEX IF NOT EXISTS idx_inventory_pricing_discounts_consignor
  ON public.inventory_pricing_discounts (consignor_id);

CREATE INDEX IF NOT EXISTS idx_inventory_pricing_discounts_item
  ON public.inventory_pricing_discounts (item_id)
  WHERE item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_pricing_discounts_category
  ON public.inventory_pricing_discounts (consignor_id, category)
  WHERE category IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_pricing_discounts_active
  ON public.inventory_pricing_discounts (is_active, starts_at, ends_at);

CREATE TRIGGER inventory_pricing_discounts_updated_at
  BEFORE UPDATE ON public.inventory_pricing_discounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.inventory_pricing_discounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins full access on inventory pricing discounts" ON public.inventory_pricing_discounts;
CREATE POLICY "Admins full access on inventory pricing discounts"
  ON public.inventory_pricing_discounts
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Vendors can read own inventory pricing discounts" ON public.inventory_pricing_discounts;
CREATE POLICY "Vendors can read own inventory pricing discounts"
  ON public.inventory_pricing_discounts
  FOR SELECT
  USING (
    get_user_role() = 'vendor'
    AND consignor_id = get_user_consignor_id()
  );

DROP POLICY IF EXISTS "Vendors can insert own inventory pricing discounts" ON public.inventory_pricing_discounts;
CREATE POLICY "Vendors can insert own inventory pricing discounts"
  ON public.inventory_pricing_discounts
  FOR INSERT
  WITH CHECK (
    get_user_role() = 'vendor'
    AND consignor_id = get_user_consignor_id()
  );

DROP POLICY IF EXISTS "Vendors can update own inventory pricing discounts" ON public.inventory_pricing_discounts;
CREATE POLICY "Vendors can update own inventory pricing discounts"
  ON public.inventory_pricing_discounts
  FOR UPDATE
  USING (
    get_user_role() = 'vendor'
    AND consignor_id = get_user_consignor_id()
  )
  WITH CHECK (
    get_user_role() = 'vendor'
    AND consignor_id = get_user_consignor_id()
  );

DROP POLICY IF EXISTS "Vendors can delete own inventory pricing discounts" ON public.inventory_pricing_discounts;
CREATE POLICY "Vendors can delete own inventory pricing discounts"
  ON public.inventory_pricing_discounts
  FOR DELETE
  USING (
    get_user_role() = 'vendor'
    AND consignor_id = get_user_consignor_id()
  );
