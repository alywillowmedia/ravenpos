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

-- ---------------------------------------------------------------------------
-- Run list, batch prepare and discard
-- ---------------------------------------------------------------------------
\set v5 'a0000000-0000-0000-0000-000000000005'
\set v6 'a0000000-0000-0000-0000-000000000006'
\set v7 'a0000000-0000-0000-0000-000000000007'
\set v8 'a0000000-0000-0000-0000-000000000008'
\set v9 'a0000000-0000-0000-0000-000000000009'
\set v10 'a0000000-0000-0000-0000-00000000000a'
\set v11 'a0000000-0000-0000-0000-00000000000b'
\set v12 'a0000000-0000-0000-0000-00000000000c'
\set v13 'a0000000-0000-0000-0000-00000000000d'
\set v14 'a0000000-0000-0000-0000-00000000000e'

INSERT INTO public.consignors (
  id, consignor_number, name, business_name, commission_split,
  consignor_pays_card_fee, payout_threshold_override, is_active, email
) VALUES
  (:'v5', 'RUN-5', 'Run Five', 'Run Five Studio', 0.60, FALSE, 1, TRUE, 'run5@example.test'),
  (:'v6', 'RUN-6', 'Run Six', 'Run Six Studio', 0.60, FALSE, 1, TRUE, 'run6@example.test'),
  (:'v7', 'RUN-7', 'Run Seven', 'Run Seven Studio', 0.60, FALSE, 50, FALSE, NULL),
  (:'v8', 'RUN-8', 'Run Eight', 'Run Eight Studio', 0.60, FALSE, 1, TRUE, 'run8@example.test'),
  (:'v9', 'RUN-9', 'Run Nine', 'Run Nine Studio', 0.60, FALSE, 1, TRUE, 'run9@example.test'),
  (:'v10', 'RUN-10', 'Run Ten', 'Run Ten Studio', 0.60, FALSE, 1, TRUE, 'run10@example.test'),
  (:'v11', 'RUN-11', 'Run Eleven', 'Run Eleven Studio', 0.60, FALSE, 1, TRUE, 'run11@example.test'),
  (:'v12', 'RUN-12', 'Run Twelve', 'Run Twelve Studio', 0.60, FALSE, 100, TRUE, 'run12@example.test'),
  (:'v13', 'RUN-13', 'Run Thirteen', 'Run Thirteen Studio', 0.60, FALSE, 100, TRUE, 'run13@example.test'),
  (:'v14', 'RUN-14', 'Run Fourteen', 'Run Fourteen Studio', 0.60, FALSE, 1, TRUE, 'run14@example.test');

CREATE FUNCTION pg_temp.run_row(p_id UUID, p_through DATE) RETURNS JSONB LANGUAGE sql AS $$
  SELECT r FROM JSONB_ARRAY_ELEMENTS(public.get_payout_run(p_through)->'rows') r
  WHERE r->>'consignor_id' = p_id::TEXT;
$$;

-- RUN-5: ledger charge, vendor invoice and a legacy balance on top of a 100 sale.
SELECT pg_temp.add_sale('b0000000-0000-0000-0000-000000000011', 'c0000000-0000-0000-0000-000000000011', :'v5',
  '2025-08-01 12:00'::TIMESTAMP AT TIME ZONE 'America/New_York', 30);
SELECT pg_temp.add_sale('b0000000-0000-0000-0000-000000000012', 'c0000000-0000-0000-0000-000000000012', :'v5',
  '2025-09-15 12:00'::TIMESTAMP AT TIME ZONE 'America/New_York', 100);
INSERT INTO public.payouts (
  id, consignor_id, amount, period_start, period_end, paid_at, status, historical_confidence
) VALUES (
  '30000000-0000-0000-0000-0000000000a5', :'v5', 10,
  '2025-07-31 00:00:00+00', '2025-08-02 00:00:00+00', '2025-08-03 00:00:00+00', 'paid', 'legacy_unverified'
);
INSERT INTO public.payout_legacy_balances (consignor_id, source_payout_id, original_amount, explanation)
VALUES (:'v5', '30000000-0000-0000-0000-0000000000a5', 7, 'Run fixture legacy balance');
INSERT INTO public.vendor_ledger_entries (consignor_id, description, amount) VALUES (:'v5', 'Run fixture charge', 4);
INSERT INTO public.invoices (recipient_type, consignor_id, recipient_name, total) VALUES ('vendor', :'v5', 'Run Five', 5);

CREATE TEMP TABLE run_before AS SELECT pg_temp.run_row(:'v5'::uuid, '2025-10-31') AS r;

SELECT is(
  (SELECT ARRAY(SELECT k FROM JSONB_OBJECT_KEYS(r) k ORDER BY k) FROM run_before),
  (SELECT ARRAY(SELECT k FROM UNNEST(ARRAY['consignor_id','consignor_number','name','business_name','pay_to_name','email',
    'is_active','threshold','carried_in','earned','booth_rent','other_deductions','invoices_applied',
    'payable_before_invoices','payable','paying_now','status','threshold_remaining','pending_total','pending_count',
    'pending_type','draft_id','draft_through','override_reason','last_paid_at','legacy_item_count','items_count',
    'sales_count','cutoff_at']) k ORDER BY k)),
  'run row has exactly the agreed keys'
);
SELECT is((SELECT (r->>'carried_in')::NUMERIC FROM run_before), 7.00::NUMERIC, 'legacy balance is carried in');
SELECT is((SELECT (r->>'earned')::NUMERIC FROM run_before), 60.00::NUMERIC, 'earned counts the sale after the last paid cutoff');
SELECT is((SELECT (r->>'other_deductions')::NUMERIC FROM run_before), 4.00::NUMERIC, 'ledger charge shows as other deductions');
SELECT is((SELECT (r->>'invoices_applied')::NUMERIC FROM run_before), 5.00::NUMERIC, 'vendor invoice is applied');
SELECT is((SELECT (r->>'payable')::NUMERIC FROM run_before), 58.00::NUMERIC, 'queue payable is sales plus legacy less charge and invoice');
SELECT is((SELECT r->>'status' FROM run_before), 'ready', 'vendor over the minimum is ready');
SELECT cmp_ok((SELECT (r->>'legacy_item_count')::INT FROM run_before), '>', 0, 'legacy-uncertain item is counted');
SELECT is((SELECT (r->>'cutoff_at')::TIMESTAMPTZ FROM run_before), public.payout_day_end('2025-10-31') - INTERVAL '1 microsecond', 'row cutoff is the last microsecond of the store day');

CREATE TEMP TABLE run_prep AS
SELECT public.prepare_payout_run('2025-10-31', ARRAY[:'v5'::uuid]) AS res;
SELECT is(
  (SELECT original_amount_due FROM public.payouts WHERE consignor_id = :'v5' AND status = 'draft'),
  (SELECT (r->>'payable')::NUMERIC FROM run_before),
  'the queue equals the draft'
);
SELECT is((SELECT r->>'status' FROM (SELECT pg_temp.run_row(:'v5'::uuid, '2025-10-31') r) x), 'draft', 'a prepared vendor shows as draft');
SELECT is(
  (SELECT (r->>'payable')::NUMERIC FROM (SELECT pg_temp.run_row(:'v5'::uuid, '2025-10-31') r) x),
  (SELECT original_amount_due FROM public.payouts WHERE consignor_id = :'v5' AND status = 'draft'),
  'draft row payable is the stored figure'
);
SELECT is((SELECT (r->>'carried_in')::NUMERIC FROM (SELECT pg_temp.run_row(:'v5'::uuid, '2025-10-31') r) x), 7.00::NUMERIC, 'draft row reads the carried-in snapshot');
SELECT is((SELECT (r->>'other_deductions')::NUMERIC FROM (SELECT pg_temp.run_row(:'v5'::uuid, '2025-10-31') r) x), 4.00::NUMERIC, 'draft row sums non-rent, non-invoice deductions');
SELECT is((SELECT r->>'draft_through' FROM (SELECT pg_temp.run_row(:'v5'::uuid, '2025-10-31') r) x), '2025-10-31', 'draft_through is the range end');
SELECT is(
  public.get_vendor_payout_preview(:'v5'::uuid, '2025-10-31'),
  pg_temp.run_row(:'v5'::uuid, '2025-10-31'),
  'preview returns the same row'
);
SELECT cmp_ok((public.get_payout_run('2025-10-31')->'legacy'->>'payouts')::INT, '>', 0, 'legacy payouts reported');
SELECT cmp_ok((public.get_payout_run('2025-10-31')->'legacy'->>'items')::INT, '>', 0, 'legacy items reported');

-- A vendor with a partial draft through an earlier date keeps the draft's stored figures
-- whatever date is on screen. Live at 2025-10-31 the summary would say 90, not 60.
SELECT pg_temp.add_sale('b0000000-0000-0000-0000-000000000021', 'c0000000-0000-0000-0000-000000000021', :'v8',
  '2025-09-10 12:00'::TIMESTAMP AT TIME ZONE 'America/New_York', 100);
SELECT pg_temp.add_sale('b0000000-0000-0000-0000-000000000022', 'c0000000-0000-0000-0000-000000000022', :'v8',
  '2025-10-10 12:00'::TIMESTAMP AT TIME ZONE 'America/New_York', 50);
-- A charge too big for the 09-30 balance is pending in the draft but would apply at 10-31.
INSERT INTO public.vendor_ledger_entries (consignor_id, description, amount) VALUES (:'v8', 'Run fixture big charge', 70);
INSERT INTO run_ids
SELECT 'r8', public.save_payout_draft(:'v8'::uuid, NULL, 'through_date', NULL, '2025-09-30', TRUE, 40, NULL, NULL, 'Run fixture reason');
UPDATE public.consignors SET payout_threshold_override = 77 WHERE id = :'v8';
CREATE TEMP TABLE run8 AS SELECT pg_temp.run_row(:'v8'::uuid, '2025-10-31') AS r;
SELECT is((SELECT (r->>'paying_now')::NUMERIC FROM run8), 40.00::NUMERIC, 'draft row paying now is the draft amount');
SELECT is((SELECT (r->>'payable')::NUMERIC FROM run8), 60.00::NUMERIC, 'draft row payable is the stored amount due, not live');
SELECT is((SELECT (r->>'earned')::NUMERIC FROM run8), 60.00::NUMERIC, 'draft row earned is the stored snapshot, not live');
SELECT is((SELECT (r->>'payable_before_invoices')::NUMERIC FROM run8), 60.00::NUMERIC, 'draft row payable before invoices is the stored snapshot');
SELECT is((SELECT (r->>'threshold')::NUMERIC FROM run8), 1.00::NUMERIC, 'draft row threshold is the stored snapshot');
SELECT is((SELECT r->>'draft_through' FROM run8), '2025-09-30', 'draft vendor shows the draft through date');
SELECT is((SELECT r->>'status' FROM run8), 'draft', 'draft vendor status is draft');
SELECT is((SELECT r->>'override_reason' FROM run8), 'Run fixture reason', 'override reason comes from the draft');
SELECT is((SELECT (r->>'sales_count')::INT FROM run8), 1, 'draft row sales count is the draft''s');
SELECT is((SELECT (r->>'items_count')::INT FROM run8), 1, 'draft row items count is the draft''s');
SELECT is((SELECT (r->>'pending_total')::NUMERIC FROM run8), 70.00::NUMERIC, 'draft row pending charge follows the draft scope');
SELECT is((SELECT (r->>'pending_count')::INT FROM run8), 1, 'draft row pending count follows the draft scope');
SELECT is(
  (SELECT (r->>'cutoff_at')::TIMESTAMPTZ FROM run8),
  public.payout_day_end('2025-09-30') - INTERVAL '1 microsecond',
  'draft row cutoff is the draft''s stored cutoff'
);

-- Status, minimum remaining and draft fallbacks.
SELECT pg_temp.add_sale('b0000000-0000-0000-0000-000000000081', 'c0000000-0000-0000-0000-000000000081', :'v12',
  '2025-10-10 12:00'::TIMESTAMP AT TIME ZONE 'America/New_York', 50);
SELECT is((SELECT r->>'status' FROM (SELECT pg_temp.run_row(:'v12'::uuid, '2025-10-31') r) x), 'accruing', 'vendor under the minimum is accruing');
SELECT is((SELECT (r->>'threshold_remaining')::NUMERIC FROM (SELECT pg_temp.run_row(:'v12'::uuid, '2025-10-31') r) x), 70.00::NUMERIC, 'threshold remaining is the minimum less payable');
SELECT is((SELECT r->>'status' FROM (SELECT pg_temp.run_row(:'v13'::uuid, '2025-10-31') r) x), 'paid_up', 'active vendor with nothing owed is paid up');
SELECT is((SELECT (r->>'threshold_remaining')::NUMERIC FROM (SELECT pg_temp.run_row(:'v13'::uuid, '2025-10-31') r) x), 100.00::NUMERIC, 'paid-up vendor is a full minimum short');

-- All-outstanding draft with null snapshots (saved before this release).
SELECT pg_temp.add_sale('b0000000-0000-0000-0000-000000000091', 'c0000000-0000-0000-0000-000000000091', :'v14',
  '2025-09-10 12:00'::TIMESTAMP AT TIME ZONE 'America/New_York', 100);
INSERT INTO public.vendor_ledger_entries (consignor_id, description, amount) VALUES (:'v14', 'Run fixture small charge', 6);
INSERT INTO run_ids
SELECT 'r14', public.save_payout_draft(:'v14'::uuid, NULL, 'all_outstanding', NULL, NULL, TRUE, NULL, NULL, NULL, NULL);
UPDATE public.payouts SET carried_in_snapshot = NULL, earned_snapshot = NULL WHERE id = (SELECT id FROM run_ids WHERE name = 'r14');
CREATE TEMP TABLE run14 AS SELECT pg_temp.run_row(:'v14'::uuid, '2025-10-31') AS r;
SELECT is((SELECT r->>'draft_through' FROM run14), (NOW() AT TIME ZONE 'America/New_York')::DATE::TEXT, 'draft without a range end falls back to the store date of its cutoff');
SELECT is((SELECT (r->>'carried_in')::NUMERIC FROM run14), 0.00::NUMERIC, 'null carried-in snapshot reads as zero');
SELECT is((SELECT (r->>'earned')::NUMERIC FROM run14), 60.00::NUMERIC, 'null earned snapshot is rebuilt from payable plus deductions');

-- RUN-7: inactive vendor is listed while owed and drops off once paid up.
SELECT pg_temp.add_sale('b0000000-0000-0000-0000-000000000031', 'c0000000-0000-0000-0000-000000000031', :'v7',
  '2025-10-10 12:00'::TIMESTAMP AT TIME ZONE 'America/New_York', 20);
SELECT isnt(pg_temp.run_row(:'v7'::uuid, '2025-10-31'), NULL::JSONB, 'inactive vendor with money owed is listed');
SELECT is((SELECT r->>'status' FROM (SELECT pg_temp.run_row(:'v7'::uuid, '2025-10-31') r) x), 'ready', 'inactive vendor has no minimum');

CREATE TEMP TABLE paid_before AS
SELECT public.get_payout_run('2025-10-31')->'paid_in_month' AS oct, public.get_payout_run('2025-09-30')->'paid_in_month' AS sep;
INSERT INTO run_ids
SELECT 'r7', public.save_payout_draft(:'v7'::uuid, NULL, 'through_date', NULL, '2025-10-31', TRUE, NULL, NULL, NULL, NULL);
SELECT lives_ok(
  $$SELECT public.finalize_payout((SELECT id FROM run_ids WHERE name = 'r7'), 'cash', '2025-10-20', NULL, NULL, NULL)$$,
  'inactive vendor payout finalizes'
);
SELECT is(pg_temp.run_row(:'v7'::uuid, '2025-10-31'), NULL::JSONB, 'inactive vendor is not listed once paid up');

-- paid_in_month counts by payment date (paid_at is always the recording time) and excludes voids.
INSERT INTO public.payouts (
  id, consignor_id, amount, period_start, period_end, paid_at, payment_date, status, historical_confidence
) VALUES (
  '30000000-0000-0000-0000-0000000000b1', :'v7', 999, NOW(), NOW(), NOW(), '2025-10-15', 'voided', 'verified'
);
SELECT is(
  (public.get_payout_run('2025-10-31')->'paid_in_month'->>'count')::INT,
  (SELECT (oct->>'count')::INT FROM paid_before) + 1,
  'payout dated in the month is counted and the voided one is not'
);
SELECT is(
  (public.get_payout_run('2025-10-31')->'paid_in_month'->>'total')::NUMERIC,
  (SELECT (oct->>'total')::NUMERIC FROM paid_before) + 12.00,
  'paid total grows by the payout amount only'
);

-- prepare_payout_run: skipped, created, failed.
SELECT pg_temp.add_sale('b0000000-0000-0000-0000-000000000041', 'c0000000-0000-0000-0000-000000000041', :'v9',
  '2025-09-01 12:00'::TIMESTAMP AT TIME ZONE 'America/New_York', 80);
CREATE TEMP TABLE run_batch AS
SELECT public.prepare_payout_run('2025-10-31', ARRAY[:'v8'::uuid, :'v9'::uuid, '99999999-9999-9999-9999-999999999999'::uuid]) AS res;
SELECT is((SELECT res->0->>'status' FROM run_batch), 'skipped', 'vendor with a draft is skipped');
SELECT is((SELECT res->1->>'status' FROM run_batch), 'created', 'fresh vendor gets a draft');
SELECT is((SELECT res->2->>'status' FROM run_batch), 'failed', 'unknown vendor fails');
SELECT isnt((SELECT res->2->>'message' FROM run_batch), NULL, 'failure carries the error message');
SELECT is(
  (SELECT COUNT(*)::INT FROM public.payouts WHERE id = (SELECT (res->1->>'payout_id')::UUID FROM run_batch) AND status = 'draft'),
  1, 'created draft exists'
);
SELECT is(
  (SELECT COUNT(*)::INT FROM public.payouts WHERE consignor_id = :'v8' AND status = 'draft'),
  1, 'skipped vendor keeps its single draft'
);

-- discard_payout_draft
CREATE TEMP TABLE run_discard AS SELECT (res->1->>'payout_id')::UUID AS id FROM run_batch;
SELECT cmp_ok((SELECT COUNT(*)::INT FROM public.payout_sale_allocations WHERE payout_id = (SELECT id FROM run_discard)), '>', 0, 'draft has allocations before discard');
SELECT is(public.discard_payout_draft((SELECT id FROM run_discard)), (SELECT id FROM run_discard), 'discard returns the payout id');
SELECT is((SELECT COUNT(*)::INT FROM public.payouts WHERE id = (SELECT id FROM run_discard)), 0, 'discard removes the payout');
SELECT is((SELECT COUNT(*)::INT FROM public.payout_sale_allocations WHERE payout_id = (SELECT id FROM run_discard)), 0, 'discard removes the allocations');
CREATE TEMP TABLE run_discard5 AS SELECT id FROM public.payouts WHERE consignor_id = :'v5' AND status = 'draft';
SELECT cmp_ok((SELECT COUNT(*)::INT FROM public.payout_adjustments WHERE payout_id = (SELECT id FROM run_discard5)), '>', 0, 'draft has adjustments before discard');
SELECT lives_ok($$SELECT public.discard_payout_draft((SELECT id FROM run_discard5))$$, 'draft with adjustments is discarded');
SELECT is((SELECT COUNT(*)::INT FROM public.payout_adjustments WHERE payout_id = (SELECT id FROM run_discard5)), 0, 'discard removes the adjustments');
SELECT is((SELECT COUNT(*)::INT FROM public.payout_sale_allocations WHERE payout_id = (SELECT id FROM run_discard5)), 0, 'discard removes the allocations of that draft too');
SELECT is(
  (SELECT public.prepare_payout_run('2025-10-31', ARRAY[:'v9'::uuid])->0->>'status'),
  'created', 'prepare creates a new draft after a discard'
);
SELECT throws_ok(
  $$SELECT public.discard_payout_draft((SELECT id FROM run_ids WHERE name = 'r7'))$$,
  'P0002', 'Only drafts can be discarded.', 'a paid payout cannot be discarded'
);

-- RUN-6: the invoice swallows the whole payout; the zero-amount draft still finalizes.
SELECT pg_temp.add_sale('b0000000-0000-0000-0000-000000000051', 'c0000000-0000-0000-0000-000000000051', :'v6',
  '2025-10-10 12:00'::TIMESTAMP AT TIME ZONE 'America/New_York', 10);
INSERT INTO public.invoices (recipient_type, consignor_id, recipient_name, total) VALUES ('vendor', :'v6', 'Run Six', 50);
INSERT INTO run_ids
SELECT 'r6', public.save_payout_draft(:'v6'::uuid, NULL, 'through_date', NULL, '2025-10-31', TRUE, NULL, NULL, NULL, NULL);
SELECT is((SELECT amount FROM public.payouts WHERE id = (SELECT id FROM run_ids WHERE name = 'r6')), 0.00::NUMERIC, 'invoice-covered draft pays nothing');
SELECT lives_ok(
  $$SELECT public.finalize_payout((SELECT id FROM run_ids WHERE name = 'r6'), 'check', '2025-09-30', NULL, NULL, NULL)$$,
  'zero-amount payout finalizes by check without a reference'
);
SELECT is(
  (public.get_payout_run('2025-09-30')->'paid_in_month'->>'count')::INT,
  (SELECT (sep->>'count')::INT FROM paid_before) + 1,
  'a payout dated in the previous month counts there'
);
SELECT is(
  (public.get_payout_run('2025-10-31')->'paid_in_month'->>'count')::INT,
  (SELECT (oct->>'count')::INT FROM paid_before) + 1,
  'a payout dated in the previous month is not counted in October'
);

-- Through-date mode forces a null start and prior balance on.
SELECT pg_temp.add_sale('b0000000-0000-0000-0000-000000000061', 'c0000000-0000-0000-0000-000000000061', :'v10',
  '2025-09-15 12:00'::TIMESTAMP AT TIME ZONE 'America/New_York', 100);
INSERT INTO run_ids
SELECT 'r10', public.save_payout_draft(:'v10'::uuid, NULL, 'through_date', '2025-09-01', '2025-10-31', FALSE, NULL, NULL, NULL, NULL);
SELECT is((SELECT source_range_start FROM public.payouts WHERE id = (SELECT id FROM run_ids WHERE name = 'r10')), NULL::DATE, 'through-date ignores a supplied start');
SELECT is((SELECT include_prior_balance FROM public.payouts WHERE id = (SELECT id FROM run_ids WHERE name = 'r10')), TRUE, 'through-date forces prior balance on');

-- 9pm Eastern the day before a range start is outside the range (pins payout_day_start).
SELECT pg_temp.add_sale('b0000000-0000-0000-0000-000000000071', 'c0000000-0000-0000-0000-000000000071', :'v11',
  '2025-10-09 21:00'::TIMESTAMP AT TIME ZONE 'America/New_York', 100);
SELECT pg_temp.add_sale('b0000000-0000-0000-0000-000000000072', 'c0000000-0000-0000-0000-000000000072', :'v11',
  '2025-10-10 12:00'::TIMESTAMP AT TIME ZONE 'America/New_York', 50);
INSERT INTO run_ids
SELECT 'r11', public.save_payout_draft(:'v11'::uuid, NULL, 'selected_range', '2025-10-10', '2025-10-10', FALSE, NULL, NULL, NULL, NULL);
SELECT is((SELECT amount FROM public.payouts WHERE id = (SELECT id FROM run_ids WHERE name = 'r11')), 30.00::NUMERIC, 'sale at 9pm the evening before the range start is excluded');

-- A vendor cannot read the run.
ALTER TABLE public.users DISABLE TRIGGER USER;
INSERT INTO auth.users (id) VALUES ('20000000-0000-0000-0000-0000000000f1');
INSERT INTO public.users (id, email, role, consignor_id, employee_id)
VALUES ('20000000-0000-0000-0000-0000000000f1', 'run-vendor@example.test', 'vendor', :'v5', NULL);
ALTER TABLE public.users ENABLE TRIGGER USER;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-0000000000f1', TRUE);
SELECT set_config('request.jwt.claim.role', 'authenticated', TRUE);
SELECT throws_like($$SELECT public.get_payout_run('2025-10-31')$$, '%Admin access%', 'vendor cannot read the payout run');
SELECT throws_like($$SELECT public.get_vendor_payout_preview('a0000000-0000-0000-0000-000000000005'::uuid, '2025-10-31')$$, '%Admin access%', 'vendor cannot read a payout preview');
SELECT throws_like($$SELECT public.prepare_payout_run('2025-10-31', ARRAY['a0000000-0000-0000-0000-000000000005'::uuid])$$, '%Admin access%', 'vendor cannot prepare payouts');
SELECT throws_like($$SELECT public.discard_payout_draft('99999999-9999-9999-9999-999999999998'::uuid)$$, '%Admin access%', 'vendor cannot discard drafts');
RESET ROLE;
SELECT set_config('request.jwt.claim.role', 'service_role', TRUE);

-- ---------------------------------------------------------------------------
-- Statement, workspace and vendor earnings
-- ---------------------------------------------------------------------------
\set v15 'a0000000-0000-0000-0000-00000000000f'
\set v16 'a0000000-0000-0000-0000-000000000010'

INSERT INTO public.consignors (
  id, consignor_number, name, business_name, commission_split,
  consignor_pays_card_fee, payout_threshold_override, is_active, email
) VALUES
  (:'v15', 'RUN-15', 'Run Fifteen', 'Run Fifteen Studio', 0.60, TRUE, 1, TRUE, 'run15@example.test'),
  (:'v16', 'RUN-16', 'Run Sixteen', 'Run Sixteen Studio', 0.60, FALSE, 1, TRUE, 'run16@example.test');

ALTER TABLE public.employees DISABLE TRIGGER USER;
INSERT INTO public.employees (id, name, pin_hash, pin_salt)
VALUES ('50000000-0000-0000-0000-0000000000f9', 'Run Admin Person', 'test-hash', 'test-salt');
ALTER TABLE public.employees ENABLE TRIGGER USER;
INSERT INTO auth.users (id) VALUES
  ('20000000-0000-0000-0000-0000000000f2'),
  ('20000000-0000-0000-0000-0000000000f3'),
  ('20000000-0000-0000-0000-0000000000f4'),
  ('20000000-0000-0000-0000-0000000000f5');
ALTER TABLE public.users DISABLE TRIGGER USER;
INSERT INTO public.users (id, email, role, consignor_id, employee_id) VALUES
  ('20000000-0000-0000-0000-0000000000f2', 'run-vendor1@example.test', 'vendor', :'v1', NULL),
  ('20000000-0000-0000-0000-0000000000f3', 'run-vendor3@example.test', 'vendor', :'v3', NULL),
  ('20000000-0000-0000-0000-0000000000f4', 'run-admin@example.test', 'admin', NULL, NULL),
  ('20000000-0000-0000-0000-0000000000f5', 'run-staff@example.test', 'employee', NULL, '50000000-0000-0000-0000-0000000000f9');
ALTER TABLE public.users ENABLE TRIGGER USER;

-- Card sale where the vendor carries the card fee.
INSERT INTO public.sales (
  id, completed_at, subtotal, tax_amount, total, payment_method, discount_total, payment_breakdown
) VALUES (
  'b0000000-0000-0000-0000-0000000000a1', '2025-10-10 12:00'::TIMESTAMP AT TIME ZONE 'America/New_York',
  200, 0, 200, 'card', 0,
  JSONB_BUILD_ARRAY(JSONB_BUILD_OBJECT('method', 'card', 'amount', 200))
);
INSERT INTO public.sale_items (
  id, sale_id, consignor_id, sku, name, price, quantity,
  commission_split, discount_amount, consignor_pays_card_fee
) VALUES (
  'c0000000-0000-0000-0000-0000000000a1', 'b0000000-0000-0000-0000-0000000000a1', :'v15', 'RUN-CARD', 'Card item',
  200, 1, 0.60, 0, TRUE
);

-- 9pm Eastern on the last day of the range (pins the range preview boundary).
SELECT pg_temp.add_sale('b0000000-0000-0000-0000-0000000000a2', 'c0000000-0000-0000-0000-0000000000a2', :'v16',
  '2025-10-20 21:00'::TIMESTAMP AT TIME ZONE 'America/New_York', 100);

GRANT SELECT ON run_ids TO authenticated;

-- The RUN-1 vendor cannot open a draft statement.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-0000000000f2', TRUE);
SELECT set_config('request.jwt.claim.role', 'authenticated', TRUE);
SELECT throws_like(
  $$SELECT public.get_payout_statement((SELECT id FROM run_ids WHERE name = 'r1'))$$,
  '%not found%', 'vendor cannot read their own draft statement'
);
RESET ROLE;
SELECT set_config('request.jwt.claim.role', 'service_role', TRUE);

-- Emails: newest row wins.
INSERT INTO public.payout_statement_emails (payout_id, recipient, status, error, created_at)
VALUES ((SELECT id FROM run_ids WHERE name = 'r1'), 'run1@example.test', 'failed', 'bounced', NOW() - INTERVAL '2 days');
INSERT INTO public.payout_statement_emails (payout_id, recipient, status, provider_id, created_at)
VALUES ((SELECT id FROM run_ids WHERE name = 'r1'), 'run1@example.test', 'sent', 'prov-1', NOW() - INTERVAL '1 day');

-- Finalize RUN-1 as the named admin so paid_by is set.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-0000000000f4', TRUE);
SELECT set_config('request.jwt.claim.role', 'authenticated', TRUE);
SELECT lives_ok(
  $$SELECT public.finalize_payout((SELECT id FROM run_ids WHERE name = 'r1'), 'cash', '2025-11-05', NULL, NULL, 'Fixture override')$$,
  'admin finalizes the RUN-1 payout'
);
SELECT is(
  (public.get_payout_statement((SELECT id FROM run_ids WHERE name = 'r1'))->'actors'->>'paid_by_name'),
  'run-admin@example.test', 'admin sees who paid, by sign-in email when there is no employee record'
);
SELECT is(
  (public.get_payout_statement((SELECT id FROM run_ids WHERE name = 'r1'))->'actors'->>'prepared_by_name'),
  NULL::TEXT, 'actors keeps a null name when nobody prepared it'
);
SELECT is(
  (public.get_payout_statement((SELECT id FROM run_ids WHERE name = 'r1'))->'latest_email'->>'status'),
  'sent', 'admin sees the newest statement email'
);
SELECT is(
  (public.get_payout_statement((SELECT id FROM run_ids WHERE name = 'r1'))->'latest_email'->>'provider_id'),
  'prov-1', 'latest email carries its provider id'
);
RESET ROLE;
SELECT set_config('request.jwt.claim.role', 'service_role', TRUE);

SELECT is(public.payout_actor_name('20000000-0000-0000-0000-0000000000f5'::uuid), 'Run Admin Person', 'actor name prefers the employee name');
SELECT is(public.payout_actor_name('20000000-0000-0000-0000-0000000000f4'::uuid), 'run-admin@example.test', 'actor name falls back to the sign-in email');
SELECT is(public.payout_actor_name(NULL), NULL::TEXT, 'no user gives no name');

-- The RUN-1 vendor can read the paid statement but not the audit details.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-0000000000f2', TRUE);
SELECT set_config('request.jwt.claim.role', 'authenticated', TRUE);
SELECT lives_ok(
  $$SELECT public.get_payout_statement((SELECT id FROM run_ids WHERE name = 'r1'))$$,
  'vendor reads their paid statement'
);
SELECT is(public.get_payout_statement((SELECT id FROM run_ids WHERE name = 'r1'))->'actors', 'null'::JSONB, 'vendor gets no actors');
SELECT is(public.get_payout_statement((SELECT id FROM run_ids WHERE name = 'r1'))->'latest_email', 'null'::JSONB, 'vendor gets no email record');

-- Server-side vendor earnings.
SELECT is(
  (SELECT (e->>'vendor_earnings')::NUMERIC
   FROM JSONB_ARRAY_ELEMENTS(public.get_vendor_sale_earnings('a0000000-0000-0000-0000-000000000001'::uuid)) e
   WHERE e->>'sale_item_id' = 'c0000000-0000-0000-0000-000000000001'),
  60.00::NUMERIC, 'vendor sees their own September item earnings'
);
SELECT throws_ok(
  $$SELECT public.get_vendor_sale_earnings('a0000000-0000-0000-0000-000000000003'::uuid)$$,
  '42501', NULL, 'vendor cannot read another vendor earnings'
);
SELECT is((SELECT COUNT(*)::INT FROM public.payout_statement_emails), 0, 'vendor reads no statement email rows');
SELECT throws_like(
  $$INSERT INTO public.payout_statement_emails (payout_id, recipient, status)
    VALUES ((SELECT id FROM run_ids WHERE name = 'r1'), 'x@example.test', 'sent')$$,
  '%permission denied%', 'authenticated cannot insert statement emails'
);
RESET ROLE;
SELECT set_config('request.jwt.claim.role', 'service_role', TRUE);

-- Admin earnings for a card-fee-on-vendor item match the ledger cut, not net x split.
CREATE TEMP TABLE card_item AS
SELECT f.final_vendor_cut, ROUND(f.net_line_amount * f.commission_percentage / 100, 2) AS net_times_split
FROM public.get_payout_sale_financials('a0000000-0000-0000-0000-00000000000f'::uuid, NOW()) f
WHERE f.sale_item_id = 'c0000000-0000-0000-0000-0000000000a1';
GRANT SELECT ON card_item TO authenticated;
SELECT ok((SELECT final_vendor_cut < net_times_split FROM card_item), 'fixture: the card fee lands on the vendor');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-0000000000f4', TRUE);
SELECT set_config('request.jwt.claim.role', 'authenticated', TRUE);
SELECT is(
  (SELECT (e->>'vendor_earnings')::NUMERIC
   FROM JSONB_ARRAY_ELEMENTS(public.get_vendor_sale_earnings('a0000000-0000-0000-0000-00000000000f'::uuid)) e
   WHERE e->>'sale_item_id' = 'c0000000-0000-0000-0000-0000000000a1'),
  (SELECT final_vendor_cut FROM card_item),
  'card fee on the vendor: earnings equal the final vendor cut'
);
SELECT ok(
  (SELECT (e->>'vendor_earnings')::NUMERIC
   FROM JSONB_ARRAY_ELEMENTS(public.get_vendor_sale_earnings('a0000000-0000-0000-0000-00000000000f'::uuid)) e
   WHERE e->>'sale_item_id' = 'c0000000-0000-0000-0000-0000000000a1') < (SELECT net_times_split FROM card_item),
  'card fee on the vendor: earnings are below net x split'
);
RESET ROLE;
SELECT set_config('request.jwt.claim.role', 'service_role', TRUE);

-- Workspace: inactive vendor has no minimum and no email; active vendor shows email.
SELECT is((public.get_vendor_payout_workspace(:'v2'::uuid)->'summary'->>'threshold')::NUMERIC, 0::NUMERIC, 'inactive vendor workspace reports a zero minimum');
SELECT is(public.get_vendor_payout_workspace(:'v2'::uuid)->'vendor'->>'email', NULL::TEXT, 'vendor without email reports null');
SELECT is(public.get_vendor_payout_workspace(:'v1'::uuid)->'vendor'->>'email', 'run1@example.test', 'workspace carries the vendor email');
SELECT is(
  JSONB_ARRAY_LENGTH(public.get_vendor_payout_workspace(:'v16'::uuid, '2025-10-20', '2025-10-20')->'sale_items'),
  1, 'workspace range end covers 9pm Eastern on the last day'
);

-- Older desktop builds: range preview counts a 9pm Eastern sale on the range end.
SELECT is(
  (SELECT (r->>'items_count')::INT
   FROM JSONB_ARRAY_ELEMENTS(public.get_payout_range_preview('2025-10-20', '2025-10-20')) r
   WHERE r->>'consignor_id' = 'a0000000-0000-0000-0000-000000000010'),
  1, 'range preview counts a sale at 9pm Eastern on the range end'
);

-- ---------------------------------------------------------------------------
-- Draft lock on the tables, store-time workspace boundaries, actor names
-- ---------------------------------------------------------------------------
\set v17 'a0000000-0000-0000-0000-000000000011'
\set v18 'a0000000-0000-0000-0000-000000000012'
INSERT INTO public.consignors (
  id, consignor_number, name, business_name, commission_split,
  consignor_pays_card_fee, payout_threshold_override, is_active, email
) VALUES
  (:'v17', 'RUN-17', 'Run Seventeen', 'Run Seventeen Studio', 0.60, FALSE, 1, TRUE, 'run17@example.test'),
  (:'v18', 'RUN-18', 'Run Eighteen', 'Run Eighteen Studio', 0.60, FALSE, 1, TRUE, 'run18@example.test');
INSERT INTO auth.users (id) VALUES ('20000000-0000-0000-0000-0000000000f6');
ALTER TABLE public.users DISABLE TRIGGER USER;
INSERT INTO public.users (id, email, role, consignor_id, employee_id)
VALUES ('20000000-0000-0000-0000-0000000000f6', 'run-vendor17@example.test', 'vendor', :'v17', NULL);
ALTER TABLE public.users ENABLE TRIGGER USER;

SELECT pg_temp.add_sale('b0000000-0000-0000-0000-0000000000b1', 'c0000000-0000-0000-0000-0000000000b1', :'v17',
  '2025-10-10 12:00'::TIMESTAMP AT TIME ZONE 'America/New_York', 100);
INSERT INTO public.vendor_ledger_entries (consignor_id, description, amount) VALUES (:'v17', 'Run fixture draft charge', 6);
INSERT INTO run_ids
SELECT 'r17', public.save_payout_draft(:'v17'::uuid, NULL, 'through_date', NULL, '2025-10-31', TRUE, NULL, NULL, NULL, NULL);
SELECT ok(EXISTS (SELECT 1 FROM public.payout_adjustments WHERE payout_id = (SELECT id FROM run_ids WHERE name = 'r17')), 'fixture: the draft carries an adjustment');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-0000000000f6', TRUE);
SELECT set_config('request.jwt.claim.role', 'authenticated', TRUE);
SELECT is((SELECT COUNT(*)::INT FROM public.payouts WHERE consignor_id = 'a0000000-0000-0000-0000-000000000011'), 0, 'vendor reads no draft payout row');
SELECT is((SELECT COUNT(*)::INT FROM public.payout_sale_allocations WHERE consignor_id = 'a0000000-0000-0000-0000-000000000011'), 0, 'vendor reads no draft allocation rows');
SELECT is((SELECT COUNT(*)::INT FROM public.payout_adjustments WHERE consignor_id = 'a0000000-0000-0000-0000-000000000011'), 0, 'vendor reads no draft adjustment rows');
RESET ROLE;
SELECT set_config('request.jwt.claim.role', 'service_role', TRUE);

-- Finalize as the admin, then the vendor sees the paid rows.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-0000000000f4', TRUE);
SELECT set_config('request.jwt.claim.role', 'authenticated', TRUE);
SELECT lives_ok($$SELECT public.finalize_payout((SELECT id FROM run_ids WHERE name = 'r17'), 'cash', '2025-11-05', NULL, NULL, NULL)$$, 'admin finalizes RUN-17');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-0000000000f6', TRUE);
SELECT set_config('request.jwt.claim.role', 'authenticated', TRUE);
SELECT is((SELECT COUNT(*)::INT FROM public.payouts WHERE consignor_id = 'a0000000-0000-0000-0000-000000000011'), 1, 'vendor reads their paid payout row');
SELECT is((SELECT COUNT(*)::INT FROM public.payout_sale_allocations WHERE consignor_id = 'a0000000-0000-0000-0000-000000000011'), 1, 'vendor reads their paid allocation rows');
SELECT is((SELECT COUNT(*)::INT FROM public.payout_adjustments WHERE consignor_id = 'a0000000-0000-0000-0000-000000000011'), 1, 'vendor reads their paid adjustment rows');
RESET ROLE;
SELECT set_config('request.jwt.claim.role', 'service_role', TRUE);

-- Payment at 9pm Eastern the evening before the range start stays outside the range.
SELECT pg_temp.add_sale('b0000000-0000-0000-0000-0000000000b2', 'c0000000-0000-0000-0000-0000000000b2', :'v18',
  '2025-09-15 12:00'::TIMESTAMP AT TIME ZONE 'America/New_York', 100);
INSERT INTO run_ids
SELECT 'r18', public.save_payout_draft(:'v18'::uuid, NULL, 'through_date', NULL, '2025-09-30', TRUE, NULL, NULL, NULL, NULL);
SELECT public.finalize_payout((SELECT id FROM run_ids WHERE name = 'r18'), 'cash', '2025-10-09', NULL, NULL, NULL);
ALTER TABLE public.payouts DISABLE TRIGGER USER;
UPDATE public.payouts SET paid_at = '2025-10-09 21:00'::TIMESTAMP AT TIME ZONE 'America/New_York'
WHERE id = (SELECT id FROM run_ids WHERE name = 'r18');
ALTER TABLE public.payouts ENABLE TRIGGER USER;
SELECT is((SELECT paid_at FROM public.payouts WHERE id = (SELECT id FROM run_ids WHERE name = 'r18')),
  '2025-10-10 01:00:00+00'::timestamptz, 'fixture: payment is 9pm Eastern the evening before');
SELECT pg_temp.add_sale('b0000000-0000-0000-0000-0000000000b3', 'c0000000-0000-0000-0000-0000000000b3', :'v18',
  '2025-10-10 12:00'::TIMESTAMP AT TIME ZONE 'America/New_York', 50);
SELECT is((public.get_vendor_payout_workspace(:'v18'::uuid, '2025-10-10', '2025-10-10')->'summary'->>'payments_in_range')::NUMERIC, 0::NUMERIC, 'evening-before payment is not in the range');
SELECT is((public.get_vendor_payout_workspace(:'v18'::uuid, '2025-10-10', '2025-10-10')->'summary'->>'range_activity')::NUMERIC, 30.00::NUMERIC, 'range activity counts only the in-range sale');

-- Actor-name function is service-role only.
SELECT ok(NOT has_function_privilege('authenticated', 'public.payout_actor_name(uuid)', 'EXECUTE'), 'authenticated cannot execute payout_actor_name');
SELECT ok(NOT has_function_privilege('anon', 'public.payout_actor_name(uuid)', 'EXECUTE'), 'anonymous cannot execute payout_actor_name');

-- A voided payout names who voided it and who reversed it.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-0000000000f4', TRUE);
SELECT set_config('request.jwt.claim.role', 'authenticated', TRUE);
SELECT lives_ok($$SELECT public.void_payout((SELECT id FROM run_ids WHERE name = 'r17'), 'Fixture void')$$, 'admin voids RUN-17 payout');
SELECT is(public.get_payout_statement((SELECT id FROM run_ids WHERE name = 'r17'))->'actors'->>'voided_by_name', 'run-admin@example.test', 'voided_by_name resolves');
SELECT is(public.get_payout_statement((SELECT id FROM run_ids WHERE name = 'r17'))->'actors'->>'reversed_by_name', 'run-admin@example.test', 'reversed_by_name resolves');
RESET ROLE;
SELECT set_config('request.jwt.claim.role', 'service_role', TRUE);

-- The workspace history row carries the payment date, not just when it was recorded.
SELECT is(public.get_vendor_payout_workspace(:'v18'::uuid)->'payout_history'->0->>'payment_date', '2025-10-09', 'workspace history row carries payment_date');

-- finalize_payout_checked: pays only the amount the screen confirmed.
\set v19 'a0000000-0000-0000-0000-000000000013'
INSERT INTO public.consignors (
  id, consignor_number, name, business_name, commission_split,
  consignor_pays_card_fee, payout_threshold_override, is_active, email
) VALUES (:'v19', 'RUN-19', 'Run Nineteen', 'Run Nineteen Studio', 0.60, FALSE, 1, TRUE, 'run19@example.test');
SELECT pg_temp.add_sale('b0000000-0000-0000-0000-0000000000b4', 'c0000000-0000-0000-0000-0000000000b4', :'v19',
  '2025-10-10 12:00'::TIMESTAMP AT TIME ZONE 'America/New_York', 100);
INSERT INTO run_ids
SELECT 'r19', public.save_payout_draft(:'v19'::uuid, NULL, 'through_date', NULL, '2025-10-31', TRUE, NULL, NULL, NULL, NULL);
SELECT is((SELECT amount FROM public.payouts WHERE id = (SELECT id FROM run_ids WHERE name = 'r19')), 60.00::numeric, 'fixture: RUN-19 draft is 60.00');

-- Another admin lowers the draft after the screen loaded.
SELECT public.save_payout_draft(:'v19'::uuid, (SELECT id FROM run_ids WHERE name = 'r19'), 'through_date', NULL, '2025-10-31', TRUE, 45, NULL, NULL, NULL);
SELECT is((SELECT amount FROM public.payouts WHERE id = (SELECT id FROM run_ids WHERE name = 'r19')), 45.00::numeric, 'fixture: the draft was re-saved at 45.00');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-0000000000f4', TRUE);
SELECT set_config('request.jwt.claim.role', 'authenticated', TRUE);
SELECT throws_ok(
  $$SELECT public.finalize_payout_checked((SELECT id FROM run_ids WHERE name = 'r19'), 60.00, 'cash', '2025-11-05', NULL, NULL, NULL)$$,
  'PT409', 'The payout amount changed after this screen loaded.', 'a stale expected amount is refused');
SELECT is((SELECT status FROM public.payouts WHERE id = (SELECT id FROM run_ids WHERE name = 'r19')), 'draft', 'the refused payout is still a draft');
SELECT lives_ok(
  $$SELECT public.finalize_payout_checked((SELECT id FROM run_ids WHERE name = 'r19'), 45.00, 'cash', '2025-11-05', NULL, NULL, NULL)$$,
  'the current amount finalizes');
SELECT is((SELECT status FROM public.payouts WHERE id = (SELECT id FROM run_ids WHERE name = 'r19')), 'paid', 'the confirmed payout is paid');
SELECT is((SELECT amount FROM public.payouts WHERE id = (SELECT id FROM run_ids WHERE name = 'r19')), 45.00::numeric, 'and paid at the confirmed amount');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-0000000000f6', TRUE);
SELECT set_config('request.jwt.claim.role', 'authenticated', TRUE);
SELECT throws_ok(
  $$SELECT public.finalize_payout_checked((SELECT id FROM run_ids WHERE name = 'r19'), 45.00, 'cash', '2025-11-05', NULL, NULL, NULL)$$,
  '42501', NULL, 'a vendor is refused');
RESET ROLE;
SELECT set_config('request.jwt.claim.role', 'service_role', TRUE);

-- A draft that went stale (finalize_payout raises 40001) reaches the client as PT409 with its message.
\set v20 'a0000000-0000-0000-0000-000000000014'
INSERT INTO public.consignors (
  id, consignor_number, name, business_name, commission_split,
  consignor_pays_card_fee, payout_threshold_override, is_active, email
) VALUES (:'v20', 'RUN-20', 'Run Twenty', 'Run Twenty Studio', 0.60, FALSE, 1, TRUE, 'run20@example.test');
SELECT pg_temp.add_sale('b0000000-0000-0000-0000-0000000000b5', 'c0000000-0000-0000-0000-0000000000b5', :'v20',
  '2025-10-10 12:00'::TIMESTAMP AT TIME ZONE 'America/New_York', 100);
INSERT INTO public.vendor_ledger_entries (consignor_id, description, amount) VALUES (:'v20', 'Run fixture stale charge', 6);
INSERT INTO run_ids
SELECT 'r20', public.save_payout_draft(:'v20'::uuid, NULL, 'through_date', NULL, '2025-10-31', TRUE, NULL, NULL, NULL, NULL);
SELECT ok(EXISTS (SELECT 1 FROM public.payout_adjustments WHERE payout_id = (SELECT id FROM run_ids WHERE name = 'r20') AND source_table = 'vendor_ledger_entries'), 'fixture: RUN-20 draft carries a ledger deduction');
UPDATE public.vendor_ledger_entries SET deducted_payout_id = (SELECT id FROM run_ids WHERE name = 'r19') WHERE consignor_id = :'v20';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-0000000000f4', TRUE);
SELECT set_config('request.jwt.claim.role', 'authenticated', TRUE);
SELECT throws_ok(
  $$SELECT public.finalize_payout_checked((SELECT id FROM run_ids WHERE name = 'r20'), (SELECT amount FROM public.payouts WHERE id = (SELECT id FROM run_ids WHERE name = 'r20')), 'cash', '2025-11-05', NULL, NULL, NULL)$$,
  'PT409', 'A ledger deduction changed after the draft was prepared.', 'a stale draft surfaces as PT409 with the original message');
SELECT is((SELECT status FROM public.payouts WHERE id = (SELECT id FROM run_ids WHERE name = 'r20')), 'draft', 'the stale payout is still a draft');
RESET ROLE;
SELECT set_config('request.jwt.claim.role', 'service_role', TRUE);

-- A future end date is refused in both dated modes, and an already-paid payout reads as not found.
SELECT throws_ok(
  $$SELECT public.save_payout_draft((SELECT id FROM public.consignors WHERE consignor_number = 'RUN-20'), NULL, 'through_date', NULL, '2099-01-31', TRUE, NULL, NULL, NULL, NULL)$$,
  '22023', 'The payout date cannot be in the future.', 'a future through date is refused');
SELECT throws_ok(
  $$SELECT public.save_payout_draft((SELECT id FROM public.consignors WHERE consignor_number = 'RUN-20'), NULL, 'selected_range', '2025-10-01', '2099-01-31', TRUE, NULL, NULL, NULL, NULL)$$,
  '22023', 'The payout date cannot be in the future.', 'a future range end is refused');
\set v21 'a0000000-0000-0000-0000-000000000015'
INSERT INTO public.consignors (
  id, consignor_number, name, business_name, commission_split,
  consignor_pays_card_fee, payout_threshold_override, is_active, email
) VALUES (:'v21', 'RUN-21', 'Run Twentyone', 'Run Twentyone Studio', 0.60, FALSE, 1, TRUE, 'run21@example.test');
SELECT is(
  (SELECT e ->> 'status' FROM JSONB_ARRAY_ELEMENTS(public.prepare_payout_run('2099-01-31', ARRAY[:'v21'::uuid])) e),
  'failed', 'prepare reports a future date as a failed vendor instead of aborting');
SELECT is(
  (SELECT e ->> 'message' FROM JSONB_ARRAY_ELEMENTS(public.prepare_payout_run('2099-01-31', ARRAY[:'v21'::uuid])) e),
  'The payout date cannot be in the future.', 'with the plain message');
SELECT throws_ok(
  $$SELECT public.finalize_payout_checked((SELECT id FROM run_ids WHERE name = 'r19'), 1.23, 'cash', '2025-11-05', NULL, NULL, NULL)$$,
  'P0002', 'Finalizable payout draft not found.', 'a paid payout with a wrong expected amount reads as not found');

SELECT * FROM finish();
ROLLBACK;
