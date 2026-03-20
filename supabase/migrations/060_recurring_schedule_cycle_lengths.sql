-- Support recurring schedule templates with 1-week, 2-week, or 4-week cycles.

ALTER TABLE public.employee_recurring_schedules
  ADD COLUMN IF NOT EXISTS cycle_length_days SMALLINT,
  ADD COLUMN IF NOT EXISTS day_offset SMALLINT;

UPDATE public.employee_recurring_schedules
SET cycle_length_days = 7
WHERE cycle_length_days IS NULL;

UPDATE public.employee_recurring_schedules
SET day_offset = MOD((weekday - EXTRACT(DOW FROM active_from)::INT + 7), 7)
WHERE day_offset IS NULL;

ALTER TABLE public.employee_recurring_schedules
  DROP CONSTRAINT IF EXISTS employee_recurring_schedules_cycle_length_days_check,
  ADD CONSTRAINT employee_recurring_schedules_cycle_length_days_check
    CHECK (cycle_length_days IN (7, 14, 28));

ALTER TABLE public.employee_recurring_schedules
  DROP CONSTRAINT IF EXISTS employee_recurring_schedules_day_offset_check,
  ADD CONSTRAINT employee_recurring_schedules_day_offset_check
    CHECK (day_offset IS NULL OR (cycle_length_days IS NOT NULL AND day_offset >= 0 AND day_offset < cycle_length_days));

CREATE INDEX IF NOT EXISTS idx_employee_recurring_schedules_cycle
  ON public.employee_recurring_schedules (employee_id, cycle_length_days, day_offset, active_from);
