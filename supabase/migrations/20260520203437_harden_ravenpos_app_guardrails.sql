-- Harden RavenPOS mutation/read guardrails without changing public storefront reads.
--
-- Supabase anonymous sign-in can produce an authenticated database role. For
-- sensitive app surfaces, require a RavenPOS-recognized actor instead of only
-- checking auth.role() = 'authenticated'.

CREATE OR REPLACE FUNCTION public.is_ravenpos_app_actor()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT auth.role() = 'service_role' OR public.can_access_logged_in_app();
$$;

REVOKE ALL ON FUNCTION public.is_ravenpos_app_actor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_ravenpos_app_actor() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.adjust_customer_store_credit(
  p_customer_id UUID,
  p_amount_change NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_new_balance NUMERIC;
BEGIN
  IF NOT public.is_ravenpos_app_actor() THEN
    RAISE EXCEPTION 'Not authorized to adjust customer store credit';
  END IF;

  IF p_amount_change = 0 THEN
    SELECT store_credit INTO v_new_balance
    FROM public.customers
    WHERE id = p_customer_id;

    IF v_new_balance IS NULL THEN
      RAISE EXCEPTION 'Customer not found';
    END IF;

    RETURN ROUND(v_new_balance, 2);
  END IF;

  UPDATE public.customers
  SET store_credit = ROUND((store_credit + p_amount_change)::NUMERIC, 2)
  WHERE id = p_customer_id
    AND (store_credit + p_amount_change) >= 0
  RETURNING store_credit INTO v_new_balance;

  IF v_new_balance IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = p_customer_id) THEN
      RAISE EXCEPTION 'Customer not found';
    END IF;
    RAISE EXCEPTION 'Insufficient store credit';
  END IF;

  RETURN v_new_balance;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_gift_card(
  p_amount NUMERIC,
  p_recipient_name TEXT DEFAULT NULL,
  p_recipient_email TEXT DEFAULT NULL,
  p_from_name TEXT DEFAULT NULL,
  p_message TEXT DEFAULT NULL,
  p_purchaser_customer_id UUID DEFAULT NULL,
  p_purchase_payment_method TEXT DEFAULT NULL,
  p_purchase_payment_intent_id TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  code TEXT,
  original_amount NUMERIC,
  current_balance NUMERIC,
  recipient_email TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_amount NUMERIC;
  v_method TEXT;
BEGIN
  IF NOT public.is_ravenpos_app_actor() THEN
    RAISE EXCEPTION 'Not authorized to create gift cards';
  END IF;

  v_amount := ROUND(COALESCE(p_amount, 0)::NUMERIC, 2);
  v_method := NULLIF(TRIM(LOWER(COALESCE(p_purchase_payment_method, ''))), '');

  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Gift card amount must be greater than 0';
  END IF;

  IF v_method IS NOT NULL AND v_method NOT IN ('cash', 'card') THEN
    RAISE EXCEPTION 'Invalid payment method';
  END IF;

  RETURN QUERY
  INSERT INTO public.gift_cards (
    code,
    original_amount,
    current_balance,
    recipient_name,
    recipient_email,
    from_name,
    purchaser_customer_id,
    purchase_payment_method,
    purchase_payment_intent_id,
    message
  )
  VALUES (
    public.generate_gift_card_code(),
    v_amount,
    v_amount,
    NULLIF(TRIM(COALESCE(p_recipient_name, '')), ''),
    NULLIF(TRIM(COALESCE(p_recipient_email, '')), ''),
    NULLIF(TRIM(COALESCE(p_from_name, '')), ''),
    p_purchaser_customer_id,
    v_method,
    NULLIF(TRIM(COALESCE(p_purchase_payment_intent_id, '')), ''),
    NULLIF(TRIM(COALESCE(p_message, '')), '')
  )
  RETURNING gift_cards.id, gift_cards.code, gift_cards.original_amount, gift_cards.current_balance, gift_cards.recipient_email;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_gift_card_by_code(
  p_code TEXT
)
RETURNS TABLE (
  id UUID,
  code TEXT,
  current_balance NUMERIC,
  is_active BOOLEAN,
  recipient_name TEXT,
  recipient_email TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_ravenpos_app_actor() THEN
    RAISE EXCEPTION 'Not authorized to look up gift cards';
  END IF;

  RETURN QUERY
  SELECT
    g.id,
    g.code,
    ROUND(g.current_balance::NUMERIC, 2) AS current_balance,
    g.is_active,
    g.recipient_name,
    g.recipient_email
  FROM public.gift_cards g
  WHERE g.code = UPPER(TRIM(COALESCE(p_code, '')))
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.redeem_gift_card(
  p_code TEXT,
  p_amount NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_code TEXT;
  v_amount NUMERIC;
  v_new_balance NUMERIC;
  v_exists BOOLEAN;
BEGIN
  IF NOT public.is_ravenpos_app_actor() THEN
    RAISE EXCEPTION 'Not authorized to redeem gift cards';
  END IF;

  v_code := UPPER(TRIM(COALESCE(p_code, '')));
  v_amount := ROUND(COALESCE(p_amount, 0)::NUMERIC, 2);

  IF v_code = '' THEN
    RAISE EXCEPTION 'Gift card code is required';
  END IF;

  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Redeem amount must be greater than 0';
  END IF;

  UPDATE public.gift_cards
  SET
    current_balance = ROUND((current_balance - v_amount)::NUMERIC, 2),
    last_redeemed_at = NOW(),
    is_active = CASE
      WHEN ROUND((current_balance - v_amount)::NUMERIC, 2) <= 0 THEN FALSE
      ELSE is_active
    END
  WHERE code = v_code
    AND is_active = TRUE
    AND current_balance >= v_amount
  RETURNING current_balance INTO v_new_balance;

  IF v_new_balance IS NULL THEN
    SELECT EXISTS(SELECT 1 FROM public.gift_cards WHERE code = v_code) INTO v_exists;
    IF NOT v_exists THEN
      RAISE EXCEPTION 'Gift card not found';
    END IF;

    IF EXISTS(SELECT 1 FROM public.gift_cards WHERE code = v_code AND is_active = FALSE) THEN
      RAISE EXCEPTION 'Gift card is inactive';
    END IF;

    RAISE EXCEPTION 'Insufficient gift card balance';
  END IF;

  RETURN ROUND(v_new_balance::NUMERIC, 2);
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_gift_card_balance(
  p_code TEXT,
  p_amount NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_code TEXT;
  v_amount NUMERIC;
  v_new_balance NUMERIC;
BEGIN
  IF NOT public.is_ravenpos_app_actor() THEN
    RAISE EXCEPTION 'Not authorized to restore gift cards';
  END IF;

  v_code := UPPER(TRIM(COALESCE(p_code, '')));
  v_amount := ROUND(COALESCE(p_amount, 0)::NUMERIC, 2);

  IF v_code = '' THEN
    RAISE EXCEPTION 'Gift card code is required';
  END IF;

  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Restore amount must be greater than 0';
  END IF;

  UPDATE public.gift_cards
  SET
    current_balance = ROUND((current_balance + v_amount)::NUMERIC, 2),
    is_active = TRUE
  WHERE code = v_code
  RETURNING current_balance INTO v_new_balance;

  IF v_new_balance IS NULL THEN
    RAISE EXCEPTION 'Gift card not found';
  END IF;

  RETURN ROUND(v_new_balance::NUMERIC, 2);
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_customer_store_credit(UUID, NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_gift_card(NUMERIC, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_gift_card_by_code(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.redeem_gift_card(TEXT, NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restore_gift_card_balance(TEXT, NUMERIC) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.adjust_customer_store_credit(UUID, NUMERIC) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_gift_card(NUMERIC, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_gift_card_by_code(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.redeem_gift_card(TEXT, NUMERIC) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restore_gift_card_balance(TEXT, NUMERIC) TO authenticated, service_role;

DROP POLICY IF EXISTS "Authenticated users can upload item images" ON storage.objects;
CREATE POLICY "Authenticated users can upload item images"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'item-images'
  AND public.is_ravenpos_app_actor()
);

DROP POLICY IF EXISTS "Authenticated users can update item images" ON storage.objects;
CREATE POLICY "Authenticated users can update item images"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'item-images'
  AND public.is_ravenpos_app_actor()
)
WITH CHECK (
  bucket_id = 'item-images'
  AND public.is_ravenpos_app_actor()
);

DROP POLICY IF EXISTS "Authenticated users can delete item images" ON storage.objects;
CREATE POLICY "Authenticated users can delete item images"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'item-images'
  AND public.is_ravenpos_app_actor()
);

DROP POLICY IF EXISTS "Authenticated can view POS terminal settings" ON public.pos_terminal_settings;
CREATE POLICY "Authenticated can view POS terminal settings"
ON public.pos_terminal_settings
FOR SELECT
USING (public.is_ravenpos_app_actor());

DROP POLICY IF EXISTS "Authenticated can view dealers" ON public.dealers;
CREATE POLICY "Authenticated can view dealers"
ON public.dealers
FOR SELECT
USING (public.is_ravenpos_app_actor());

DROP POLICY IF EXISTS "Authenticated can view dealer purchases" ON public.dealer_purchases;
CREATE POLICY "Authenticated can view dealer purchases"
ON public.dealer_purchases
FOR SELECT
USING (public.is_ravenpos_app_actor());

DROP POLICY IF EXISTS "Authenticated can view dealer purchase items" ON public.dealer_purchase_items;
CREATE POLICY "Authenticated can view dealer purchase items"
ON public.dealer_purchase_items
FOR SELECT
USING (public.is_ravenpos_app_actor());
