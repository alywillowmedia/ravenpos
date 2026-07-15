BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(33);

SELECT has_table('public', 'payout_sale_allocations', 'exact sale allocation ledger exists');
SELECT has_table('public', 'payout_adjustments', 'payout adjustment ledger exists');
SELECT has_table('public', 'invoice_payments', 'append-only invoice payment ledger exists');
SELECT has_table('public', 'payout_reversals', 'payout reversal ledger exists');
SELECT has_table('public', 'payout_legacy_balances', 'structured legacy balances exist');
SELECT has_table('public', 'payout_settings', 'global payout settings exist');

SELECT has_function('public', 'get_payout_queue', ARRAY['date', 'date']);
SELECT has_function('public', 'get_vendor_payout_workspace', ARRAY['uuid', 'date', 'date']);
SELECT has_function('public', 'get_payout_sale_financials', ARRAY['uuid', 'timestamp with time zone']);
SELECT has_function('public', 'save_payout_draft', ARRAY['uuid', 'uuid', 'text', 'date', 'date', 'boolean', 'numeric', 'jsonb', 'text', 'text']);
SELECT has_function('public', 'finalize_payout', ARRAY['uuid', 'text', 'date', 'text', 'text', 'text']);
SELECT has_function('public', 'void_payout', ARRAY['uuid', 'text']);
SELECT has_function('public', 'record_invoice_payment', ARRAY['uuid', 'numeric', 'date', 'text', 'text']);
SELECT has_function('public', 'get_payout_statement', ARRAY['uuid']);
SELECT has_function('public', 'get_invoice_workspace', ARRAY['uuid']);
SELECT has_function('public', 'get_payout_reconciliation_report', ARRAY[]::text[]);

SELECT col_not_null('public'::name, 'payout_sale_allocations'::name, 'amount_settled'::name, 'allocation amount is required');
SELECT col_not_null('public'::name, 'payout_sale_allocations'::name, 'remaining_amount_after'::name, 'allocation remainder is required');
SELECT col_not_null('public'::name, 'payout_adjustments'::name, 'amount'::name, 'adjustment amount is required');
SELECT col_not_null('public'::name, 'invoice_payments'::name, 'amount'::name, 'invoice payment amount is required');

SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.payouts'::regclass), 'payouts RLS enabled');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.payout_sale_allocations'::regclass), 'allocation RLS enabled');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.payout_adjustments'::regclass), 'adjustment RLS enabled');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.invoice_payments'::regclass), 'invoice payment RLS enabled');

SELECT ok(EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.payouts'::regclass AND tgname = 'guard_paid_payout_mutation'), 'paid payout immutability trigger installed');
SELECT ok(EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.payout_sale_allocations'::regclass AND tgname = 'guard_payout_sale_allocations_mutation'), 'allocation evidence immutability trigger installed');
SELECT ok(EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.invoice_payments'::regclass AND tgname = 'guard_append_only_invoice_payment'), 'invoice payment append-only trigger installed');
SELECT ok(EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_payout_allocations_item_paid'), 'allocation open-balance index installed');
SELECT ok(EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_payouts_queue'), 'payout queue partial index installed');
SELECT ok(EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uniq_payouts_one_draft_per_vendor'), 'only one active draft per vendor is allowed');
SELECT ok(has_function_privilege('authenticated', 'public.finalize_payout(uuid,text,date,text,text,text)', 'EXECUTE'), 'authenticated sessions can reach the authorization-checked finalize RPC');
SELECT ok(NOT has_function_privilege('anon', 'public.finalize_payout(uuid,text,date,text,text,text)', 'EXECUTE'), 'anonymous sessions cannot execute finalize RPC');
SELECT is((SELECT default_threshold FROM public.payout_settings WHERE singleton), 100::numeric, 'default threshold is $100');

SELECT * FROM finish();
ROLLBACK;
