-- Vendor payouts rework, server part 1: through-date payouts, store-time day
-- boundaries, shared payout minimum and one scope calculation that the queue and
-- the draft both read. Safe to re-run.

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

ALTER TABLE public.payouts
  ADD COLUMN IF NOT EXISTS carried_in_snapshot NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS earned_snapshot NUMERIC(12,2);

ALTER TABLE public.payout_settings
  ADD COLUMN IF NOT EXISTS time_zone TEXT NOT NULL DEFAULT 'America/New_York';

ALTER TABLE public.payouts DROP CONSTRAINT IF EXISTS payouts_range_mode_check;
ALTER TABLE public.payouts
  ADD CONSTRAINT payouts_range_mode_check
  CHECK (range_mode IN ('all_outstanding', 'through_date', 'selected_range'));

ALTER TABLE public.payouts DROP CONSTRAINT IF EXISTS payouts_range_dates_check;
ALTER TABLE public.payouts
  ADD CONSTRAINT payouts_range_dates_check
  CHECK (
    range_mode = 'all_outstanding'
    OR (range_mode = 'through_date' AND source_range_end IS NOT NULL AND source_range_start IS NULL)
    OR (range_mode = 'selected_range' AND source_range_start IS NOT NULL AND source_range_end IS NOT NULL
        AND source_range_start <= source_range_end)
  );

CREATE TABLE IF NOT EXISTS public.payout_statement_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id UUID NOT NULL REFERENCES public.payouts(id),
  recipient TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
  provider_id TEXT,
  error TEXT,
  sent_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payout_statement_emails_payout_idx
  ON public.payout_statement_emails (payout_id, created_at DESC);

ALTER TABLE public.payout_statement_emails ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read payout statement emails" ON public.payout_statement_emails;
CREATE POLICY "Admins read payout statement emails"
ON public.payout_statement_emails FOR SELECT TO authenticated
USING ((SELECT public.is_admin()));

REVOKE ALL ON TABLE public.payout_statement_emails FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.payout_statement_emails TO authenticated;
GRANT ALL ON TABLE public.payout_statement_emails TO service_role;

-- ---------------------------------------------------------------------------
-- Store-time helpers (service role only)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.payout_store_time_zone()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (SELECT ps.time_zone FROM public.payout_settings ps WHERE ps.singleton),
    'America/New_York'
  );
$$;

CREATE OR REPLACE FUNCTION public.payout_day_start(p_day DATE)
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p_day::TIMESTAMP AT TIME ZONE public.payout_store_time_zone();
$$;

-- Exclusive end: the start of the next store day.
CREATE OR REPLACE FUNCTION public.payout_day_end(p_day DATE)
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT (p_day + 1)::TIMESTAMP AT TIME ZONE public.payout_store_time_zone();
$$;

CREATE OR REPLACE FUNCTION public.payout_sale_in_scope(
  p_sale_timestamp TIMESTAMPTZ,
  p_range_mode TEXT,
  p_start DATE,
  p_end DATE,
  p_include_prior BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE p_range_mode
    WHEN 'all_outstanding' THEN TRUE
    WHEN 'through_date' THEN p_sale_timestamp < public.payout_day_end(p_end)
    ELSE (p_sale_timestamp >= public.payout_day_start(p_start) AND p_sale_timestamp < public.payout_day_end(p_end))
      OR (p_include_prior AND p_sale_timestamp < public.payout_day_start(p_start))
  END;
$$;

CREATE OR REPLACE FUNCTION public.get_vendor_payout_threshold(p_consignor_id UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN c.is_active IS NOT TRUE THEN 0::NUMERIC
    ELSE COALESCE(c.payout_threshold_override, (SELECT ps.default_threshold FROM public.payout_settings ps WHERE ps.singleton), 100)
  END
  FROM public.consignors c
  WHERE c.id = p_consignor_id;
$$;

-- ---------------------------------------------------------------------------
-- One scope calculation shared by the queue and the draft
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_payout_scope_summary(
  p_consignor_id UUID,
  p_range_mode TEXT,
  p_start DATE,
  p_end DATE,
  p_include_prior BOOLEAN,
  p_as_of TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE (
  carried_in NUMERIC,
  earned NUMERIC,
  source_available NUMERIC,
  legacy_available NUMERIC,
  booth_rent NUMERIC,
  other_required NUMERIC,
  required_total NUMERIC,
  invoices_applied NUMERIC,
  payable_before_invoices NUMERIC,
  payable NUMERIC,
  pending_total NUMERIC,
  pending_count INTEGER,
  pending_type TEXT,
  sales_count INTEGER,
  items_count INTEGER,
  legacy_item_count INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_last_cutoff TIMESTAMPTZ;
  v_carried_sales NUMERIC := 0;
  v_earned NUMERIC := 0;
  v_legacy NUMERIC := 0;
  v_source NUMERIC := 0;
  v_booth NUMERIC := 0;
  v_other NUMERIC := 0;
  v_pending_total NUMERIC := 0;
  v_pending_count INTEGER := 0;
  v_pending_type TEXT;
  v_open_invoices NUMERIC := 0;
  v_required NUMERIC := 0;
  v_before NUMERIC := 0;
  v_invoices NUMERIC := 0;
  v_sales_count INTEGER := 0;
  v_items_count INTEGER := 0;
  v_legacy_items INTEGER := 0;
BEGIN
  SELECT MAX(COALESCE(p.cutoff_at, p.period_end, p.paid_at))
  INTO v_last_cutoff
  FROM public.payouts p
  WHERE p.consignor_id = p_consignor_id
    AND p.status = 'paid';

  SELECT
    ROUND(COALESCE(SUM(f.remaining_amount) FILTER (
      WHERE v_last_cutoff IS NOT NULL AND f.sale_timestamp <= v_last_cutoff
    ), 0), 2),
    ROUND(COALESCE(SUM(f.remaining_amount) FILTER (
      WHERE v_last_cutoff IS NULL OR f.sale_timestamp > v_last_cutoff
    ), 0), 2),
    COUNT(DISTINCT f.sale_id)::INTEGER,
    COALESCE(SUM(f.quantity - f.refunded_quantity), 0)::INTEGER
  INTO v_carried_sales, v_earned, v_sales_count, v_items_count
  FROM public.get_payout_sale_financials(p_consignor_id, p_as_of) f
  WHERE f.remaining_amount > 0
    AND f.allocation_status <> 'legacy_uncertain'
    AND public.payout_sale_in_scope(f.sale_timestamp, p_range_mode, p_start, p_end, p_include_prior);

  SELECT COUNT(*)::INTEGER
  INTO v_legacy_items
  FROM public.get_payout_sale_financials(p_consignor_id, p_as_of) f
  WHERE f.allocation_status = 'legacy_uncertain';

  IF p_include_prior OR p_range_mode IN ('all_outstanding', 'through_date') THEN
    v_legacy := public.get_legacy_balance_remaining(p_consignor_id, p_as_of);
  END IF;

  v_source := ROUND(v_carried_sales + v_earned + v_legacy, 2);

  SELECT
    COALESCE(SUM(a.amount) FILTER (WHERE a.will_apply AND a.adjustment_type = 'booth_rent'), 0),
    COALESCE(SUM(a.amount) FILTER (WHERE a.will_apply AND a.adjustment_type <> 'booth_rent'), 0),
    COALESCE(SUM(a.amount) FILTER (WHERE NOT a.will_apply), 0),
    COUNT(*) FILTER (WHERE NOT a.will_apply)::INTEGER,
    (ARRAY_AGG(a.adjustment_type ORDER BY a.amount DESC) FILTER (WHERE NOT a.will_apply))[1]
  INTO v_booth, v_other, v_pending_total, v_pending_count, v_pending_type
  FROM public.get_vendor_required_adjustments(p_consignor_id, v_source, p_as_of) a;

  v_booth := ROUND(v_booth, 2);
  v_other := ROUND(v_other, 2);
  v_required := ROUND(v_booth + v_other, 2);

  SELECT ROUND(COALESCE(SUM(GREATEST(i.total - i.amount_paid, 0)), 0), 2)
  INTO v_open_invoices
  FROM public.invoices i
  WHERE i.recipient_type = 'vendor'
    AND i.consignor_id = p_consignor_id
    AND i.status IN ('unpaid', 'partially_paid');

  v_before := ROUND(GREATEST(v_source - v_required, 0), 2);
  v_invoices := ROUND(LEAST(v_open_invoices, v_before), 2);

  RETURN QUERY SELECT
    ROUND(v_carried_sales + v_legacy, 2),
    v_earned,
    v_source,
    ROUND(v_legacy, 2),
    v_booth,
    v_other,
    v_required,
    v_invoices,
    v_before,
    ROUND(GREATEST(v_source - v_required - v_invoices, 0), 2),
    ROUND(v_pending_total, 2),
    v_pending_count,
    v_pending_type,
    v_sales_count,
    v_items_count,
    v_legacy_items;
END;
$$;

-- ---------------------------------------------------------------------------
-- save_payout_draft with through-date mode
-- ---------------------------------------------------------------------------

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
  v_source_start DATE := CASE WHEN p_range_mode = 'through_date' THEN NULL ELSE p_source_range_start END;
  v_include_prior BOOLEAN := CASE WHEN p_range_mode = 'through_date' THEN TRUE ELSE p_include_prior_balance END;
  v_summary RECORD;
BEGIN
  IF NOT (public.is_admin() OR COALESCE(auth.role(), '') = 'service_role') THEN
    RAISE EXCEPTION 'Admin access is required to save payout drafts.'
      USING ERRCODE = '42501';
  END IF;

  IF p_range_mode NOT IN ('all_outstanding', 'through_date', 'selected_range') THEN
    RAISE EXCEPTION 'Invalid payout range mode.' USING ERRCODE = '22023';
  END IF;

  IF p_range_mode = 'through_date' AND p_source_range_end IS NULL THEN
    RAISE EXCEPTION 'Through-date payouts require an end date.'
      USING ERRCODE = '22023';
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
    WHERE c.id = p_consignor_id
  ) THEN
    RAISE EXCEPTION 'Vendor not found.' USING ERRCODE = 'P0002';
  END IF;

  v_cutoff := CASE
    WHEN p_range_mode IN ('selected_range', 'through_date')
      THEN public.payout_day_end(p_source_range_end) - INTERVAL '1 microsecond'
    ELSE v_now
  END;

  v_threshold := public.get_vendor_payout_threshold(p_consignor_id);

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
      v_source_start, p_source_range_end, p_range_mode, v_include_prior,
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
    AND public.payout_sale_in_scope(
      f.sale_timestamp, p_range_mode, v_source_start, p_source_range_end, v_include_prior
    );

  IF v_include_prior OR p_range_mode = 'all_outstanding' THEN
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
      AND public.payout_sale_in_scope(
        f.sale_timestamp, p_range_mode, v_source_start, p_source_range_end, v_include_prior
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

  SELECT * INTO v_summary
  FROM public.get_payout_scope_summary(
    p_consignor_id, p_range_mode, v_source_start, p_source_range_end, v_include_prior, v_now
  );

  UPDATE public.payouts p
  SET
    amount = v_payment,
    period_start = COALESCE(
      (SELECT MIN(psa.sale_timestamp) FROM public.payout_sale_allocations psa WHERE psa.payout_id = v_payout_id),
      v_cutoff
    ),
    period_end = v_cutoff,
    cutoff_at = v_cutoff,
    source_range_start = v_source_start,
    source_range_end = p_source_range_end,
    range_mode = p_range_mode,
    include_prior_balance = v_include_prior,
    threshold_snapshot = v_threshold,
    carried_in_snapshot = v_summary.carried_in,
    earned_snapshot = v_summary.earned,
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


REVOKE ALL ON FUNCTION public.payout_store_time_zone() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.payout_day_start(DATE) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.payout_day_end(DATE) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.payout_sale_in_scope(TIMESTAMPTZ, TEXT, DATE, DATE, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_vendor_payout_threshold(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_payout_scope_summary(UUID, TEXT, DATE, DATE, BOOLEAN, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.payout_store_time_zone() TO service_role;
GRANT EXECUTE ON FUNCTION public.payout_day_start(DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.payout_day_end(DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.payout_sale_in_scope(TIMESTAMPTZ, TEXT, DATE, DATE, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_vendor_payout_threshold(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_payout_scope_summary(UUID, TEXT, DATE, DATE, BOOLEAN, TIMESTAMPTZ) TO service_role;

-- ---------------------------------------------------------------------------
-- Payout run: one lean row per vendor, batch prepare and draft discard
-- ---------------------------------------------------------------------------

-- Row logic shared by the run list and the single-vendor preview.
CREATE OR REPLACE FUNCTION public.build_payout_run_row(
  p_consignor_id UUID,
  p_through DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c public.consignors%ROWTYPE;
  d public.payouts%ROWTYPE;
  s RECORD;
  v_has_draft BOOLEAN := FALSE;
  v_threshold NUMERIC;
  v_last_paid TIMESTAMPTZ;
  v_carried NUMERIC;
  v_earned NUMERIC;
  v_booth NUMERIC;
  v_other NUMERIC := 0;
  v_invoices NUMERIC;
  v_before NUMERIC;
  v_payable NUMERIC;
  v_paying NUMERIC;
  v_status TEXT;
  v_items INTEGER;
  v_sales INTEGER;
  v_cutoff TIMESTAMPTZ;
BEGIN
  SELECT * INTO c FROM public.consignors WHERE id = p_consignor_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_threshold := public.get_vendor_payout_threshold(p_consignor_id);

  SELECT * INTO d
  FROM public.payouts p
  WHERE p.consignor_id = p_consignor_id AND p.status = 'draft'
  ORDER BY p.updated_at DESC, p.id DESC
  LIMIT 1;
  v_has_draft := FOUND;

  -- A draft reads its own scope, so the row does not change with the date on screen.
  IF v_has_draft THEN
    SELECT * INTO s
    FROM public.get_payout_scope_summary(
      p_consignor_id, d.range_mode, d.source_range_start, d.source_range_end, d.include_prior_balance
    );
  ELSE
    SELECT * INTO s
    FROM public.get_payout_scope_summary(p_consignor_id, 'through_date', NULL, p_through, TRUE);
  END IF;

  SELECT MAX(p.paid_at) INTO v_last_paid
  FROM public.payouts p
  WHERE p.consignor_id = p_consignor_id AND p.status = 'paid';

  IF v_has_draft THEN
    SELECT ROUND(COALESCE(SUM(-pa.amount), 0), 2) INTO v_other
    FROM public.payout_adjustments pa
    WHERE pa.payout_id = d.id
      AND pa.amount < 0
      AND pa.adjustment_type NOT IN ('booth_rent', 'invoice_deduction');

    v_threshold := COALESCE(d.threshold_snapshot, v_threshold);
    v_booth := COALESCE(d.booth_rent_deduction, 0);
    v_invoices := COALESCE(d.invoice_deduction, 0);
    v_payable := COALESCE(d.original_amount_due, d.amount);
    v_paying := d.amount;
    v_before := COALESCE(d.payable_before_invoices_snapshot, v_payable + v_invoices);
    v_carried := COALESCE(d.carried_in_snapshot, 0);
    v_earned := COALESCE(d.earned_snapshot, v_before + v_booth + v_other);
    v_status := 'draft';
    v_items := COALESCE(d.items_sold, 0);
    v_sales := COALESCE(d.sales_count, 0);
    v_cutoff := d.cutoff_at;
  ELSE
    v_booth := s.booth_rent;
    v_other := s.other_required;
    v_invoices := s.invoices_applied;
    v_before := s.payable_before_invoices;
    v_payable := s.payable;
    v_paying := s.payable;
    v_carried := s.carried_in;
    v_earned := s.earned;
    v_items := s.items_count;
    v_sales := s.sales_count;
    v_cutoff := public.payout_day_end(p_through) - INTERVAL '1 microsecond';
    v_status := CASE
      WHEN v_before <= 0 THEN 'paid_up'
      WHEN v_before >= v_threshold THEN 'ready'
      ELSE 'accruing'
    END;
  END IF;

  RETURN JSONB_BUILD_OBJECT(
    'consignor_id', c.id,
    'consignor_number', c.consignor_number,
    'name', c.name,
    'business_name', c.business_name,
    'pay_to_name', CASE
      WHEN c.pay_to_type = 'individual' THEN COALESCE(
        NULLIF(TRIM(CONCAT_WS(' ', c.first_name, c.last_name)), ''),
        NULLIF(c.business_name, ''),
        c.name
      )
      ELSE COALESCE(
        NULLIF(c.business_name, ''),
        NULLIF(TRIM(CONCAT_WS(' ', c.first_name, c.last_name)), ''),
        c.name
      )
    END,
    'email', c.email,
    'is_active', COALESCE(c.is_active, FALSE),
    'threshold', ROUND(v_threshold, 2),
    'carried_in', ROUND(v_carried, 2),
    'earned', ROUND(v_earned, 2),
    'booth_rent', ROUND(v_booth, 2),
    'other_deductions', ROUND(v_other, 2),
    'invoices_applied', ROUND(v_invoices, 2),
    'payable_before_invoices', ROUND(v_before, 2),
    'payable', ROUND(v_payable, 2),
    'paying_now', ROUND(v_paying, 2),
    'status', v_status,
    'threshold_remaining', ROUND(GREATEST(v_threshold - v_before, 0), 2),
    'pending_total', s.pending_total,
    'pending_count', s.pending_count,
    'pending_type', s.pending_type,
    'draft_id', CASE WHEN v_has_draft THEN d.id END,
    'draft_through', CASE WHEN v_has_draft THEN COALESCE(
      d.source_range_end,
      (d.cutoff_at AT TIME ZONE public.payout_store_time_zone())::DATE
    ) END,
    'override_reason', CASE WHEN v_has_draft THEN d.below_threshold_override_reason END,
    'last_paid_at', v_last_paid,
    'legacy_item_count', s.legacy_item_count,
    'items_count', v_items,
    'sales_count', v_sales,
    'cutoff_at', v_cutoff
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_payout_run(p_through DATE DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_through DATE := COALESCE(
    p_through,
    (NOW() AT TIME ZONE public.payout_store_time_zone())::DATE
  );
  v_month DATE := DATE_TRUNC('month', COALESCE(
    p_through,
    (NOW() AT TIME ZONE public.payout_store_time_zone())::DATE
  ))::DATE;
  v_rows JSONB;
  v_paid_count INTEGER;
  v_paid_total NUMERIC;
  v_legacy_payouts INTEGER;
  v_legacy_items BIGINT;
BEGIN
  IF NOT (public.is_admin() OR COALESCE(auth.role(), '') = 'service_role') THEN
    RAISE EXCEPTION 'Admin access is required for the payout run.'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(JSONB_AGG(b.r ORDER BY
    CASE b.r->>'status'
      WHEN 'draft' THEN 0 WHEN 'ready' THEN 1 WHEN 'accruing' THEN 2 ELSE 3
    END,
    (b.r->>'payable')::NUMERIC DESC,
    b.r->>'consignor_number'
  ), '[]'::JSONB)
  INTO v_rows
  FROM (
    SELECT public.build_payout_run_row(c.id, v_through) AS r
    FROM public.consignors c
    OFFSET 0 -- keeps the planner from re-running the STABLE row builder at every filter and sort key
  ) b
  WHERE (b.r->>'is_active')::BOOLEAN
    OR (b.r->>'payable_before_invoices')::NUMERIC > 0
    OR b.r->>'draft_id' IS NOT NULL;

  SELECT COUNT(*)::INTEGER, ROUND(COALESCE(SUM(p.amount), 0), 2)
  INTO v_paid_count, v_paid_total
  FROM public.payouts p
  WHERE p.status = 'paid'
    AND COALESCE(p.payment_date, (p.paid_at AT TIME ZONE public.payout_store_time_zone())::DATE) >= v_month
    AND COALESCE(p.payment_date, (p.paid_at AT TIME ZONE public.payout_store_time_zone())::DATE)
      < (v_month + INTERVAL '1 month')::DATE;

  SELECT COUNT(*)::INTEGER INTO v_legacy_payouts
  FROM public.payouts p
  WHERE p.status = 'paid' AND p.historical_confidence = 'legacy_unverified';

  SELECT COALESCE(SUM(x.n), 0) INTO v_legacy_items
  FROM public.consignors c
  CROSS JOIN LATERAL (
    SELECT COUNT(*) AS n
    FROM public.get_payout_sale_financials(c.id, NOW()) f
    WHERE f.allocation_status = 'legacy_uncertain'
  ) x
  WHERE EXISTS (
    SELECT 1 FROM public.payouts p
    WHERE p.consignor_id = c.id
      AND p.status = 'paid'
      AND p.historical_confidence = 'legacy_unverified'
  );

  RETURN JSONB_BUILD_OBJECT(
    'rows', v_rows,
    'paid_in_month', JSONB_BUILD_OBJECT('count', v_paid_count, 'total', v_paid_total),
    'legacy', JSONB_BUILD_OBJECT('payouts', v_legacy_payouts, 'items', v_legacy_items)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_vendor_payout_preview(
  p_consignor_id UUID,
  p_through DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row JSONB;
BEGIN
  IF NOT (public.is_admin() OR COALESCE(auth.role(), '') = 'service_role') THEN
    RAISE EXCEPTION 'Admin access is required for payout previews.'
      USING ERRCODE = '42501';
  END IF;

  v_row := public.build_payout_run_row(
    p_consignor_id,
    COALESCE(p_through, (NOW() AT TIME ZONE public.payout_store_time_zone())::DATE)
  );

  IF v_row IS NULL THEN
    RAISE EXCEPTION 'Vendor not found.' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.prepare_payout_run(
  p_through DATE,
  p_consignor_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id UUID;
  v_draft_id UUID;
  v_payout_id UUID;
  v_results JSONB := '[]'::JSONB;
BEGIN
  IF NOT (public.is_admin() OR COALESCE(auth.role(), '') = 'service_role') THEN
    RAISE EXCEPTION 'Admin access is required to prepare payouts.'
      USING ERRCODE = '42501';
  END IF;

  IF p_through IS NULL THEN
    RAISE EXCEPTION 'Earnings through date is required.' USING ERRCODE = '22023';
  END IF;

  FOR v_id IN
    SELECT u.id
    FROM UNNEST(COALESCE(p_consignor_ids, ARRAY[]::UUID[])) WITH ORDINALITY AS u(id, ord)
    GROUP BY u.id
    ORDER BY MIN(u.ord)
  LOOP
    SELECT p.id INTO v_draft_id
    FROM public.payouts p
    WHERE p.consignor_id = v_id AND p.status = 'draft'
    ORDER BY p.updated_at DESC, p.id DESC
    LIMIT 1;

    IF v_draft_id IS NOT NULL THEN
      v_results := v_results || JSONB_BUILD_ARRAY(JSONB_BUILD_OBJECT(
        'consignor_id', v_id, 'payout_id', v_draft_id,
        'status', 'skipped', 'message', 'Already has a draft.'
      ));
      CONTINUE;
    END IF;

    BEGIN
      v_payout_id := public.save_payout_draft(
        v_id, NULL, 'through_date', NULL, p_through, TRUE, NULL, NULL, NULL, NULL
      );
      v_results := v_results || JSONB_BUILD_ARRAY(JSONB_BUILD_OBJECT(
        'consignor_id', v_id, 'payout_id', v_payout_id,
        'status', 'created', 'message', NULL
      ));
    EXCEPTION WHEN OTHERS THEN
      v_results := v_results || JSONB_BUILD_ARRAY(JSONB_BUILD_OBJECT(
        'consignor_id', v_id, 'payout_id', NULL,
        'status', 'failed', 'message', SQLERRM
      ));
    END;
  END LOOP;

  RETURN v_results;
END;
$$;

CREATE OR REPLACE FUNCTION public.discard_payout_draft(p_payout_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status TEXT;
BEGIN
  IF NOT (public.is_admin() OR COALESCE(auth.role(), '') = 'service_role') THEN
    RAISE EXCEPTION 'Admin access is required to discard payout drafts.'
      USING ERRCODE = '42501';
  END IF;

  SELECT p.status INTO v_status
  FROM public.payouts p
  WHERE p.id = p_payout_id
  FOR UPDATE;

  IF NOT FOUND OR v_status <> 'draft' THEN
    RAISE EXCEPTION 'Only drafts can be discarded.' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.payout_adjustments WHERE payout_id = p_payout_id;
  DELETE FROM public.payout_sale_allocations WHERE payout_id = p_payout_id;
  DELETE FROM public.payouts WHERE id = p_payout_id;

  RETURN p_payout_id;
END;
$$;

REVOKE ALL ON FUNCTION public.build_payout_run_row(UUID, DATE) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_payout_run(DATE) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_vendor_payout_preview(UUID, DATE) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prepare_payout_run(DATE, UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.discard_payout_draft(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.build_payout_run_row(UUID, DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_payout_run(DATE) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_vendor_payout_preview(UUID, DATE) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.prepare_payout_run(DATE, UUID[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.discard_payout_draft(UUID) TO authenticated, service_role;
