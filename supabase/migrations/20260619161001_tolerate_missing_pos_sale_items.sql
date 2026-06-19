-- Let POS sale snapshots survive missing/deleted inventory rows.
--
-- The previous atomic inventory migration fails existing stock shortages, but it
-- also failed if an item_id no longer existed. For offline cash sync and stale
-- carts, keep the sale snapshot and store item_id as NULL for missing items.
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
    NULLIF(p_sale->>'total', '')::NUMERIC,
    NULLIF(p_sale->>'cash_tendered', '')::NUMERIC,
    NULLIF(p_sale->>'change_given', '')::NUMERIC,
    NULLIF(p_sale->>'customer_id', '')::UUID,
    COALESCE(NULLIF(p_sale->>'payment_method', ''), 'cash'),
    NULLIF(p_sale->>'stripe_payment_intent_id', ''),
    NULLIF(p_sale->>'processed_by_employee', '')::UUID,
    COALESCE(p_sale->'discounts', '[]'::JSONB),
    COALESCE(NULLIF(p_sale->>'discount_total', '')::NUMERIC, 0),
    COALESCE(NULLIF(p_sale->>'store_credit_used', '')::NUMERIC, 0),
    COALESCE(NULLIF(p_sale->>'card_fee_amount', '')::NUMERIC, 0),
    COALESCE(NULLIF(p_sale->>'gift_card_used', '')::NUMERIC, 0),
    NULLIF(p_sale->>'check_number', ''),
    NULLIF(p_sale->>'processed_by_user', '')::UUID,
    p_sale->'payment_breakdown'
  )
  RETURNING * INTO inserted_sale;

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
