-- Close public access to employee records.
--
-- Migration 011 created "Service role can read employees" as FOR SELECT USING (true)
-- with no TO clause. That applied to every role, so the public anon key could read
-- all employee columns, including pin_hash, pin_salt, hourly_rate and addresses.
-- The service role bypasses RLS and never needed the policy.
--
-- Nothing reads these tables without a login. PIN sign-in reads employees through
-- verify-employee-pin with the service role, then runs as `authenticated` on an
-- anonymous auth session mapped in employee_sessions, which current_employee_id()
-- resolves for the own-row policies.
--
-- Roll out the matching web and desktop client first: `select=*` on employees fails
-- once pin_hash and pin_salt are no longer selectable.
--
-- Safe to run more than once.

BEGIN;

-- ------------------------------------------------------------------
-- Policies
-- ------------------------------------------------------------------
DROP POLICY IF EXISTS "Service role can read employees" ON public.employees;

DROP POLICY IF EXISTS "Admins can manage employees" ON public.employees;
CREATE POLICY "Admins can manage employees"
ON public.employees
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Employees can read own employee profile" ON public.employees;
CREATE POLICY "Employees can read own employee profile"
ON public.employees
FOR SELECT
TO authenticated
USING (id = public.current_employee_id());

-- Replaced by 053. Dropped again in case a database kept the 011 versions.
DROP POLICY IF EXISTS "Anyone can read time entries" ON public.time_entries;
DROP POLICY IF EXISTS "Anyone can insert time entries" ON public.time_entries;
DROP POLICY IF EXISTS "Anyone can update time entries" ON public.time_entries;

-- ------------------------------------------------------------------
-- Grants
-- ------------------------------------------------------------------
REVOKE ALL ON TABLE public.employees FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.time_entries FROM PUBLIC, anon, authenticated;

GRANT INSERT, UPDATE, DELETE ON TABLE public.employees TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.time_entries TO authenticated;
GRANT ALL ON TABLE public.employees, public.time_entries TO service_role;

-- A 4-6 digit PIN falls to brute force from its hash and salt, so no client role
-- reads them, admins included. Admins can still write them to set a PIN.
-- This grant is per column: a column added to employees later needs its own grant.
DO $$
DECLARE
  readable_columns text;
BEGIN
  SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum)
  INTO readable_columns
  FROM pg_attribute
  WHERE attrelid = 'public.employees'::regclass
    AND attnum > 0
    AND NOT attisdropped
    AND attname NOT IN ('pin_hash', 'pin_salt');

  EXECUTE format('GRANT SELECT (%s) ON TABLE public.employees TO authenticated', readable_columns);
END;
$$;

-- ------------------------------------------------------------------
-- Chat display names
-- ------------------------------------------------------------------
-- Vendors and employees see coworker names in chat, which the open policy used to
-- allow by accident. Return only id and name, and only for employees who share a
-- thread with the caller or posted in one.
CREATE OR REPLACE FUNCTION public.get_chat_employee_names(p_employee_ids uuid[])
RETURNS TABLE(id uuid, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH caller_threads AS (
    SELECT m.thread_id
    FROM public.chat_thread_members m
    WHERE (m.member_type = 'user' AND m.user_id = auth.uid())
      OR (m.member_type = 'employee' AND m.employee_id = public.current_employee_id())
  )
  SELECT e.id, e.name
  FROM public.employees e
  WHERE e.id = ANY (p_employee_ids)
    AND (
      public.is_admin()
      OR e.id = public.current_employee_id()
      OR EXISTS (
        SELECT 1
        FROM public.chat_thread_members peer
        JOIN caller_threads t ON t.thread_id = peer.thread_id
        WHERE peer.employee_id = e.id
      )
      OR EXISTS (
        SELECT 1
        FROM public.chat_messages msg
        JOIN caller_threads t ON t.thread_id = msg.thread_id
        WHERE msg.sender_employee_id = e.id
      )
    );
$$;

REVOKE ALL ON FUNCTION public.get_chat_employee_names(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_chat_employee_names(uuid[]) TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
