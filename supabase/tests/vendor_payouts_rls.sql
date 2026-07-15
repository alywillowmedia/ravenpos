BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(13);

INSERT INTO public.consignors (id, consignor_number, name, commission_split, is_active) VALUES
  ('10000000-0000-0000-0000-000000000001', 'RLS-V1', 'RLS Vendor One', 0.60, TRUE),
  ('10000000-0000-0000-0000-000000000002', 'RLS-V2', 'RLS Vendor Two', 0.60, TRUE);
INSERT INTO auth.users (id) VALUES
  ('20000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002'),
  ('20000000-0000-0000-0000-000000000003'),
  ('20000000-0000-0000-0000-000000000004');
ALTER TABLE public.employees DISABLE TRIGGER USER;
INSERT INTO public.employees (id, name, pin_hash, pin_salt) VALUES
  ('50000000-0000-0000-0000-000000000001', 'RLS Employee', 'test-hash', 'test-salt');
ALTER TABLE public.employees ENABLE TRIGGER USER;
ALTER TABLE public.users DISABLE TRIGGER USER;
INSERT INTO public.users (id, email, role, consignor_id, employee_id) VALUES
  ('20000000-0000-0000-0000-000000000001', 'admin-rls@example.test', 'admin', NULL, NULL),
  ('20000000-0000-0000-0000-000000000002', 'vendor1-rls@example.test', 'vendor', '10000000-0000-0000-0000-000000000001', NULL),
  ('20000000-0000-0000-0000-000000000003', 'vendor2-rls@example.test', 'vendor', '10000000-0000-0000-0000-000000000002', NULL),
  ('20000000-0000-0000-0000-000000000004', 'employee-rls@example.test', 'employee', NULL, '50000000-0000-0000-0000-000000000001');
ALTER TABLE public.users ENABLE TRIGGER USER;

INSERT INTO public.payouts (
  id, consignor_id, amount, period_start, period_end, paid_at, status,
  historical_confidence
) VALUES
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 10, NOW(), NOW(), NOW(), 'paid', 'verified'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 20, NOW(), NOW(), NOW(), 'paid', 'verified');
SELECT set_config('app.allow_payout_reconciliation', 'on', TRUE);
INSERT INTO public.payout_adjustments (payout_id, consignor_id, adjustment_type, amount, description) VALUES
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'other', 1, 'Vendor one evidence'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'other', 1, 'Vendor two evidence');
INSERT INTO public.invoices (id, recipient_type, consignor_id, recipient_name, total) VALUES
  ('40000000-0000-0000-0000-000000000001', 'vendor', '10000000-0000-0000-0000-000000000001', 'RLS Vendor One', 5),
  ('40000000-0000-0000-0000-000000000002', 'vendor', '10000000-0000-0000-0000-000000000002', 'RLS Vendor Two', 6);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', TRUE);
SELECT set_config('request.jwt.claim.role', 'authenticated', TRUE);
SELECT is((SELECT COUNT(*)::integer FROM public.payouts), 1, 'vendor reads only own payout row');
SELECT is((SELECT COUNT(*)::integer FROM public.payout_adjustments), 1, 'vendor reads only own adjustment evidence');
SELECT is((SELECT COUNT(*)::integer FROM public.invoices), 1, 'vendor reads only own vendor invoice');
SELECT lives_ok($$ SELECT public.get_vendor_payout_workspace('10000000-0000-0000-0000-000000000001', NULL, NULL) $$, 'vendor can call own canonical workspace');
SELECT throws_like($$ SELECT public.get_vendor_payout_workspace('10000000-0000-0000-0000-000000000002', NULL, NULL) $$, '%Not authorized%', 'vendor cannot call another vendor workspace');
SELECT throws_like($$ UPDATE public.payouts SET amount = 99 WHERE id = '30000000-0000-0000-0000-000000000001' $$, '%permission denied%', 'vendor cannot mutate payout financial data');

SELECT set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000004', TRUE);
SELECT is((SELECT COUNT(*)::integer FROM public.payouts), 0, 'employee cannot read payouts');
SELECT is((SELECT COUNT(*)::integer FROM public.payout_adjustments), 0, 'employee cannot read payout adjustments');
SELECT is((SELECT COUNT(*)::integer FROM public.invoices), 0, 'employee cannot read financial invoices');
SELECT throws_like($$ SELECT public.get_payout_statement('30000000-0000-0000-0000-000000000001') $$, '%Not authorized%', 'employee cannot call payout statement RPC');

SELECT set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', TRUE);
SELECT is((
  SELECT COUNT(*)::integer
  FROM public.payouts
  WHERE id IN (
    '30000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000002'
  )
), 2, 'admin reads both vendors payout fixtures');
SELECT is((
  SELECT COUNT(*)::integer
  FROM public.invoices
  WHERE id IN (
    '40000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000002'
  )
), 2, 'admin reads both vendors invoice fixtures');
SELECT lives_ok($$ SELECT public.get_payout_queue(NULL, NULL) $$, 'admin can call payout queue RPC');

SELECT * FROM finish();
ROLLBACK;
