-- Payout integrity guardrails.
--
-- The payout system depends on public.sale_items. A row in public.sales without
-- sale_items is only a payment header; it has no consignor attribution and
-- cannot be paid out correctly.

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
    COALESCE(NULLIF(p_sale->>'id', '')::UUID, uuid_generate_v4()),
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
    COALESCE(NULLIF(item_payload->>'id', '')::UUID, uuid_generate_v4()),
    inserted_sale.id,
    NULLIF(item_payload->>'item_id', '')::UUID,
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
  FROM jsonb_array_elements(p_sale_items) AS item_payload;

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

-- Force browser/app clients through the atomic RPC above. This prevents old
-- deployed clients from creating a sales row and failing before sale_items
-- are attached. Service-role maintenance SQL still bypasses RLS as usual.
DROP POLICY IF EXISTS "Authenticated app users can insert sales" ON public.sales;
DROP POLICY IF EXISTS "Authenticated can insert sales" ON public.sales;
DROP POLICY IF EXISTS "Anyone can insert sales" ON public.sales;
CREATE POLICY "POS sales must use atomic RPC"
ON public.sales
FOR INSERT
TO authenticated
WITH CHECK (FALSE);

CREATE OR REPLACE FUNCTION public.get_payout_orphan_sales(
  p_since TIMESTAMPTZ DEFAULT NOW() - INTERVAL '30 days'
)
RETURNS TABLE (
  id UUID,
  completed_at TIMESTAMPTZ,
  payment_method TEXT,
  subtotal NUMERIC,
  total NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_ravenpos_app_actor() THEN
    RAISE EXCEPTION 'Not authorized to inspect payout sale integrity.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    s.id,
    s.completed_at,
    s.payment_method,
    s.subtotal,
    s.total
  FROM public.sales s
  WHERE s.completed_at >= p_since
    AND NOT EXISTS (
      SELECT 1
      FROM public.sale_items si
      WHERE si.sale_id = s.id
    )
  ORDER BY s.completed_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_payout_orphan_sales(TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_payout_orphan_sales(TIMESTAMPTZ) TO authenticated, service_role;
