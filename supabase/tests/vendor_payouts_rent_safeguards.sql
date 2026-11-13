BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT * FROM no_plan();
SELECT set_config('request.jwt.claim.role', 'service_role', TRUE);

\set v1 'a1000000-0000-0000-0000-000000000001'

INSERT INTO public.consignors (
  id, consignor_number, name, business_name, commission_split,
  consignor_pays_card_fee, payout_threshold_override, is_active, email, booth_square_feet, booth_cost_per_square_foot
) VALUES (:'v1', 'RENT-1', 'Rent One', 'Rent One Studio', 0.60, FALSE, 1, TRUE, 'rent1@example.test', 10, 2);

-- Monthly rent is derived from the booth size and rate.
SELECT is((SELECT monthly_booth_rent FROM public.consignors WHERE id = :'v1'), 20.00::numeric, 'test vendor owes $20 a month');

INSERT INTO public.sales (
  id, completed_at, subtotal, tax_amount, total, payment_method, discount_total, payment_breakdown
) VALUES (
  'b1000000-0000-0000-0000-000000000001', '2025-09-15 12:00'::TIMESTAMP AT TIME ZONE 'America/New_York',
  200, 0, 200, 'cash', 0, JSONB_BUILD_ARRAY(JSONB_BUILD_OBJECT('method', 'cash', 'amount', 200))
);
INSERT INTO public.sale_items (
  id, sale_id, consignor_id, sku, name, price, quantity, commission_split, discount_amount, consignor_pays_card_fee
) VALUES (
  'c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', :'v1',
  'RENT-ITEM-1', 'Rent item', 200, 1, 0.60, 0, FALSE
);

-- Store time: 10pm on Oct 31 in New York is already Nov 1 in UTC.
SELECT is(
  (SELECT source_reference FROM public.get_vendor_required_adjustments(
     :'v1'::uuid, 1000, '2025-10-31 22:00'::TIMESTAMP AT TIME ZONE 'America/New_York')
   WHERE adjustment_type = 'booth_rent'),
  '2025-10', 'rent on the last evening of the month is for that month, not the next');
SELECT is(
  (SELECT source_reference FROM public.get_vendor_required_adjustments(
     :'v1'::uuid, 1000, '2025-11-01 00:30'::TIMESTAMP AT TIME ZONE 'America/New_York')
   WHERE adjustment_type = 'booth_rent'),
  '2025-11', 'rent after store midnight is for the new month');

CREATE TEMP TABLE rent_ids (name TEXT PRIMARY KEY, id UUID);
INSERT INTO rent_ids
SELECT 'd1', public.save_payout_draft(:'v1'::uuid, NULL, 'through_date', NULL, '2025-10-31', TRUE, NULL, NULL, NULL, NULL);

SELECT is((SELECT amount FROM public.payouts WHERE id = (SELECT id FROM rent_ids WHERE name = 'd1')),
  100.00::numeric, 'draft pays earnings less one month of rent');

-- Rent recorded by hand for the drafted month, after the draft was prepared.
INSERT INTO public.booth_rent_payments (id, consignor_id, amount, period_month, period_year, notes)
SELECT 'd1000000-0000-0000-0000-000000000001', :'v1', 20,
  (pa.metadata->>'period_month')::INTEGER, (pa.metadata->>'period_year')::INTEGER, 'Paid in cash'
FROM public.payout_adjustments pa
WHERE pa.payout_id = (SELECT id FROM rent_ids WHERE name = 'd1') AND pa.adjustment_type = 'booth_rent';

SELECT throws_ok(
  $$SELECT public.finalize_payout_checked((SELECT id FROM rent_ids WHERE name = 'd1'), 100, 'cash', '2025-11-05', NULL, NULL, NULL)$$,
  'PT409', 'Booth rent changed after the draft was prepared.', 'hand-recorded rent for a drafted month stops Mark paid with a plain message');
SELECT is((SELECT status FROM public.payouts WHERE id = (SELECT id FROM rent_ids WHERE name = 'd1')),
  'draft', 'and the payout stays a draft');

SELECT lives_ok(
  $$DELETE FROM public.booth_rent_payments WHERE id = 'd1000000-0000-0000-0000-000000000001'$$,
  'rent recorded by hand can still be deleted');
SELECT lives_ok(
  $$SELECT public.finalize_payout_checked((SELECT id FROM rent_ids WHERE name = 'd1'), 100, 'cash', '2025-11-05', NULL, NULL, NULL)$$,
  'the payout then finalizes');
SELECT is(
  (SELECT COUNT(*)::INT FROM public.booth_rent_payments
   WHERE source_payout_id = (SELECT id FROM rent_ids WHERE name = 'd1') AND reversed_at IS NULL),
  1, 'finalize writes the rent row');

SELECT throws_ok(
  $$DELETE FROM public.booth_rent_payments WHERE source_payout_id = (SELECT id FROM rent_ids WHERE name = 'd1')$$,
  '23514', 'This rent was deducted by a payout. Void the payout to reverse it.', 'payout rent cannot be deleted');
SELECT throws_ok(
  $$UPDATE public.booth_rent_payments SET period_month = CASE WHEN period_month = 1 THEN 2 ELSE 1 END
    WHERE source_payout_id = (SELECT id FROM rent_ids WHERE name = 'd1')$$,
  '23514', 'This rent was deducted by a payout and cannot be edited.', 'payout rent cannot be moved to another month');
SELECT lives_ok(
  $$UPDATE public.booth_rent_payments SET notes = 'Checked' WHERE source_payout_id = (SELECT id FROM rent_ids WHERE name = 'd1')$$,
  'a note on payout rent can still change');
SELECT is(
  (SELECT COUNT(*)::INT FROM public.get_vendor_required_adjustments(:'v1'::uuid, 1000, NOW()) WHERE adjustment_type = 'booth_rent'),
  0, 'the paid month is not owed again');

SELECT lives_ok(
  $$SELECT public.void_payout((SELECT id FROM rent_ids WHERE name = 'd1'), 'Test void')$$,
  'voiding the payout still reverses its rent');
SELECT is(
  (SELECT COUNT(*)::INT FROM public.booth_rent_payments
   WHERE source_payout_id = (SELECT id FROM rent_ids WHERE name = 'd1') AND reversed_at IS NOT NULL),
  1, 'the rent row is kept and marked reversed');
SELECT is(
  (SELECT COUNT(*)::INT FROM public.get_vendor_required_adjustments(:'v1'::uuid, 1000, NOW()) WHERE adjustment_type = 'booth_rent'),
  1, 'and the month is owed again');

SELECT * FROM finish();
ROLLBACK;
