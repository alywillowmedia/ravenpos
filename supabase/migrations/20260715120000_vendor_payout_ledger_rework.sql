-- Canonical vendor payout ledger, immutable statements, atomic payment workflows,
-- append-only invoice payments, historical reconciliation, and hardened RLS.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Payout lifecycle and structured selection metadata
-- ---------------------------------------------------------------------------

ALTER TABLE public.payouts
  ALTER COLUMN paid_at DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'paid',
  ADD COLUMN IF NOT EXISTS prepared_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS prepared_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS paid_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cutoff_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source_range_start DATE,
  ADD COLUMN IF NOT EXISTS source_range_end DATE,
  ADD COLUMN IF NOT EXISTS range_mode TEXT NOT NULL DEFAULT 'all_outstanding',
  ADD COLUMN IF NOT EXISTS include_prior_balance BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS threshold_snapshot NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS payable_before_invoices_snapshot NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS below_threshold_override_reason TEXT,
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS payment_reference TEXT,
  ADD COLUMN IF NOT EXISTS payment_date DATE,
  ADD COLUMN IF NOT EXISTS historical_confidence TEXT NOT NULL DEFAULT 'legacy_unverified',
  ADD COLUMN IF NOT EXISTS reconciliation_explanation TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE public.payouts
SET status = 'paid',
    prepared_at = COALESCE(prepared_at, created_at, paid_at),
    cutoff_at = COALESCE(cutoff_at, period_end, paid_at),
    payment_date = COALESCE(payment_date, paid_at::DATE),
    historical_confidence = COALESCE(historical_confidence, 'legacy_unverified'),
    updated_at = COALESCE(updated_at, created_at, paid_at, NOW())
WHERE status IS DISTINCT FROM 'paid'
   OR prepared_at IS NULL
   OR cutoff_at IS NULL
   OR payment_date IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payouts_status_check'
      AND conrelid = 'public.payouts'::regclass
  ) THEN
    ALTER TABLE public.payouts
      ADD CONSTRAINT payouts_status_check
      CHECK (status IN ('draft', 'paid', 'voided'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payouts_range_mode_check'
      AND conrelid = 'public.payouts'::regclass
  ) THEN
    ALTER TABLE public.payouts
      ADD CONSTRAINT payouts_range_mode_check
      CHECK (range_mode IN ('all_outstanding', 'selected_range'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payouts_historical_confidence_check'
      AND conrelid = 'public.payouts'::regclass
  ) THEN
    ALTER TABLE public.payouts
      ADD CONSTRAINT payouts_historical_confidence_check
      CHECK (historical_confidence IN ('verified', 'reconciled', 'legacy_unverified'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payouts_range_dates_check'
      AND conrelid = 'public.payouts'::regclass
  ) THEN
    ALTER TABLE public.payouts
      ADD CONSTRAINT payouts_range_dates_check
      CHECK (
        (range_mode = 'all_outstanding')
        OR (
          source_range_start IS NOT NULL
          AND source_range_end IS NOT NULL
          AND source_range_start <= source_range_end
        )
      );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.payout_settings (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  default_threshold NUMERIC(12,2) NOT NULL DEFAULT 100 CHECK (default_threshold >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);

INSERT INTO public.payout_settings (singleton, default_threshold)
VALUES (TRUE, 100)
ON CONFLICT (singleton) DO NOTHING;

ALTER TABLE public.consignors
  ADD COLUMN IF NOT EXISTS payout_threshold_override NUMERIC(12,2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'consignors_payout_threshold_override_check'
      AND conrelid = 'public.consignors'::regclass
  ) THEN
    ALTER TABLE public.consignors
      ADD CONSTRAINT consignors_payout_threshold_override_check
      CHECK (payout_threshold_override IS NULL OR payout_threshold_override >= 0);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Exact statement evidence
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.payout_sale_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id UUID NOT NULL REFERENCES public.payouts(id) ON DELETE RESTRICT,
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE RESTRICT,
  sale_item_id UUID NOT NULL REFERENCES public.sale_items(id) ON DELETE RESTRICT,
  consignor_id UUID NOT NULL REFERENCES public.consignors(id) ON DELETE RESTRICT,
  sale_timestamp TIMESTAMPTZ NOT NULL,
  sku TEXT NOT NULL,
  item_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  refunded_quantity INTEGER NOT NULL DEFAULT 0 CHECK (refunded_quantity >= 0),
  unit_price NUMERIC(12,2) NOT NULL,
  gross_line_amount NUMERIC(12,2) NOT NULL,
  item_discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  allocated_order_discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_line_amount NUMERIC(12,2) NOT NULL,
  commission_percentage NUMERIC(7,4) NOT NULL,
  vendor_earnings_before_fees NUMERIC(12,2) NOT NULL,
  allocated_card_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
  final_vendor_cut NUMERIC(12,2) NOT NULL,
  amount_settled NUMERIC(12,2) NOT NULL CHECK (amount_settled > 0),
  remaining_amount_after NUMERIC(12,2) NOT NULL CHECK (remaining_amount_after >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT payout_sale_allocations_unique_item_per_payout UNIQUE (payout_id, sale_item_id),
  CONSTRAINT payout_sale_allocations_refund_quantity_check CHECK (refunded_quantity <= quantity),
  CONSTRAINT payout_sale_allocations_amount_check CHECK (amount_settled <= final_vendor_cut + 0.01)
);

CREATE TABLE IF NOT EXISTS public.payout_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id UUID NOT NULL REFERENCES public.payouts(id) ON DELETE RESTRICT,
  consignor_id UUID NOT NULL REFERENCES public.consignors(id) ON DELETE RESTRICT,
  adjustment_type TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount <> 0),
  description TEXT NOT NULL CHECK (length(trim(description)) > 0),
  source_table TEXT,
  source_reference TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT payout_adjustments_type_check CHECK (
    adjustment_type IN (
      'booth_rent', 'marketing_fee', 'manual_ledger', 'invoice_deduction',
      'refund_reversal', 'legacy_carryover', 'write_off', 'void_reversal', 'other'
    )
  )
);

CREATE TABLE IF NOT EXISTS public.invoice_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  payout_id UUID REFERENCES public.payouts(id) ON DELETE RESTRICT,
  consignor_id UUID REFERENCES public.consignors(id) ON DELETE RESTRICT,
  payment_type TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount <> 0),
  paid_date DATE NOT NULL,
  actor_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reference TEXT,
  notes TEXT,
  reverses_payment_id UUID REFERENCES public.invoice_payments(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT invoice_payments_type_check CHECK (
    payment_type IN ('direct', 'payout_funded', 'legacy_direct', 'reversal')
  ),
  CONSTRAINT invoice_payments_payout_check CHECK (
    (payment_type = 'payout_funded' AND payout_id IS NOT NULL AND amount > 0)
    OR (payment_type = 'direct' AND payout_id IS NULL AND amount > 0)
    OR (payment_type = 'legacy_direct' AND amount > 0)
    OR (payment_type = 'reversal' AND amount < 0 AND reverses_payment_id IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.payout_reversals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id UUID NOT NULL REFERENCES public.payouts(id) ON DELETE RESTRICT,
  consignor_id UUID NOT NULL REFERENCES public.consignors(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  reversed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reversed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  snapshot JSONB NOT NULL DEFAULT '{}'::JSONB,
  CONSTRAINT payout_reversals_one_per_payout UNIQUE (payout_id)
);

CREATE TABLE IF NOT EXISTS public.payout_legacy_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consignor_id UUID NOT NULL REFERENCES public.consignors(id) ON DELETE RESTRICT,
  source_payout_id UUID NOT NULL REFERENCES public.payouts(id) ON DELETE RESTRICT,
  original_amount NUMERIC(12,2) NOT NULL CHECK (original_amount > 0),
  explanation TEXT NOT NULL,
  confidence TEXT NOT NULL DEFAULT 'legacy_unverified'
    CHECK (confidence IN ('reconciled', 'legacy_unverified')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT payout_legacy_balances_source_unique UNIQUE (source_payout_id)
);

-- Source records retain reversal evidence without erasing the paid statement.
ALTER TABLE public.booth_rent_payments
  ADD COLUMN IF NOT EXISTS source_payout_id UUID REFERENCES public.payouts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reversed_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.marketing_fee_allocations
  ADD COLUMN IF NOT EXISTS deduction_reversed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deduction_reversed_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.vendor_ledger_entries
  ADD COLUMN IF NOT EXISTS deduction_reversed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deduction_reversed_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.booth_rent_payments
  DROP CONSTRAINT IF EXISTS booth_rent_payments_consignor_id_period_month_period_year_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_booth_rent_payments_active_period
  ON public.booth_rent_payments (consignor_id, period_year, period_month)
  WHERE reversed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_payouts_queue
  ON public.payouts (status, consignor_id, prepared_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_payouts_one_draft_per_vendor
  ON public.payouts (consignor_id)
  WHERE status = 'draft';
CREATE INDEX IF NOT EXISTS idx_payouts_paid_history
  ON public.payouts (consignor_id, paid_at DESC, id DESC)
  WHERE status = 'paid';
CREATE INDEX IF NOT EXISTS idx_payout_allocations_item_paid
  ON public.payout_sale_allocations (sale_item_id, payout_id);
CREATE INDEX IF NOT EXISTS idx_payout_allocations_vendor_history
  ON public.payout_sale_allocations (consignor_id, sale_timestamp DESC, sale_item_id);
CREATE INDEX IF NOT EXISTS idx_payout_adjustments_payout
  ON public.payout_adjustments (payout_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_payout_adjustments_source
  ON public.payout_adjustments (source_table, source_reference)
  WHERE source_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice_timeline
  ON public.invoice_payments (invoice_id, paid_date DESC, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_payout
  ON public.invoice_payments (payout_id)
  WHERE payout_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_legacy_balances_vendor
  ON public.payout_legacy_balances (consignor_id, created_at, id);

-- ---------------------------------------------------------------------------
-- Immutability guards
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_paid_payout_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('paid', 'voided') THEN
      RAISE EXCEPTION 'Paid and voided payouts are immutable; use void_payout.'
        USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status IN ('paid', 'voided')
     AND COALESCE(current_setting('app.allow_payout_void', TRUE), 'off') <> 'on' THEN
    RAISE EXCEPTION 'Paid and voided payouts are immutable; use void_payout.'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_paid_payout_mutation ON public.payouts;
CREATE TRIGGER guard_paid_payout_mutation
BEFORE UPDATE OR DELETE ON public.payouts
FOR EACH ROW EXECUTE FUNCTION public.guard_paid_payout_mutation();

CREATE OR REPLACE FUNCTION public.guard_payout_evidence_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payout_id UUID;
  v_status TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_payout_id := NEW.payout_id;
  ELSE
    v_payout_id := OLD.payout_id;
  END IF;
  SELECT p.status INTO v_status FROM public.payouts p WHERE p.id = v_payout_id;
  IF v_status IN ('paid', 'voided')
     AND COALESCE(current_setting('app.allow_payout_reconciliation', TRUE), 'off') <> 'on' THEN
    RAISE EXCEPTION 'Evidence for paid and voided payouts is immutable.'
      USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_payout_sale_allocations_mutation ON public.payout_sale_allocations;
CREATE TRIGGER guard_payout_sale_allocations_mutation
BEFORE INSERT OR UPDATE OR DELETE ON public.payout_sale_allocations
FOR EACH ROW EXECUTE FUNCTION public.guard_payout_evidence_mutation();

DROP TRIGGER IF EXISTS guard_payout_adjustments_mutation ON public.payout_adjustments;
CREATE TRIGGER guard_payout_adjustments_mutation
BEFORE INSERT OR UPDATE OR DELETE ON public.payout_adjustments
FOR EACH ROW EXECUTE FUNCTION public.guard_payout_evidence_mutation();

CREATE OR REPLACE FUNCTION public.guard_append_only_invoice_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'Invoice payments are append-only; create a reversal entry.'
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS guard_append_only_invoice_payment ON public.invoice_payments;
CREATE TRIGGER guard_append_only_invoice_payment
BEFORE UPDATE OR DELETE ON public.invoice_payments
FOR EACH ROW EXECUTE FUNCTION public.guard_append_only_invoice_payment();

-- ---------------------------------------------------------------------------
-- Deterministic, cents-safe sale-item financials and allocation status
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_payout_sale_financials(
  p_consignor_id UUID,
  p_as_of TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE (
  sale_id UUID,
  sale_item_id UUID,
  consignor_id UUID,
  sale_timestamp TIMESTAMPTZ,
  sku TEXT,
  item_name TEXT,
  quantity INTEGER,
  refunded_quantity INTEGER,
  unit_price NUMERIC,
  gross_line_amount NUMERIC,
  item_discount NUMERIC,
  allocated_order_discount NUMERIC,
  net_line_amount NUMERIC,
  commission_percentage NUMERIC,
  vendor_earnings_before_fees NUMERIC,
  allocated_card_fee NUMERIC,
  final_vendor_cut NUMERIC,
  paid_amount NUMERIC,
  remaining_amount NUMERIC,
  refund_obligation_amount NUMERIC,
  allocation_status TEXT,
  linked_payouts JSONB
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  WITH base AS (
    SELECT
      si.id AS sale_item_id,
      si.sale_id,
      si.consignor_id,
      s.completed_at AS sale_timestamp,
      si.sku,
      si.name AS item_name,
      si.quantity,
      si.price,
      si.commission_split,
      COALESCE(si.consignor_pays_card_fee, FALSE) AS consignor_pays_card_fee,
      GREATEST(0, ROUND((si.price * si.quantity * 100)::NUMERIC))::BIGINT AS gross_cents,
      GREATEST(
        0,
        LEAST(
          ROUND((COALESCE(si.discount_amount, 0) * 100)::NUMERIC),
          ROUND((si.price * si.quantity * 100)::NUMERIC)
        )
      )::BIGINT AS item_discount_cents,
      GREATEST(0, ROUND((COALESCE(s.discount_total, 0) * 100)::NUMERIC))::BIGINT AS sale_discount_cents,
      s.payment_method,
      s.payment_breakdown,
      GREATEST(0, ROUND((COALESCE(s.total, 0) * 100)::NUMERIC))::BIGINT AS sale_total_cents
    FROM public.sale_items si
    JOIN public.sales s ON s.id = si.sale_id
    WHERE s.completed_at <= p_as_of
      AND EXISTS (
        SELECT 1
        FROM public.sale_items target_item
        WHERE target_item.sale_id = s.id
          AND target_item.consignor_id = p_consignor_id
      )
  ), sale_totals AS (
    SELECT
      b.sale_id,
      SUM(b.item_discount_cents)::BIGINT AS total_item_discount_cents,
      SUM(b.gross_cents - b.item_discount_cents)::BIGINT AS after_item_discount_cents,
      MAX(b.sale_discount_cents)::BIGINT AS sale_discount_cents
    FROM base b
    GROUP BY b.sale_id
  ), discount_prelim AS (
    SELECT
      b.*,
      st.after_item_discount_cents,
      LEAST(
        GREATEST(st.sale_discount_cents - st.total_item_discount_cents, 0),
        st.after_item_discount_cents
      )::BIGINT AS order_discount_cents,
      CASE WHEN st.after_item_discount_cents > 0 THEN
        FLOOR(
          LEAST(
            GREATEST(st.sale_discount_cents - st.total_item_discount_cents, 0),
            st.after_item_discount_cents
          )::NUMERIC * (b.gross_cents - b.item_discount_cents)::NUMERIC
          / st.after_item_discount_cents::NUMERIC
        )::BIGINT
      ELSE 0 END AS order_discount_base_cents,
      CASE WHEN st.after_item_discount_cents > 0 THEN
        MOD(
          LEAST(
            GREATEST(st.sale_discount_cents - st.total_item_discount_cents, 0),
            st.after_item_discount_cents
          ) * (b.gross_cents - b.item_discount_cents),
          st.after_item_discount_cents
        )
      ELSE 0 END AS order_discount_remainder
    FROM base b
    JOIN sale_totals st ON st.sale_id = b.sale_id
  ), discount_ranked AS (
    SELECT
      dp.*,
      SUM(dp.order_discount_base_cents) OVER (PARTITION BY dp.sale_id) AS allocated_discount_base,
      ROW_NUMBER() OVER (
        PARTITION BY dp.sale_id
        ORDER BY dp.order_discount_remainder DESC, dp.sale_item_id
      ) AS discount_rank
    FROM discount_prelim dp
  ), net_lines AS (
    SELECT
      dr.*,
      (
        dr.order_discount_base_cents
        + CASE
            WHEN dr.discount_rank <= (dr.order_discount_cents - dr.allocated_discount_base)
            THEN 1 ELSE 0
          END
      )::BIGINT AS allocated_order_discount_cents,
      GREATEST(
        0,
        dr.gross_cents - dr.item_discount_cents
        - dr.order_discount_base_cents
        - CASE
            WHEN dr.discount_rank <= (dr.order_discount_cents - dr.allocated_discount_base)
            THEN 1 ELSE 0
          END
      )::BIGINT AS net_line_cents
    FROM discount_ranked dr
  ), fee_context AS (
    SELECT
      nl.*,
      SUM(nl.net_line_cents) OVER (PARTITION BY nl.sale_id)::BIGINT AS sale_net_cents,
      CASE
        WHEN nl.payment_method = 'card' THEN nl.sale_total_cents
        WHEN nl.payment_method = 'split'
          AND jsonb_typeof(nl.payment_breakdown) = 'array'
        THEN GREATEST(0, ROUND((
          SELECT COALESCE(SUM((entry->>'amount')::NUMERIC), 0) * 100
          FROM jsonb_array_elements(nl.payment_breakdown) entry
          WHERE entry->>'method' = 'card'
        )::NUMERIC))::BIGINT
        ELSE 0
      END AS card_tender_cents
    FROM net_lines nl
  ), fee_prelim AS (
    SELECT
      fc.*,
      CASE WHEN fc.card_tender_cents > 0
        THEN ROUND((fc.card_tender_cents * 0.027 + 5)::NUMERIC)::BIGINT
        ELSE 0
      END AS sale_fee_cents,
      CASE WHEN fc.sale_net_cents > 0 AND fc.card_tender_cents > 0 THEN
        FLOOR(
          ROUND((fc.card_tender_cents * 0.027 + 5)::NUMERIC)::NUMERIC
          * fc.net_line_cents::NUMERIC / fc.sale_net_cents::NUMERIC
        )::BIGINT
      ELSE 0 END AS fee_base_cents,
      CASE WHEN fc.sale_net_cents > 0 AND fc.card_tender_cents > 0 THEN
        MOD(
          ROUND((fc.card_tender_cents * 0.027 + 5)::NUMERIC)::BIGINT * fc.net_line_cents,
          fc.sale_net_cents
        )
      ELSE 0 END AS fee_remainder
    FROM fee_context fc
  ), fee_ranked AS (
    SELECT
      fp.*,
      SUM(fp.fee_base_cents) OVER (PARTITION BY fp.sale_id) AS fee_base_total,
      ROW_NUMBER() OVER (
        PARTITION BY fp.sale_id
        ORDER BY fp.fee_remainder DESC, fp.sale_item_id
      ) AS fee_rank
    FROM fee_prelim fp
  ), refund_totals AS (
    SELECT
      (entry->>'sale_item_id')::UUID AS sale_item_id,
      SUM(GREATEST(0, COALESCE((entry->>'quantity')::INTEGER, 0)))::INTEGER AS refunded_quantity
    FROM public.refunds r
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.items, '[]'::JSONB)) entry
    WHERE r.created_at <= p_as_of
      AND entry ? 'sale_item_id'
    GROUP BY (entry->>'sale_item_id')::UUID
  ), active_allocations AS (
    SELECT
      psa.sale_item_id,
      ROUND(SUM(psa.amount_settled)::NUMERIC, 2) AS paid_amount,
      JSONB_AGG(
        JSONB_BUILD_OBJECT(
          'payout_id', p.id,
          'amount', psa.amount_settled,
          'paid_at', p.paid_at,
          'confidence', p.historical_confidence
        ) ORDER BY p.paid_at, p.id
      ) AS linked_payouts
    FROM public.payout_sale_allocations psa
    JOIN public.payouts p ON p.id = psa.payout_id
    WHERE p.status = 'paid'
      AND p.paid_at <= p_as_of
    GROUP BY psa.sale_item_id
  ), applied_refund_reversals AS (
    SELECT
      pa.source_reference::UUID AS sale_item_id,
      ROUND(SUM(-pa.amount)::NUMERIC, 2) AS applied_amount
    FROM public.payout_adjustments pa
    JOIN public.payouts p ON p.id = pa.payout_id
    WHERE pa.adjustment_type = 'refund_reversal'
      AND pa.source_table = 'sale_items'
      AND p.status = 'paid'
      AND p.paid_at <= p_as_of
    GROUP BY pa.source_reference::UUID
  ), calculated AS (
    SELECT
      fr.*,
      LEAST(fr.quantity, COALESCE(rt.refunded_quantity, 0))::INTEGER AS refunded_quantity,
      GREATEST(fr.quantity - LEAST(fr.quantity, COALESCE(rt.refunded_quantity, 0)), 0)::INTEGER AS effective_quantity,
      ROUND((fr.net_line_cents * fr.commission_split)::NUMERIC)::BIGINT AS vendor_before_fee_cents,
      CASE WHEN fr.consignor_pays_card_fee THEN
        fr.fee_base_cents
        + CASE WHEN fr.fee_rank <= (fr.sale_fee_cents - fr.fee_base_total) THEN 1 ELSE 0 END
      ELSE 0 END::BIGINT AS card_fee_cents,
      COALESCE(aa.paid_amount, 0)::NUMERIC AS paid_amount,
      COALESCE(aa.linked_payouts, '[]'::JSONB) AS linked_payouts,
      COALESCE(arr.applied_amount, 0)::NUMERIC AS applied_refund_reversal
    FROM fee_ranked fr
    LEFT JOIN refund_totals rt ON rt.sale_item_id = fr.sale_item_id
    LEFT JOIN active_allocations aa ON aa.sale_item_id = fr.sale_item_id
    LEFT JOIN applied_refund_reversals arr ON arr.sale_item_id = fr.sale_item_id
  ), valued AS (
    SELECT
      c.*,
      CASE WHEN c.quantity > 0 THEN
        ROUND((c.vendor_before_fee_cents * c.effective_quantity::NUMERIC / c.quantity)::NUMERIC)
      ELSE 0 END::BIGINT AS effective_vendor_before_fee_cents,
      CASE WHEN c.quantity > 0 THEN
        ROUND((c.card_fee_cents * c.effective_quantity::NUMERIC / c.quantity)::NUMERIC)
      ELSE 0 END::BIGINT AS effective_card_fee_cents,
      EXISTS (
        SELECT 1
        FROM public.payouts lp
        WHERE lp.consignor_id = c.consignor_id
          AND lp.status = 'paid'
          AND lp.historical_confidence = 'legacy_unverified'
          -- Legacy range boundaries passed through JavaScript and were stored to
          -- millisecond precision, while sales retain PostgreSQL microseconds.
          -- Compare both sides at the least-precise known granularity so the
          -- sale that produced a stored boundary cannot fall just outside it.
          AND c.sale_timestamp
            >= DATE_TRUNC('milliseconds', COALESCE(lp.period_start, lp.paid_at))
          AND c.sale_timestamp
            < DATE_TRUNC('milliseconds', LEAST(COALESCE(lp.period_end, lp.paid_at), lp.paid_at))
              + INTERVAL '1 millisecond'
      ) AS legacy_uncertain
    FROM calculated c
  ), final AS (
    SELECT
      v.*,
      GREATEST(v.effective_vendor_before_fee_cents - v.effective_card_fee_cents, 0)::BIGINT AS final_vendor_cut_cents
    FROM valued v
  )
  SELECT
    f.sale_id,
    f.sale_item_id,
    f.consignor_id,
    f.sale_timestamp,
    f.sku,
    f.item_name,
    f.quantity,
    f.refunded_quantity,
    ROUND(f.price::NUMERIC, 2),
    ROUND((f.gross_cents / 100.0)::NUMERIC, 2),
    ROUND((f.item_discount_cents / 100.0)::NUMERIC, 2),
    ROUND((f.allocated_order_discount_cents / 100.0)::NUMERIC, 2),
    ROUND((f.net_line_cents / 100.0)::NUMERIC, 2),
    ROUND((f.commission_split * 100)::NUMERIC, 4),
    ROUND((f.effective_vendor_before_fee_cents / 100.0)::NUMERIC, 2),
    ROUND((f.effective_card_fee_cents / 100.0)::NUMERIC, 2),
    ROUND((f.final_vendor_cut_cents / 100.0)::NUMERIC, 2),
    ROUND(f.paid_amount::NUMERIC, 2),
    CASE WHEN f.legacy_uncertain AND f.paid_amount = 0 THEN 0::NUMERIC
      ELSE ROUND(GREATEST((f.final_vendor_cut_cents / 100.0) - f.paid_amount, 0)::NUMERIC, 2)
    END,
    ROUND(GREATEST(f.paid_amount - (f.final_vendor_cut_cents / 100.0) - f.applied_refund_reversal, 0)::NUMERIC, 2),
    CASE
      WHEN f.legacy_uncertain AND f.paid_amount = 0 THEN 'legacy_uncertain'
      WHEN f.effective_quantity = 0 THEN 'refunded'
      WHEN f.paid_amount <= 0 THEN 'unpaid'
      WHEN f.paid_amount + 0.009 < (f.final_vendor_cut_cents / 100.0) THEN 'partially_paid'
      ELSE 'paid'
    END,
    f.linked_payouts
  FROM final f
  WHERE f.consignor_id = p_consignor_id
  ORDER BY f.sale_timestamp, f.sale_id, f.sale_item_id;
$$;

REVOKE ALL ON FUNCTION public.get_payout_sale_financials(UUID, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_payout_sale_financials(UUID, TIMESTAMPTZ)
  TO service_role;

-- ---------------------------------------------------------------------------
-- Canonical balance helpers and read workspaces
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_legacy_balance_remaining(
  p_consignor_id UUID,
  p_as_of TIMESTAMPTZ DEFAULT NOW()
)
RETURNS NUMERIC
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT ROUND(COALESCE(SUM(GREATEST(
    lb.original_amount - COALESCE(applied.amount, 0), 0
  )), 0)::NUMERIC, 2)
  FROM public.payout_legacy_balances lb
  LEFT JOIN LATERAL (
    SELECT SUM(pa.amount) AS amount
    FROM public.payout_adjustments pa
    JOIN public.payouts p ON p.id = pa.payout_id
    WHERE pa.adjustment_type = 'legacy_carryover'
      AND pa.source_table = 'payout_legacy_balances'
      AND pa.source_reference = lb.id::TEXT
      AND p.status = 'paid'
      AND p.paid_at <= p_as_of
  ) applied ON TRUE
  WHERE lb.consignor_id = p_consignor_id
    AND lb.created_at <= p_as_of;
$$;

REVOKE ALL ON FUNCTION public.get_legacy_balance_remaining(UUID, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_legacy_balance_remaining(UUID, TIMESTAMPTZ)
  TO service_role;

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
  v_current_month DATE := DATE_TRUNC('month', p_as_of)::DATE;
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
      SELECT DATE_TRUNC('month', MIN(p.paid_at))::DATE
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

CREATE OR REPLACE FUNCTION public.get_vendor_payable_at(
  p_consignor_id UUID,
  p_as_of TIMESTAMPTZ DEFAULT NOW()
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sources NUMERIC;
  v_required NUMERIC;
BEGIN
  SELECT ROUND(
    COALESCE(SUM(f.remaining_amount), 0)
    + public.get_legacy_balance_remaining(p_consignor_id, p_as_of),
    2
  ) INTO v_sources
  FROM public.get_payout_sale_financials(p_consignor_id, p_as_of) f;

  SELECT ROUND(COALESCE(SUM(a.amount) FILTER (WHERE a.will_apply), 0), 2)
  INTO v_required
  FROM public.get_vendor_required_adjustments(p_consignor_id, v_sources, p_as_of) a;

  RETURN ROUND(GREATEST(v_sources - COALESCE(v_required, 0), 0), 2);
END;
$$;

REVOKE ALL ON FUNCTION public.get_vendor_payable_at(UUID, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_vendor_payable_at(UUID, TIMESTAMPTZ)
  TO service_role;

CREATE OR REPLACE FUNCTION public.get_vendor_payout_workspace(
  p_consignor_id UUID,
  p_range_start DATE DEFAULT NULL,
  p_range_end DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role TEXT := public.get_user_role();
  v_is_admin BOOLEAN := public.is_admin() OR COALESCE(auth.role(), '') = 'service_role';
  v_as_of TIMESTAMPTZ := CASE
    WHEN p_range_end IS NULL THEN NOW()
    ELSE p_range_end::TIMESTAMPTZ + INTERVAL '1 day' - INTERVAL '1 microsecond'
  END;
  v_opening_as_of TIMESTAMPTZ := CASE
    WHEN p_range_start IS NULL THEN NULL
    ELSE p_range_start::TIMESTAMPTZ - INTERVAL '1 microsecond'
  END;
  v_vendor JSONB;
  v_sale_items JSONB;
  v_adjustments JSONB;
  v_invoices JSONB;
  v_history JSONB;
  v_sources NUMERIC := 0;
  v_required NUMERIC := 0;
  v_current NUMERIC := 0;
  v_opening NUMERIC := 0;
  v_closing NUMERIC := 0;
  v_payments NUMERIC := 0;
  v_applied_adjustments NUMERIC := 0;
  v_range_activity NUMERIC := 0;
  v_threshold NUMERIC := 100;
  v_draft_id UUID;
  v_legacy_exceptions INTEGER := 0;
BEGIN
  IF NOT v_is_admin AND NOT (
    COALESCE(v_role, '') = 'vendor'
    AND COALESCE(public.get_user_consignor_id() = p_consignor_id, FALSE)
  ) THEN
    RAISE EXCEPTION 'Not authorized to view this vendor payout workspace.'
      USING ERRCODE = '42501';
  END IF;

  SELECT JSONB_BUILD_OBJECT(
    'id', c.id,
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
    'booth_location', c.booth_location,
    'has_w9_filled_out', COALESCE(c.has_w9_filled_out, FALSE),
    'commission_split', c.commission_split,
    'payout_threshold_override', c.payout_threshold_override
  )
  INTO v_vendor
  FROM public.consignors c
  WHERE c.id = p_consignor_id;

  IF v_vendor IS NULL THEN
    RAISE EXCEPTION 'Vendor not found.' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(c.payout_threshold_override, ps.default_threshold, 100)
  INTO v_threshold
  FROM public.consignors c
  CROSS JOIN public.payout_settings ps
  WHERE c.id = p_consignor_id AND ps.singleton;

  SELECT
    COALESCE(JSONB_AGG(TO_JSONB(f) ORDER BY f.sale_timestamp DESC, f.sale_id, f.sale_item_id), '[]'::JSONB),
    ROUND(COALESCE(SUM(f.remaining_amount), 0), 2),
    COUNT(*) FILTER (WHERE f.allocation_status = 'legacy_uncertain')
  INTO v_sale_items, v_sources, v_legacy_exceptions
  FROM public.get_payout_sale_financials(p_consignor_id, v_as_of) f;

  v_sources := ROUND(v_sources + public.get_legacy_balance_remaining(p_consignor_id, v_as_of), 2);

  SELECT
    COALESCE(JSONB_AGG(TO_JSONB(a) ORDER BY a.will_apply DESC, a.adjustment_type, a.source_reference), '[]'::JSONB),
    ROUND(COALESCE(SUM(a.amount) FILTER (WHERE a.will_apply), 0), 2)
  INTO v_adjustments, v_required
  FROM public.get_vendor_required_adjustments(p_consignor_id, v_sources, v_as_of) a;

  v_closing := ROUND(GREATEST(v_sources - v_required, 0), 2);
  v_current := public.get_vendor_payable_at(p_consignor_id, NOW());
  v_opening := CASE WHEN v_opening_as_of IS NULL THEN 0
    ELSE public.get_vendor_payable_at(p_consignor_id, v_opening_as_of)
  END;

  SELECT ROUND(COALESCE(SUM(p.amount), 0), 2)
  INTO v_payments
  FROM public.payouts p
  WHERE p.consignor_id = p_consignor_id
    AND p.status = 'paid'
    AND (p_range_start IS NULL OR p.paid_at >= p_range_start::TIMESTAMPTZ)
    AND p.paid_at <= v_as_of;

  SELECT ROUND(COALESCE(SUM(pa.amount), 0), 2)
  INTO v_applied_adjustments
  FROM public.payout_adjustments pa
  JOIN public.payouts p ON p.id = pa.payout_id
  WHERE pa.consignor_id = p_consignor_id
    AND p.status = 'paid'
    AND (p_range_start IS NULL OR p.paid_at >= p_range_start::TIMESTAMPTZ)
    AND p.paid_at <= v_as_of;

  v_range_activity := ROUND(v_closing - v_opening - v_applied_adjustments + v_payments, 2);

  SELECT COALESCE(JSONB_AGG(JSONB_BUILD_OBJECT(
    'id', i.id,
    'invoice_number', UPPER(LEFT(i.id::TEXT, 8)),
    'created_at', i.created_at,
    'total', ROUND(i.total, 2),
    'amount_paid', ROUND(i.amount_paid, 2),
    'balance_due', ROUND(GREATEST(i.total - i.amount_paid, 0), 2),
    'status', i.status,
    'notes', i.notes
  ) ORDER BY i.created_at, i.id), '[]'::JSONB)
  INTO v_invoices
  FROM public.invoices i
  WHERE i.recipient_type = 'vendor'
    AND i.consignor_id = p_consignor_id
    AND i.status IN ('unpaid', 'partially_paid');

  SELECT COALESCE(JSONB_AGG(JSONB_BUILD_OBJECT(
    'id', p.id,
    'status', p.status,
    'amount', p.amount,
    'paid_at', p.paid_at,
    'payment_method', p.payment_method,
    'payment_reference', p.payment_reference,
    'historical_confidence', p.historical_confidence,
    'reconciliation_explanation', p.reconciliation_explanation,
    'items_sold', p.items_sold
  ) ORDER BY COALESCE(p.paid_at, p.prepared_at) DESC, p.id DESC), '[]'::JSONB)
  INTO v_history
  FROM public.payouts p
  WHERE p.consignor_id = p_consignor_id
    AND p.status IN ('paid', 'voided');

  SELECT p.id INTO v_draft_id
  FROM public.payouts p
  WHERE p.consignor_id = p_consignor_id AND p.status = 'draft'
  ORDER BY p.updated_at DESC, p.id DESC
  LIMIT 1;

  RETURN JSONB_BUILD_OBJECT(
    'vendor', v_vendor,
    'summary', JSONB_BUILD_OBJECT(
      'opening_balance', v_opening,
      'range_activity', v_range_activity,
      'applied_adjustments', v_applied_adjustments,
      'payments_in_range', v_payments,
      'closing_balance', v_closing,
      'current_payable', v_current,
      'threshold', ROUND(v_threshold, 2),
      'threshold_remaining', ROUND(GREATEST(v_threshold - v_current, 0), 2),
      'threshold_progress', CASE WHEN v_threshold <= 0 THEN 100
        ELSE ROUND(LEAST(v_current / v_threshold * 100, 100), 1)
      END,
      'readiness', CASE
        WHEN v_draft_id IS NOT NULL THEN 'draft'
        WHEN v_current <= 0 THEN 'paid_up'
        WHEN v_current >= v_threshold THEN 'ready'
        ELSE 'accruing'
      END,
      'draft_id', v_draft_id,
      'legacy_exception_count', v_legacy_exceptions,
      'range_start', p_range_start,
      'range_end', p_range_end
    ),
    'sale_items', v_sale_items,
    'required_adjustments', v_adjustments,
    'invoices', v_invoices,
    'payout_history', v_history
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_vendor_payout_workspace(UUID, DATE, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_vendor_payout_workspace(UUID, DATE, DATE)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_payout_queue(
  p_range_start DATE DEFAULT NULL,
  p_range_end DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rows JSONB;
BEGIN
  IF NOT (public.is_admin() OR COALESCE(auth.role(), '') = 'service_role') THEN
    RAISE EXCEPTION 'Admin access is required for the payout queue.'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(JSONB_AGG(workspace ORDER BY
    CASE workspace->'summary'->>'readiness'
      WHEN 'draft' THEN 0 WHEN 'ready' THEN 1 WHEN 'accruing' THEN 2 ELSE 3
    END,
    (workspace->'summary'->>'current_payable')::NUMERIC DESC,
    workspace->'vendor'->>'consignor_number'
  ), '[]'::JSONB)
  INTO v_rows
  FROM (
    SELECT public.get_vendor_payout_workspace(c.id, p_range_start, p_range_end) AS workspace
    FROM public.consignors c
    WHERE c.is_active = TRUE
    ORDER BY c.consignor_number
  ) q;

  RETURN v_rows;
END;
$$;

REVOKE ALL ON FUNCTION public.get_payout_queue(DATE, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_payout_queue(DATE, DATE)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Atomic admin workflows
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

  SELECT ROUND(COALESCE(SUM(f.remaining_amount), 0), 2)
  INTO v_sale_available
  FROM public.get_payout_sale_financials(p_consignor_id, v_cutoff) f
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
    v_legacy_available := public.get_legacy_balance_remaining(p_consignor_id, v_cutoff);
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
    p_consignor_id, v_source_available, v_cutoff
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
        AND lb.created_at <= v_cutoff
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
    FROM public.get_payout_sale_financials(p_consignor_id, v_cutoff) f
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

CREATE OR REPLACE FUNCTION public.finalize_payout(
  p_payout_id UUID,
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
  v_payout public.payouts%ROWTYPE;
  v_now TIMESTAMPTZ := NOW();
  v_allocation_total NUMERIC := 0;
  v_adjustment_total NUMERIC := 0;
  v_reconciled_cash NUMERIC := 0;
  v_current_payable NUMERIC := 0;
  v_invoice RECORD;
  v_adjustment RECORD;
  v_financial RECORD;
BEGIN
  IF NOT (public.is_admin() OR COALESCE(auth.role(), '') = 'service_role') THEN
    RAISE EXCEPTION 'Admin access is required to finalize payouts.'
      USING ERRCODE = '42501';
  END IF;

  IF p_payment_method IS NULL OR TRIM(p_payment_method) = '' THEN
    RAISE EXCEPTION 'Payment method is required.' USING ERRCODE = '22023';
  END IF;
  IF p_payment_date IS NULL THEN
    RAISE EXCEPTION 'Payment date is required.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_payout
  FROM public.payouts p
  WHERE p.id = p_payout_id
  FOR UPDATE;

  IF NOT FOUND OR v_payout.status <> 'draft' THEN
    RAISE EXCEPTION 'Finalizable payout draft not found.' USING ERRCODE = 'P0002';
  END IF;

  -- Consistent lock order prevents concurrent finalizations from claiming the same item.
  PERFORM 1
  FROM public.sale_items si
  WHERE si.id IN (
    SELECT psa.sale_item_id
    FROM public.payout_sale_allocations psa
    WHERE psa.payout_id = p_payout_id
  )
  ORDER BY si.id
  FOR UPDATE;

  FOR v_adjustment IN
    SELECT pa.*
    FROM public.payout_adjustments pa
    WHERE pa.payout_id = p_payout_id
    ORDER BY COALESCE(pa.source_table, ''), COALESCE(pa.source_reference, ''), pa.id
  LOOP
    IF v_adjustment.source_table = 'marketing_fee_allocations' AND NOT EXISTS (
      SELECT 1 FROM public.marketing_fee_allocations mfa
      WHERE mfa.id = v_adjustment.source_reference::UUID
        AND mfa.consignor_id = v_payout.consignor_id
        AND mfa.deducted_payout_id IS NULL
    ) THEN
      RAISE EXCEPTION 'A marketing deduction changed after the draft was prepared.'
        USING ERRCODE = '40001';
    ELSIF v_adjustment.source_table = 'vendor_ledger_entries' AND NOT EXISTS (
      SELECT 1 FROM public.vendor_ledger_entries vle
      WHERE vle.id = v_adjustment.source_reference::UUID
        AND vle.consignor_id = v_payout.consignor_id
        AND vle.deducted_payout_id IS NULL
    ) THEN
      RAISE EXCEPTION 'A ledger deduction changed after the draft was prepared.'
        USING ERRCODE = '40001';
    ELSIF v_adjustment.source_table = 'invoices' AND NOT EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = v_adjustment.source_reference::UUID
        AND i.consignor_id = v_payout.consignor_id
        AND i.recipient_type = 'vendor'
        AND i.status IN ('unpaid', 'partially_paid')
        AND ROUND(i.total - i.amount_paid, 2) + 0.009 >= -v_adjustment.amount
    ) THEN
      RAISE EXCEPTION 'An invoice application changed after the draft was prepared.'
        USING ERRCODE = '40001';
    ELSIF v_adjustment.source_table = 'payout_legacy_balances' AND
      public.get_legacy_balance_remaining(v_payout.consignor_id, v_now) + 0.009 < v_adjustment.amount THEN
      RAISE EXCEPTION 'Legacy carryover changed after the draft was prepared.'
        USING ERRCODE = '40001';
    END IF;
  END LOOP;

  PERFORM 1 FROM public.marketing_fee_allocations mfa
  WHERE mfa.id IN (
    SELECT pa.source_reference::UUID FROM public.payout_adjustments pa
    WHERE pa.payout_id = p_payout_id AND pa.source_table = 'marketing_fee_allocations'
  ) ORDER BY mfa.id FOR UPDATE;

  PERFORM 1 FROM public.vendor_ledger_entries vle
  WHERE vle.id IN (
    SELECT pa.source_reference::UUID FROM public.payout_adjustments pa
    WHERE pa.payout_id = p_payout_id AND pa.source_table = 'vendor_ledger_entries'
  ) ORDER BY vle.id FOR UPDATE;

  PERFORM 1 FROM public.invoices i
  WHERE i.id IN (
    SELECT pa.source_reference::UUID FROM public.payout_adjustments pa
    WHERE pa.payout_id = p_payout_id AND pa.source_table = 'invoices'
  ) ORDER BY i.id FOR UPDATE;

  -- Recalculate current item balances after locks are held.
  FOR v_financial IN
    SELECT psa.sale_item_id, psa.amount_settled, f.remaining_amount
    FROM public.payout_sale_allocations psa
    JOIN public.get_payout_sale_financials(v_payout.consignor_id, v_now) f
      ON f.sale_item_id = psa.sale_item_id
    WHERE psa.payout_id = p_payout_id
  LOOP
    IF v_financial.amount_settled > v_financial.remaining_amount + 0.009 THEN
      RAISE EXCEPTION 'Sale allocation conflict detected for item %.', v_financial.sale_item_id
        USING ERRCODE = '40001';
    END IF;
  END LOOP;

  IF (
    SELECT COUNT(*) FROM public.payout_sale_allocations psa WHERE psa.payout_id = p_payout_id
  ) <> (
    SELECT COUNT(*)
    FROM public.payout_sale_allocations psa
    JOIN public.get_payout_sale_financials(v_payout.consignor_id, v_now) f
      ON f.sale_item_id = psa.sale_item_id
    WHERE psa.payout_id = p_payout_id
  ) THEN
    RAISE EXCEPTION 'A sale allocation is no longer available.' USING ERRCODE = '40001';
  END IF;

  SELECT ROUND(COALESCE(SUM(psa.amount_settled), 0), 2)
  INTO v_allocation_total
  FROM public.payout_sale_allocations psa
  WHERE psa.payout_id = p_payout_id;

  SELECT ROUND(COALESCE(SUM(pa.amount), 0), 2)
  INTO v_adjustment_total
  FROM public.payout_adjustments pa
  WHERE pa.payout_id = p_payout_id;

  v_reconciled_cash := ROUND(v_allocation_total + v_adjustment_total, 2);
  IF ABS(v_reconciled_cash - v_payout.amount) > 0.009 THEN
    RAISE EXCEPTION 'Draft no longer reconciles: allocations plus adjustments equal %, expected %.',
      v_reconciled_cash, v_payout.amount
      USING ERRCODE = '23514';
  END IF;

  v_current_payable := public.get_vendor_payable_at(v_payout.consignor_id, v_now);
  IF v_payout.amount > 0
     AND COALESCE(v_payout.payable_before_invoices_snapshot, v_payout.original_amount_due, 0)
       < COALESCE(v_payout.threshold_snapshot, 0)
     AND NULLIF(TRIM(COALESCE(
       p_below_threshold_override_reason,
       v_payout.below_threshold_override_reason,
       ''
     )), '') IS NULL THEN
    RAISE EXCEPTION 'A below-threshold payout requires an override reason.'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.booth_rent_payments (
    consignor_id, amount, period_month, period_year, notes, paid_at, source_payout_id
  )
  SELECT
    v_payout.consignor_id,
    -pa.amount,
    (pa.metadata->>'period_month')::INTEGER,
    (pa.metadata->>'period_year')::INTEGER,
    'Applied by payout #' || UPPER(LEFT(p_payout_id::TEXT, 8)),
    v_now,
    p_payout_id
  FROM public.payout_adjustments pa
  WHERE pa.payout_id = p_payout_id
    AND pa.adjustment_type = 'booth_rent';

  UPDATE public.marketing_fee_allocations mfa
  SET deducted_payout_id = p_payout_id,
      deducted_at = v_now,
      deduction_reversed_at = NULL,
      deduction_reversed_by = NULL
  WHERE mfa.id IN (
    SELECT pa.source_reference::UUID
    FROM public.payout_adjustments pa
    WHERE pa.payout_id = p_payout_id
      AND pa.source_table = 'marketing_fee_allocations'
  );

  UPDATE public.vendor_ledger_entries vle
  SET deducted_payout_id = p_payout_id,
      deducted_at = v_now,
      deduction_reversed_at = NULL,
      deduction_reversed_by = NULL
  WHERE vle.id IN (
    SELECT pa.source_reference::UUID
    FROM public.payout_adjustments pa
    WHERE pa.payout_id = p_payout_id
      AND pa.source_table = 'vendor_ledger_entries'
  );

  INSERT INTO public.invoice_payments (
    invoice_id, payout_id, consignor_id, payment_type, amount,
    paid_date, actor_id, reference, notes
  )
  SELECT
    pa.source_reference::UUID,
    p_payout_id,
    v_payout.consignor_id,
    'payout_funded',
    -pa.amount,
    p_payment_date,
    auth.uid(),
    NULLIF(TRIM(COALESCE(p_payment_reference, '')), ''),
    'Applied during payout finalization'
  FROM public.payout_adjustments pa
  WHERE pa.payout_id = p_payout_id
    AND pa.adjustment_type = 'invoice_deduction';

  FOR v_invoice IN
    SELECT DISTINCT pa.source_reference::UUID AS invoice_id
    FROM public.payout_adjustments pa
    WHERE pa.payout_id = p_payout_id
      AND pa.adjustment_type = 'invoice_deduction'
    ORDER BY pa.source_reference::UUID
  LOOP
    UPDATE public.invoices i
    SET amount_paid = totals.amount_paid,
        status = CASE
          WHEN totals.amount_paid <= 0 THEN 'unpaid'
          WHEN totals.amount_paid + 0.009 >= i.total THEN 'paid'
          ELSE 'partially_paid'
        END,
        paid_at = CASE
          WHEN totals.amount_paid + 0.009 >= i.total THEN v_now
          ELSE NULL
        END,
        updated_at = v_now
    FROM (
      SELECT ROUND(COALESCE(SUM(ip.amount), 0), 2) AS amount_paid
      FROM public.invoice_payments ip
      WHERE ip.invoice_id = v_invoice.invoice_id
    ) totals
    WHERE i.id = v_invoice.invoice_id;
  END LOOP;

  UPDATE public.payouts p
  SET status = 'paid',
      paid_at = v_now,
      paid_by = auth.uid(),
      payment_method = TRIM(p_payment_method),
      payment_reference = NULLIF(TRIM(COALESCE(p_payment_reference, '')), ''),
      payment_date = p_payment_date,
      notes = COALESCE(p_notes, p.notes),
      below_threshold_override_reason = NULLIF(TRIM(COALESCE(
        p_below_threshold_override_reason,
        p.below_threshold_override_reason,
        ''
      )), ''),
      historical_confidence = 'verified',
      reconciliation_explanation = 'Finalized from exact locked sale allocations and adjustment snapshots.',
      updated_at = v_now
  WHERE p.id = p_payout_id;

  RETURN JSONB_BUILD_OBJECT(
    'payout_id', p_payout_id,
    'status', 'paid',
    'amount', v_payout.amount,
    'paid_at', v_now,
    'current_payable_after', public.get_vendor_payable_at(v_payout.consignor_id, NOW())
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_payout(UUID, TEXT, DATE, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_payout(UUID, TEXT, DATE, TEXT, TEXT, TEXT)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.record_invoice_payment(
  p_invoice_id UUID,
  p_amount NUMERIC,
  p_paid_date DATE,
  p_reference TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_amount NUMERIC := ROUND(COALESCE(p_amount, 0)::NUMERIC, 2);
  v_payment_id UUID;
  v_next_paid NUMERIC;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  IF NOT (public.is_admin() OR COALESCE(auth.role(), '') = 'service_role') THEN
    RAISE EXCEPTION 'Admin access is required to record invoice payments.'
      USING ERRCODE = '42501';
  END IF;
  IF v_amount <= 0 OR p_paid_date IS NULL THEN
    RAISE EXCEPTION 'A positive amount and payment date are required.'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_invoice
  FROM public.invoices i
  WHERE i.id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_amount > ROUND(v_invoice.total - v_invoice.amount_paid, 2) + 0.009 THEN
    RAISE EXCEPTION 'Payment exceeds the remaining invoice balance.'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.invoice_payments (
    invoice_id, consignor_id, payment_type, amount, paid_date,
    actor_id, reference, notes
  ) VALUES (
    p_invoice_id, v_invoice.consignor_id, 'direct', v_amount, p_paid_date,
    auth.uid(), NULLIF(TRIM(COALESCE(p_reference, '')), ''), p_notes
  ) RETURNING id INTO v_payment_id;

  SELECT ROUND(COALESCE(SUM(ip.amount), 0), 2)
  INTO v_next_paid
  FROM public.invoice_payments ip
  WHERE ip.invoice_id = p_invoice_id;

  UPDATE public.invoices i
  SET amount_paid = v_next_paid,
      status = CASE
        WHEN v_next_paid <= 0 THEN 'unpaid'
        WHEN v_next_paid + 0.009 >= i.total THEN 'paid'
        ELSE 'partially_paid'
      END,
      paid_at = CASE WHEN v_next_paid + 0.009 >= i.total THEN v_now ELSE NULL END,
      updated_at = v_now
  WHERE i.id = p_invoice_id;

  RETURN JSONB_BUILD_OBJECT(
    'payment_id', v_payment_id,
    'invoice_id', p_invoice_id,
    'amount_paid', v_next_paid,
    'balance_due', ROUND(GREATEST(v_invoice.total - v_next_paid, 0), 2)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_invoice_payment(UUID, NUMERIC, DATE, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_invoice_payment(UUID, NUMERIC, DATE, TEXT, TEXT)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.void_payout(
  p_payout_id UUID,
  p_reason TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payout public.payouts%ROWTYPE;
  v_reversal_id UUID;
  v_now TIMESTAMPTZ := NOW();
  v_payment RECORD;
  v_invoice_id UUID;
  v_amount_paid NUMERIC;
BEGIN
  IF NOT (public.is_admin() OR COALESCE(auth.role(), '') = 'service_role') THEN
    RAISE EXCEPTION 'Admin access is required to void payouts.'
      USING ERRCODE = '42501';
  END IF;
  IF NULLIF(TRIM(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'A void reason is required.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_payout
  FROM public.payouts p
  WHERE p.id = p_payout_id
  FOR UPDATE;

  IF NOT FOUND OR v_payout.status <> 'paid' THEN
    RAISE EXCEPTION 'Only paid payouts can be voided.' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.payout_reversals (
    payout_id, consignor_id, reason, reversed_by, snapshot
  ) VALUES (
    p_payout_id,
    v_payout.consignor_id,
    TRIM(p_reason),
    auth.uid(),
    TO_JSONB(v_payout)
  ) RETURNING id INTO v_reversal_id;

  FOR v_payment IN
    SELECT ip.*
    FROM public.invoice_payments ip
    WHERE ip.payout_id = p_payout_id
      AND ip.payment_type = 'payout_funded'
    ORDER BY ip.invoice_id, ip.created_at, ip.id
  LOOP
    INSERT INTO public.invoice_payments (
      invoice_id, payout_id, consignor_id, payment_type, amount,
      paid_date, actor_id, reference, notes, reverses_payment_id
    ) VALUES (
      v_payment.invoice_id,
      p_payout_id,
      v_payment.consignor_id,
      'reversal',
      -v_payment.amount,
      CURRENT_DATE,
      auth.uid(),
      v_payout.payment_reference,
      'Reversal for voided payout: ' || TRIM(p_reason),
      v_payment.id
    );
  END LOOP;

  FOR v_invoice_id IN
    SELECT DISTINCT ip.invoice_id
    FROM public.invoice_payments ip
    WHERE ip.payout_id = p_payout_id
    ORDER BY ip.invoice_id
  LOOP
    SELECT ROUND(COALESCE(SUM(ip.amount), 0), 2)
    INTO v_amount_paid
    FROM public.invoice_payments ip
    WHERE ip.invoice_id = v_invoice_id;

    UPDATE public.invoices i
    SET amount_paid = v_amount_paid,
        status = CASE
          WHEN v_amount_paid <= 0 THEN 'unpaid'
          WHEN v_amount_paid + 0.009 >= i.total THEN 'paid'
          ELSE 'partially_paid'
        END,
        paid_at = CASE WHEN v_amount_paid + 0.009 >= i.total THEN i.paid_at ELSE NULL END,
        updated_at = v_now
    WHERE i.id = v_invoice_id;
  END LOOP;

  UPDATE public.booth_rent_payments brp
  SET reversed_at = v_now,
      reversed_by = auth.uid()
  WHERE brp.source_payout_id = p_payout_id
    AND brp.reversed_at IS NULL;

  UPDATE public.marketing_fee_allocations mfa
  SET deducted_payout_id = NULL,
      deducted_at = NULL,
      deduction_reversed_at = v_now,
      deduction_reversed_by = auth.uid()
  WHERE mfa.deducted_payout_id = p_payout_id;

  UPDATE public.vendor_ledger_entries vle
  SET deducted_payout_id = NULL,
      deducted_at = NULL,
      deduction_reversed_at = v_now,
      deduction_reversed_by = auth.uid()
  WHERE vle.deducted_payout_id = p_payout_id;

  PERFORM set_config('app.allow_payout_void', 'on', TRUE);
  UPDATE public.payouts p
  SET status = 'voided',
      voided_at = v_now,
      voided_by = auth.uid(),
      updated_at = v_now
  WHERE p.id = p_payout_id;

  RETURN v_reversal_id;
END;
$$;

REVOKE ALL ON FUNCTION public.void_payout(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.void_payout(UUID, TEXT)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_payout_statement(p_payout_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payout public.payouts%ROWTYPE;
  v_vendor JSONB;
  v_allocations JSONB;
  v_adjustments JSONB;
  v_invoice_payments JSONB;
  v_reversal JSONB;
BEGIN
  SELECT * INTO v_payout FROM public.payouts p WHERE p.id = p_payout_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payout not found.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (public.is_admin() OR COALESCE(auth.role(), '') = 'service_role') AND NOT (
    COALESCE(public.get_user_role(), '') = 'vendor'
    AND COALESCE(public.get_user_consignor_id() = v_payout.consignor_id, FALSE)
  ) THEN
    RAISE EXCEPTION 'Not authorized to view this payout statement.'
      USING ERRCODE = '42501';
  END IF;

  SELECT JSONB_BUILD_OBJECT(
    'id', c.id,
    'consignor_number', c.consignor_number,
    'name', c.name,
    'business_name', c.business_name,
    'pay_to_name', CASE
      WHEN c.pay_to_type = 'individual' THEN COALESCE(
        NULLIF(TRIM(CONCAT_WS(' ', c.first_name, c.last_name)), ''),
        NULLIF(c.business_name, ''), c.name
      )
      ELSE COALESCE(
        NULLIF(c.business_name, ''),
        NULLIF(TRIM(CONCAT_WS(' ', c.first_name, c.last_name)), ''), c.name
      )
    END
  ) INTO v_vendor
  FROM public.consignors c
  WHERE c.id = v_payout.consignor_id;

  SELECT COALESCE(JSONB_AGG(TO_JSONB(psa) ORDER BY psa.sale_timestamp, psa.sale_id, psa.sale_item_id), '[]'::JSONB)
  INTO v_allocations
  FROM public.payout_sale_allocations psa
  WHERE psa.payout_id = p_payout_id;

  SELECT COALESCE(JSONB_AGG(TO_JSONB(pa) ORDER BY pa.created_at, pa.id), '[]'::JSONB)
  INTO v_adjustments
  FROM public.payout_adjustments pa
  WHERE pa.payout_id = p_payout_id;

  SELECT COALESCE(JSONB_AGG(JSONB_BUILD_OBJECT(
    'id', ip.id,
    'invoice_id', ip.invoice_id,
    'invoice_number', UPPER(LEFT(ip.invoice_id::TEXT, 8)),
    'payment_type', ip.payment_type,
    'amount', ip.amount,
    'paid_date', ip.paid_date,
    'reference', ip.reference,
    'notes', ip.notes,
    'created_at', ip.created_at,
    'invoice_total', i.total,
    'invoice_status', i.status
  ) ORDER BY ip.paid_date, ip.created_at, ip.id), '[]'::JSONB)
  INTO v_invoice_payments
  FROM public.invoice_payments ip
  JOIN public.invoices i ON i.id = ip.invoice_id
  WHERE ip.payout_id = p_payout_id;

  SELECT TO_JSONB(pr) INTO v_reversal
  FROM public.payout_reversals pr
  WHERE pr.payout_id = p_payout_id;

  RETURN JSONB_BUILD_OBJECT(
    'payout', TO_JSONB(v_payout),
    'vendor', v_vendor,
    'allocations', v_allocations,
    'adjustments', v_adjustments,
    'invoice_payments', v_invoice_payments,
    'reversal', v_reversal,
    'is_exact', v_payout.historical_confidence IN ('verified', 'reconciled')
      AND JSONB_ARRAY_LENGTH(v_allocations) > 0
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_payout_statement(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_payout_statement(UUID)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_invoice_workspace(p_invoice_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_items JSONB;
  v_payments JSONB;
  v_vendor JSONB;
BEGIN
  SELECT * INTO v_invoice FROM public.invoices i WHERE i.id = p_invoice_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (public.is_admin() OR COALESCE(auth.role(), '') = 'service_role') AND NOT (
    COALESCE(public.get_user_role(), '') = 'vendor'
    AND v_invoice.recipient_type = 'vendor'
    AND COALESCE(public.get_user_consignor_id() = v_invoice.consignor_id, FALSE)
  ) THEN
    RAISE EXCEPTION 'Not authorized to view this invoice.' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(JSONB_AGG(TO_JSONB(ii) ORDER BY ii.created_at, ii.id), '[]'::JSONB)
  INTO v_items
  FROM public.invoice_items ii
  WHERE ii.invoice_id = p_invoice_id;

  SELECT COALESCE(JSONB_AGG(JSONB_BUILD_OBJECT(
    'id', ip.id,
    'payout_id', ip.payout_id,
    'payment_type', ip.payment_type,
    'amount', ip.amount,
    'paid_date', ip.paid_date,
    'actor_id', ip.actor_id,
    'reference', ip.reference,
    'notes', ip.notes,
    'reverses_payment_id', ip.reverses_payment_id,
    'created_at', ip.created_at
  ) ORDER BY ip.paid_date DESC, ip.created_at DESC, ip.id DESC), '[]'::JSONB)
  INTO v_payments
  FROM public.invoice_payments ip
  WHERE ip.invoice_id = p_invoice_id;

  SELECT CASE WHEN c.id IS NULL THEN NULL ELSE JSONB_BUILD_OBJECT(
    'id', c.id,
    'consignor_number', c.consignor_number,
    'name', c.name,
    'business_name', c.business_name,
    'current_payable', public.get_vendor_payable_at(c.id, NOW())
  ) END
  INTO v_vendor
  FROM public.consignors c
  WHERE c.id = v_invoice.consignor_id;

  RETURN JSONB_BUILD_OBJECT(
    'invoice', TO_JSONB(v_invoice),
    'items', v_items,
    'payments', v_payments,
    'vendor', v_vendor
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_invoice_workspace(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_invoice_workspace(UUID)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Historical conversion and deterministic reconciliation
-- ---------------------------------------------------------------------------

INSERT INTO public.invoice_payments (
  invoice_id, payout_id, consignor_id, payment_type, amount,
  paid_date, actor_id, reference, notes, created_at
)
SELECT
  ipd.invoice_id,
  ipd.payout_id,
  ipd.consignor_id,
  'payout_funded',
  ROUND(ipd.amount, 2),
  COALESCE(p.payment_date, p.paid_at::DATE, ipd.created_at::DATE),
  p.paid_by,
  p.payment_reference,
  'Backfilled from invoice_payout_deductions',
  ipd.created_at
FROM public.invoice_payout_deductions ipd
JOIN public.payouts p ON p.id = ipd.payout_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.invoice_payments existing
  WHERE existing.invoice_id = ipd.invoice_id
    AND existing.payout_id = ipd.payout_id
    AND existing.payment_type = 'payout_funded'
    AND existing.amount = ipd.amount
);

INSERT INTO public.invoice_payments (
  invoice_id, consignor_id, payment_type, amount, paid_date,
  actor_id, notes, created_at
)
SELECT
  i.id,
  i.consignor_id,
  'legacy_direct',
  ROUND(i.amount_paid - COALESCE(recorded.total, 0), 2),
  COALESCE(i.paid_at::DATE, i.updated_at::DATE, i.created_at::DATE),
  NULL,
  'Legacy direct payment backfilled from the historical invoice aggregate.',
  COALESCE(i.paid_at, i.updated_at, i.created_at, NOW())
FROM public.invoices i
LEFT JOIN LATERAL (
  SELECT SUM(ip.amount) AS total
  FROM public.invoice_payments ip
  WHERE ip.invoice_id = i.id
) recorded ON TRUE
WHERE ROUND(i.amount_paid - COALESCE(recorded.total, 0), 2) > 0;

DO $$
DECLARE
  v_vendor RECORD;
  v_payout RECORD;
  v_source_payout_id UUID;
  v_remaining NUMERIC;
  v_is_range BOOLEAN;
  v_includes_carry BOOLEAN;
BEGIN
  FOR v_vendor IN SELECT c.id FROM public.consignors c LOOP
    v_source_payout_id := NULL;
    v_remaining := 0;

    FOR v_payout IN
      SELECT p.*
      FROM public.payouts p
      WHERE p.consignor_id = v_vendor.id
        AND p.status = 'paid'
      ORDER BY p.paid_at, p.id
    LOOP
      IF NOT COALESCE(v_payout.is_partial, FALSE) THEN
        v_is_range := COALESCE(v_payout.notes, '') LIKE '[Range Payout:%';
        v_includes_carry := COALESCE(v_payout.notes, '') LIKE '%[Deferred Carryover Included]%';
        IF NOT v_is_range OR v_includes_carry THEN
          v_source_payout_id := NULL;
          v_remaining := 0;
        END IF;
      ELSIF COALESCE(v_payout.balance_disposition, 'deferred') = 'deferred' THEN
        v_remaining := ROUND(GREATEST(
          COALESCE(v_payout.original_amount_due, v_payout.amount) - v_payout.amount,
          0
        ), 2);
        v_source_payout_id := CASE WHEN v_remaining > 0 THEN v_payout.id ELSE NULL END;
      ELSE
        v_source_payout_id := NULL;
        v_remaining := 0;
      END IF;
    END LOOP;

    IF v_source_payout_id IS NOT NULL AND v_remaining > 0 THEN
      INSERT INTO public.payout_legacy_balances (
        consignor_id, source_payout_id, original_amount, explanation, confidence
      ) VALUES (
        v_vendor.id,
        v_source_payout_id,
        v_remaining,
        'Structured from the latest determinable deferred partial-payout balance.',
        'legacy_unverified'
      ) ON CONFLICT (source_payout_id) DO NOTHING;
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  v_payout public.payouts%ROWTYPE;
  v_gross NUMERIC;
  v_vendor_cut NUMERIC;
  v_store_share NUMERIC;
  v_card_fees NUMERIC;
  v_cash NUMERIC;
  v_items INTEGER;
  v_sales INTEGER;
  v_deductions NUMERIC;
  v_candidate_count INTEGER;
BEGIN
  PERFORM set_config('app.allow_payout_void', 'on', TRUE);
  PERFORM set_config('app.allow_payout_reconciliation', 'on', TRUE);

  FOR v_payout IN
    SELECT p.*
    FROM public.payouts p
    WHERE p.status = 'paid'
      AND p.historical_confidence = 'legacy_unverified'
    ORDER BY p.paid_at, p.id
  LOOP
    IF COALESCE(v_payout.is_partial, FALSE) THEN
      UPDATE public.payouts
      SET reconciliation_explanation = 'Partial historical payout cannot be linked deterministically.'
      WHERE id = v_payout.id;
      CONTINUE;
    END IF;

    SELECT
      COUNT(*),
      ROUND(COALESCE(SUM(
        f.net_line_amount * (f.quantity - f.refunded_quantity)::NUMERIC / NULLIF(f.quantity, 0)
      ), 0), 2),
      ROUND(COALESCE(SUM(f.final_vendor_cut), 0), 2),
      ROUND(COALESCE(SUM(
        (f.net_line_amount * (f.quantity - f.refunded_quantity)::NUMERIC / NULLIF(f.quantity, 0))
        - f.vendor_earnings_before_fees
      ), 0), 2),
      ROUND(COALESCE(SUM(f.allocated_card_fee), 0), 2),
      COALESCE(SUM(f.quantity - f.refunded_quantity), 0)::INTEGER,
      COUNT(DISTINCT f.sale_id)::INTEGER
    INTO v_candidate_count, v_gross, v_vendor_cut, v_store_share, v_card_fees, v_items, v_sales
    FROM public.get_payout_sale_financials(v_payout.consignor_id, v_payout.paid_at) f
    WHERE f.sale_timestamp
        >= DATE_TRUNC('milliseconds', COALESCE(v_payout.period_start, v_payout.paid_at))
      AND f.sale_timestamp
        < DATE_TRUNC('milliseconds', LEAST(COALESCE(v_payout.period_end, v_payout.paid_at), v_payout.paid_at))
          + INTERVAL '1 millisecond'
      AND NOT EXISTS (
        SELECT 1
        FROM public.payout_sale_allocations existing
        JOIN public.payouts owner ON owner.id = existing.payout_id
        WHERE existing.sale_item_id = f.sale_item_id
          AND owner.status = 'paid'
          AND owner.historical_confidence IN ('verified', 'reconciled')
      );

    v_deductions := ROUND(
      COALESCE(v_payout.booth_rent_deduction, 0)
      + COALESCE(v_payout.marketing_fee_deduction, 0)
      + COALESCE(v_payout.ledger_deduction, 0)
      + COALESCE(v_payout.invoice_deduction, 0),
      2
    );
    v_cash := ROUND(v_vendor_cut - v_deductions, 2);

    IF v_candidate_count > 0
       AND ABS(v_gross - COALESCE(v_payout.gross_sales, 0)) <= 0.01
       AND ABS(v_store_share - COALESCE(v_payout.store_share, 0)) <= 0.01
       AND ABS(v_card_fees - COALESCE(v_payout.credit_card_fees, 0)) <= 0.01
       AND ABS(v_cash - COALESCE(v_payout.amount, 0)) <= 0.01
       AND v_items = COALESCE(v_payout.items_sold, 0)
       AND v_sales = COALESCE(v_payout.sales_count, 0)
    THEN
      INSERT INTO public.payout_sale_allocations (
        payout_id, sale_id, sale_item_id, consignor_id, sale_timestamp,
        sku, item_name, quantity, refunded_quantity, unit_price,
        gross_line_amount, item_discount, allocated_order_discount, net_line_amount,
        commission_percentage, vendor_earnings_before_fees, allocated_card_fee,
        final_vendor_cut, amount_settled, remaining_amount_after
      )
      SELECT
        v_payout.id, f.sale_id, f.sale_item_id, f.consignor_id, f.sale_timestamp,
        f.sku, f.item_name, f.quantity, f.refunded_quantity, f.unit_price,
        f.gross_line_amount, f.item_discount, f.allocated_order_discount, f.net_line_amount,
        f.commission_percentage, f.vendor_earnings_before_fees, f.allocated_card_fee,
        f.final_vendor_cut, f.final_vendor_cut, 0
      FROM public.get_payout_sale_financials(v_payout.consignor_id, v_payout.paid_at) f
      WHERE f.sale_timestamp
          >= DATE_TRUNC('milliseconds', COALESCE(v_payout.period_start, v_payout.paid_at))
        AND f.sale_timestamp
          < DATE_TRUNC('milliseconds', LEAST(COALESCE(v_payout.period_end, v_payout.paid_at), v_payout.paid_at))
            + INTERVAL '1 millisecond'
        AND f.final_vendor_cut > 0
        AND NOT EXISTS (
          SELECT 1
          FROM public.payout_sale_allocations existing
          JOIN public.payouts owner ON owner.id = existing.payout_id
          WHERE existing.sale_item_id = f.sale_item_id
            AND owner.status = 'paid'
            AND owner.historical_confidence IN ('verified', 'reconciled')
        );

      UPDATE public.payouts
      SET historical_confidence = 'reconciled',
          reconciliation_explanation = 'Historical period matched saved sales, store share, fees, counts, deductions, and payout within one cent.',
          updated_at = NOW()
      WHERE id = v_payout.id;
    ELSE
      UPDATE public.payouts
      SET reconciliation_explanation = CONCAT_WS(' ',
        'Exact historical allocation unavailable.',
        'Candidate items:', v_candidate_count::TEXT || ';',
        'candidate cash:', TO_CHAR(v_cash, 'FM999999990.00') || ';',
        'saved cash:', TO_CHAR(COALESCE(v_payout.amount, 0), 'FM999999990.00') || '.'
      ),
      updated_at = NOW()
      WHERE id = v_payout.id;
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.get_payout_reconciliation_report()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_summary JSONB;
  v_unresolved JSONB;
BEGIN
  IF NOT (public.is_admin() OR COALESCE(auth.role(), '') = 'service_role') THEN
    RAISE EXCEPTION 'Admin access is required for reconciliation reporting.'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(JSONB_AGG(JSONB_BUILD_OBJECT(
    'confidence', grouped.historical_confidence,
    'count', grouped.payout_count,
    'total_amount', grouped.total_amount
  ) ORDER BY grouped.historical_confidence), '[]'::JSONB)
  INTO v_summary
  FROM (
    SELECT
      p.historical_confidence,
      COUNT(*) AS payout_count,
      ROUND(SUM(p.amount), 2) AS total_amount
    FROM public.payouts p
    WHERE p.status IN ('paid', 'voided')
    GROUP BY p.historical_confidence
  ) grouped;

  SELECT COALESCE(JSONB_AGG(JSONB_BUILD_OBJECT(
    'payout_id', p.id,
    'consignor_id', p.consignor_id,
    'vendor_name', c.name,
    'paid_at', p.paid_at,
    'amount', p.amount,
    'explanation', p.reconciliation_explanation
  ) ORDER BY p.paid_at, p.id), '[]'::JSONB)
  INTO v_unresolved
  FROM public.payouts p
  JOIN public.consignors c ON c.id = p.consignor_id
  WHERE p.historical_confidence = 'legacy_unverified';

  RETURN JSONB_BUILD_OBJECT('summary', v_summary, 'unresolved', v_unresolved);
END;
$$;

REVOKE ALL ON FUNCTION public.get_payout_reconciliation_report() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_payout_reconciliation_report()
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Financial RLS and least-privilege grants
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_consignor_payout_threshold()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.payout_threshold_override IS DISTINCT FROM OLD.payout_threshold_override
     AND NOT (public.is_admin() OR COALESCE(auth.role(), '') = 'service_role') THEN
    RAISE EXCEPTION 'Only administrators can change payout thresholds.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_consignor_payout_threshold ON public.consignors;
CREATE TRIGGER guard_consignor_payout_threshold
BEFORE UPDATE OF payout_threshold_override ON public.consignors
FOR EACH ROW EXECUTE FUNCTION public.guard_consignor_payout_threshold();

ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_sale_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_reversals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_legacy_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_payout_deductions ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  v_policy RECORD;
BEGIN
  FOR v_policy IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY(ARRAY[
        'payouts', 'payout_settings', 'payout_sale_allocations',
        'payout_adjustments', 'invoice_payments', 'payout_reversals',
        'payout_legacy_balances', 'invoices', 'invoice_items',
        'invoice_payout_deductions'
      ])
  LOOP
    EXECUTE FORMAT('DROP POLICY IF EXISTS %I ON %I.%I',
      v_policy.policyname, v_policy.schemaname, v_policy.tablename);
  END LOOP;
END $$;

CREATE POLICY "Admins and vendors read scoped payouts"
ON public.payouts FOR SELECT TO authenticated
USING (
  (SELECT public.is_admin())
  OR (
    (SELECT public.get_user_role()) = 'vendor'
    AND consignor_id = (SELECT public.get_user_consignor_id())
  )
);

CREATE POLICY "Admins manage payout settings"
ON public.payout_settings FOR ALL TO authenticated
USING ((SELECT public.is_admin()))
WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY "Authenticated financial users read payout settings"
ON public.payout_settings FOR SELECT TO authenticated
USING ((SELECT public.get_user_role()) IN ('admin', 'vendor'));

CREATE POLICY "Admins and vendors read scoped payout allocations"
ON public.payout_sale_allocations FOR SELECT TO authenticated
USING (
  (SELECT public.is_admin())
  OR (
    (SELECT public.get_user_role()) = 'vendor'
    AND consignor_id = (SELECT public.get_user_consignor_id())
  )
);

CREATE POLICY "Admins and vendors read scoped payout adjustments"
ON public.payout_adjustments FOR SELECT TO authenticated
USING (
  (SELECT public.is_admin())
  OR (
    (SELECT public.get_user_role()) = 'vendor'
    AND consignor_id = (SELECT public.get_user_consignor_id())
  )
);

CREATE POLICY "Admins and vendors read scoped invoice payments"
ON public.invoice_payments FOR SELECT TO authenticated
USING (
  (SELECT public.is_admin())
  OR (
    (SELECT public.get_user_role()) = 'vendor'
    AND consignor_id = (SELECT public.get_user_consignor_id())
  )
);

CREATE POLICY "Admins and vendors read scoped payout reversals"
ON public.payout_reversals FOR SELECT TO authenticated
USING (
  (SELECT public.is_admin())
  OR (
    (SELECT public.get_user_role()) = 'vendor'
    AND consignor_id = (SELECT public.get_user_consignor_id())
  )
);

CREATE POLICY "Admins and vendors read scoped legacy balances"
ON public.payout_legacy_balances FOR SELECT TO authenticated
USING (
  (SELECT public.is_admin())
  OR (
    (SELECT public.get_user_role()) = 'vendor'
    AND consignor_id = (SELECT public.get_user_consignor_id())
  )
);

CREATE POLICY "Admins manage invoices"
ON public.invoices FOR ALL TO authenticated
USING ((SELECT public.is_admin()))
WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY "Vendors read own invoices"
ON public.invoices FOR SELECT TO authenticated
USING (
  (SELECT public.get_user_role()) = 'vendor'
  AND recipient_type = 'vendor'
  AND consignor_id = (SELECT public.get_user_consignor_id())
);

CREATE POLICY "Admins manage invoice items"
ON public.invoice_items FOR ALL TO authenticated
USING ((SELECT public.is_admin()))
WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY "Vendors read own invoice items"
ON public.invoice_items FOR SELECT TO authenticated
USING (
  (SELECT public.get_user_role()) = 'vendor'
  AND EXISTS (
    SELECT 1
    FROM public.invoices i
    WHERE i.id = invoice_items.invoice_id
      AND i.recipient_type = 'vendor'
      AND i.consignor_id = (SELECT public.get_user_consignor_id())
  )
);

CREATE POLICY "Admins read legacy invoice payout deductions"
ON public.invoice_payout_deductions FOR SELECT TO authenticated
USING ((SELECT public.is_admin()));

CREATE POLICY "Vendors read own legacy invoice payout deductions"
ON public.invoice_payout_deductions FOR SELECT TO authenticated
USING (
  (SELECT public.get_user_role()) = 'vendor'
  AND consignor_id = (SELECT public.get_user_consignor_id())
);

REVOKE ALL ON TABLE public.payouts FROM anon, authenticated;
REVOKE ALL ON TABLE public.payout_settings FROM anon, authenticated;
REVOKE ALL ON TABLE public.payout_sale_allocations FROM anon, authenticated;
REVOKE ALL ON TABLE public.payout_adjustments FROM anon, authenticated;
REVOKE ALL ON TABLE public.invoice_payments FROM anon, authenticated;
REVOKE ALL ON TABLE public.payout_reversals FROM anon, authenticated;
REVOKE ALL ON TABLE public.payout_legacy_balances FROM anon, authenticated;
REVOKE ALL ON TABLE public.invoices FROM anon, authenticated;
REVOKE ALL ON TABLE public.invoice_items FROM anon, authenticated;
REVOKE ALL ON TABLE public.invoice_payout_deductions FROM anon, authenticated;

GRANT SELECT ON TABLE public.payouts TO authenticated;
GRANT SELECT, UPDATE ON TABLE public.payout_settings TO authenticated;
GRANT SELECT ON TABLE public.payout_sale_allocations TO authenticated;
GRANT SELECT ON TABLE public.payout_adjustments TO authenticated;
GRANT SELECT ON TABLE public.invoice_payments TO authenticated;
GRANT SELECT ON TABLE public.payout_reversals TO authenticated;
GRANT SELECT ON TABLE public.payout_legacy_balances TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.invoices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.invoice_items TO authenticated;
GRANT SELECT ON TABLE public.invoice_payout_deductions TO authenticated;

GRANT ALL ON TABLE public.payouts, public.payout_settings,
  public.payout_sale_allocations, public.payout_adjustments,
  public.invoice_payments, public.payout_reversals,
  public.payout_legacy_balances, public.invoices, public.invoice_items,
  public.invoice_payout_deductions TO service_role;

COMMENT ON TABLE public.payout_sale_allocations IS
  'Immutable sale-item evidence for draft, paid, and voided payout statements.';
COMMENT ON TABLE public.payout_adjustments IS
  'Signed immutable snapshot of every non-sale amount applied to a payout.';
COMMENT ON TABLE public.invoice_payments IS
  'Append-only direct, payout-funded, legacy, and reversal invoice payment ledger.';
COMMENT ON COLUMN public.payouts.payable_before_invoices_snapshot IS
  'Threshold basis after required affordable deductions and before optional invoice applications.';
