-- Persist one opening and ending till float record per business day.

CREATE TABLE IF NOT EXISTS public.till_float_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_date DATE NOT NULL UNIQUE,
  opening_float NUMERIC(12, 2) CHECK (opening_float IS NULL OR opening_float >= 0),
  ending_float NUMERIC(12, 2) CHECK (ending_float IS NULL OR ending_float >= 0),
  opening_recorded_at TIMESTAMPTZ,
  ending_recorded_at TIMESTAMPTZ,
  opening_recorded_by_employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  ending_recorded_by_employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  opening_recorded_by_name TEXT,
  ending_recorded_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_till_float_records_business_date_desc
ON public.till_float_records (business_date DESC);

CREATE INDEX IF NOT EXISTS idx_till_float_records_opening_employee
ON public.till_float_records (opening_recorded_by_employee_id)
WHERE opening_recorded_by_employee_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_till_float_records_ending_employee
ON public.till_float_records (ending_recorded_by_employee_id)
WHERE ending_recorded_by_employee_id IS NOT NULL;

DROP TRIGGER IF EXISTS till_float_records_updated_at ON public.till_float_records;
CREATE TRIGGER till_float_records_updated_at
  BEFORE UPDATE ON public.till_float_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.till_float_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "App staff can read till float history" ON public.till_float_records;
CREATE POLICY "App staff can read till float history"
ON public.till_float_records
FOR SELECT
TO authenticated
USING (
  (SELECT public.is_admin())
  OR (SELECT public.current_employee_id()) IS NOT NULL
);

DROP POLICY IF EXISTS "Service role can manage till float history" ON public.till_float_records;
CREATE POLICY "Service role can manage till float history"
ON public.till_float_records
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.save_till_float_record(
  p_business_date DATE,
  p_opening_float NUMERIC DEFAULT NULL,
  p_ending_float NUMERIC DEFAULT NULL
)
RETURNS public.till_float_records
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_employee_id UUID := public.current_employee_id();
  v_actor_name TEXT;
  v_opening_float NUMERIC(12, 2);
  v_ending_float NUMERIC(12, 2);
  v_record public.till_float_records;
BEGIN
  IF auth.uid() IS NULL OR (v_employee_id IS NULL AND NOT public.is_admin()) THEN
    RAISE EXCEPTION 'Not authorized to save till floats';
  END IF;

  IF p_business_date IS NULL THEN
    RAISE EXCEPTION 'Business date is required';
  END IF;

  IF p_opening_float IS NULL AND p_ending_float IS NULL THEN
    RAISE EXCEPTION 'An opening or ending float is required';
  END IF;

  IF p_opening_float < 0 OR p_ending_float < 0 THEN
    RAISE EXCEPTION 'Till floats cannot be negative';
  END IF;

  v_opening_float := CASE WHEN p_opening_float IS NULL THEN NULL ELSE ROUND(p_opening_float, 2) END;
  v_ending_float := CASE WHEN p_ending_float IS NULL THEN NULL ELSE ROUND(p_ending_float, 2) END;

  SELECT COALESCE(e.name, u.full_name, u.email, 'Staff member')
  INTO v_actor_name
  FROM (SELECT 1) seed
  LEFT JOIN public.employees e ON e.id = v_employee_id
  LEFT JOIN public.users u ON u.id = auth.uid();

  INSERT INTO public.till_float_records (
    business_date,
    opening_float,
    ending_float,
    opening_recorded_at,
    ending_recorded_at,
    opening_recorded_by_employee_id,
    ending_recorded_by_employee_id,
    opening_recorded_by_name,
    ending_recorded_by_name
  )
  VALUES (
    p_business_date,
    v_opening_float,
    v_ending_float,
    CASE WHEN p_opening_float IS NULL THEN NULL ELSE now() END,
    CASE WHEN p_ending_float IS NULL THEN NULL ELSE now() END,
    CASE WHEN p_opening_float IS NULL THEN NULL ELSE v_employee_id END,
    CASE WHEN p_ending_float IS NULL THEN NULL ELSE v_employee_id END,
    CASE WHEN p_opening_float IS NULL THEN NULL ELSE v_actor_name END,
    CASE WHEN p_ending_float IS NULL THEN NULL ELSE v_actor_name END
  )
  ON CONFLICT (business_date) DO UPDATE
  SET
    opening_float = CASE
      WHEN p_opening_float IS NULL THEN till_float_records.opening_float
      ELSE v_opening_float
    END,
    ending_float = CASE
      WHEN p_ending_float IS NULL THEN till_float_records.ending_float
      ELSE v_ending_float
    END,
    opening_recorded_at = CASE
      WHEN p_opening_float IS NULL THEN till_float_records.opening_recorded_at
      ELSE now()
    END,
    ending_recorded_at = CASE
      WHEN p_ending_float IS NULL THEN till_float_records.ending_recorded_at
      ELSE now()
    END,
    opening_recorded_by_employee_id = CASE
      WHEN p_opening_float IS NULL THEN till_float_records.opening_recorded_by_employee_id
      ELSE v_employee_id
    END,
    ending_recorded_by_employee_id = CASE
      WHEN p_ending_float IS NULL THEN till_float_records.ending_recorded_by_employee_id
      ELSE v_employee_id
    END,
    opening_recorded_by_name = CASE
      WHEN p_opening_float IS NULL THEN till_float_records.opening_recorded_by_name
      ELSE v_actor_name
    END,
    ending_recorded_by_name = CASE
      WHEN p_ending_float IS NULL THEN till_float_records.ending_recorded_by_name
      ELSE v_actor_name
    END
  RETURNING * INTO v_record;

  RETURN v_record;
END;
$$;

REVOKE ALL ON FUNCTION public.save_till_float_record(DATE, NUMERIC, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_till_float_record(DATE, NUMERIC, NUMERIC)
TO authenticated, service_role;

GRANT SELECT ON TABLE public.till_float_records TO authenticated;
GRANT ALL ON TABLE public.till_float_records TO service_role;
