-- Employee portal credential accounts + RLS hardening

-- Allow employee role in users table.
ALTER TABLE public.users
DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE public.users
ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'vendor', 'employee'));

-- Link credential user accounts to employee identities.
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_employee_unique
ON public.users(employee_id)
WHERE employee_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_employee_role
ON public.users(role, employee_id);

-- Keep role linkage consistent.
ALTER TABLE public.users
DROP CONSTRAINT IF EXISTS users_employee_role_link_check;

ALTER TABLE public.users
ADD CONSTRAINT users_employee_role_link_check
CHECK (
  (
    role = 'employee'
    AND employee_id IS NOT NULL
    AND consignor_id IS NULL
  )
  OR (
    role <> 'employee'
    AND employee_id IS NULL
  )
) NOT VALID;

-- Resolve current employee identity from either:
-- 1) a credential employee user account, or
-- 2) an active anonymous PIN session mapping.
CREATE OR REPLACE FUNCTION public.current_employee_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  WITH employee_from_user AS (
    SELECT u.employee_id AS employee_id
    FROM public.users u
    JOIN public.employees e ON e.id = u.employee_id
    WHERE u.id = auth.uid()
      AND u.role = 'employee'
      AND u.employee_id IS NOT NULL
      AND e.is_active = TRUE
    LIMIT 1
  ),
  employee_from_session AS (
    SELECT s.employee_id
    FROM public.employee_sessions s
    JOIN public.employees e ON e.id = s.employee_id
    WHERE s.auth_user_id = auth.uid()
      AND s.expires_at > now()
      AND e.is_active = TRUE
    ORDER BY s.updated_at DESC
    LIMIT 1
  )
  SELECT employee_id FROM employee_from_user
  UNION ALL
  SELECT employee_id FROM employee_from_session
  LIMIT 1;
$$;

-- Keep broad app access restricted to admin/vendor users and active PIN sessions.
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
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role IN ('admin', 'vendor')
  ) OR public.has_active_employee_session();
END;
$$;

-- Employees can read their own employee profile.
DROP POLICY IF EXISTS "Employees can read own employee profile" ON public.employees;
CREATE POLICY "Employees can read own employee profile"
ON public.employees
FOR SELECT
TO authenticated
USING (id = public.current_employee_id());

-- Replace permissive time entry policies with role-safe policies.
DROP POLICY IF EXISTS "Authenticated app users can read time entries" ON public.time_entries;
DROP POLICY IF EXISTS "Authenticated app users can insert time entries" ON public.time_entries;
DROP POLICY IF EXISTS "Authenticated app users can update time entries" ON public.time_entries;
DROP POLICY IF EXISTS "Authenticated can insert time entries" ON public.time_entries;
DROP POLICY IF EXISTS "Authenticated can update time entries" ON public.time_entries;
DROP POLICY IF EXISTS "Anyone can read time entries" ON public.time_entries;
DROP POLICY IF EXISTS "Anyone can insert time entries" ON public.time_entries;
DROP POLICY IF EXISTS "Anyone can update time entries" ON public.time_entries;
DROP POLICY IF EXISTS "Admins can manage time entries" ON public.time_entries;
DROP POLICY IF EXISTS "Admins can delete time entries" ON public.time_entries;

CREATE POLICY "Admins can manage time entries"
ON public.time_entries
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Employees can read own time entries"
ON public.time_entries
FOR SELECT
TO authenticated
USING (employee_id = public.current_employee_id());

CREATE POLICY "Employees can insert own time entries"
ON public.time_entries
FOR INSERT
TO authenticated
WITH CHECK (employee_id = public.current_employee_id());

CREATE POLICY "Employees can update own time entries"
ON public.time_entries
FOR UPDATE
TO authenticated
USING (employee_id = public.current_employee_id())
WITH CHECK (employee_id = public.current_employee_id());
