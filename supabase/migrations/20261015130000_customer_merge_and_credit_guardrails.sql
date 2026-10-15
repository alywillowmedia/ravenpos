-- Customer data hardening:
--   * Only store staff (admins and employees) may adjust store credit by hand.
--     Vendor-role users could previously call the adjust functions directly.
--   * merge_customers moves a duplicate customer's orders, refunds, gift cards,
--     invoices, saved carts, and store credit onto the customer being kept,
--     logs the credit transfer, then deletes the duplicate.
--   * The vendor -> customer sync trigger now really compares phone digits. Its
--     '\\D' pattern matched a literal backslash, so differently formatted
--     numbers never matched and duplicate customers were created.

CREATE OR REPLACE FUNCTION public.is_ravenpos_staff()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(auth.role(), '') = 'service_role'
    OR public.is_admin()
    OR public.current_employee_id() IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.is_ravenpos_staff() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_ravenpos_staff() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Manual credit adjustments: staff only
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.adjust_customer_store_credit(
  p_customer_id UUID,
  p_amount_change NUMERIC,
  p_note TEXT DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_ravenpos_staff() THEN
    RAISE EXCEPTION 'Only store staff can adjust customer store credit'
      USING ERRCODE = '42501';
  END IF;

  RETURN public.apply_store_credit_change(
    p_customer_id, NULL, p_amount_change, 'manual_adjustment', NULL, NULL, p_note
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.adjust_customer_vendor_store_credit(
  p_customer_id UUID,
  p_consignor_id UUID,
  p_amount_change NUMERIC,
  p_note TEXT DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_ravenpos_staff() THEN
    RAISE EXCEPTION 'Only store staff can adjust customer vendor store credit'
      USING ERRCODE = '42501';
  END IF;

  IF p_consignor_id IS NULL THEN
    RAISE EXCEPTION 'Vendor is required';
  END IF;

  RETURN public.apply_store_credit_change(
    p_customer_id, p_consignor_id, p_amount_change, 'manual_adjustment', NULL, NULL, p_note
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Merge a duplicate customer into the one being kept
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.merge_customers(
  p_keep_customer_id UUID,
  p_duplicate_customer_id UUID
)
RETURNS public.customers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_keep public.customers%ROWTYPE;
  v_duplicate public.customers%ROWTYPE;
  v_note TEXT;
  v_vendor_credit RECORD;
  v_general_credit NUMERIC;
BEGIN
  IF NOT (public.is_admin() OR COALESCE(auth.role(), '') = 'service_role') THEN
    RAISE EXCEPTION 'Only admins can merge customers' USING ERRCODE = '42501';
  END IF;

  IF p_keep_customer_id IS NULL OR p_duplicate_customer_id IS NULL THEN
    RAISE EXCEPTION 'Choose both customers to merge';
  END IF;

  IF p_keep_customer_id = p_duplicate_customer_id THEN
    RAISE EXCEPTION 'Choose two different customers to merge';
  END IF;

  -- Lock both rows in a stable order.
  PERFORM 1 FROM public.customers
  WHERE id IN (p_keep_customer_id, p_duplicate_customer_id)
  ORDER BY id
  FOR UPDATE;

  SELECT * INTO v_keep FROM public.customers WHERE id = p_keep_customer_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer to keep was not found';
  END IF;

  SELECT * INTO v_duplicate FROM public.customers WHERE id = p_duplicate_customer_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Duplicate customer was not found';
  END IF;

  IF v_keep.consignor_id IS NOT NULL AND v_duplicate.consignor_id IS NOT NULL THEN
    RAISE EXCEPTION 'Both customers are linked to vendor profiles; they cannot be merged';
  END IF;

  v_note := 'Merged from duplicate customer ' || COALESCE(NULLIF(btrim(v_duplicate.name), ''), 'Unnamed')
    || ' (' || v_duplicate.id || ')';

  -- Orders and other records follow the customer.
  UPDATE public.sales SET customer_id = v_keep.id WHERE customer_id = v_duplicate.id;
  UPDATE public.refunds SET customer_id = v_keep.id WHERE customer_id = v_duplicate.id;
  UPDATE public.gift_cards SET purchaser_customer_id = v_keep.id WHERE purchaser_customer_id = v_duplicate.id;
  UPDATE public.invoices SET customer_id = v_keep.id WHERE customer_id = v_duplicate.id;
  UPDATE public.pos_saved_carts SET customer_id = v_keep.id WHERE customer_id = v_duplicate.id;

  -- Store credit moves with a logged entry on both accounts.
  v_general_credit := ROUND(COALESCE(v_duplicate.store_credit, 0), 2);
  IF v_general_credit > 0 THEN
    PERFORM public.apply_store_credit_change(
      v_duplicate.id, NULL, -v_general_credit, 'customer_merge', NULL, NULL,
      'Moved to ' || COALESCE(NULLIF(btrim(v_keep.name), ''), 'Unnamed') || ' (' || v_keep.id || ')'
    );
    PERFORM public.apply_store_credit_change(
      v_keep.id, NULL, v_general_credit, 'customer_merge', NULL, NULL, v_note
    );
  END IF;

  FOR v_vendor_credit IN
    SELECT consignor_id, ROUND(balance, 2) AS balance
    FROM public.customer_vendor_store_credits
    WHERE customer_id = v_duplicate.id AND balance > 0
  LOOP
    PERFORM public.apply_store_credit_change(
      v_duplicate.id, v_vendor_credit.consignor_id, -v_vendor_credit.balance, 'customer_merge', NULL, NULL,
      'Moved to ' || COALESCE(NULLIF(btrim(v_keep.name), ''), 'Unnamed') || ' (' || v_keep.id || ')'
    );
    PERFORM public.apply_store_credit_change(
      v_keep.id, v_vendor_credit.consignor_id, v_vendor_credit.balance, 'customer_merge', NULL, NULL, v_note
    );
  END LOOP;

  -- Keep any contact details the kept customer is missing.
  UPDATE public.customers
  SET
    email = COALESCE(NULLIF(btrim(email), ''), v_duplicate.email),
    phone = COALESCE(NULLIF(btrim(phone), ''), v_duplicate.phone),
    notes = CASE
      WHEN NULLIF(btrim(COALESCE(v_duplicate.notes, '')), '') IS NULL THEN notes
      WHEN NULLIF(btrim(COALESCE(notes, '')), '') IS NULL THEN v_duplicate.notes
      ELSE notes || E'\n' || v_duplicate.notes
    END,
    accepts_marketing = COALESCE(accepts_marketing, FALSE) OR COALESCE(v_duplicate.accepts_marketing, FALSE),
    updated_at = NOW()
  WHERE id = v_keep.id;

  -- A vendor link moves too (one customer per vendor).
  IF v_duplicate.consignor_id IS NOT NULL THEN
    UPDATE public.customers SET consignor_id = NULL WHERE id = v_duplicate.id;
    UPDATE public.customers SET consignor_id = v_duplicate.consignor_id WHERE id = v_keep.id;
  END IF;

  DELETE FROM public.customers WHERE id = v_duplicate.id;

  SELECT * INTO v_keep FROM public.customers WHERE id = p_keep_customer_id;
  RETURN v_keep;
END;
$$;

REVOKE ALL ON FUNCTION public.merge_customers(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.merge_customers(UUID, UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Vendor -> customer sync: compare phone digits for real
-- ---------------------------------------------------------------------------

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
  phone_digits TEXT;
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
  -- Last 10 digits, so "(540) 553-1431" and "+15405531431" match.
  phone_digits := NULLIF(RIGHT(regexp_replace(COALESCE(normalized_phone, ''), '[^0-9]', '', 'g'), 10), '');

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
        AND phone_digits IS NOT NULL
        AND RIGHT(regexp_replace(COALESCE(c.phone, ''), '[^0-9]', '', 'g'), 10) = phone_digits
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
