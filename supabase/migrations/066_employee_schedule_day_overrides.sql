-- Day-level recurring schedule overrides (for example: skip one recurring day without changing template)

CREATE TABLE IF NOT EXISTS public.employee_schedule_day_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  shift_date DATE NOT NULL,
  is_day_off BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT employee_schedule_day_overrides_unique_employee_date UNIQUE (employee_id, shift_date)
);

CREATE INDEX IF NOT EXISTS idx_employee_schedule_day_overrides_shift_date
  ON public.employee_schedule_day_overrides (shift_date);

DROP TRIGGER IF EXISTS update_employee_schedule_day_overrides_updated_at ON public.employee_schedule_day_overrides;
CREATE TRIGGER update_employee_schedule_day_overrides_updated_at
  BEFORE UPDATE ON public.employee_schedule_day_overrides
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.employee_schedule_day_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage employee schedule day overrides" ON public.employee_schedule_day_overrides;
CREATE POLICY "Admins can manage employee schedule day overrides"
ON public.employee_schedule_day_overrides
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Authenticated users can read relevant schedule day overrides" ON public.employee_schedule_day_overrides;
CREATE POLICY "Authenticated users can read relevant schedule day overrides"
ON public.employee_schedule_day_overrides
FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR employee_id = public.current_employee_id()
);
