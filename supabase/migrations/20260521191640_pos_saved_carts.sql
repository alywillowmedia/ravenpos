-- Saved POS carts / hold-for-later folder.
-- Cart contents are stored as a snapshot, then the frontend refreshes inventory
-- items from current item rows when opening a saved cart.

CREATE TABLE IF NOT EXISTS public.pos_saved_carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name TEXT,
  cart_items JSONB NOT NULL CHECK (jsonb_typeof(cart_items) = 'array'),
  order_discounts JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(order_discounts) = 'array'),
  dealer_discount_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  item_count INTEGER NOT NULL DEFAULT 0 CHECK (item_count >= 0),
  subtotal DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  total DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  created_by_user UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_by_employee UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pos_saved_carts_created_at ON public.pos_saved_carts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pos_saved_carts_customer_id ON public.pos_saved_carts(customer_id);

DROP TRIGGER IF EXISTS pos_saved_carts_updated_at ON public.pos_saved_carts;
CREATE TRIGGER pos_saved_carts_updated_at
  BEFORE UPDATE ON public.pos_saved_carts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.pos_saved_carts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated app users can manage saved POS carts" ON public.pos_saved_carts;
CREATE POLICY "Authenticated app users can manage saved POS carts"
ON public.pos_saved_carts
FOR ALL
TO authenticated
USING (public.is_ravenpos_app_actor())
WITH CHECK (public.is_ravenpos_app_actor());

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pos_saved_carts TO authenticated, service_role;
