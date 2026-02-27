-- Recurring employee schedules + enforcement for approved day-off conflicts

CREATE TABLE IF NOT EXISTS public.employee_recurring_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  notes TEXT,
  active_from DATE NOT NULL DEFAULT CURRENT_DATE,
  active_until DATE,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT employee_recurring_schedules_time_order CHECK (end_time > start_time),
  CONSTRAINT employee_recurring_schedules_date_order CHECK (active_until IS NULL OR active_until >= active_from)
);

CREATE INDEX IF NOT EXISTS idx_employee_recurring_schedules_employee_weekday
  ON public.employee_recurring_schedules (employee_id, weekday);

CREATE INDEX IF NOT EXISTS idx_employee_recurring_schedules_active_dates
  ON public.employee_recurring_schedules (active_from, active_until);

DROP TRIGGER IF EXISTS update_employee_recurring_schedules_updated_at ON public.employee_recurring_schedules;
CREATE TRIGGER update_employee_recurring_schedules_updated_at
  BEFORE UPDATE ON public.employee_recurring_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.employee_recurring_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage recurring employee schedules" ON public.employee_recurring_schedules;
CREATE POLICY "Admins can manage recurring employee schedules"
ON public.employee_recurring_schedules
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Authenticated users can read relevant recurring schedules" ON public.employee_recurring_schedules;
CREATE POLICY "Authenticated users can read relevant recurring schedules"
ON public.employee_recurring_schedules
FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR employee_id = public.current_employee_id()
);

CREATE OR REPLACE FUNCTION public.has_approved_time_off(p_employee_id UUID, p_shift_date DATE)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.employee_time_off_requests r
    WHERE r.employee_id = p_employee_id
      AND r.status = 'approved'
      AND p_shift_date BETWEEN r.start_date AND r.end_date
  );
$$;

CREATE OR REPLACE FUNCTION public.prevent_schedule_on_approved_time_off()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.has_approved_time_off(NEW.employee_id, NEW.shift_date) THEN
    RAISE EXCEPTION 'Cannot schedule an employee on an approved day off.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS employee_schedules_block_approved_time_off ON public.employee_schedules;
CREATE TRIGGER employee_schedules_block_approved_time_off
  BEFORE INSERT OR UPDATE OF employee_id, shift_date
  ON public.employee_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_schedule_on_approved_time_off();
