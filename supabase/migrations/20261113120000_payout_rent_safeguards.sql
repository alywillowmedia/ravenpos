-- Payout rent safeguards. Additive: no existing row is changed.
--
-- 1. Rent rows written by a payout can no longer be deleted or re-pointed by hand.
--    Deleting one made the next payout deduct the same month a second time.
-- 2. The month rent is owed for is worked out in store time, not the database
--    session zone, so a run on the last evening of a month stays in that month.
-- 3. Mark paid answers plainly when rent for a drafted month was recorded by hand
--    after the draft was prepared, instead of failing on a duplicate key.

-- ---------------------------------------------------------------------------
-- 1. Protect payout-created rent rows
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.protect_payout_booth_rent()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.source_payout_id IS NOT NULL THEN
      RAISE EXCEPTION 'This rent was deducted by a payout. Void the payout to reverse it.'
        USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;

  -- void_payout stamps reversed_at and reversed_by; everything else stays as paid.
  IF OLD.source_payout_id IS NOT NULL AND (
    NEW.consignor_id, NEW.amount, NEW.period_month, NEW.period_year, NEW.source_payout_id
  ) IS DISTINCT FROM (
    OLD.consignor_id, OLD.amount, OLD.period_month, OLD.period_year, OLD.source_payout_id
  ) THEN
    RAISE EXCEPTION 'This rent was deducted by a payout and cannot be edited.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_payout_booth_rent ON public.booth_rent_payments;
CREATE TRIGGER protect_payout_booth_rent
  BEFORE UPDATE OR DELETE ON public.booth_rent_payments
  FOR EACH ROW EXECUTE FUNCTION public.protect_payout_booth_rent();

-- ---------------------------------------------------------------------------
-- 2. Rent months in store time
-- ---------------------------------------------------------------------------

-- Same body as 20260715120000, except the two month boundaries marked "store time".
CREATE OR REPLACE FUNCTION public.get_vendor_required_adjustments(
  p_consignor_id UUID,
  p_available NUMERIC,
  p_as_of TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE (
  adjustment_type TEXT,
  amount NUMERIC,
  signed_amount NUMERIC,
  description TEXT,
  source_table TEXT,
  source_reference TEXT,
  metadata JSONB,
  will_apply BOOLEAN,
  pending_reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_remaining NUMERIC := GREATEST(ROUND(COALESCE(p_available, 0)::NUMERIC, 2), 0);
  v_monthly_rent NUMERIC := 0;
  v_start_month DATE;
  v_current_month DATE := DATE_TRUNC('month', p_as_of AT TIME ZONE public.payout_store_time_zone())::DATE; -- store time
  v_month DATE;
  v_row RECORD;
  v_can_apply BOOLEAN;
BEGIN
  -- Refund overpayments are the oldest and highest-priority obligation.
  FOR v_row IN
    SELECT
      f.sale_item_id,
      f.sale_timestamp,
      f.item_name,
      f.refund_obligation_amount
    FROM public.get_payout_sale_financials(p_consignor_id, p_as_of) f
    WHERE f.refund_obligation_amount > 0
    ORDER BY f.sale_timestamp, f.sale_item_id
  LOOP
    v_can_apply := v_row.refund_obligation_amount <= v_remaining;
    RETURN QUERY SELECT
      'refund_reversal'::TEXT,
      v_row.refund_obligation_amount,
      -v_row.refund_obligation_amount,
      ('Refund reversal · ' || v_row.item_name)::TEXT,
      'sale_items'::TEXT,
      v_row.sale_item_id::TEXT,
      JSONB_BUILD_OBJECT('sale_timestamp', v_row.sale_timestamp),
      v_can_apply,
      CASE WHEN v_can_apply THEN NULL::TEXT ELSE 'insufficient_available_funds'::TEXT END;
    IF v_can_apply THEN
      v_remaining := ROUND(v_remaining - v_row.refund_obligation_amount, 2);
    END IF;
  END LOOP;

  SELECT COALESCE(c.monthly_booth_rent, 0)
  INTO v_monthly_rent
  FROM public.consignors c
  WHERE c.id = p_consignor_id;

  IF v_monthly_rent > 0 THEN
    SELECT (
      MAKE_DATE(brp.period_year, brp.period_month, 1) + INTERVAL '1 month'
    )::DATE
    INTO v_start_month
    FROM public.booth_rent_payments brp
    WHERE brp.consignor_id = p_consignor_id
      AND brp.reversed_at IS NULL
      AND brp.paid_at <= p_as_of
    ORDER BY brp.period_year DESC, brp.period_month DESC
    LIMIT 1;

    IF v_start_month IS NULL THEN
      SELECT DATE_TRUNC('month', MIN(p.paid_at) AT TIME ZONE public.payout_store_time_zone())::DATE -- store time
      INTO v_start_month
      FROM public.payouts p
      WHERE p.consignor_id = p_consignor_id
        AND p.status = 'paid'
        AND p.paid_at <= p_as_of;
    END IF;

    v_start_month := COALESCE(v_start_month, v_current_month);
    v_month := v_start_month;

    WHILE v_month <= v_current_month LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM public.booth_rent_payments brp
        WHERE brp.consignor_id = p_consignor_id
          AND brp.period_year = EXTRACT(YEAR FROM v_month)::INTEGER
          AND brp.period_month = EXTRACT(MONTH FROM v_month)::INTEGER
          AND brp.reversed_at IS NULL
      ) THEN
        v_can_apply := v_monthly_rent <= v_remaining;
        RETURN QUERY SELECT
          'booth_rent'::TEXT,
          ROUND(v_monthly_rent, 2),
          -ROUND(v_monthly_rent, 2),
          ('Booth rent · ' || TO_CHAR(v_month, 'Mon YYYY'))::TEXT,
          'booth_rent_periods'::TEXT,
          TO_CHAR(v_month, 'YYYY-MM'),
          JSONB_BUILD_OBJECT(
            'period_year', EXTRACT(YEAR FROM v_month)::INTEGER,
            'period_month', EXTRACT(MONTH FROM v_month)::INTEGER
          ),
          v_can_apply,
          CASE WHEN v_can_apply THEN NULL::TEXT ELSE 'insufficient_available_funds'::TEXT END;
        IF v_can_apply THEN
          v_remaining := ROUND(v_remaining - v_monthly_rent, 2);
        END IF;
      END IF;
      v_month := (v_month + INTERVAL '1 month')::DATE;
    END LOOP;
  END IF;

  FOR v_row IN
    SELECT mfa.id, mfa.amount, mf.title, mf.description, mfa.created_at
    FROM public.marketing_fee_allocations mfa
    JOIN public.marketing_fees mf ON mf.id = mfa.marketing_fee_id
    WHERE mfa.consignor_id = p_consignor_id
      AND mfa.deducted_payout_id IS NULL
      AND mfa.created_at <= p_as_of
    ORDER BY mfa.created_at, mfa.id
  LOOP
    v_can_apply := v_row.amount <= v_remaining;
    RETURN QUERY SELECT
      'marketing_fee'::TEXT,
      ROUND(v_row.amount, 2),
      -ROUND(v_row.amount, 2),
      v_row.title::TEXT,
      'marketing_fee_allocations'::TEXT,
      v_row.id::TEXT,
      JSONB_BUILD_OBJECT('detail', v_row.description),
      v_can_apply,
      CASE WHEN v_can_apply THEN NULL::TEXT ELSE 'insufficient_available_funds'::TEXT END;
    IF v_can_apply THEN
      v_remaining := ROUND(v_remaining - v_row.amount, 2);
    END IF;
  END LOOP;

  FOR v_row IN
    SELECT vle.id, vle.amount, vle.description, vle.created_at
    FROM public.vendor_ledger_entries vle
    WHERE vle.consignor_id = p_consignor_id
      AND vle.deducted_payout_id IS NULL
      AND vle.created_at <= p_as_of
    ORDER BY vle.created_at, vle.id
  LOOP
    v_can_apply := v_row.amount <= v_remaining;
    RETURN QUERY SELECT
      'manual_ledger'::TEXT,
      ROUND(v_row.amount, 2),
      -ROUND(v_row.amount, 2),
      v_row.description::TEXT,
      'vendor_ledger_entries'::TEXT,
      v_row.id::TEXT,
      '{}'::JSONB,
      v_can_apply,
      CASE WHEN v_can_apply THEN NULL::TEXT ELSE 'insufficient_available_funds'::TEXT END;
    IF v_can_apply THEN
      v_remaining := ROUND(v_remaining - v_row.amount, 2);
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.get_vendor_required_adjustments(UUID, NUMERIC, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_vendor_required_adjustments(UUID, NUMERIC, TIMESTAMPTZ)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Mark paid: rent recorded by hand after the draft was prepared
-- ---------------------------------------------------------------------------

-- Same as 20261105130000, plus the booth rent check.
CREATE OR REPLACE FUNCTION public.finalize_payout_checked(
  p_payout_id UUID,
  p_expected_amount NUMERIC,
  p_payment_method TEXT,
  p_payment_date DATE,
  p_payment_reference TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_below_threshold_override_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_amount NUMERIC;
  v_status TEXT;
  v_consignor_id UUID;
BEGIN
  IF NOT (public.is_admin() OR COALESCE(auth.role(), '') = 'service_role') THEN
    RAISE EXCEPTION 'Admin access is required to finalize payouts.'
      USING ERRCODE = '42501';
  END IF;

  SELECT p.amount, p.status, p.consignor_id INTO v_amount, v_status, v_consignor_id
  FROM public.payouts p
  WHERE p.id = p_payout_id
  FOR UPDATE;

  IF FOUND AND v_status = 'draft' AND (p_expected_amount IS NULL OR ROUND(v_amount, 2) <> ROUND(p_expected_amount, 2)) THEN
    -- Not 40001: PostgREST retries serialization failures forever instead of answering.
    -- PT409 answers HTTP 409.
    RAISE EXCEPTION 'The payout amount changed after this screen loaded.'
      USING ERRCODE = 'PT409';
  END IF;

  -- Rent for a drafted month recorded by hand since the draft was prepared. Without this
  -- the finalize insert fails on the one-active-row-per-month index with a raw message.
  IF FOUND AND v_status = 'draft' AND EXISTS (
    SELECT 1
    FROM public.payout_adjustments pa
    JOIN public.booth_rent_payments brp
      ON brp.consignor_id = v_consignor_id
     AND brp.period_year = (pa.metadata->>'period_year')::INTEGER
     AND brp.period_month = (pa.metadata->>'period_month')::INTEGER
     AND brp.reversed_at IS NULL
    WHERE pa.payout_id = p_payout_id
      AND pa.adjustment_type = 'booth_rent'
  ) THEN
    RAISE EXCEPTION 'Booth rent changed after the draft was prepared.'
      USING ERRCODE = 'PT409';
  END IF;

  -- finalize_payout raises 40001 for a stale draft. PostgREST retries 40001 forever, so
  -- re-raise it with the original message as PT409 (HTTP 409).
  BEGIN
    RETURN public.finalize_payout(
      p_payout_id,
      p_payment_method,
      p_payment_date,
      p_payment_reference,
      p_notes,
      p_below_threshold_override_reason
    );
  EXCEPTION WHEN serialization_failure THEN
    RAISE EXCEPTION '%', SQLERRM USING ERRCODE = 'PT409';
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_payout_checked(UUID, NUMERIC, TEXT, DATE, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_payout_checked(UUID, NUMERIC, TEXT, DATE, TEXT, TEXT, TEXT)
  TO authenticated, service_role;
