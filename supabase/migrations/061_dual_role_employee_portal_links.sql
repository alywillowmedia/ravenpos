-- Support dual-role users (vendor/admin + employee portal) on a single auth login.

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS linked_employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_linked_employee_unique
ON public.users(linked_employee_id)
WHERE linked_employee_id IS NOT NULL;

ALTER TABLE public.users
DROP CONSTRAINT IF EXISTS users_employee_role_link_check;

ALTER TABLE public.users
ADD CONSTRAINT users_employee_role_link_check
CHECK (
  (
    role = 'employee'
    AND employee_id IS NOT NULL
    AND consignor_id IS NULL
    AND linked_employee_id IS NULL
  )
  OR (
    role <> 'employee'
    AND employee_id IS NULL
  )
) NOT VALID;

-- Resolve current employee identity from:
-- 1) role='employee' credential accounts, or
-- 2) vendor/admin accounts linked via linked_employee_id, or
-- 3) active anonymous PIN sessions.
CREATE OR REPLACE FUNCTION public.current_employee_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  WITH employee_from_user AS (
    SELECT
      CASE
        WHEN u.role = 'employee' THEN u.employee_id
        ELSE u.linked_employee_id
      END AS employee_id
    FROM public.users u
    JOIN public.employees e
      ON e.id = CASE
        WHEN u.role = 'employee' THEN u.employee_id
        ELSE u.linked_employee_id
      END
    WHERE u.id = auth.uid()
      AND (
        (u.role = 'employee' AND u.employee_id IS NOT NULL)
        OR (u.role IN ('admin', 'vendor') AND u.linked_employee_id IS NOT NULL)
      )
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
