-- Gift card rework: sell several cards in one payment, pick a printed design,
-- and optionally tie a card to one vendor so it only pays for that vendor's items.
--
--   * gift_cards.consignor_id  NULL = good for anything in the store;
--                              otherwise only good for that vendor's items.
--   * gift_cards.theme         the printed/emailed design (see src/lib/giftCardThemes.ts).
--   * gift_cards.batch_id      cards sold together in one payment share a batch id.
--
-- Money handling is unchanged: every card row still carries its own
-- purchase_payment_method, so till counts and the sales summary keep working.

ALTER TABLE public.gift_cards
  ADD COLUMN IF NOT EXISTS consignor_id UUID REFERENCES public.consignors(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS theme TEXT,
  ADD COLUMN IF NOT EXISTS batch_id UUID;

CREATE INDEX IF NOT EXISTS idx_gift_cards_batch ON public.gift_cards(batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gift_cards_consignor ON public.gift_cards(consignor_id) WHERE consignor_id IS NOT NULL;

COMMENT ON COLUMN public.gift_cards.consignor_id IS 'NULL = store-wide card. Otherwise the card only pays for this vendor''s items.';
COMMENT ON COLUMN public.gift_cards.theme IS 'Design used when the card is printed or emailed.';
COMMENT ON COLUMN public.gift_cards.batch_id IS 'Cards sold together in one payment share a batch id.';

-- ---------------------------------------------------------------------------
-- Sell several cards at once. All cards are created or none are.
-- p_cards: [{amount, recipient_name, recipient_email, message, theme}]
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_gift_card_batch(
  p_cards JSONB,
  p_consignor_id UUID DEFAULT NULL,
  p_theme TEXT DEFAULT NULL,
  p_from_name TEXT DEFAULT NULL,
  p_purchaser_customer_id UUID DEFAULT NULL,
  p_purchase_payment_method TEXT DEFAULT NULL,
  p_purchase_payment_intent_id TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  code TEXT,
  original_amount NUMERIC,
  recipient_name TEXT,
  recipient_email TEXT,
  from_name TEXT,
  message TEXT,
  theme TEXT,
  consignor_id UUID,
  batch_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_method TEXT := NULLIF(TRIM(LOWER(COALESCE(p_purchase_payment_method, ''))), '');
  v_batch_id UUID := gen_random_uuid();
  v_card JSONB;
  v_amount NUMERIC;
  v_count INTEGER;
BEGIN
  IF NOT public.is_ravenpos_app_actor() THEN
    RAISE EXCEPTION 'Not authorized to create gift cards';
  END IF;

  IF p_cards IS NULL OR jsonb_typeof(p_cards) <> 'array' THEN
    RAISE EXCEPTION 'Add at least one gift card';
  END IF;

  v_count := jsonb_array_length(p_cards);
  IF v_count < 1 THEN
    RAISE EXCEPTION 'Add at least one gift card';
  END IF;
  IF v_count > 48 THEN
    RAISE EXCEPTION 'A single gift card sale is limited to 48 cards';
  END IF;

  IF v_method IS NOT NULL AND v_method NOT IN ('cash', 'card') THEN
    RAISE EXCEPTION 'Invalid payment method';
  END IF;

  IF p_consignor_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.consignors c WHERE c.id = p_consignor_id) THEN
    RAISE EXCEPTION 'Vendor not found';
  END IF;

  FOR v_card IN SELECT value FROM jsonb_array_elements(p_cards)
  LOOP
    v_amount := ROUND(COALESCE(NULLIF(v_card->>'amount', '')::NUMERIC, 0), 2);
    IF v_amount <= 0 THEN
      RAISE EXCEPTION 'Gift card amount must be greater than 0';
    END IF;
    IF v_amount > 1000 THEN
      RAISE EXCEPTION 'Gift card amount is too large';
    END IF;

    RETURN QUERY
    INSERT INTO public.gift_cards AS g (
      code, original_amount, current_balance,
      recipient_name, recipient_email, from_name, message,
      purchaser_customer_id, purchase_payment_method, purchase_payment_intent_id,
      consignor_id, theme, batch_id
    )
    VALUES (
      public.generate_gift_card_code(), v_amount, v_amount,
      NULLIF(TRIM(COALESCE(v_card->>'recipient_name', '')), ''),
      NULLIF(TRIM(COALESCE(v_card->>'recipient_email', '')), ''),
      NULLIF(TRIM(COALESCE(p_from_name, '')), ''),
      NULLIF(TRIM(COALESCE(v_card->>'message', '')), ''),
      p_purchaser_customer_id, v_method,
      NULLIF(TRIM(COALESCE(p_purchase_payment_intent_id, '')), ''),
      p_consignor_id,
      COALESCE(NULLIF(TRIM(COALESCE(v_card->>'theme', '')), ''), NULLIF(TRIM(COALESCE(p_theme, '')), '')),
      v_batch_id
    )
    RETURNING g.id, g.code, g.original_amount, g.recipient_name, g.recipient_email,
              g.from_name, g.message, g.theme, g.consignor_id, g.batch_id;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.create_gift_card_batch(JSONB, UUID, TEXT, TEXT, UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_gift_card_batch(JSONB, UUID, TEXT, TEXT, UUID, TEXT, TEXT) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Lookup now also says which vendor a card is tied to, and returns what is
-- needed to reprint it.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_gift_card_by_code(TEXT);
CREATE OR REPLACE FUNCTION public.get_gift_card_by_code(p_code TEXT)
RETURNS TABLE (
  id UUID,
  code TEXT,
  current_balance NUMERIC,
  is_active BOOLEAN,
  recipient_name TEXT,
  recipient_email TEXT,
  expires_at TIMESTAMPTZ,
  consignor_id UUID,
  consignor_name TEXT,
  theme TEXT,
  original_amount NUMERIC,
  from_name TEXT,
  message TEXT
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
    g.recipient_email,
    g.expires_at,
    g.consignor_id,
    COALESCE(
      NULLIF(TRIM(c.business_name), ''),
      NULLIF(TRIM(c.name), '')
    ) AS consignor_name,
    g.theme,
    ROUND(g.original_amount::NUMERIC, 2) AS original_amount,
    g.from_name,
    g.message
  FROM public.gift_cards g
  LEFT JOIN public.consignors c ON c.id = g.consignor_id
  WHERE g.code = UPPER(TRIM(COALESCE(p_code, '')))
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.get_gift_card_by_code(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_gift_card_by_code(TEXT) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Backstop for vendor cards. Checkout already limits a vendor card to that
-- vendor's items; this refuses a sale that spends one where it does not belong.
-- It runs at commit, once the sale's items exist.
--
-- The ceiling is deliberately generous (the vendor's full-price lines plus all
-- of the sale's tax) so a legitimate sale is never refused over rounding or a
-- discount; it stops a vendor card paying for another vendor's items.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_vendor_gift_card_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_consignor_id UUID;
  v_vendor_name TEXT;
  v_vendor_lines NUMERIC;
  v_tax NUMERIC;
  v_redeemed NUMERIC;
BEGIN
  IF NEW.entry_type <> 'sale_redemption' OR NEW.sale_id IS NULL OR NEW.amount >= 0 THEN
    RETURN NULL;
  END IF;

  SELECT g.consignor_id INTO v_consignor_id
  FROM public.gift_cards g WHERE g.id = NEW.gift_card_id;

  IF v_consignor_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- The sale may have been rolled back or removed in the same transaction.
  IF NOT EXISTS (SELECT 1 FROM public.sales s WHERE s.id = NEW.sale_id) THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(si.price * si.quantity), 0) INTO v_vendor_lines
  FROM public.sale_items si
  WHERE si.sale_id = NEW.sale_id AND si.consignor_id = v_consignor_id;

  SELECT COALESCE(NULLIF(TRIM(c.business_name), ''), NULLIF(TRIM(c.name), ''), 'that vendor')
  INTO v_vendor_name
  FROM public.consignors c WHERE c.id = v_consignor_id;

  IF v_vendor_lines <= 0 THEN
    RAISE EXCEPTION 'This gift card is only good for % items, and this sale has none.', v_vendor_name;
  END IF;

  SELECT COALESCE(s.tax_amount, 0) INTO v_tax FROM public.sales s WHERE s.id = NEW.sale_id;

  SELECT COALESCE(-SUM(t.amount), 0) INTO v_redeemed
  FROM public.gift_card_transactions t
  WHERE t.sale_id = NEW.sale_id
    AND t.gift_card_id = NEW.gift_card_id
    AND t.entry_type IN ('sale_redemption', 'refund_restore');

  IF v_redeemed > v_vendor_lines + v_tax + 0.01 THEN
    RAISE EXCEPTION 'This gift card is only good for % items. It can cover at most % of this sale.',
      v_vendor_name, TO_CHAR(ROUND(v_vendor_lines + v_tax, 2), 'FM$999999990.00');
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS gift_card_transactions_vendor_scope ON public.gift_card_transactions;
CREATE CONSTRAINT TRIGGER gift_card_transactions_vendor_scope
AFTER INSERT ON public.gift_card_transactions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.enforce_vendor_gift_card_scope();

NOTIFY pgrst, 'reload schema';
