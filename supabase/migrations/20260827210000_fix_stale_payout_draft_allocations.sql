-- Keep selected payout ranges as sale-inclusion boundaries while valuing every
-- source and obligation against current ledger state. This prevents a refund or
-- payment recorded after a historical range end from producing a permanently
-- stale draft that finalize_payout rejects with SQLSTATE 40001.

CREATE OR REPLACE FUNCTION public.save_payout_draft(
  p_consignor_id UUID,
  p_payout_id UUID DEFAULT NULL,
  p_range_mode TEXT DEFAULT 'all_outstanding',
  p_source_range_start DATE DEFAULT NULL,
  p_source_range_end DATE DEFAULT NULL,
  p_include_prior_balance BOOLEAN DEFAULT TRUE,
  p_payment_amount NUMERIC DEFAULT NULL,
  p_invoice_applications JSONB DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_below_threshold_override_reason TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payout_id UUID := p_payout_id;
  v_cutoff TIMESTAMPTZ;
  v_threshold NUMERIC := 100;
  v_legacy_available NUMERIC := 0;
  v_sale_available NUMERIC := 0;
  v_source_available NUMERIC := 0;
  v_required_total NUMERIC := 0;
  v_invoice_total NUMERIC := 0;
  v_full_payable NUMERIC := 0;
  v_payment NUMERIC := 0;
  v_source_settlement NUMERIC := 0;
  v_legacy_apply NUMERIC := 0;
  v_sale_target NUMERIC := 0;
  v_now TIMESTAMPTZ := NOW();
  v_has_invoice_input BOOLEAN := FALSE;
BEGIN
  IF NOT (public.is_admin() OR COALESCE(auth.role(), '') = 'service_role') THEN
    RAISE EXCEPTION 'Admin access is required to save payout drafts.'
      USING ERRCODE = '42501';
  END IF;

  IF p_range_mode NOT IN ('all_outstanding', 'selected_range') THEN
    RAISE EXCEPTION 'Invalid payout range mode.' USING ERRCODE = '22023';
  END IF;

  IF p_range_mode = 'selected_range' AND (
    p_source_range_start IS NULL OR p_source_range_end IS NULL
    OR p_source_range_start > p_source_range_end
  ) THEN
    RAISE EXCEPTION 'Selected-range payouts require a valid start and end date.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.consignors c
    WHERE c.id = p_consignor_id AND c.is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'Active vendor not found.' USING ERRCODE = 'P0002';
  END IF;

  v_cutoff := CASE
    WHEN p_range_mode = 'selected_range'
      THEN p_source_range_end::TIMESTAMPTZ + INTERVAL '1 day' - INTERVAL '1 microsecond'
    ELSE v_now
  END;

  SELECT COALESCE(c.payout_threshold_override, ps.default_threshold, 100)
  INTO v_threshold
  FROM public.consignors c
  CROSS JOIN public.payout_settings ps
  WHERE c.id = p_consignor_id AND ps.singleton;

  IF v_payout_id IS NOT NULL THEN
    PERFORM 1 FROM public.payouts p
    WHERE p.id = v_payout_id
    FOR UPDATE;

    IF NOT FOUND OR NOT EXISTS (
      SELECT 1 FROM public.payouts p
      WHERE p.id = v_payout_id
        AND p.consignor_id = p_consignor_id
        AND p.status = 'draft'
    ) THEN
      RAISE EXCEPTION 'Editable payout draft not found.' USING ERRCODE = 'P0002';
    END IF;

    DELETE FROM public.payout_sale_allocations WHERE payout_id = v_payout_id;
    DELETE FROM public.payout_adjustments WHERE payout_id = v_payout_id;
  ELSE
    INSERT INTO public.payouts (
      consignor_id, amount, period_start, period_end, sales_count, items_sold,
      gross_sales, tax_collected, store_share, credit_card_fees, notes,
      paid_at, status, prepared_at, prepared_by, cutoff_at,
      source_range_start, source_range_end, range_mode, include_prior_balance,
      threshold_snapshot, below_threshold_override_reason,
      historical_confidence, updated_at, is_partial
    ) VALUES (
      p_consignor_id, 0, v_cutoff, v_cutoff, 0, 0,
      0, 0, 0, 0, p_notes,
      NULL, 'draft', v_now, auth.uid(), v_cutoff,
      p_source_range_start, p_source_range_end, p_range_mode, p_include_prior_balance,
      v_threshold, NULLIF(TRIM(COALESCE(p_below_threshold_override_reason, '')), ''),
      'verified', v_now, FALSE
    ) RETURNING id INTO v_payout_id;
  END IF;

  -- The selected range limits which sales are eligible, but their balance must
  -- reflect current refunds and paid allocations. Using the historical range end
  -- here can create a draft that can never pass finalization after a later refund.
  SELECT ROUND(COALESCE(SUM(f.remaining_amount), 0), 2)
  INTO v_sale_available
  FROM public.get_payout_sale_financials(p_consignor_id, v_now) f
  WHERE f.remaining_amount > 0
    AND f.allocation_status <> 'legacy_uncertain'
    AND (
      p_range_mode = 'all_outstanding'
      OR (
        f.sale_timestamp >= p_source_range_start::TIMESTAMPTZ
        AND f.sale_timestamp < (p_source_range_end + 1)::TIMESTAMPTZ
      )
      OR (
        p_range_mode = 'selected_range'
        AND p_include_prior_balance
        AND f.sale_timestamp < p_source_range_start::TIMESTAMPTZ
      )
    );

  IF p_include_prior_balance OR p_range_mode = 'all_outstanding' THEN
    v_legacy_available := public.get_legacy_balance_remaining(p_consignor_id, v_now);
  END IF;

  v_source_available := ROUND(v_sale_available + v_legacy_available, 2);

  INSERT INTO public.payout_adjustments (
    payout_id, consignor_id, adjustment_type, amount, description,
    source_table, source_reference, metadata
  )
  SELECT
    v_payout_id,
    p_consignor_id,
    a.adjustment_type,
    a.signed_amount,
    a.description,
    a.source_table,
    a.source_reference,
    a.metadata
  FROM public.get_vendor_required_adjustments(
    p_consignor_id, v_source_available, v_now
  ) a
  WHERE a.will_apply;

  SELECT ROUND(COALESCE(SUM(-pa.amount), 0), 2)
  INTO v_required_total
  FROM public.payout_adjustments pa
  WHERE pa.payout_id = v_payout_id
    AND pa.amount < 0;

  v_has_invoice_input := p_invoice_applications IS NOT NULL
    AND jsonb_typeof(p_invoice_applications) = 'array';

  IF v_has_invoice_input THEN
    INSERT INTO public.payout_adjustments (
      payout_id, consignor_id, adjustment_type, amount, description,
      source_table, source_reference, metadata
    )
    SELECT
      v_payout_id,
      p_consignor_id,
      'invoice_deduction',
      -ROUND((entry->>'amount')::NUMERIC, 2),
      'Invoice #' || UPPER(LEFT(i.id::TEXT, 8)),
      'invoices',
      i.id::TEXT,
      JSONB_BUILD_OBJECT('invoice_total', i.total, 'amount_paid_before', i.amount_paid)
    FROM jsonb_array_elements(p_invoice_applications) entry
    JOIN public.invoices i ON i.id = (entry->>'invoice_id')::UUID
    WHERE i.recipient_type = 'vendor'
      AND i.consignor_id = p_consignor_id
      AND i.status IN ('unpaid', 'partially_paid')
      AND ROUND((entry->>'amount')::NUMERIC, 2) > 0
      AND ROUND((entry->>'amount')::NUMERIC, 2) <= ROUND(i.total - i.amount_paid, 2);

    IF (SELECT COUNT(*) FROM jsonb_array_elements(p_invoice_applications)) <>
       (SELECT COUNT(*) FROM public.payout_adjustments pa
        WHERE pa.payout_id = v_payout_id AND pa.adjustment_type = 'invoice_deduction') THEN
      RAISE EXCEPTION 'One or more invoice applications are invalid or stale.'
        USING ERRCODE = '22023';
    END IF;
  ELSE
    INSERT INTO public.payout_adjustments (
      payout_id, consignor_id, adjustment_type, amount, description,
      source_table, source_reference, metadata
    )
    WITH open_invoices AS (
      SELECT
        i.*,
        ROUND(GREATEST(i.total - i.amount_paid, 0), 2) AS balance_due,
        COALESCE(SUM(ROUND(GREATEST(i.total - i.amount_paid, 0), 2)) OVER (
          ORDER BY i.created_at, i.id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ), 0) AS prior_due
      FROM public.invoices i
      WHERE i.recipient_type = 'vendor'
        AND i.consignor_id = p_consignor_id
        AND i.status IN ('unpaid', 'partially_paid')
    ), selected AS (
      SELECT
        oi.*,
        LEAST(
          oi.balance_due,
          GREATEST(v_source_available - v_required_total - oi.prior_due, 0)
        ) AS amount_to_apply
      FROM open_invoices oi
    )
    SELECT
      v_payout_id,
      p_consignor_id,
      'invoice_deduction',
      -ROUND(s.amount_to_apply, 2),
      'Invoice #' || UPPER(LEFT(s.id::TEXT, 8)),
      'invoices',
      s.id::TEXT,
      JSONB_BUILD_OBJECT('invoice_total', s.total, 'amount_paid_before', s.amount_paid)
    FROM selected s
    WHERE s.amount_to_apply > 0;
  END IF;

  SELECT ROUND(COALESCE(SUM(-pa.amount), 0), 2)
  INTO v_invoice_total
  FROM public.payout_adjustments pa
  WHERE pa.payout_id = v_payout_id
    AND pa.adjustment_type = 'invoice_deduction';

  IF v_invoice_total > GREATEST(v_source_available - v_required_total, 0) + 0.009 THEN
    RAISE EXCEPTION 'Invoice applications exceed available payout funds.'
      USING ERRCODE = '23514';
  END IF;

  v_full_payable := ROUND(GREATEST(v_source_available - v_required_total - v_invoice_total, 0), 2);
  v_payment := ROUND(COALESCE(p_payment_amount, v_full_payable)::NUMERIC, 2);

  IF v_payment < 0 OR v_payment > v_full_payable + 0.009 THEN
    RAISE EXCEPTION 'Payment amount must be between zero and the current payable amount.'
      USING ERRCODE = '22023';
  END IF;

  v_source_settlement := ROUND(v_payment + v_required_total + v_invoice_total, 2);
  v_legacy_apply := ROUND(LEAST(v_legacy_available, v_source_settlement), 2);
  v_sale_target := ROUND(GREATEST(v_source_settlement - v_legacy_apply, 0), 2);

  IF v_legacy_apply > 0 THEN
    INSERT INTO public.payout_adjustments (
      payout_id, consignor_id, adjustment_type, amount, description,
      source_table, source_reference, metadata
    )
    WITH balances AS (
      SELECT
        lb.*,
        GREATEST(lb.original_amount - COALESCE((
          SELECT SUM(pa.amount)
          FROM public.payout_adjustments pa
          JOIN public.payouts p ON p.id = pa.payout_id
          WHERE pa.adjustment_type = 'legacy_carryover'
            AND pa.source_table = 'payout_legacy_balances'
            AND pa.source_reference = lb.id::TEXT
            AND p.status = 'paid'
        ), 0), 0) AS remaining,
        COALESCE(SUM(GREATEST(lb.original_amount - COALESCE((
          SELECT SUM(pa.amount)
          FROM public.payout_adjustments pa
          JOIN public.payouts p ON p.id = pa.payout_id
          WHERE pa.adjustment_type = 'legacy_carryover'
            AND pa.source_table = 'payout_legacy_balances'
            AND pa.source_reference = lb.id::TEXT
            AND p.status = 'paid'
        ), 0), 0)) OVER (
          ORDER BY lb.created_at, lb.id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ), 0) AS prior_remaining
      FROM public.payout_legacy_balances lb
      WHERE lb.consignor_id = p_consignor_id
        AND lb.created_at <= v_now
    )
    SELECT
      v_payout_id,
      p_consignor_id,
      'legacy_carryover',
      ROUND(LEAST(b.remaining, GREATEST(v_legacy_apply - b.prior_remaining, 0)), 2),
      'Structured legacy carryover',
      'payout_legacy_balances',
      b.id::TEXT,
      JSONB_BUILD_OBJECT('source_payout_id', b.source_payout_id, 'confidence', b.confidence)
    FROM balances b
    WHERE LEAST(b.remaining, GREATEST(v_legacy_apply - b.prior_remaining, 0)) > 0;
  END IF;

  INSERT INTO public.payout_sale_allocations (
    payout_id, sale_id, sale_item_id, consignor_id, sale_timestamp,
    sku, item_name, quantity, refunded_quantity, unit_price,
    gross_line_amount, item_discount, allocated_order_discount, net_line_amount,
    commission_percentage, vendor_earnings_before_fees, allocated_card_fee,
    final_vendor_cut, amount_settled, remaining_amount_after
  )
  WITH eligible AS (
    SELECT
      f.*,
      COALESCE(SUM(f.remaining_amount) OVER (
        ORDER BY f.sale_timestamp, f.sale_id, f.sale_item_id
        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
      ), 0) AS prior_remaining
    FROM public.get_payout_sale_financials(p_consignor_id, v_now) f
    WHERE f.remaining_amount > 0
      AND f.allocation_status <> 'legacy_uncertain'
      AND (
        p_range_mode = 'all_outstanding'
        OR (
          f.sale_timestamp >= p_source_range_start::TIMESTAMPTZ
          AND f.sale_timestamp < (p_source_range_end + 1)::TIMESTAMPTZ
        )
        OR (
          p_range_mode = 'selected_range'
          AND p_include_prior_balance
          AND f.sale_timestamp < p_source_range_start::TIMESTAMPTZ
        )
      )
  ), selected AS (
    SELECT
      e.*,
      ROUND(LEAST(e.remaining_amount, GREATEST(v_sale_target - e.prior_remaining, 0)), 2) AS settle_now
    FROM eligible e
  )
  SELECT
    v_payout_id, s.sale_id, s.sale_item_id, p_consignor_id, s.sale_timestamp,
    s.sku, s.item_name, s.quantity, s.refunded_quantity, s.unit_price,
    s.gross_line_amount, s.item_discount, s.allocated_order_discount, s.net_line_amount,
    s.commission_percentage, s.vendor_earnings_before_fees, s.allocated_card_fee,
    s.final_vendor_cut, s.settle_now, ROUND(s.remaining_amount - s.settle_now, 2)
  FROM selected s
  WHERE s.settle_now > 0;

  UPDATE public.payouts p
  SET
    amount = v_payment,
    period_start = COALESCE(
      (SELECT MIN(psa.sale_timestamp) FROM public.payout_sale_allocations psa WHERE psa.payout_id = v_payout_id),
      v_cutoff
    ),
    period_end = v_cutoff,
    cutoff_at = v_cutoff,
    source_range_start = p_source_range_start,
    source_range_end = p_source_range_end,
    range_mode = p_range_mode,
    include_prior_balance = p_include_prior_balance,
    threshold_snapshot = v_threshold,
    payable_before_invoices_snapshot = ROUND(GREATEST(v_source_available - v_required_total, 0), 2),
    below_threshold_override_reason = NULLIF(TRIM(COALESCE(p_below_threshold_override_reason, '')), ''),
    sales_count = COALESCE((SELECT COUNT(DISTINCT psa.sale_id) FROM public.payout_sale_allocations psa WHERE psa.payout_id = v_payout_id), 0),
    items_sold = COALESCE((SELECT SUM(psa.quantity - psa.refunded_quantity) FROM public.payout_sale_allocations psa WHERE psa.payout_id = v_payout_id), 0),
    gross_sales = COALESCE((SELECT ROUND(SUM(psa.gross_line_amount), 2) FROM public.payout_sale_allocations psa WHERE psa.payout_id = v_payout_id), 0),
    store_share = COALESCE((SELECT ROUND(SUM(psa.net_line_amount - psa.vendor_earnings_before_fees), 2) FROM public.payout_sale_allocations psa WHERE psa.payout_id = v_payout_id), 0),
    credit_card_fees = COALESCE((SELECT ROUND(SUM(psa.allocated_card_fee), 2) FROM public.payout_sale_allocations psa WHERE psa.payout_id = v_payout_id), 0),
    booth_rent_deduction = COALESCE((SELECT ROUND(SUM(-pa.amount), 2) FROM public.payout_adjustments pa WHERE pa.payout_id = v_payout_id AND pa.adjustment_type = 'booth_rent'), 0),
    marketing_fee_deduction = COALESCE((SELECT ROUND(SUM(-pa.amount), 2) FROM public.payout_adjustments pa WHERE pa.payout_id = v_payout_id AND pa.adjustment_type = 'marketing_fee'), 0),
    ledger_deduction = COALESCE((SELECT ROUND(SUM(-pa.amount), 2) FROM public.payout_adjustments pa WHERE pa.payout_id = v_payout_id AND pa.adjustment_type IN ('manual_ledger', 'refund_reversal', 'write_off')), 0),
    invoice_deduction = v_invoice_total,
    notes = p_notes,
    original_amount_due = v_full_payable,
    is_partial = v_payment + 0.009 < v_full_payable,
    partial_reason = CASE WHEN v_payment + 0.009 < v_full_payable THEN 'Partial payment; unpaid balance rolls forward automatically.' ELSE NULL END,
    balance_disposition = CASE WHEN v_payment + 0.009 < v_full_payable THEN 'deferred' ELSE NULL END,
    prepared_at = COALESCE(p.prepared_at, v_now),
    prepared_by = COALESCE(p.prepared_by, auth.uid()),
    status = 'draft',
    updated_at = v_now
  WHERE p.id = v_payout_id;

  RETURN v_payout_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_payout_draft(UUID, UUID, TEXT, DATE, DATE, BOOLEAN, NUMERIC, JSONB, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_payout_draft(UUID, UUID, TEXT, DATE, DATE, BOOLEAN, NUMERIC, JSONB, TEXT, TEXT)
  TO authenticated, service_role;


