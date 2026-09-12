-- Active employees can maintain relationship records. Deletes and account
-- administration remain governed by existing admin-only policies.

DROP POLICY IF EXISTS "Employees can select consignors" ON public.consignors;
CREATE POLICY "Employees can select consignors" ON public.consignors
FOR SELECT TO authenticated
USING ((SELECT public.current_employee_id()) IS NOT NULL);

DROP POLICY IF EXISTS "Employees can insert consignors" ON public.consignors;
CREATE POLICY "Employees can insert consignors" ON public.consignors
FOR INSERT TO authenticated
WITH CHECK ((SELECT public.current_employee_id()) IS NOT NULL);

DROP POLICY IF EXISTS "Employees can update consignors" ON public.consignors;
CREATE POLICY "Employees can update consignors" ON public.consignors
FOR UPDATE TO authenticated
USING ((SELECT public.current_employee_id()) IS NOT NULL)
WITH CHECK ((SELECT public.current_employee_id()) IS NOT NULL);

GRANT SELECT, INSERT, UPDATE ON public.consignors TO authenticated;

DROP POLICY IF EXISTS "Employees can select dealers" ON public.dealers;
CREATE POLICY "Employees can select dealers" ON public.dealers
FOR SELECT TO authenticated
USING ((SELECT public.current_employee_id()) IS NOT NULL);

DROP POLICY IF EXISTS "Employees can insert dealers" ON public.dealers;
CREATE POLICY "Employees can insert dealers" ON public.dealers
FOR INSERT TO authenticated
WITH CHECK ((SELECT public.current_employee_id()) IS NOT NULL);

DROP POLICY IF EXISTS "Employees can update dealers" ON public.dealers;
CREATE POLICY "Employees can update dealers" ON public.dealers
FOR UPDATE TO authenticated
USING ((SELECT public.current_employee_id()) IS NOT NULL)
WITH CHECK ((SELECT public.current_employee_id()) IS NOT NULL);

GRANT SELECT, INSERT, UPDATE ON public.dealers TO authenticated;

DROP POLICY IF EXISTS "Employees can select consignor_rate_schedules" ON public.consignor_rate_schedules;
CREATE POLICY "Employees can select consignor_rate_schedules" ON public.consignor_rate_schedules
FOR SELECT TO authenticated
USING ((SELECT public.current_employee_id()) IS NOT NULL);

DROP POLICY IF EXISTS "Employees can insert consignor_rate_schedules" ON public.consignor_rate_schedules;
CREATE POLICY "Employees can insert consignor_rate_schedules" ON public.consignor_rate_schedules
FOR INSERT TO authenticated
WITH CHECK ((SELECT public.current_employee_id()) IS NOT NULL);

DROP POLICY IF EXISTS "Employees can update consignor_rate_schedules" ON public.consignor_rate_schedules;
CREATE POLICY "Employees can update consignor_rate_schedules" ON public.consignor_rate_schedules
FOR UPDATE TO authenticated
USING ((SELECT public.current_employee_id()) IS NOT NULL)
WITH CHECK ((SELECT public.current_employee_id()) IS NOT NULL);

DROP POLICY IF EXISTS "Employees can delete consignor_rate_schedules" ON public.consignor_rate_schedules;
CREATE POLICY "Employees can delete consignor_rate_schedules" ON public.consignor_rate_schedules
FOR DELETE TO authenticated
USING ((SELECT public.current_employee_id()) IS NOT NULL);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.consignor_rate_schedules TO authenticated;
