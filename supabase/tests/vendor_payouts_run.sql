BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT * FROM no_plan();
SELECT set_config('request.jwt.claim.role', 'service_role', TRUE);

\set v1 'a0000000-0000-0000-0000-000000000001'
\set v2 'a0000000-0000-0000-0000-000000000002'
\set v3 'a0000000-0000-0000-0000-000000000003'
\set v4 'a0000000-0000-0000-0000-000000000004'

CREATE FUNCTION pg_temp.add_sale(
  p_sale_id UUID, p_item_id UUID, p_consignor_id UUID, p_at TIMESTAMPTZ, p_price NUMERIC
) RETURNS VOID LANGUAGE sql AS $$
  INSERT INTO public.sales (
    id, completed_at, subtotal, tax_amount, total, payment_method,
    discount_total, payment_breakdown
  ) VALUES (
    p_sale_id, p_at, p_price, 0, p_price, 'cash', 0,
    JSONB_BUILD_ARRAY(JSONB_BUILD_OBJECT('method', 'cash', 'amount', p_price))
  );
  INSERT INTO public.sale_items (
    id, sale_id, consignor_id, sku, name, price, quantity,
    commission_split, discount_amount, consignor_pays_card_fee
  ) VALUES (
    p_item_id, p_sale_id, p_consignor_id, 'RUN-' || LEFT(p_item_id::TEXT, 8), 'Run item',
    p_price, 1, 0.60, 0, FALSE
  );
$$;

INSERT INTO public.consignors (
  id, consignor_number, name, business_name, commission_split,
  consignor_pays_card_fee, payout_threshold_override, is_active, email
) VALUES
  (:'v1', 'RUN-1', 'Run One', 'Run One Studio', 0.60, FALSE, 50, TRUE, 'run1@example.test'),
  (:'v2', 'RUN-2', 'Run Two', 'Run Two Studio', 0.60, FALSE, 50, FALSE, NULL),
  (:'v3', 'RUN-3', 'Run Three', 'Run Three Studio', 0.60, FALSE, 1, TRUE, 'run3@example.test'),
  (:'v4', 'RUN-4', 'Run Four', 'Run Four Studio', 0.60, FALSE, NULL, TRUE, 'run4@example.test');

-- Store time is America/New_York (EDT until 2025-11-02, EST after).
SELECT pg_temp.add_sale('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', :'v1',
  '2025-09-15 12:00'::TIMESTAMP AT TIME ZONE 'America/New_York', 100);
SELECT pg_temp.add_sale('b0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', :'v1',
  '2025-10-31 23:00'::TIMESTAMP AT TIME ZONE 'America/New_York', 50);
SELECT pg_temp.add_sale('b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000003', :'v1',
  '2025-11-01 00:30'::TIMESTAMP AT TIME ZONE 'America/New_York', 10);
SELECT pg_temp.add_sale('b0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000004', :'v2',
  '2025-10-10 12:00'::TIMESTAMP AT TIME ZONE 'America/New_York', 20);
SELECT pg_temp.add_sale('b0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000005', :'v3',
  '2025-09-10 12:00'::TIMESTAMP AT TIME ZONE 'America/New_York', 100);
SELECT pg_temp.add_sale('b0000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000006', :'v3',
  '2025-10-10 12:00'::TIMESTAMP AT TIME ZONE 'America/New_York', 50);

SELECT is(public.payout_day_start('2025-11-02'), '2025-11-02 04:00:00+00'::timestamptz, 'store day starts in daylight time');
SELECT is(public.payout_day_end('2025-11-02'), '2025-11-03 05:00:00+00'::timestamptz, 'store day ends in standard time');
SELECT is((SELECT earned FROM public.get_payout_scope_summary(:'v1'::uuid, 'through_date', NULL, '2025-10-31', TRUE)), 90.00::numeric, 'cutoff keeps 11pm on the last day and older sales, drops 12:30am next day');
SELECT is(public.get_vendor_payout_threshold(:'v2'::uuid), 0::numeric, 'inactive vendor has no minimum');
SELECT is(public.get_vendor_payout_threshold(:'v1'::uuid), 50::numeric, 'override wins');
SELECT is(public.get_vendor_payout_threshold(:'v4'::uuid), 100::numeric, 'shop default applies');

-- RUN-1: through-date draft, then narrowed to a selected range.
CREATE TEMP TABLE run_ids (name TEXT PRIMARY KEY, id UUID);
INSERT INTO run_ids
SELECT 'r1', public.save_payout_draft(:'v1'::uuid, NULL, 'through_date', NULL, '2025-10-31', TRUE, NULL, NULL, NULL, NULL);

SELECT is((SELECT amount FROM public.payouts WHERE id = (SELECT id FROM run_ids WHERE name = 'r1')), 90.00::numeric, 'through-date draft amount covers older and cutoff-day sales');
SELECT is((SELECT COUNT(*)::INT FROM public.payout_sale_allocations WHERE payout_id = (SELECT id FROM run_ids WHERE name = 'r1')), 2, 'through-date draft has two allocations');
SELECT is((SELECT source_range_start FROM public.payouts WHERE id = (SELECT id FROM run_ids WHERE name = 'r1')), NULL::date, 'through-date draft has no range start');
SELECT is((SELECT include_prior_balance FROM public.payouts WHERE id = (SELECT id FROM run_ids WHERE name = 'r1')), TRUE, 'through-date draft includes prior balance');
SELECT is((SELECT earned_snapshot FROM public.payouts WHERE id = (SELECT id FROM run_ids WHERE name = 'r1')), 90.00::numeric, 'earned snapshot stored');
SELECT is((SELECT carried_in_snapshot FROM public.payouts WHERE id = (SELECT id FROM run_ids WHERE name = 'r1')), 0.00::numeric, 'carried-in snapshot is zero for a never-paid vendor');
SELECT is(
  (SELECT cutoff_at FROM public.payouts WHERE id = (SELECT id FROM run_ids WHERE name = 'r1')),
  public.payout_day_end('2025-10-31') - INTERVAL '1 microsecond',
  'cutoff is the last microsecond of the store day'
);

SELECT throws_ok(
  $$SELECT public.save_payout_draft('a0000000-0000-0000-0000-000000000001'::uuid, NULL, 'through_date', NULL, NULL, TRUE, NULL, NULL, NULL, NULL)$$,
  '22023', NULL, 'through-date draft needs an end date'
);

SELECT lives_ok(
  $$SELECT public.save_payout_draft('a0000000-0000-0000-0000-000000000001'::uuid, (SELECT id FROM run_ids WHERE name = 'r1'),
    'selected_range', '2025-10-01', '2025-10-31', FALSE, NULL, NULL, NULL, NULL)$$,
  'a through-date draft can be narrowed to a range'
);
SELECT is((SELECT amount FROM public.payouts WHERE id = (SELECT id FROM run_ids WHERE name = 'r1')), 30.00::numeric, 'narrowed draft leaves older money out');

-- RUN-2: inactive vendor pays below the default minimum with no reason.
INSERT INTO run_ids
SELECT 'r2', public.save_payout_draft(:'v2'::uuid, NULL, 'through_date', NULL, '2025-10-31', TRUE, NULL, NULL, NULL, NULL);
SELECT is((SELECT threshold_snapshot FROM public.payouts WHERE id = (SELECT id FROM run_ids WHERE name = 'r2')), 0.00::numeric, 'inactive vendor draft stores a zero minimum');
SELECT lives_ok(
  $$SELECT public.finalize_payout((SELECT id FROM run_ids WHERE name = 'r2'), 'cash', '2025-11-05', NULL, NULL, NULL)$$,
  'inactive vendor finalizes without an override reason'
);

-- RUN-3: partial payout, then carried-in appears.
INSERT INTO run_ids
SELECT 'r3', public.save_payout_draft(:'v3'::uuid, NULL, 'through_date', NULL, '2025-09-30', TRUE, 40, NULL, NULL, NULL);
SELECT lives_ok(
  $$SELECT public.finalize_payout((SELECT id FROM run_ids WHERE name = 'r3'), 'cash', '2025-11-05', NULL, NULL, NULL)$$,
  'partial payout finalizes'
);
SELECT is((SELECT carried_in FROM public.get_payout_scope_summary(:'v3'::uuid, 'through_date', NULL, '2025-10-31', TRUE)), 20.00::numeric, 'unpaid remainder before the last cutoff is carried in');
SELECT is((SELECT earned FROM public.get_payout_scope_summary(:'v3'::uuid, 'through_date', NULL, '2025-10-31', TRUE)), 30.00::numeric, 'newer sales are earned');

SELECT * FROM finish();
ROLLBACK;
