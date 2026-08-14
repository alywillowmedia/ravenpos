-- Prevent vendor updates from trying to link a second customer row to a vendor
-- that already has a linked customer. The unique customers.consignor_id
-- constraint intentionally permits only one customer profile per vendor.

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
  linked_customer_id UUID;
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

  -- Always prefer the customer that is already linked to this vendor. Without
  -- this check, another unlinked customer with the same email or phone can be
  -- assigned the same consignor_id and violate customers_consignor_id_key.
  SELECT c.id
  INTO linked_customer_id
  FROM public.customers c
  WHERE c.consignor_id = NEW.id
  LIMIT 1;

  IF linked_customer_id IS NOT NULL THEN
    UPDATE public.customers
    SET
      name = resolved_name,
      email = COALESCE(normalized_email, email),
      phone = COALESCE(normalized_phone, phone),
      updated_at = now()
    WHERE id = linked_customer_id;

    RETURN NEW;
  END IF;

  -- A vendor without a linked customer may adopt the oldest unlinked customer
  -- with the same email, or with the same phone when the vendor has no email.
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
    WHERE id = matched_customer_id
      AND consignor_id IS NULL
    RETURNING id INTO linked_customer_id;

    IF linked_customer_id IS NOT NULL THEN
      RETURN NEW;
    END IF;
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

COMMENT ON FUNCTION public.sync_customer_from_consignor() IS
  'Keeps one customer profile synchronized per vendor without linking duplicate email or phone matches.';
