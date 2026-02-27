-- Employee time off requests and schedule privacy hardening

CREATE OR REPLACE FUNCTION public.current_employee_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT s.employee_id
  FROM public.employee_sessions s
  JOIN public.employees e ON e.id = s.employee_id
  WHERE s.auth_user_id = auth.uid()
    AND s.expires_at > now()
    AND e.is_active = TRUE
  ORDER BY s.updated_at DESC
  LIMIT 1;
$$;

CREATE TABLE IF NOT EXISTS public.employee_time_off_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  review_notes TEXT,
  reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT employee_time_off_requests_date_order CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_employee_time_off_requests_employee_dates
  ON public.employee_time_off_requests (employee_id, start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_employee_time_off_requests_status_start
  ON public.employee_time_off_requests (status, start_date);

DROP TRIGGER IF EXISTS update_employee_time_off_requests_updated_at ON public.employee_time_off_requests;
CREATE TRIGGER update_employee_time_off_requests_updated_at
  BEFORE UPDATE ON public.employee_time_off_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.employee_time_off_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage employee time off requests" ON public.employee_time_off_requests;
CREATE POLICY "Admins can manage employee time off requests"
ON public.employee_time_off_requests
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Employees can read own time off requests" ON public.employee_time_off_requests;
CREATE POLICY "Employees can read own time off requests"
ON public.employee_time_off_requests
FOR SELECT
TO authenticated
USING (employee_id = public.current_employee_id());

DROP POLICY IF EXISTS "Employees can submit own time off requests" ON public.employee_time_off_requests;
CREATE POLICY "Employees can submit own time off requests"
ON public.employee_time_off_requests
FOR INSERT
TO authenticated
WITH CHECK (
  employee_id = public.current_employee_id()
  AND status = 'pending'
  AND reviewed_by IS NULL
  AND reviewed_at IS NULL
);

DROP POLICY IF EXISTS "Employees can delete own pending time off requests" ON public.employee_time_off_requests;
CREATE POLICY "Employees can delete own pending time off requests"
ON public.employee_time_off_requests
FOR DELETE
TO authenticated
USING (
  employee_id = public.current_employee_id()
  AND status = 'pending'
);

DROP POLICY IF EXISTS "Anyone can read employee schedules" ON public.employee_schedules;
DROP POLICY IF EXISTS "Authenticated users can read relevant employee schedules" ON public.employee_schedules;
CREATE POLICY "Authenticated users can read relevant employee schedules"
ON public.employee_schedules
FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR employee_id = public.current_employee_id()
);
