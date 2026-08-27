-- Allow active RavenPOS employees to add and maintain inventory without
-- granting destructive product or consignor administration privileges.

DROP POLICY IF EXISTS "Employees can read inventory" ON public.items;
CREATE POLICY "Employees can read inventory"
ON public.items
FOR SELECT
TO authenticated
USING ((SELECT public.current_employee_id()) IS NOT NULL);

DROP POLICY IF EXISTS "Employees can add inventory" ON public.items;
CREATE POLICY "Employees can add inventory"
ON public.items
FOR INSERT
TO authenticated
WITH CHECK ((SELECT public.current_employee_id()) IS NOT NULL);

DROP POLICY IF EXISTS "Employees can update inventory" ON public.items;
CREATE POLICY "Employees can update inventory"
ON public.items
FOR UPDATE
TO authenticated
USING ((SELECT public.current_employee_id()) IS NOT NULL)
WITH CHECK ((SELECT public.current_employee_id()) IS NOT NULL);

GRANT SELECT, INSERT, UPDATE ON TABLE public.items TO authenticated;
