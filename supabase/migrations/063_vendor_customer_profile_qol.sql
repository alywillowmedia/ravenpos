-- Vendor/customer sync + account profile photo support + self profile updates

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS consignor_id UUID REFERENCES public.consignors(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'customers_consignor_id_key'
      AND conrelid = 'public.customers'::regclass
  ) THEN
    ALTER TABLE public.customers
      ADD CONSTRAINT customers_consignor_id_key UNIQUE (consignor_id);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_customers_consignor_id
  ON public.customers(consignor_id);

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS profile_image_url TEXT;

CREATE OR REPLACE FUNCTION public.sync_customer_from_consignor()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  resolved_name TEXT;
  normalized_email TEXT;
  normalized_phone TEXT;
  matched_customer_id UUID;
BEGIN
  resolved_name := COALESCE(
    NULLIF(btrim(NEW.business_name), ''),
    NULLIF(btrim(CONCAT_WS(' ', NEW.first_name, NEW.last_name)), ''),
    NULLIF(btrim(NEW.name), ''),
    'Unnamed Vendor'
  );

  normalized_email := NULLIF(lower(btrim(COALESCE(NEW.email, ''))), '');
  normalized_phone := NULLIF(btrim(COALESCE(NEW.phone, '')), '');

  SELECT c.id
  INTO matched_customer_id
  FROM public.customers c
  WHERE c.consignor_id IS NULL
    AND (
      (normalized_email IS NOT NULL AND lower(COALESCE(c.email, '')) = normalized_email)
      OR (
        normalized_email IS NULL
        AND normalized_phone IS NOT NULL
        AND regexp_replace(COALESCE(c.phone, ''), '\\D', '', 'g') = regexp_replace(normalized_phone, '\\D', '', 'g')
      )
    )
  ORDER BY c.created_at ASC
  LIMIT 1;

  IF matched_customer_id IS NOT NULL THEN
    UPDATE public.customers
    SET
      consignor_id = NEW.id,
      name = resolved_name,
      email = COALESCE(normalized_email, email),
      phone = COALESCE(normalized_phone, phone),
      updated_at = now()
    WHERE id = matched_customer_id;
  END IF;

  INSERT INTO public.customers (consignor_id, name, email, phone, notes)
  VALUES (
    NEW.id,
    resolved_name,
    normalized_email,
    normalized_phone,
    'Auto-synced from vendor profile'
  )
  ON CONFLICT (consignor_id)
  DO UPDATE SET
    name = EXCLUDED.name,
    email = COALESCE(EXCLUDED.email, public.customers.email),
    phone = COALESCE(EXCLUDED.phone, public.customers.phone),
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_customer_from_consignor ON public.consignors;
CREATE TRIGGER sync_customer_from_consignor
AFTER INSERT OR UPDATE OF name, business_name, first_name, last_name, email, phone
ON public.consignors
FOR EACH ROW
EXECUTE FUNCTION public.sync_customer_from_consignor();

INSERT INTO public.customers (consignor_id, name, email, phone, notes)
SELECT
  c.id,
  COALESCE(
    NULLIF(btrim(c.business_name), ''),
    NULLIF(btrim(CONCAT_WS(' ', c.first_name, c.last_name)), ''),
    NULLIF(btrim(c.name), ''),
    'Unnamed Vendor'
  ) AS resolved_name,
  NULLIF(lower(btrim(COALESCE(c.email, ''))), '') AS normalized_email,
  NULLIF(btrim(COALESCE(c.phone, '')), '') AS normalized_phone,
  'Auto-synced from vendor profile'
FROM public.consignors c
ON CONFLICT (consignor_id)
DO UPDATE SET
  name = EXCLUDED.name,
  email = COALESCE(EXCLUDED.email, public.customers.email),
  phone = COALESCE(EXCLUDED.phone, public.customers.phone),
  updated_at = now();

DROP POLICY IF EXISTS "Users can update own profile fields" ON public.users;
CREATE POLICY "Users can update own profile fields"
ON public.users
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id
  AND role IS NOT DISTINCT FROM (SELECT u.role FROM public.users u WHERE u.id = auth.uid())
  AND consignor_id IS NOT DISTINCT FROM (SELECT u.consignor_id FROM public.users u WHERE u.id = auth.uid())
  AND employee_id IS NOT DISTINCT FROM (SELECT u.employee_id FROM public.users u WHERE u.id = auth.uid())
  AND linked_employee_id IS NOT DISTINCT FROM (SELECT u.linked_employee_id FROM public.users u WHERE u.id = auth.uid())
);
