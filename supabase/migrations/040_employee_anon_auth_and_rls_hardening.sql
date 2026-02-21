-- Employee anonymous auth + RLS hardening
-- Requires Supabase Anonymous Sign-In to be enabled.

-- ================================================
-- Employee auth session mapping
-- ================================================
CREATE TABLE IF NOT EXISTS public.employee_sessions (
  auth_user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_sessions_employee_id ON public.employee_sessions(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_sessions_expires_at ON public.employee_sessions(expires_at);

DROP TRIGGER IF EXISTS employee_sessions_updated_at ON public.employee_sessions;
CREATE TRIGGER employee_sessions_updated_at
  BEFORE UPDATE ON public.employee_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.employee_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage employee sessions" ON public.employee_sessions;
DROP POLICY IF EXISTS "Admins can read employee sessions" ON public.employee_sessions;
DROP POLICY IF EXISTS "Users can delete own employee session" ON public.employee_sessions;

CREATE POLICY "Service role can manage employee sessions" ON public.employee_sessions
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Admins can read employee sessions" ON public.employee_sessions
  FOR SELECT
  USING (is_admin());

CREATE POLICY "Users can delete own employee session" ON public.employee_sessions
  FOR DELETE
  USING (auth.uid() = auth_user_id);

-- ================================================
-- Helper functions for RLS checks
-- ================================================
CREATE OR REPLACE FUNCTION public.has_active_employee_session()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.employee_sessions s
    JOIN public.employees e ON e.id = s.employee_id
    WHERE s.auth_user_id = auth.uid()
      AND s.expires_at > now()
      AND e.is_active = TRUE
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.can_access_logged_in_app()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = auth.uid()
  ) OR public.has_active_employee_session();
END;
$$;

-- ================================================
-- Tighten formerly-permissive policies
-- Logged-in app users only (admin/vendor users OR verified employee PIN sessions)
-- ================================================

-- customers
DROP POLICY IF EXISTS "Allow all on customers" ON public.customers;
DROP POLICY IF EXISTS "Authenticated can manage customers" ON public.customers;
CREATE POLICY "Authenticated app users can manage customers"
ON public.customers
FOR ALL
TO authenticated
USING (public.can_access_logged_in_app())
WITH CHECK (public.can_access_logged_in_app());

-- gift_cards
DROP POLICY IF EXISTS "Allow all on gift_cards" ON public.gift_cards;
DROP POLICY IF EXISTS "Authenticated can manage gift_cards" ON public.gift_cards;
CREATE POLICY "Authenticated app users can manage gift_cards"
ON public.gift_cards
FOR ALL
TO authenticated
USING (public.can_access_logged_in_app())
WITH CHECK (public.can_access_logged_in_app());

-- payouts
DROP POLICY IF EXISTS "Allow all on payouts" ON public.payouts;
DROP POLICY IF EXISTS "Authenticated can manage payouts" ON public.payouts;
CREATE POLICY "Authenticated app users can manage payouts"
ON public.payouts
FOR ALL
TO authenticated
USING (public.can_access_logged_in_app())
WITH CHECK (public.can_access_logged_in_app());

-- refunds
DROP POLICY IF EXISTS "Allow all on refunds" ON public.refunds;
DROP POLICY IF EXISTS "Authenticated can manage refunds" ON public.refunds;
CREATE POLICY "Authenticated app users can manage refunds"
ON public.refunds
FOR ALL
TO authenticated
USING (public.can_access_logged_in_app())
WITH CHECK (public.can_access_logged_in_app());

-- shopify_config
DROP POLICY IF EXISTS "Allow all on shopify_config" ON public.shopify_config;
DROP POLICY IF EXISTS "Authenticated can manage shopify_config" ON public.shopify_config;
CREATE POLICY "Authenticated app users can manage shopify_config"
ON public.shopify_config
FOR ALL
TO authenticated
USING (public.can_access_logged_in_app())
WITH CHECK (public.can_access_logged_in_app());

-- sync_log
DROP POLICY IF EXISTS "Allow all on sync_log" ON public.sync_log;
DROP POLICY IF EXISTS "Authenticated can manage sync_log" ON public.sync_log;
CREATE POLICY "Authenticated app users can manage sync_log"
ON public.sync_log
FOR ALL
TO authenticated
USING (public.can_access_logged_in_app())
WITH CHECK (public.can_access_logged_in_app());

-- sale_items
DROP POLICY IF EXISTS "Anyone can read sale_items" ON public.sale_items;
DROP POLICY IF EXISTS "Authenticated app users can read sale_items" ON public.sale_items;
CREATE POLICY "Authenticated app users can read sale_items"
ON public.sale_items
FOR SELECT
TO authenticated
USING (public.can_access_logged_in_app());

DROP POLICY IF EXISTS "Anyone can insert sale_items" ON public.sale_items;
DROP POLICY IF EXISTS "Authenticated can insert sale_items" ON public.sale_items;
CREATE POLICY "Authenticated app users can insert sale_items"
ON public.sale_items
FOR INSERT
TO authenticated
WITH CHECK (public.can_access_logged_in_app());

-- sales
DROP POLICY IF EXISTS "Anyone can read sales" ON public.sales;
DROP POLICY IF EXISTS "Authenticated app users can read sales" ON public.sales;
CREATE POLICY "Authenticated app users can read sales"
ON public.sales
FOR SELECT
TO authenticated
USING (public.can_access_logged_in_app());

DROP POLICY IF EXISTS "Anyone can insert sales" ON public.sales;
DROP POLICY IF EXISTS "Authenticated can insert sales" ON public.sales;
CREATE POLICY "Authenticated app users can insert sales"
ON public.sales
FOR INSERT
TO authenticated
WITH CHECK (public.can_access_logged_in_app());

DROP POLICY IF EXISTS "Anyone can update sales" ON public.sales;
DROP POLICY IF EXISTS "Authenticated can update sales" ON public.sales;
CREATE POLICY "Authenticated app users can update sales"
ON public.sales
FOR UPDATE
TO authenticated
USING (public.can_access_logged_in_app())
WITH CHECK (public.can_access_logged_in_app());

-- time_entries
DROP POLICY IF EXISTS "Anyone can read time entries" ON public.time_entries;
DROP POLICY IF EXISTS "Authenticated app users can read time entries" ON public.time_entries;
CREATE POLICY "Authenticated app users can read time entries"
ON public.time_entries
FOR SELECT
TO authenticated
USING (public.can_access_logged_in_app());

DROP POLICY IF EXISTS "Anyone can insert time entries" ON public.time_entries;
DROP POLICY IF EXISTS "Authenticated can insert time entries" ON public.time_entries;
CREATE POLICY "Authenticated app users can insert time entries"
ON public.time_entries
FOR INSERT
TO authenticated
WITH CHECK (public.can_access_logged_in_app());

DROP POLICY IF EXISTS "Anyone can update time entries" ON public.time_entries;
DROP POLICY IF EXISTS "Authenticated can update time entries" ON public.time_entries;
CREATE POLICY "Authenticated app users can update time entries"
ON public.time_entries
FOR UPDATE
TO authenticated
USING (public.can_access_logged_in_app())
WITH CHECK (public.can_access_logged_in_app());
