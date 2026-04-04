-- Dealers directory + reverse POS purchase records.
-- Cash dealer purchases should reduce expected till cash in end-of-day counting.

CREATE TABLE IF NOT EXISTS public.dealers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  business_name TEXT,
  email TEXT,
  phone TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dealer_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id UUID REFERENCES public.dealers(id) ON DELETE SET NULL,
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
  tax_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  total DECIMAL(10,2) NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'card', 'check')),
  check_number TEXT,
  notes TEXT,
  processed_by_user UUID REFERENCES public.users(id) ON DELETE SET NULL,
  processed_by_employee UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dealer_purchase_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_purchase_id UUID NOT NULL REFERENCES public.dealer_purchases(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  description TEXT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_cost DECIMAL(10,2) NOT NULL CHECK (unit_cost >= 0),
  line_total DECIMAL(10,2) NOT NULL CHECK (line_total >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS dealers_updated_at ON public.dealers;
CREATE TRIGGER dealers_updated_at
  BEFORE UPDATE ON public.dealers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS dealer_purchases_updated_at ON public.dealer_purchases;
CREATE TRIGGER dealer_purchases_updated_at
  BEFORE UPDATE ON public.dealer_purchases
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.dealers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dealer_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dealer_purchase_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view dealers" ON public.dealers;
CREATE POLICY "Authenticated can view dealers"
ON public.dealers
FOR SELECT
USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins can manage dealers" ON public.dealers;
CREATE POLICY "Admins can manage dealers"
ON public.dealers
FOR ALL
USING ((SELECT is_admin()))
WITH CHECK ((SELECT is_admin()));

DROP POLICY IF EXISTS "Authenticated can view dealer purchases" ON public.dealer_purchases;
CREATE POLICY "Authenticated can view dealer purchases"
ON public.dealer_purchases
FOR SELECT
USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins can manage dealer purchases" ON public.dealer_purchases;
CREATE POLICY "Admins can manage dealer purchases"
ON public.dealer_purchases
FOR ALL
USING ((SELECT is_admin()))
WITH CHECK ((SELECT is_admin()));

DROP POLICY IF EXISTS "Authenticated can view dealer purchase items" ON public.dealer_purchase_items;
CREATE POLICY "Authenticated can view dealer purchase items"
ON public.dealer_purchase_items
FOR SELECT
USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins can manage dealer purchase items" ON public.dealer_purchase_items;
CREATE POLICY "Admins can manage dealer purchase items"
ON public.dealer_purchase_items
FOR ALL
USING ((SELECT is_admin()))
WITH CHECK ((SELECT is_admin()));

GRANT SELECT ON public.dealers TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.dealers TO authenticated;

GRANT SELECT ON public.dealer_purchases TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.dealer_purchases TO authenticated;

GRANT SELECT ON public.dealer_purchase_items TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.dealer_purchase_items TO authenticated;
