-- Add partial-day time off support while keeping full-day request behavior.

ALTER TABLE public.employee_time_off_requests
  ADD COLUMN IF NOT EXISTS is_full_day BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS start_time TIME,
  ADD COLUMN IF NOT EXISTS end_time TIME;

ALTER TABLE public.employee_time_off_requests
  DROP CONSTRAINT IF EXISTS employee_time_off_requests_time_window;

ALTER TABLE public.employee_time_off_requests
  ADD CONSTRAINT employee_time_off_requests_time_window CHECK (
    (
      is_full_day = TRUE
      AND start_time IS NULL
      AND end_time IS NULL
    )
    OR
    (
      is_full_day = FALSE
      AND start_date = end_date
      AND start_time IS NOT NULL
      AND end_time IS NOT NULL
      AND end_time > start_time
    )
  );

CREATE OR REPLACE FUNCTION public.has_approved_time_off(
  p_employee_id UUID,
  p_shift_date DATE,
  p_shift_start_time TIME,
  p_shift_end_time TIME
)
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
      AND (
        r.is_full_day = TRUE
        OR (
          r.is_full_day = FALSE
          AND p_shift_date = r.start_date
          AND p_shift_start_time < r.end_time
          AND p_shift_end_time > r.start_time
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.prevent_schedule_on_approved_time_off()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.has_approved_time_off(NEW.employee_id, NEW.shift_date, NEW.start_time, NEW.end_time) THEN
    RAISE EXCEPTION 'Cannot schedule an employee during approved time off.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS employee_schedules_block_approved_time_off ON public.employee_schedules;
CREATE TRIGGER employee_schedules_block_approved_time_off
  BEFORE INSERT OR UPDATE OF employee_id, shift_date, start_time, end_time
  ON public.employee_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_schedule_on_approved_time_off();
