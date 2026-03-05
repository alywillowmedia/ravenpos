-- Harden invoice access to logged-in app users only.
-- Replaces permissive "Allow all" policies introduced in 044_invoices.sql.

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on invoices" ON public.invoices;
DROP POLICY IF EXISTS "Authenticated app users can manage invoices" ON public.invoices;
CREATE POLICY "Authenticated app users can manage invoices"
ON public.invoices
FOR ALL
TO authenticated
USING (public.can_access_logged_in_app())
WITH CHECK (public.can_access_logged_in_app());

DROP POLICY IF EXISTS "Allow all on invoice_items" ON public.invoice_items;
DROP POLICY IF EXISTS "Authenticated app users can manage invoice_items" ON public.invoice_items;
CREATE POLICY "Authenticated app users can manage invoice_items"
ON public.invoice_items
FOR ALL
TO authenticated
USING (public.can_access_logged_in_app())
WITH CHECK (public.can_access_logged_in_app());
