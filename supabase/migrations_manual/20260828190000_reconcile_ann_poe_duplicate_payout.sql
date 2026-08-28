-- One-time administrative reconciliation for Ann Poe's check #2072.
--
-- Payout 88255A24 was finalized at $0.00 with no allocation evidence even
-- though the check included the same $23.99 quilt item already settled on
-- payout 5337BF67. Preserve that first settlement and intentionally record the
-- duplicate payment on 88255A24 so its immutable statement matches the check.
--
-- This migration is deliberately assertion-heavy. Any drift from the exact
-- reviewed production records aborts the statement without partial changes.

DO $reconcile_ann_poe_duplicate_payout$
DECLARE
  v_target_payout_id CONSTANT UUID := '88255a24-61e9-4f73-bf07-66f49f1fd199';
  v_source_payout_id CONSTANT UUID := '5337bf67-16d0-45ed-ad8f-ebf466993d24';
  v_consignor_id CONSTANT UUID := '402395f0-c5ec-4580-82bf-cd7f743a2e1a';
  v_sale_id CONSTANT UUID := 'b72c70ad-d86c-4e33-84ef-2538972d0f23';
  v_sale_item_id CONSTANT UUID := '89719124-ffeb-47c3-b4c8-70f9e806bdd6';
  v_target public.payouts%ROWTYPE;
  v_source public.payout_sale_allocations%ROWTYPE;
  v_evidence_count INTEGER;
  v_paid_amount NUMERIC;
  v_overpayment_amount NUMERIC;
  v_payable_before NUMERIC;
  v_payable_after NUMERIC;
BEGIN
  SELECT p.*
  INTO v_target
  FROM public.payouts p
  WHERE p.id = v_target_payout_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target payout % was not found.', v_target_payout_id;
  END IF;

  SELECT psa.*
  INTO v_source
  FROM public.payout_sale_allocations psa
  JOIN public.payouts p ON p.id = psa.payout_id
  WHERE psa.payout_id = v_source_payout_id
    AND psa.sale_id = v_sale_id
    AND psa.sale_item_id = v_sale_item_id
    AND psa.consignor_id = v_consignor_id
    AND p.consignor_id = v_consignor_id
    AND p.status = 'paid'
  FOR UPDATE OF psa;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expected source allocation was not found on payout %.', v_source_payout_id;
  END IF;

  SELECT COUNT(*)
  INTO v_evidence_count
  FROM public.payout_sale_allocations psa
  WHERE psa.payout_id = v_target_payout_id;

  -- Safe re-run: accept only the exact completed reconciliation.
  IF v_target.status = 'paid'
     AND v_target.consignor_id = v_consignor_id
     AND v_target.amount = 23.99
     AND v_target.items_sold = 1
     AND v_target.sales_count = 1
     AND v_target.historical_confidence = 'reconciled'
     AND v_evidence_count = 1
     AND EXISTS (
       SELECT 1
       FROM public.payout_sale_allocations psa
       WHERE psa.payout_id = v_target_payout_id
         AND psa.sale_item_id = v_sale_item_id
         AND psa.amount_settled = 23.99
         AND psa.remaining_amount_after = 0
     ) THEN
    RAISE NOTICE 'Payout % is already reconciled; no changes made.', v_target_payout_id;
    RETURN;
  END IF;

  IF v_target.consignor_id IS DISTINCT FROM v_consignor_id
     OR v_target.status IS DISTINCT FROM 'paid'
     OR v_target.amount IS DISTINCT FROM 0.00
     OR v_target.items_sold IS DISTINCT FROM 0
     OR v_target.sales_count IS DISTINCT FROM 0
     OR v_target.gross_sales IS DISTINCT FROM 0.00
     OR v_target.store_share IS DISTINCT FROM 0.00
     OR v_target.credit_card_fees IS DISTINCT FROM 0.00
     OR v_target.payment_reference IS DISTINCT FROM '2072'
     OR v_target.payment_date IS DISTINCT FROM DATE '2026-08-15'
     OR v_target.source_range_start IS DISTINCT FROM DATE '2026-07-01'
     OR v_target.source_range_end IS DISTINCT FROM DATE '2026-08-01'
     OR v_target.include_prior_balance IS DISTINCT FROM FALSE
     OR v_target.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'Target payout % no longer matches the reviewed empty paid statement.', v_target_payout_id;
  END IF;

  IF v_evidence_count <> 0
     OR EXISTS (SELECT 1 FROM public.payout_adjustments pa WHERE pa.payout_id = v_target_payout_id)
     OR EXISTS (SELECT 1 FROM public.invoice_payments ip WHERE ip.payout_id = v_target_payout_id)
     OR EXISTS (SELECT 1 FROM public.payout_reversals pr WHERE pr.payout_id = v_target_payout_id) THEN
    RAISE EXCEPTION 'Target payout % now has evidence or reversal records; refusing to reconcile.', v_target_payout_id;
  END IF;

  IF v_source.sku IS DISTINCT FROM 'ann-793-51'
     OR v_source.item_name IS DISTINCT FROM 'Lightweight quilt - 85x55'
     OR v_source.sale_timestamp::DATE IS DISTINCT FROM DATE '2026-07-25'
     OR v_source.quantity IS DISTINCT FROM 1
     OR v_source.refunded_quantity IS DISTINCT FROM 0
     OR v_source.unit_price IS DISTINCT FROM 29.99
     OR v_source.gross_line_amount IS DISTINCT FROM 29.99
     OR v_source.net_line_amount IS DISTINCT FROM 29.99
     OR v_source.commission_percentage IS DISTINCT FROM 80.0000
     OR v_source.vendor_earnings_before_fees IS DISTINCT FROM 23.99
     OR v_source.allocated_card_fee IS DISTINCT FROM 0.00
     OR v_source.final_vendor_cut IS DISTINCT FROM 23.99
     OR v_source.amount_settled IS DISTINCT FROM 23.99
     OR v_source.remaining_amount_after IS DISTINCT FROM 0.00 THEN
    RAISE EXCEPTION 'Source allocation % no longer matches the reviewed $23.99 quilt settlement.', v_source.id;
  END IF;

  SELECT public.get_vendor_payable_at(v_consignor_id, NOW())
  INTO v_payable_before;

  IF v_payable_before < 23.99 THEN
    RAISE EXCEPTION 'Ann Poe payable balance % is too small to absorb the intentional $23.99 duplicate payment.', v_payable_before;
  END IF;

  PERFORM set_config('app.allow_payout_reconciliation', 'on', TRUE);
  PERFORM set_config('app.allow_payout_void', 'on', TRUE);

  INSERT INTO public.payout_sale_allocations (
    payout_id,
    sale_id,
    sale_item_id,
    consignor_id,
    sale_timestamp,
    sku,
    item_name,
    quantity,
    refunded_quantity,
    unit_price,
    gross_line_amount,
    item_discount,
    allocated_order_discount,
    net_line_amount,
    commission_percentage,
    vendor_earnings_before_fees,
    allocated_card_fee,
    final_vendor_cut,
    amount_settled,
    remaining_amount_after
  ) VALUES (
    v_target_payout_id,
    v_source.sale_id,
    v_source.sale_item_id,
    v_source.consignor_id,
    v_source.sale_timestamp,
    v_source.sku,
    v_source.item_name,
    v_source.quantity,
    v_source.refunded_quantity,
    v_source.unit_price,
    v_source.gross_line_amount,
    v_source.item_discount,
    v_source.allocated_order_discount,
    v_source.net_line_amount,
    v_source.commission_percentage,
    v_source.vendor_earnings_before_fees,
    v_source.allocated_card_fee,
    v_source.final_vendor_cut,
    23.99,
    0.00
  );

  UPDATE public.payouts p
  SET amount = 23.99,
      period_start = v_source.sale_timestamp,
      sales_count = 1,
      items_sold = v_source.quantity - v_source.refunded_quantity,
      gross_sales = v_source.gross_line_amount,
      store_share = ROUND(v_source.net_line_amount - v_source.vendor_earnings_before_fees, 2),
      credit_card_fees = v_source.allocated_card_fee,
      payable_before_invoices_snapshot = 23.99,
      original_amount_due = 23.99,
      is_partial = FALSE,
      partial_reason = NULL,
      balance_disposition = NULL,
      historical_confidence = 'reconciled',
      reconciliation_explanation =
        'One-time administrative reconciliation: check #2072 intentionally included a duplicate $23.99 settlement for the July 25 quilt sale item. The original settlement remains on payout #5337BF67.',
      notes = CONCAT_WS(E'\n', NULLIF(TRIM(COALESCE(p.notes, '')), ''),
        'Administrative reconciliation: duplicate $23.99 quilt payment intentionally recorded; original settlement preserved on payout #5337BF67.'),
      updated_at = NOW()
  WHERE p.id = v_target_payout_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target payout % disappeared during reconciliation.', v_target_payout_id;
  END IF;

  SELECT f.paid_amount, f.refund_obligation_amount
  INTO v_paid_amount, v_overpayment_amount
  FROM public.get_payout_sale_financials(v_consignor_id, NOW()) f
  WHERE f.sale_item_id = v_sale_item_id;

  IF v_paid_amount IS DISTINCT FROM 47.98
     OR v_overpayment_amount IS DISTINCT FROM 23.99 THEN
    RAISE EXCEPTION 'Duplicate-payment ledger validation failed: paid %, overpayment %.',
      v_paid_amount, v_overpayment_amount;
  END IF;

  SELECT public.get_vendor_payable_at(v_consignor_id, NOW())
  INTO v_payable_after;

  IF v_payable_after IS DISTINCT FROM ROUND(v_payable_before - 23.99, 2) THEN
    RAISE EXCEPTION 'Vendor payable validation failed: expected %, found %.',
      ROUND(v_payable_before - 23.99, 2), v_payable_after;
  END IF;

  IF (SELECT p.amount FROM public.payouts p WHERE p.id = v_target_payout_id) IS DISTINCT FROM 23.99
     OR (SELECT COUNT(*) FROM public.payout_sale_allocations psa WHERE psa.payout_id = v_target_payout_id) <> 1
     OR (SELECT ROUND(SUM(psa.amount_settled), 2) FROM public.payout_sale_allocations psa WHERE psa.payout_id = v_target_payout_id) IS DISTINCT FROM 23.99 THEN
    RAISE EXCEPTION 'Final payout reconciliation validation failed for %.', v_target_payout_id;
  END IF;
END;
$reconcile_ann_poe_duplicate_payout$;
