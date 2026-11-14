-- Cash rounding: the store no longer gives pennies, so the cash part of a sale
-- is paid to the nearest nickel.
--
--   * sales.cash_rounding is the signed difference (-0.02 to 0.02) between the
--     cash actually due and the exact amount. 0 for sales with no cash, and
--     for every sale made before this change.
--   * It is part of sales.total, the same way card_fee_amount is:
--       total = subtotal - discounts + tax + card fee + cash rounding
--     so payment_breakdown still sums to total. Item prices, tax and vendor
--     payouts are not affected.
--
-- create_pos_sale_with_items is the 20261015120000 version, unchanged except
-- that it stores cash_rounding from the sale payload.

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS cash_rounding NUMERIC(10,2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sales_cash_rounding_range' AND conrelid = 'public.sales'::regclass
  ) THEN
    ALTER TABLE public.sales
      ADD CONSTRAINT sales_cash_rounding_range CHECK (cash_rounding BETWEEN -0.02 AND 0.02);
  END IF;
END $$;

COMMENT ON COLUMN public.sales.cash_rounding IS 'Signed cents added/removed so the cash part is a multiple of $0.05 (-0.02 to 0.02). Included in total.';
COMMENT ON COLUMN public.sales.total IS 'Full order total (subtotal - discounts + tax + card fee + cash rounding). Tenders in payment_breakdown sum to this.';

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
    cash_rounding,
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
    COALESCE(NULLIF(p_sale->>'cash_rounding', '')::NUMERIC, 0),
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
