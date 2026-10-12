-- Preview, for every active vendor, the payout that save_payout_draft would
-- build in selected_range mode with the prior balance excluded: only unpaid
-- items sold inside the range, valued against current ledger state, less the
-- required deductions and open invoices that the draft applies automatically.

CREATE OR REPLACE FUNCTION public.get_payout_range_preview(
  p_range_start DATE,
  p_range_end DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_rows JSONB;
BEGIN
  IF NOT (public.is_admin() OR COALESCE(auth.role(), '') = 'service_role') THEN
    RAISE EXCEPTION 'Admin access is required for the payout range preview.'
      USING ERRCODE = '42501';
  END IF;

  IF p_range_start IS NULL OR p_range_end IS NULL OR p_range_start > p_range_end THEN
    RAISE EXCEPTION 'Range previews require a valid start and end date.'
      USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(JSONB_AGG(JSONB_BUILD_OBJECT(
    'consignor_id', r.consignor_id,
    'sales_count', r.sales_count,
    'items_count', r.items_count,
    'range_earnings', r.range_earnings,
    'already_paid', r.already_paid,
    'deductions', r.deductions,
    'invoice_balance', r.invoice_balance,
    'invoices_applied', ROUND(LEAST(r.invoice_balance, GREATEST(r.range_earnings - r.deductions, 0)), 2),
    'estimated_payout', ROUND(GREATEST(r.range_earnings - r.deductions - r.invoice_balance, 0), 2)
  ) ORDER BY r.consignor_number), '[]'::JSONB)
  INTO v_rows
  FROM (
    SELECT
      c.id AS consignor_id,
      c.consignor_number,
      s.sales_count,
      s.items_count,
      s.range_earnings,
      s.already_paid,
      COALESCE((
        SELECT ROUND(SUM(a.amount), 2)
        FROM public.get_vendor_required_adjustments(c.id, s.range_earnings, v_now) a
        WHERE a.will_apply
      ), 0) AS deductions,
      COALESCE((
        SELECT ROUND(SUM(ROUND(GREATEST(i.total - i.amount_paid, 0), 2)), 2)
        FROM public.invoices i
        WHERE i.recipient_type = 'vendor'
          AND i.consignor_id = c.id
          AND i.status IN ('unpaid', 'partially_paid')
      ), 0) AS invoice_balance
    FROM public.consignors c
    CROSS JOIN LATERAL (
      SELECT
        COUNT(DISTINCT f.sale_id) FILTER (WHERE f.eligible)::INTEGER AS sales_count,
        COALESCE(SUM(f.quantity - f.refunded_quantity) FILTER (WHERE f.eligible), 0)::INTEGER AS items_count,
        ROUND(COALESCE(SUM(f.remaining_amount) FILTER (WHERE f.eligible), 0), 2) AS range_earnings,
        ROUND(COALESCE(SUM(f.paid_amount), 0), 2) AS already_paid
      FROM (
        SELECT
          sf.*,
          sf.remaining_amount > 0 AND sf.allocation_status <> 'legacy_uncertain' AS eligible
        FROM public.get_payout_sale_financials(c.id, v_now) sf
        WHERE sf.sale_timestamp >= p_range_start::TIMESTAMPTZ
          AND sf.sale_timestamp < (p_range_end + 1)::TIMESTAMPTZ
      ) f
    ) s
    WHERE c.is_active = TRUE
  ) r;

  RETURN v_rows;
END;
$$;

REVOKE ALL ON FUNCTION public.get_payout_range_preview(DATE, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_payout_range_preview(DATE, DATE)
  TO authenticated, service_role;
