-- Store credit and gift cards become first-class tenders.
--
-- Before this migration store credit and gift cards were subtracted from the
-- order before payment: sales.total held only the cash/check/card remainder and
-- payment_method held the remainder's tender (a fully credit-paid sale was saved
-- as payment_method='card', total=0).
--
-- From here on:
--   * sales.total is the full order total (subtotal - discounts + tax + card fee).
--   * sales.payment_breakdown lists every tender and sums to sales.total. Entries:
--       {method:'store_credit', amount, consignor_id|null}
--       {method:'gift_card',    amount, gift_card_id, code_last4}
--       {method:'cash'|'check'|'card', amount, ...existing tender details}
--   * sales.payment_method is the single tender used, or 'split'.
--   * Credit and gift card balances are deducted inside create_pos_sale_with_items,
--     in the same transaction as the sale.
--   * Every balance change is written to store_credit_transactions /
--     gift_card_transactions.
--
-- Card-fee basis is unchanged: payment_method='card' still means the whole total
-- was card, and mixed tenders are 'split' with a card entry in the breakdown.

-- ---------------------------------------------------------------------------
-- Allowed tender values
-- ---------------------------------------------------------------------------

ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS valid_payment_method;
ALTER TABLE public.sales
ADD CONSTRAINT valid_payment_method
CHECK (payment_method IN ('cash', 'card', 'check', 'split', 'store_credit', 'gift_card'));

COMMENT ON COLUMN public.sales.total IS 'Full order total (subtotal - discounts + tax + card fee). Tenders in payment_breakdown sum to this.';
COMMENT ON COLUMN public.sales.payment_method IS 'Single tender used (cash, check, card, store_credit, gift_card) or split when several tenders were used.';
COMMENT ON COLUMN public.sales.payment_breakdown IS 'Every tender on the sale (cash/check/card/store_credit/gift_card) with amounts; sums to total.';

ALTER TABLE public.refunds
ADD COLUMN IF NOT EXISTS payment_breakdown JSONB;

ALTER TABLE public.refunds DROP CONSTRAINT IF EXISTS valid_refund_payment_method;
ALTER TABLE public.refunds
ADD CONSTRAINT valid_refund_payment_method
CHECK (payment_method IN ('cash', 'card', 'check', 'split', 'store_credit', 'gift_card'));

COMMENT ON COLUMN public.refunds.payment_breakdown IS 'Per-tender refund allocation; sums to refund_amount.';

-- ---------------------------------------------------------------------------
-- Ledgers
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.store_credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  -- NULL = general store credit; otherwise vendor-scoped credit for this vendor.
  consignor_id UUID REFERENCES public.consignors(id) ON DELETE SET NULL,
  amount NUMERIC(10,2) NOT NULL,
  balance_after NUMERIC(10,2) NOT NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN (
    'migrated_balance',
    'manual_adjustment',
    'sale_redemption',
    'refund_credit',
    'customer_merge'
  )),
  sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL,
  refund_id UUID REFERENCES public.refunds(id) ON DELETE SET NULL,
  note TEXT,
  created_by_user UUID,
  created_by_employee UUID,
  actor_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_store_credit_transactions_customer
ON public.store_credit_transactions(customer_id, created_at);
CREATE INDEX IF NOT EXISTS idx_store_credit_transactions_sale
ON public.store_credit_transactions(sale_id) WHERE sale_id IS NOT NULL;

ALTER TABLE public.store_credit_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "App actors can read store credit transactions" ON public.store_credit_transactions;
CREATE POLICY "App actors can read store credit transactions"
ON public.store_credit_transactions
FOR SELECT
TO authenticated
USING (public.is_ravenpos_app_actor());

GRANT SELECT ON TABLE public.store_credit_transactions TO authenticated;
GRANT ALL ON TABLE public.store_credit_transactions TO service_role;

COMMENT ON TABLE public.store_credit_transactions IS 'Append-only history of every customer store credit balance change (general and vendor-scoped). Written only by SECURITY DEFINER functions.';

CREATE TABLE IF NOT EXISTS public.gift_card_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gift_card_id UUID NOT NULL REFERENCES public.gift_cards(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL,
  balance_after NUMERIC(10,2) NOT NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN (
    'issue',
    'migrated_adjustment',
    'sale_redemption',
    'refund_restore',
    'manual_redemption',
    'manual_restore'
  )),
  sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL,
  refund_id UUID REFERENCES public.refunds(id) ON DELETE SET NULL,
  note TEXT,
  created_by_user UUID,
  created_by_employee UUID,
  actor_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_gift_card_transactions_card
ON public.gift_card_transactions(gift_card_id, created_at);

ALTER TABLE public.gift_card_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "App actors can read gift card transactions" ON public.gift_card_transactions;
CREATE POLICY "App actors can read gift card transactions"
ON public.gift_card_transactions
FOR SELECT
TO authenticated
USING (public.is_ravenpos_app_actor());

GRANT SELECT ON TABLE public.gift_card_transactions TO authenticated;
GRANT ALL ON TABLE public.gift_card_transactions TO service_role;

COMMENT ON TABLE public.gift_card_transactions IS 'Append-only history of every gift card balance change. Written only by SECURITY DEFINER functions.';

-- ---------------------------------------------------------------------------
-- Internal balance helpers (not callable by clients)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ravenpos_actor_name()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (SELECT e.name FROM public.employees e WHERE e.id = public.current_employee_id()),
    (SELECT COALESCE(NULLIF(btrim(u.full_name), ''), u.email) FROM public.users u WHERE u.id = auth.uid())
  );
$$;

REVOKE ALL ON FUNCTION public.ravenpos_actor_name() FROM PUBLIC;

-- Applies a signed change to a customer's general (p_consignor_id NULL) or
-- vendor-scoped credit, refuses to go below zero, and writes the ledger row.
CREATE OR REPLACE FUNCTION public.apply_store_credit_change(
  p_customer_id UUID,
  p_consignor_id UUID,
  p_amount NUMERIC,
  p_entry_type TEXT,
  p_sale_id UUID DEFAULT NULL,
  p_refund_id UUID DEFAULT NULL,
  p_note TEXT DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_amount NUMERIC := ROUND(COALESCE(p_amount, 0)::NUMERIC, 2);
  v_new_balance NUMERIC;
BEGIN
  IF p_customer_id IS NULL THEN
    RAISE EXCEPTION 'Customer is required for store credit';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = p_customer_id) THEN
    RAISE EXCEPTION 'Customer not found';
  END IF;

  IF p_consignor_id IS NULL THEN
    IF v_amount = 0 THEN
      SELECT store_credit INTO v_new_balance FROM public.customers WHERE id = p_customer_id;
      RETURN ROUND(v_new_balance, 2);
    END IF;

    UPDATE public.customers
    SET store_credit = ROUND((store_credit + v_amount)::NUMERIC, 2)
    WHERE id = p_customer_id
      AND (store_credit + v_amount) >= 0
    RETURNING store_credit INTO v_new_balance;

    IF v_new_balance IS NULL THEN
      RAISE EXCEPTION 'Insufficient store credit';
    END IF;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.consignors WHERE id = p_consignor_id) THEN
      RAISE EXCEPTION 'Vendor not found';
    END IF;

    IF v_amount = 0 THEN
      SELECT balance INTO v_new_balance
      FROM public.customer_vendor_store_credits
      WHERE customer_id = p_customer_id AND consignor_id = p_consignor_id;
      RETURN ROUND(COALESCE(v_new_balance, 0), 2);
    END IF;

    IF v_amount > 0 THEN
      INSERT INTO public.customer_vendor_store_credits (customer_id, consignor_id, balance)
      VALUES (p_customer_id, p_consignor_id, v_amount)
      ON CONFLICT (customer_id, consignor_id)
      DO UPDATE SET
        balance = ROUND((public.customer_vendor_store_credits.balance + EXCLUDED.balance)::NUMERIC, 2),
        updated_at = NOW()
      RETURNING balance INTO v_new_balance;
    ELSE
      UPDATE public.customer_vendor_store_credits
      SET balance = ROUND((balance + v_amount)::NUMERIC, 2)
      WHERE customer_id = p_customer_id
        AND consignor_id = p_consignor_id
        AND (balance + v_amount) >= 0
      RETURNING balance INTO v_new_balance;

      IF v_new_balance IS NULL THEN
        RAISE EXCEPTION 'Insufficient vendor store credit';
      END IF;
    END IF;
  END IF;

  INSERT INTO public.store_credit_transactions (
    customer_id, consignor_id, amount, balance_after, entry_type,
    sale_id, refund_id, note, created_by_user, created_by_employee, actor_name
  )
  VALUES (
    p_customer_id, p_consignor_id, v_amount, ROUND(v_new_balance, 2), p_entry_type,
    p_sale_id, p_refund_id, NULLIF(btrim(COALESCE(p_note, '')), ''),
    (SELECT u.id FROM public.users u WHERE u.id = auth.uid()),
    public.current_employee_id(),
    public.ravenpos_actor_name()
  );

  RETURN ROUND(v_new_balance, 2);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_store_credit_change(UUID, UUID, NUMERIC, TEXT, UUID, UUID, TEXT) FROM PUBLIC;

-- Applies a signed change to a gift card balance and writes the ledger row.
-- Negative changes require an active, unexpired card with enough balance.
CREATE OR REPLACE FUNCTION public.apply_gift_card_change(
  p_gift_card_id UUID,
  p_amount NUMERIC,
  p_entry_type TEXT,
  p_sale_id UUID DEFAULT NULL,
  p_refund_id UUID DEFAULT NULL,
  p_note TEXT DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_amount NUMERIC := ROUND(COALESCE(p_amount, 0)::NUMERIC, 2);
  v_card public.gift_cards%ROWTYPE;
  v_new_balance NUMERIC;
BEGIN
  SELECT * INTO v_card FROM public.gift_cards WHERE id = p_gift_card_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Gift card not found';
  END IF;

  IF v_amount = 0 THEN
    RETURN ROUND(v_card.current_balance, 2);
  END IF;

  IF v_amount < 0 THEN
    IF NOT v_card.is_active THEN
      RAISE EXCEPTION 'Gift card is inactive';
    END IF;
    IF v_card.expires_at IS NOT NULL AND v_card.expires_at <= NOW() THEN
      RAISE EXCEPTION 'Gift card has expired';
    END IF;
    IF v_card.current_balance + v_amount < 0 THEN
      RAISE EXCEPTION 'Insufficient gift card balance';
    END IF;
  END IF;

  v_new_balance := ROUND((v_card.current_balance + v_amount)::NUMERIC, 2);

  UPDATE public.gift_cards
  SET
    current_balance = v_new_balance,
    last_redeemed_at = CASE WHEN v_amount < 0 THEN NOW() ELSE last_redeemed_at END,
    is_active = CASE WHEN v_new_balance <= 0 THEN FALSE ELSE TRUE END
  WHERE id = p_gift_card_id;

  INSERT INTO public.gift_card_transactions (
    gift_card_id, amount, balance_after, entry_type, sale_id, refund_id, note,
    created_by_user, created_by_employee, actor_name
  )
  VALUES (
    p_gift_card_id, v_amount, v_new_balance, p_entry_type, p_sale_id, p_refund_id,
    NULLIF(btrim(COALESCE(p_note, '')), ''),
    (SELECT u.id FROM public.users u WHERE u.id = auth.uid()),
    public.current_employee_id(),
    public.ravenpos_actor_name()
  );

  RETURN v_new_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_gift_card_change(UUID, NUMERIC, TEXT, UUID, UUID, TEXT) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Client-facing balance functions, now logged
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.adjust_customer_store_credit(UUID, NUMERIC);
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
  IF NOT public.is_ravenpos_app_actor() THEN
    RAISE EXCEPTION 'Not authorized to adjust customer store credit';
  END IF;

  RETURN public.apply_store_credit_change(
    p_customer_id, NULL, p_amount_change, 'manual_adjustment', NULL, NULL, p_note
  );
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_customer_store_credit(UUID, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adjust_customer_store_credit(UUID, NUMERIC, TEXT) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.adjust_customer_vendor_store_credit(UUID, UUID, NUMERIC);
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
  IF NOT public.is_ravenpos_app_actor() THEN
    RAISE EXCEPTION 'Not authorized to adjust customer vendor store credit';
  END IF;

  IF p_consignor_id IS NULL THEN
    RAISE EXCEPTION 'Vendor is required';
  END IF;

  RETURN public.apply_store_credit_change(
    p_customer_id, p_consignor_id, p_amount_change, 'manual_adjustment', NULL, NULL, p_note
  );
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_customer_vendor_store_credit(UUID, UUID, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adjust_customer_vendor_store_credit(UUID, UUID, NUMERIC, TEXT) TO authenticated, service_role;

-- Kept for older POS builds that still redeem/restore by code outside the sale.
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
  v_id UUID;
  v_amount NUMERIC := ROUND(COALESCE(p_amount, 0)::NUMERIC, 2);
BEGIN
  IF NOT public.is_ravenpos_app_actor() THEN
    RAISE EXCEPTION 'Not authorized to redeem gift cards';
  END IF;

  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Redeem amount must be greater than 0';
  END IF;

  SELECT id INTO v_id FROM public.gift_cards WHERE code = UPPER(TRIM(COALESCE(p_code, '')));
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Gift card not found';
  END IF;

  RETURN public.apply_gift_card_change(v_id, -v_amount, 'manual_redemption');
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
  v_id UUID;
  v_amount NUMERIC := ROUND(COALESCE(p_amount, 0)::NUMERIC, 2);
BEGIN
  IF NOT public.is_ravenpos_app_actor() THEN
    RAISE EXCEPTION 'Not authorized to restore gift cards';
  END IF;

  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Restore amount must be greater than 0';
  END IF;

  SELECT id INTO v_id FROM public.gift_cards WHERE code = UPPER(TRIM(COALESCE(p_code, '')));
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Gift card not found';
  END IF;

  RETURN public.apply_gift_card_change(v_id, v_amount, 'manual_restore');
END;
$$;

-- Lookup now also reports expiry so POS can refuse expired cards up front.
DROP FUNCTION IF EXISTS public.get_gift_card_by_code(TEXT);
CREATE OR REPLACE FUNCTION public.get_gift_card_by_code(
  p_code TEXT
)
RETURNS TABLE (
  id UUID,
  code TEXT,
  current_balance NUMERIC,
  is_active BOOLEAN,
  recipient_name TEXT,
  recipient_email TEXT,
  expires_at TIMESTAMPTZ
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
    g.expires_at
  FROM public.gift_cards g
  WHERE g.code = UPPER(TRIM(COALESCE(p_code, '')))
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.get_gift_card_by_code(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_gift_card_by_code(TEXT) TO authenticated, service_role;

-- Log the opening balance of newly issued gift cards.
CREATE OR REPLACE FUNCTION public.log_gift_card_issue()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.gift_card_transactions (
    gift_card_id, amount, balance_after, entry_type, note,
    created_by_user, created_by_employee, actor_name, created_at
  )
  VALUES (
    NEW.id, NEW.original_amount, NEW.current_balance, 'issue',
    CASE WHEN NEW.purchase_payment_method IS NOT NULL
      THEN 'Sold for ' || NEW.purchase_payment_method
      ELSE NULL
    END,
    (SELECT u.id FROM public.users u WHERE u.id = auth.uid()),
    public.current_employee_id(),
    public.ravenpos_actor_name(),
    NEW.issued_at
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS gift_cards_log_issue ON public.gift_cards;
CREATE TRIGGER gift_cards_log_issue
AFTER INSERT ON public.gift_cards
FOR EACH ROW EXECUTE FUNCTION public.log_gift_card_issue();

-- ---------------------------------------------------------------------------
-- Sale creation with tenders
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_pos_sale_with_items(
  p_sale JSONB,
  p_sale_items JSONB
)
RETURNS public.sales
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  inserted_sale public.sales%ROWTYPE;
  inserted_item_count INTEGER;
  expected_inventory_item_count INTEGER;
  decremented_inventory_item_count INTEGER;
  v_is_tender_payload BOOLEAN := COALESCE(p_sale->>'tenders_version', '') = '2';
  v_customer_id UUID := NULLIF(p_sale->>'customer_id', '')::UUID;
  v_total NUMERIC := ROUND(COALESCE(NULLIF(p_sale->>'total', '')::NUMERIC, 0), 2);
  v_payment_method TEXT := COALESCE(NULLIF(p_sale->>'payment_method', ''), 'cash');
  v_breakdown JSONB := CASE
    WHEN jsonb_typeof(p_sale->'payment_breakdown') = 'array' THEN p_sale->'payment_breakdown'
    ELSE NULL
  END;
  v_store_credit_used NUMERIC := ROUND(COALESCE(NULLIF(p_sale->>'store_credit_used', '')::NUMERIC, 0), 2);
  v_gift_card_used NUMERIC := ROUND(COALESCE(NULLIF(p_sale->>'gift_card_used', '')::NUMERIC, 0), 2);
  v_clean_breakdown JSONB := '[]'::JSONB;
  v_entry JSONB;
  v_method TEXT;
  v_amount NUMERIC;
  v_tender_sum NUMERIC := 0;
  v_gift_card public.gift_cards%ROWTYPE;
  v_code TEXT;
BEGIN
  IF NOT public.is_ravenpos_app_actor() THEN
    RAISE EXCEPTION 'Not authorized to create POS sales.'
      USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(p_sale) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'POS sale payload must be a JSON object.'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_sale_items) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_sale_items) = 0 THEN
    RAISE EXCEPTION 'POS sale must include at least one sale item.'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_sale_items) AS item_payload
    WHERE COALESCE(NULLIF(item_payload->>'quantity', '')::INTEGER, 1) <= 0
  ) THEN
    RAISE EXCEPTION 'POS sale item quantities must be greater than zero.'
      USING ERRCODE = '23514';
  END IF;

  IF v_is_tender_payload THEN
    -- Current POS: the breakdown is the source of truth and balances are
    -- deducted here, after the sale row exists.
    v_store_credit_used := 0;
    v_gift_card_used := 0;

    FOR v_entry IN SELECT * FROM jsonb_array_elements(COALESCE(v_breakdown, '[]'::JSONB))
    LOOP
      v_method := v_entry->>'method';
      v_amount := ROUND(COALESCE(NULLIF(v_entry->>'amount', '')::NUMERIC, 0), 2);

      IF v_method NOT IN ('cash', 'check', 'card', 'store_credit', 'gift_card') THEN
        RAISE EXCEPTION 'Unknown payment method: %', v_method USING ERRCODE = '22023';
      END IF;
      IF v_amount < 0 THEN
        RAISE EXCEPTION 'Payment amounts cannot be negative.' USING ERRCODE = '23514';
      END IF;
      CONTINUE WHEN v_amount = 0;

      IF v_method = 'store_credit' THEN
        IF v_customer_id IS NULL THEN
          RAISE EXCEPTION 'Store credit requires a customer on the sale.' USING ERRCODE = '23514';
        END IF;
        v_store_credit_used := v_store_credit_used + v_amount;
        v_entry := jsonb_build_object(
          'method', 'store_credit',
          'amount', v_amount,
          'consignor_id', NULLIF(v_entry->>'consignor_id', '')
        );
      ELSIF v_method = 'gift_card' THEN
        v_code := UPPER(TRIM(COALESCE(v_entry->>'gift_card_code', '')));
        SELECT * INTO v_gift_card
        FROM public.gift_cards
        WHERE (NULLIF(v_entry->>'gift_card_id', '') IS NOT NULL AND id = (v_entry->>'gift_card_id')::UUID)
           OR (v_code <> '' AND code = v_code)
        LIMIT 1;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'Gift card not found' USING ERRCODE = '23514';
        END IF;
        v_gift_card_used := v_gift_card_used + v_amount;
        -- Never persist the full code on the sale; it is the bearer secret.
        v_entry := jsonb_build_object(
          'method', 'gift_card',
          'amount', v_amount,
          'gift_card_id', v_gift_card.id,
          'code_last4', RIGHT(v_gift_card.code, 4)
        );
      ELSE
        v_entry := v_entry || jsonb_build_object('amount', v_amount);
      END IF;

      v_tender_sum := v_tender_sum + v_amount;
      v_clean_breakdown := v_clean_breakdown || jsonb_build_array(v_entry);
    END LOOP;

    IF ABS(v_tender_sum - v_total) > 0.005 THEN
      RAISE EXCEPTION 'Payments (%) do not add up to the sale total (%).', v_tender_sum, v_total
        USING ERRCODE = '23514';
    END IF;

    v_breakdown := CASE WHEN jsonb_array_length(v_clean_breakdown) > 0 THEN v_clean_breakdown ELSE NULL END;
    v_payment_method := CASE
      WHEN jsonb_array_length(v_clean_breakdown) = 1 THEN v_clean_breakdown->0->>'method'
      WHEN jsonb_array_length(v_clean_breakdown) > 1 THEN 'split'
      ELSE v_payment_method
    END;
  ELSIF v_store_credit_used > 0 OR v_gift_card_used > 0 THEN
    -- Older POS builds already deducted balances before calling this function
    -- and sent the remainder as total. Store the sale in the current shape.
    v_clean_breakdown := '[]'::JSONB;
    IF v_store_credit_used > 0 THEN
      v_clean_breakdown := v_clean_breakdown || jsonb_build_array(jsonb_build_object(
        'method', 'store_credit', 'amount', v_store_credit_used, 'consignor_id', NULL
      ));
    END IF;
    IF v_gift_card_used > 0 THEN
      v_clean_breakdown := v_clean_breakdown || jsonb_build_array(jsonb_build_object(
        'method', 'gift_card', 'amount', v_gift_card_used
      ));
    END IF;
    IF v_payment_method = 'split' AND v_breakdown IS NOT NULL THEN
      v_clean_breakdown := v_clean_breakdown || v_breakdown;
    ELSIF v_total > 0 THEN
      v_clean_breakdown := v_clean_breakdown || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'method', v_payment_method,
        'amount', v_total,
        'tendered', CASE WHEN v_payment_method = 'cash' THEN NULLIF(p_sale->>'cash_tendered', '')::NUMERIC END,
        'change', CASE WHEN v_payment_method = 'cash' THEN NULLIF(p_sale->>'change_given', '')::NUMERIC END,
        'check_number', CASE WHEN v_payment_method = 'check' THEN NULLIF(p_sale->>'check_number', '') END,
        'stripe_payment_intent_id', CASE WHEN v_payment_method = 'card' THEN NULLIF(p_sale->>'stripe_payment_intent_id', '') END
      )));
    END IF;

    v_total := ROUND(v_total + v_store_credit_used + v_gift_card_used, 2);
    v_breakdown := v_clean_breakdown;
    v_payment_method := CASE
      WHEN jsonb_array_length(v_clean_breakdown) = 1 THEN v_clean_breakdown->0->>'method'
      ELSE 'split'
    END;
  END IF;

  INSERT INTO public.sales (
    id,
    completed_at,
    subtotal,
    tax_amount,
    total,
    cash_tendered,
    change_given,
    customer_id,
    payment_method,
    stripe_payment_intent_id,
    processed_by_employee,
    discounts,
    discount_total,
    store_credit_used,
    card_fee_amount,
    gift_card_used,
    check_number,
    processed_by_user,
    payment_breakdown
  )
  VALUES (
    COALESCE(NULLIF(p_sale->>'id', '')::UUID, gen_random_uuid()),
    COALESCE(NULLIF(p_sale->>'completed_at', '')::TIMESTAMPTZ, NOW()),
    NULLIF(p_sale->>'subtotal', '')::NUMERIC,
    NULLIF(p_sale->>'tax_amount', '')::NUMERIC,
    v_total,
    NULLIF(p_sale->>'cash_tendered', '')::NUMERIC,
    NULLIF(p_sale->>'change_given', '')::NUMERIC,
    v_customer_id,
    v_payment_method,
    NULLIF(p_sale->>'stripe_payment_intent_id', ''),
    NULLIF(p_sale->>'processed_by_employee', '')::UUID,
    COALESCE(p_sale->'discounts', '[]'::JSONB),
    COALESCE(NULLIF(p_sale->>'discount_total', '')::NUMERIC, 0),
    v_store_credit_used,
    COALESCE(NULLIF(p_sale->>'card_fee_amount', '')::NUMERIC, 0),
    v_gift_card_used,
    NULLIF(p_sale->>'check_number', ''),
    NULLIF(p_sale->>'processed_by_user', '')::UUID,
    v_breakdown
  )
  RETURNING * INTO inserted_sale;

  IF v_is_tender_payload AND v_breakdown IS NOT NULL THEN
    FOR v_entry IN SELECT * FROM jsonb_array_elements(v_breakdown)
    LOOP
      IF v_entry->>'method' = 'store_credit' THEN
        PERFORM public.apply_store_credit_change(
          v_customer_id,
          NULLIF(v_entry->>'consignor_id', '')::UUID,
          -((v_entry->>'amount')::NUMERIC),
          'sale_redemption',
          inserted_sale.id
        );
      ELSIF v_entry->>'method' = 'gift_card' THEN
        PERFORM public.apply_gift_card_change(
          (v_entry->>'gift_card_id')::UUID,
          -((v_entry->>'amount')::NUMERIC),
          'sale_redemption',
          inserted_sale.id
        );
      END IF;
    END LOOP;
  END IF;

  WITH sale_item_quantities AS (
    SELECT
      NULLIF(item_payload->>'item_id', '')::UUID AS item_id,
      SUM(COALESCE(NULLIF(item_payload->>'quantity', '')::INTEGER, 1))::INTEGER AS quantity_sold
    FROM jsonb_array_elements(p_sale_items) AS item_payload
    WHERE NULLIF(item_payload->>'item_id', '') IS NOT NULL
    GROUP BY NULLIF(item_payload->>'item_id', '')::UUID
  ),
  existing_sale_item_quantities AS (
    SELECT sale_item_quantities.item_id, sale_item_quantities.quantity_sold
    FROM sale_item_quantities
    JOIN public.items AS item ON item.id = sale_item_quantities.item_id
  ),
  updated_items AS (
    UPDATE public.items AS item
    SET quantity = item.quantity - existing_sale_item_quantities.quantity_sold
    FROM existing_sale_item_quantities
    WHERE item.id = existing_sale_item_quantities.item_id
      AND item.quantity >= existing_sale_item_quantities.quantity_sold
    RETURNING item.id
  )
  SELECT
    (SELECT COUNT(*) FROM existing_sale_item_quantities),
    (SELECT COUNT(*) FROM updated_items)
  INTO expected_inventory_item_count, decremented_inventory_item_count;

  IF decremented_inventory_item_count <> expected_inventory_item_count THEN
    RAISE EXCEPTION 'Insufficient inventory for one or more POS sale items.'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.sale_items (
    id,
    sale_id,
    item_id,
    consignor_id,
    sku,
    name,
    price,
    quantity,
    commission_split,
    consignor_pays_card_fee,
    discount_type,
    discount_value,
    discount_amount,
    discount_reason
  )
  SELECT
    COALESCE(NULLIF(item_payload->>'id', '')::UUID, gen_random_uuid()),
    inserted_sale.id,
    existing_item.id,
    NULLIF(item_payload->>'consignor_id', '')::UUID,
    item_payload->>'sku',
    item_payload->>'name',
    NULLIF(item_payload->>'price', '')::NUMERIC,
    COALESCE(NULLIF(item_payload->>'quantity', '')::INTEGER, 1),
    NULLIF(item_payload->>'commission_split', '')::NUMERIC,
    COALESCE(NULLIF(item_payload->>'consignor_pays_card_fee', '')::BOOLEAN, FALSE),
    NULLIF(item_payload->>'discount_type', ''),
    NULLIF(item_payload->>'discount_value', '')::NUMERIC,
    COALESCE(NULLIF(item_payload->>'discount_amount', '')::NUMERIC, 0),
    NULLIF(item_payload->>'discount_reason', '')
  FROM jsonb_array_elements(p_sale_items) AS item_payload
  LEFT JOIN public.items AS existing_item
    ON existing_item.id = NULLIF(item_payload->>'item_id', '')::UUID;

  GET DIAGNOSTICS inserted_item_count = ROW_COUNT;

  IF inserted_item_count <> jsonb_array_length(p_sale_items) THEN
    RAISE EXCEPTION 'POS sale item count mismatch. Expected %, inserted %.',
      jsonb_array_length(p_sale_items),
      inserted_item_count
      USING ERRCODE = '23514';
  END IF;

  RETURN inserted_sale;
END;
$$;

REVOKE ALL ON FUNCTION public.create_pos_sale_with_items(JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_pos_sale_with_items(JSONB, JSONB) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Refunds with per-tender allocation
-- ---------------------------------------------------------------------------

-- Records a refund whose payment_breakdown says how much goes back to each
-- tender. Store credit and gift card portions are returned to the balance they
-- came from, in the same transaction. Card portions must already be refunded in
-- Stripe by the caller (stripe_refund_id on the matching breakdown entry).
CREATE OR REPLACE FUNCTION public.record_pos_refund(
  p_refund JSONB
)
RETURNS public.refunds
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sale public.sales%ROWTYPE;
  v_refund public.refunds%ROWTYPE;
  v_breakdown JSONB := CASE
    WHEN jsonb_typeof(p_refund->'payment_breakdown') = 'array' THEN p_refund->'payment_breakdown'
    ELSE '[]'::JSONB
  END;
  v_clean JSONB := '[]'::JSONB;
  v_entry JSONB;
  v_method TEXT;
  v_amount NUMERIC;
  v_sum NUMERIC := 0;
  v_refund_amount NUMERIC := ROUND(COALESCE(NULLIF(p_refund->>'refund_amount', '')::NUMERIC, 0), 2);
  v_already_refunded NUMERIC;
  v_payment_method TEXT;
  v_first_stripe_refund TEXT;
BEGIN
  IF NOT public.is_ravenpos_app_actor() THEN
    RAISE EXCEPTION 'Not authorized to record refunds.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_sale FROM public.sales WHERE id = NULLIF(p_refund->>'sale_id', '')::UUID FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale not found';
  END IF;

  IF v_refund_amount <= 0 THEN
    RAISE EXCEPTION 'Refund amount must be greater than zero';
  END IF;

  SELECT COALESCE(SUM(refund_amount), 0) INTO v_already_refunded
  FROM public.refunds WHERE sale_id = v_sale.id;

  IF v_already_refunded + v_refund_amount > v_sale.total + 0.005 THEN
    RAISE EXCEPTION 'Refund exceeds the remaining refundable amount on this sale';
  END IF;

  FOR v_entry IN SELECT * FROM jsonb_array_elements(v_breakdown)
  LOOP
    v_method := v_entry->>'method';
    v_amount := ROUND(COALESCE(NULLIF(v_entry->>'amount', '')::NUMERIC, 0), 2);
    IF v_method NOT IN ('cash', 'check', 'card', 'store_credit', 'gift_card') THEN
      RAISE EXCEPTION 'Unknown refund method: %', v_method;
    END IF;
    IF v_amount < 0 THEN
      RAISE EXCEPTION 'Refund amounts cannot be negative';
    END IF;
    CONTINUE WHEN v_amount = 0;
    IF v_method = 'store_credit' AND v_sale.customer_id IS NULL THEN
      RAISE EXCEPTION 'This sale has no customer to return store credit to';
    END IF;
    IF v_method = 'card' AND v_first_stripe_refund IS NULL THEN
      v_first_stripe_refund := NULLIF(v_entry->>'stripe_refund_id', '');
    END IF;
    v_sum := v_sum + v_amount;
    v_clean := v_clean || jsonb_build_array(jsonb_strip_nulls(v_entry || jsonb_build_object('amount', v_amount)));
  END LOOP;

  IF jsonb_array_length(v_clean) = 0 THEN
    RAISE EXCEPTION 'Refund needs at least one tender';
  END IF;

  IF ABS(v_sum - v_refund_amount) > 0.005 THEN
    RAISE EXCEPTION 'Refund tenders (%) do not add up to the refund amount (%)', v_sum, v_refund_amount;
  END IF;

  v_payment_method := CASE
    WHEN jsonb_array_length(v_clean) = 1 THEN v_clean->0->>'method'
    ELSE 'split'
  END;

  INSERT INTO public.refunds (
    sale_id, customer_id, refund_amount, payment_method, stripe_refund_id, items, payment_breakdown
  )
  VALUES (
    v_sale.id,
    v_sale.customer_id,
    v_refund_amount,
    v_payment_method,
    COALESCE(NULLIF(p_refund->>'stripe_refund_id', ''), v_first_stripe_refund),
    COALESCE(p_refund->'items', '[]'::JSONB),
    v_clean
  )
  RETURNING * INTO v_refund;

  FOR v_entry IN SELECT * FROM jsonb_array_elements(v_clean)
  LOOP
    IF v_entry->>'method' = 'store_credit' THEN
      PERFORM public.apply_store_credit_change(
        v_sale.customer_id,
        NULLIF(v_entry->>'consignor_id', '')::UUID,
        (v_entry->>'amount')::NUMERIC,
        'refund_credit',
        v_sale.id,
        v_refund.id
      );
    ELSIF v_entry->>'method' = 'gift_card' THEN
      IF NULLIF(v_entry->>'gift_card_id', '') IS NULL THEN
        RAISE EXCEPTION 'Gift card refund needs the original gift card';
      END IF;
      PERFORM public.apply_gift_card_change(
        (v_entry->>'gift_card_id')::UUID,
        (v_entry->>'amount')::NUMERIC,
        'refund_restore',
        v_sale.id,
        v_refund.id
      );
    END IF;
  END LOOP;

  RETURN v_refund;
END;
$$;

REVOKE ALL ON FUNCTION public.record_pos_refund(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_pos_refund(JSONB) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Backfill existing sales into the tender shape
-- ---------------------------------------------------------------------------

WITH legacy AS (
  SELECT
    s.id,
    ROUND(s.total + s.store_credit_used + s.gift_card_used, 2) AS new_total,
    (
      CASE WHEN s.store_credit_used > 0
        THEN jsonb_build_array(jsonb_build_object('method', 'store_credit', 'amount', s.store_credit_used, 'consignor_id', NULL))
        ELSE '[]'::JSONB
      END
      || CASE WHEN s.gift_card_used > 0
        THEN jsonb_build_array(jsonb_build_object('method', 'gift_card', 'amount', s.gift_card_used))
        ELSE '[]'::JSONB
      END
      || CASE
        WHEN s.payment_method = 'split' AND jsonb_typeof(s.payment_breakdown) = 'array' THEN s.payment_breakdown
        WHEN s.total > 0 THEN jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
          'method', s.payment_method,
          'amount', s.total,
          'tendered', CASE WHEN s.payment_method = 'cash' THEN s.cash_tendered END,
          'change', CASE WHEN s.payment_method = 'cash' THEN s.change_given END,
          'check_number', CASE WHEN s.payment_method = 'check' THEN s.check_number END,
          'stripe_payment_intent_id', CASE WHEN s.payment_method = 'card' THEN s.stripe_payment_intent_id END
        )))
        ELSE '[]'::JSONB
      END
    ) AS new_breakdown
  FROM public.sales s
  WHERE (s.store_credit_used > 0 OR s.gift_card_used > 0)
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(s.payment_breakdown) = 'array' THEN s.payment_breakdown ELSE '[]'::JSONB END
      ) entry
      WHERE entry->>'method' IN ('store_credit', 'gift_card')
    )
)
UPDATE public.sales s
SET
  total = legacy.new_total,
  payment_breakdown = legacy.new_breakdown,
  payment_method = CASE
    WHEN jsonb_array_length(legacy.new_breakdown) = 1 THEN legacy.new_breakdown->0->>'method'
    ELSE 'split'
  END
FROM legacy
WHERE s.id = legacy.id;

-- ---------------------------------------------------------------------------
-- Seed the ledgers from what is known today
-- ---------------------------------------------------------------------------

-- General credit: one carried-forward row for credit issued before tracking
-- began (dates unknown), then each historical sale redemption, so the running
-- balance ends at today's customers.store_credit.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.store_credit_transactions) THEN
    WITH redemptions AS (
      SELECT s.customer_id, s.id AS sale_id, s.completed_at, s.store_credit_used
      FROM public.sales s
      WHERE s.customer_id IS NOT NULL AND s.store_credit_used > 0
    ), per_customer AS (
      SELECT
        c.id AS customer_id,
        c.store_credit,
        COALESCE(SUM(r.store_credit_used), 0) AS redeemed,
        MIN(r.completed_at) AS first_redemption
      FROM public.customers c
      LEFT JOIN redemptions r ON r.customer_id = c.id
      GROUP BY c.id, c.store_credit
      HAVING c.store_credit > 0 OR COALESCE(SUM(r.store_credit_used), 0) > 0
    )
    INSERT INTO public.store_credit_transactions (
      customer_id, consignor_id, amount, balance_after, entry_type, note, created_at
    )
    SELECT
      pc.customer_id,
      NULL,
      ROUND(pc.store_credit + pc.redeemed, 2),
      ROUND(pc.store_credit + pc.redeemed, 2),
      'migrated_balance',
      'Credit added before history tracking began (exact dates were not recorded)',
      COALESCE(pc.first_redemption - INTERVAL '1 second', NOW())
    FROM per_customer pc;

    INSERT INTO public.store_credit_transactions (
      customer_id, consignor_id, amount, balance_after, entry_type, sale_id, note, created_at
    )
    SELECT
      r.customer_id,
      NULL,
      -r.store_credit_used,
      ROUND(
        (pc_total.store_credit + pc_total.redeemed)
        - SUM(r.store_credit_used) OVER (
          PARTITION BY r.customer_id ORDER BY r.completed_at, r.sale_id
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ),
        2
      ),
      'sale_redemption',
      r.sale_id,
      'Recorded before history tracking began',
      r.completed_at
    FROM (
      SELECT s.customer_id, s.id AS sale_id, s.completed_at, s.store_credit_used
      FROM public.sales s
      WHERE s.customer_id IS NOT NULL AND s.store_credit_used > 0
    ) r
    JOIN (
      SELECT c.id, c.store_credit, COALESCE(SUM(s.store_credit_used), 0) AS redeemed
      FROM public.customers c
      JOIN public.sales s ON s.customer_id = c.id AND s.store_credit_used > 0
      GROUP BY c.id, c.store_credit
    ) pc_total ON pc_total.id = r.customer_id;

    INSERT INTO public.store_credit_transactions (
      customer_id, consignor_id, amount, balance_after, entry_type, note, created_at
    )
    SELECT
      v.customer_id,
      v.consignor_id,
      v.balance,
      v.balance,
      'migrated_balance',
      'Vendor credit balance carried forward when history tracking began',
      v.created_at
    FROM public.customer_vendor_store_credits v
    WHERE v.balance > 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.gift_card_transactions) THEN
    INSERT INTO public.gift_card_transactions (
      gift_card_id, amount, balance_after, entry_type, note, created_at
    )
    SELECT g.id, g.original_amount, g.original_amount, 'issue',
      CASE WHEN g.purchase_payment_method IS NOT NULL THEN 'Sold for ' || g.purchase_payment_method END,
      g.issued_at
    FROM public.gift_cards g;

    INSERT INTO public.gift_card_transactions (
      gift_card_id, amount, balance_after, entry_type, note, created_at
    )
    SELECT g.id, ROUND(g.current_balance - g.original_amount, 2), g.current_balance, 'migrated_adjustment',
      'Balance changes before history tracking began',
      COALESCE(g.last_redeemed_at, g.updated_at)
    FROM public.gift_cards g
    WHERE g.current_balance <> g.original_amount;
  END IF;
END $$;
