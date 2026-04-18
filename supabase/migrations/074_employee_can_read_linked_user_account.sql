-- Allow employee sessions (PIN and employee portal) to read their linked user row.
-- This is needed so employee sidebar/profile views can show profile photo + account info.

DROP POLICY IF EXISTS "Employees can read linked user account" ON public.users;
CREATE POLICY "Employees can read linked user account"
ON public.users
FOR SELECT
TO authenticated
USING (
  public.current_employee_id() IS NOT NULL
  AND (
    employee_id = public.current_employee_id()
    OR linked_employee_id = public.current_employee_id()
  )
);
