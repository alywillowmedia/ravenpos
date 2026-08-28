BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(31);
SELECT set_config('request.jwt.claim.role', 'service_role', TRUE);

INSERT INTO public.consignors (
  id, consignor_number, name, business_name, commission_split,
  consignor_pays_card_fee, payout_threshold_override, is_active
) VALUES
  ('11111111-1111-1111-1111-111111111111', 'TEST-1', 'Vendor One', 'Vendor One Studio', 0.60, TRUE, 1, TRUE),
  ('22222222-2222-2222-2222-222222222222', 'TEST-2', 'Vendor Two', 'Vendor Two Studio', 0.70, FALSE, 1, TRUE);

INSERT INTO public.sales (
  id, completed_at, subtotal, tax_amount, total, payment_method,
  discount_total, payment_breakdown
) VALUES (
  '33333333-3333-3333-3333-333333333333', '2026-01-05 12:00:00+00',
  30.03, 0, 30.00, 'split', 0.03,
  '[{"method":"card","amount":15},{"method":"cash","amount":15}]'::jsonb
);

INSERT INTO public.sale_items (
  id, sale_id, consignor_id, sku, name, price, quantity,
  commission_split, discount_amount, consignor_pays_card_fee
) VALUES
  ('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'V1-ITEM', 'Vendor One Item', 10.01, 1, 0.60, 0, TRUE),
  ('55555555-5555-5555-5555-555555555555', '33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'V2-ITEM', 'Vendor Two Item', 20.02, 1, 0.70, 0, FALSE);

SELECT is(
  (SELECT ROUND(SUM(allocated_order_discount), 2) FROM public.get_payout_sale_financials('11111111-1111-1111-1111-111111111111', NOW()) WHERE sale_id = '33333333-3333-3333-3333-333333333333'),
  0.01::numeric,
  'vendor one receives its deterministic share of a cross-vendor order discount'
);
SELECT is(
  (SELECT allocated_order_discount FROM public.get_payout_sale_financials('22222222-2222-2222-2222-222222222222', NOW()) WHERE sale_item_id = '55555555-5555-5555-5555-555555555555'),
  0.02::numeric,
  'cross-vendor discount remainder is distributed deterministically'
);
SELECT is(
  (SELECT allocated_card_fee FROM public.get_payout_sale_financials('11111111-1111-1111-1111-111111111111', NOW()) WHERE sale_item_id = '44444444-4444-4444-4444-444444444444'),
  0.15::numeric,
  'split-tender card fee is allocated in cents to the responsible vendor item'
);
SELECT is(
  (SELECT allocated_card_fee FROM public.get_payout_sale_financials('22222222-2222-2222-2222-222222222222', NOW()) WHERE sale_item_id = '55555555-5555-5555-5555-555555555555'),
  0.00::numeric,
  'vendor item that does not own card fees is not charged'
);
SELECT is(
  (SELECT final_vendor_cut FROM public.get_payout_sale_financials('11111111-1111-1111-1111-111111111111', NOW()) WHERE sale_item_id = '44444444-4444-4444-4444-444444444444'),
  5.85::numeric,
  'sale-time commission and card fee snapshots produce the exact vendor cut'
);

INSERT INTO public.invoices (
  id, recipient_type, consignor_id, recipient_name, subtotal, total
) VALUES (
  '66666666-6666-6666-6666-666666666666', 'vendor',
  '11111111-1111-1111-1111-111111111111', 'Vendor One', 2, 2
);

INSERT INTO public.payouts (
  id, consignor_id, amount, period_start, period_end, paid_at, status,
  historical_confidence
) VALUES (
  '77777777-7777-7777-7777-777777777777',
  '11111111-1111-1111-1111-111111111111', 0, NOW(), NOW(), NULL,
  'draft', 'verified'
);

SELECT lives_ok($$
  SELECT public.save_payout_draft(
    '11111111-1111-1111-1111-111111111111',
    '77777777-7777-7777-7777-777777777777',
    'all_outstanding', NULL, NULL, TRUE, NULL, NULL, NULL, NULL
  )
$$, 'draft creation snapshots sales and preselects invoices atomically');
SELECT is((SELECT amount FROM public.payouts WHERE id = '77777777-7777-7777-7777-777777777777'), 3.85::numeric, 'oldest invoice application reduces cash payment');
SELECT is((SELECT -amount FROM public.payout_adjustments WHERE payout_id = '77777777-7777-7777-7777-777777777777' AND adjustment_type = 'invoice_deduction'), 2.00::numeric, 'invoice application is an explicit payout adjustment');
SELECT is((SELECT amount_settled FROM public.payout_sale_allocations WHERE payout_id = '77777777-7777-7777-7777-777777777777'), 5.85::numeric, 'draft stores exact sale allocation evidence');
SELECT lives_ok($$
  SELECT public.finalize_payout('77777777-7777-7777-7777-777777777777', 'check', '2026-01-10', 'TEST-CHECK', NULL, NULL)
$$, 'payout finalizes in one atomic RPC');
SELECT is((SELECT status FROM public.payouts WHERE id = '77777777-7777-7777-7777-777777777777'), 'paid', 'finalized payout is paid');
SELECT is((SELECT status FROM public.invoices WHERE id = '66666666-6666-6666-6666-666666666666'), 'paid', 'payout-funded invoice is paid atomically');
SELECT is((SELECT COUNT(*)::integer FROM public.invoice_payments WHERE invoice_id = '66666666-6666-6666-6666-666666666666'), 1, 'payout-funded invoice payment is appended to timeline');
SELECT is((SELECT allocation_status FROM public.get_payout_sale_financials('11111111-1111-1111-1111-111111111111', NOW()) WHERE sale_item_id = '44444444-4444-4444-4444-444444444444'), 'paid', 'sale item transitions to paid from exact allocations');

INSERT INTO public.invoices (
  id, recipient_type, consignor_id, recipient_name, subtotal, total
) VALUES (
  '88888888-8888-8888-8888-888888888888', 'vendor',
  '11111111-1111-1111-1111-111111111111', 'Vendor One', 5, 5
);
SELECT lives_ok($$
  SELECT public.record_invoice_payment('88888888-8888-8888-8888-888888888888', 2, '2026-01-11', 'DIRECT-1', 'Partial payment')
$$, 'direct invoice payment uses append-only RPC');
SELECT is((SELECT status FROM public.invoices WHERE id = '88888888-8888-8888-8888-888888888888'), 'partially_paid', 'direct partial payment derives partially-paid status');
SELECT is((SELECT amount_paid FROM public.invoices WHERE id = '88888888-8888-8888-8888-888888888888'), 2.00::numeric, 'invoice aggregate matches payment timeline');

INSERT INTO public.payouts (
  id, consignor_id, amount, period_start, period_end, paid_at, status,
  historical_confidence
) VALUES (
  '99999999-9999-9999-9999-999999999999',
  '22222222-2222-2222-2222-222222222222', 0, NOW(), NOW(), NULL,
  'draft', 'verified'
);

SELECT lives_ok($$
  SELECT public.save_payout_draft(
    '22222222-2222-2222-2222-222222222222',
    '99999999-9999-9999-9999-999999999999',
    'all_outstanding', NULL, NULL, TRUE, 5, '[]'::jsonb, NULL, NULL
  )
$$, 'partial payout draft allocates FIFO without forgiving remainder');
SELECT is((SELECT remaining_amount_after FROM public.payout_sale_allocations WHERE payout_id = '99999999-9999-9999-9999-999999999999'), 9.00::numeric, 'partial allocation preserves exact unpaid remainder');
SELECT lives_ok($$
  SELECT public.finalize_payout('99999999-9999-9999-9999-999999999999', 'ach', '2026-01-10', NULL, NULL, NULL)
$$, 'partial payout finalizes successfully');
SELECT is((SELECT allocation_status FROM public.get_payout_sale_financials('22222222-2222-2222-2222-222222222222', NOW()) WHERE sale_item_id = '55555555-5555-5555-5555-555555555555'), 'partially_paid', 'sale item transitions to partially paid');

SELECT is(
  ((public.get_vendor_payout_workspace('22222222-2222-2222-2222-222222222222', '2026-01-10', '2026-01-31'))->'summary'->>'opening_balance')::numeric,
  14.00::numeric,
  'report-mode opening balance retains older unpaid sale activity'
);
SELECT is(
  ((public.get_vendor_payout_workspace('22222222-2222-2222-2222-222222222222', '2026-01-10', '2026-01-31'))->'summary'->>'current_payable')::numeric,
  9.00::numeric,
  'report range does not hide the current unpaid remainder'
);

SELECT lives_ok($$ SELECT public.void_payout('77777777-7777-7777-7777-777777777777', 'Test correction') $$, 'void creates reversal evidence');
SELECT is((SELECT status FROM public.payouts WHERE id = '77777777-7777-7777-7777-777777777777'), 'voided', 'void never silently edits history to another paid amount');
SELECT is((SELECT COALESCE(SUM(amount), 0) FROM public.invoice_payments WHERE invoice_id = '66666666-6666-6666-6666-666666666666'), 0.00::numeric, 'void appends an offsetting invoice payment reversal');

INSERT INTO public.consignors (
  id, consignor_number, name, business_name, commission_split,
  consignor_pays_card_fee, payout_threshold_override, is_active
) VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'TEST-MS',
  'Boundary Vendor', 'Boundary Vendor Studio', 1, FALSE, 1, TRUE
);

INSERT INTO public.sales (
  id, completed_at, subtotal, tax_amount, total, payment_method,
  discount_total, payment_breakdown
) VALUES (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  '2026-02-01 12:00:00.123456+00', 10, 0, 10, 'cash', 0,
  '[{"method":"cash","amount":10}]'::jsonb
);

INSERT INTO public.sale_items (
  id, sale_id, consignor_id, sku, name, price, quantity,
  commission_split, discount_amount, consignor_pays_card_fee
) VALUES (
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'BOUNDARY-ITEM', 'Boundary Item', 10, 1, 1, 0, FALSE
);

INSERT INTO public.payouts (
  id, consignor_id, amount, period_start, period_end, paid_at, status,
  historical_confidence
) VALUES (
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 10,
  '2026-02-01 00:00:00+00', '2026-02-01 12:00:00.123+00',
  '2026-02-02 12:00:00+00', 'paid', 'legacy_unverified'
);

SELECT is(
  (SELECT allocation_status
   FROM public.get_payout_sale_financials(
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', NOW()
   )
   WHERE sale_item_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  'legacy_uncertain',
  'legacy boundaries compare at stored millisecond precision'
);
SELECT is(
  public.get_vendor_payable_at('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', NOW()),
  0.00::numeric,
  'sub-millisecond boundary precision cannot create a false payable balance'
);

-- A historical sale range is only an inclusion boundary. Refunds recorded after
-- that boundary must still reduce a draft's current payable allocation, otherwise
-- finalize_payout rejects every refresh of the draft with SQLSTATE 40001.
INSERT INTO public.consignors (
  id, consignor_number, name, business_name, commission_split,
  consignor_pays_card_fee, payout_threshold_override, is_active
) VALUES (
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'TEST-RANGE',
  'Range Vendor', 'Range Vendor Studio', 1, FALSE, 0, TRUE
);

INSERT INTO public.sales (
  id, completed_at, subtotal, tax_amount, total, payment_method,
  discount_total, payment_breakdown, refund_status
) VALUES (
  'ffffffff-ffff-ffff-ffff-ffffffffffff',
  '2026-03-01 12:00:00+00', 20, 0, 20, 'cash', 0,
  '[{"method":"cash","amount":20}]'::jsonb, 'partial'
);

INSERT INTO public.sale_items (
  id, sale_id, consignor_id, sku, name, price, quantity,
  commission_split, discount_amount, consignor_pays_card_fee
) VALUES (
  'eeeeeeee-ffff-eeee-ffff-eeeeeeeeeeee',
  'ffffffff-ffff-ffff-ffff-ffffffffffff',
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  'RANGE-REFUND', 'Range Refund Item', 10, 2, 1, 0, FALSE
);

INSERT INTO public.refunds (
  id, sale_id, refund_amount, payment_method, items, created_at
) VALUES (
  'ffffffff-eeee-ffff-eeee-ffffffffffff',
  'ffffffff-ffff-ffff-ffff-ffffffffffff',
  10, 'cash',
  '[{"sale_item_id":"eeeeeeee-ffff-eeee-ffff-eeeeeeeeeeee","quantity":1,"restocked":true}]'::jsonb,
  '2026-03-02 12:00:00+00'
);

INSERT INTO public.payouts (
  id, consignor_id, amount, period_start, period_end, paid_at, status,
  historical_confidence
) VALUES (
  'eeeeeeee-eeee-ffff-ffff-eeeeeeeeeeee',
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 0, NOW(), NOW(), NULL,
  'draft', 'verified'
);

SELECT lives_ok($$
  SELECT public.save_payout_draft(
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    'eeeeeeee-eeee-ffff-ffff-eeeeeeeeeeee',
    'selected_range', '2026-03-01', '2026-03-01', FALSE,
    NULL, NULL, NULL, NULL
  )
$$, 'historical-range draft refresh uses current refund state');
SELECT is(
  (SELECT amount_settled FROM public.payout_sale_allocations
   WHERE payout_id = 'eeeeeeee-eeee-ffff-ffff-eeeeeeeeeeee'),
  10.00::numeric,
  'post-range refund reduces the current sale allocation'
);
SELECT lives_ok($$
  SELECT public.finalize_payout(
    'eeeeeeee-eeee-ffff-ffff-eeeeeeeeeeee',
    'check', '2026-03-03', 'RANGE-REFUND-TEST', NULL, NULL
  )
$$, 'refreshed historical-range payout finalizes without a false allocation conflict');

SELECT * FROM finish();
ROLLBACK;
