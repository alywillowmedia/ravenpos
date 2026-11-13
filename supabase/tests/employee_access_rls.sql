-- Access rules for public.employees and public.time_entries.
-- Everything here is synthetic and rolled back, so it is safe on a restored clone.
-- Assertions report counts or seeded ids only, never restored employee values.

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(55);

INSERT INTO public.consignors (id, consignor_number, name, commission_split, is_active) VALUES
  ('e0000000-0000-0000-0000-000000000001', 'EMP-RLS-V1', 'Access Test Vendor', 0.60, TRUE);

-- a1 admin, a2 vendor, a3 credential employee, a4 live PIN session,
-- a5 anonymous sign-in with no employee session, a6 expired PIN session,
-- a7 vendor linked to an employee record.
INSERT INTO auth.users (id) VALUES
  ('a0000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000002'),
  ('a0000000-0000-0000-0000-000000000003'),
  ('a0000000-0000-0000-0000-000000000004'),
  ('a0000000-0000-0000-0000-000000000005'),
  ('a0000000-0000-0000-0000-000000000006'),
  ('a0000000-0000-0000-0000-000000000007');

ALTER TABLE public.employees DISABLE TRIGGER USER;
INSERT INTO public.employees (id, name, pin_hash, pin_salt, hourly_rate, is_active, address_line_1) VALUES
  ('e1000000-0000-0000-0000-000000000001', 'Access Test One', 'hash-1', 'salt-1', 21, TRUE, '1 Test Way'),
  ('e1000000-0000-0000-0000-000000000002', 'Access Test Two', 'hash-2', 'salt-2', 22, TRUE, '2 Test Way'),
  ('e1000000-0000-0000-0000-000000000003', 'Access Test Three', 'hash-3', 'salt-3', 23, TRUE, '3 Test Way'),
  ('e1000000-0000-0000-0000-000000000004', 'Access Test Four', 'hash-4', 'salt-4', 24, TRUE, '4 Test Way');
ALTER TABLE public.employees ENABLE TRIGGER USER;

ALTER TABLE public.users DISABLE TRIGGER USER;
INSERT INTO public.users (id, email, role, consignor_id, employee_id, linked_employee_id) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'admin-emp-rls@example.test', 'admin', NULL, NULL, NULL),
  ('a0000000-0000-0000-0000-000000000002', 'vendor-emp-rls@example.test', 'vendor', 'e0000000-0000-0000-0000-000000000001', NULL, NULL),
  ('a0000000-0000-0000-0000-000000000003', 'employee-emp-rls@example.test', 'employee', NULL, 'e1000000-0000-0000-0000-000000000001', NULL),
  ('a0000000-0000-0000-0000-000000000007', 'linked-emp-rls@example.test', 'vendor', 'e0000000-0000-0000-0000-000000000001', NULL, 'e1000000-0000-0000-0000-000000000004');
ALTER TABLE public.users ENABLE TRIGGER USER;

INSERT INTO public.employee_sessions (auth_user_id, employee_id, expires_at) VALUES
  ('a0000000-0000-0000-0000-000000000004', 'e1000000-0000-0000-0000-000000000003', NOW() + INTERVAL '1 hour'),
  ('a0000000-0000-0000-0000-000000000006', 'e1000000-0000-0000-0000-000000000002', NOW() - INTERVAL '1 hour');

INSERT INTO public.time_entries (id, employee_id, clock_in, clock_out, total_hours) VALUES
  ('e2000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', NOW() - INTERVAL '3 hours', NOW() - INTERVAL '2 hours', 1),
  ('e2000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000002', NOW() - INTERVAL '3 hours', NOW() - INTERVAL '2 hours', 1),
  ('e2000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-000000000003', NOW() - INTERVAL '3 hours', NOW() - INTERVAL '2 hours', 1);

-- Thread 1 holds employee one and the vendor; employee three posted there but is
-- no longer a member. Thread 2 holds employee two and the admin.
INSERT INTO public.chat_threads (id, thread_type, title) VALUES
  ('e3000000-0000-0000-0000-000000000001', 'group', 'Access test shared'),
  ('e3000000-0000-0000-0000-000000000002', 'group', 'Access test private');
INSERT INTO public.chat_thread_members (thread_id, member_type, user_id, employee_id) VALUES
  ('e3000000-0000-0000-0000-000000000001', 'employee', NULL, 'e1000000-0000-0000-0000-000000000001'),
  ('e3000000-0000-0000-0000-000000000001', 'user', 'a0000000-0000-0000-0000-000000000002', NULL),
  ('e3000000-0000-0000-0000-000000000002', 'employee', NULL, 'e1000000-0000-0000-0000-000000000002'),
  ('e3000000-0000-0000-0000-000000000002', 'user', 'a0000000-0000-0000-0000-000000000001', NULL);
INSERT INTO public.chat_messages (thread_id, sender_type, sender_employee_id, body) VALUES
  ('e3000000-0000-0000-0000-000000000001', 'employee', 'e1000000-0000-0000-0000-000000000003', 'Access test message');

-- Catalog state ---------------------------------------------------------------

SELECT is((
  SELECT COUNT(*)::integer
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('employees', 'time_entries')
    AND ('public' = ANY (roles) OR 'anon' = ANY (roles) OR qual = 'true' OR with_check = 'true')
), 0, 'no employees or time_entries policy is open or applies beyond authenticated');

SELECT ok(NOT has_table_privilege('anon', 'public.employees', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'), 'anon holds no table privilege on employees');
SELECT ok(NOT has_any_column_privilege('anon', 'public.employees', 'SELECT,INSERT,UPDATE,REFERENCES'), 'anon holds no column privilege on employees');
SELECT ok(NOT has_table_privilege('anon', 'public.time_entries', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'), 'anon holds no table privilege on time_entries');
SELECT ok(NOT has_any_column_privilege('anon', 'public.time_entries', 'SELECT,INSERT,UPDATE,REFERENCES'), 'anon holds no column privilege on time_entries');
SELECT ok(NOT has_column_privilege('authenticated', 'public.employees', 'pin_hash', 'SELECT'), 'authenticated cannot select pin_hash');
SELECT ok(NOT has_column_privilege('authenticated', 'public.employees', 'pin_salt', 'SELECT'), 'authenticated cannot select pin_salt');
SELECT ok(has_column_privilege('authenticated', 'public.employees', 'name', 'SELECT'), 'authenticated keeps select on name');
SELECT ok(has_table_privilege('authenticated', 'public.employees', 'INSERT') AND has_table_privilege('authenticated', 'public.employees', 'UPDATE') AND has_table_privilege('authenticated', 'public.employees', 'DELETE'), 'authenticated keeps the write grants admin pages need');
SELECT ok(NOT has_table_privilege('authenticated', 'public.employees', 'TRUNCATE,REFERENCES,TRIGGER'), 'authenticated loses unused employee privileges');
SELECT ok(NOT has_table_privilege('authenticated', 'public.time_entries', 'TRUNCATE,REFERENCES,TRIGGER'), 'authenticated loses unused time entry privileges');

-- No login at all --------------------------------------------------------------
-- Denied outright, which is stricter than an empty result.

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', TRUE);
SELECT set_config('request.jwt.claim.role', 'anon', TRUE);
SELECT throws_ok($$ SELECT id FROM public.employees $$, '42501', NULL, 'anon reads no employee rows');
SELECT throws_ok($$ SELECT pin_hash, pin_salt FROM public.employees $$, '42501', NULL, 'anon reads no PIN columns');
SELECT throws_ok($$ SELECT id FROM public.time_entries $$, '42501', NULL, 'anon reads no time entries');
SELECT throws_ok($$ UPDATE public.employees SET hourly_rate = 99 $$, '42501', NULL, 'anon cannot update employees');
SELECT throws_ok($$ DELETE FROM public.employees $$, '42501', NULL, 'anon cannot delete employees');
SELECT throws_ok($$ INSERT INTO public.time_entries (employee_id) VALUES ('e1000000-0000-0000-0000-000000000001') $$, '42501', NULL, 'anon cannot insert time entries');

-- Anonymous sign-in with no verified PIN ---------------------------------------

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', TRUE);
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000005', TRUE);
SELECT is((SELECT COUNT(*)::integer FROM public.employees), 0, 'anonymous sign-in without a PIN reads no employees');
SELECT is((SELECT COUNT(*)::integer FROM public.time_entries), 0, 'anonymous sign-in without a PIN reads no time entries');

SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000006', TRUE);
SELECT is((SELECT COUNT(*)::integer FROM public.employees), 0, 'expired PIN session reads no employees');
SELECT is((SELECT COUNT(*)::integer FROM public.time_entries), 0, 'expired PIN session reads no time entries');

-- Vendors ----------------------------------------------------------------------

SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', TRUE);
SELECT is((SELECT COUNT(*)::integer FROM public.employees), 0, 'vendor reads no employees');
SELECT is((SELECT COUNT(*)::integer FROM public.time_entries), 0, 'vendor reads no time entries');
WITH changed AS (
  UPDATE public.employees SET hourly_rate = 99 WHERE id = 'e1000000-0000-0000-0000-000000000001' RETURNING 1
) SELECT is(COUNT(*)::integer, 0, 'vendor cannot update employees') FROM changed;

SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000007', TRUE);
SELECT results_eq(
  $$ SELECT id FROM public.employees $$,
  $$ VALUES ('e1000000-0000-0000-0000-000000000004'::uuid) $$,
  'vendor linked to an employee record reads only that record'
);

-- Employees with a credential login ---------------------------------------------

SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000003', TRUE);
SELECT results_eq(
  $$ SELECT id FROM public.employees $$,
  $$ VALUES ('e1000000-0000-0000-0000-000000000001'::uuid) $$,
  'employee reads only their own row'
);
SELECT lives_ok($$ SELECT name, hourly_rate, address_line_1 FROM public.employees $$, 'employee can read own profile columns');
SELECT throws_ok($$ SELECT pin_hash FROM public.employees $$, '42501', NULL, 'employee cannot read own pin_hash');
SELECT throws_ok($$ SELECT * FROM public.employees $$, '42501', NULL, 'select star cannot reach PIN columns');
WITH changed AS (
  UPDATE public.employees SET hourly_rate = 99 WHERE id = 'e1000000-0000-0000-0000-000000000001' RETURNING 1
) SELECT is(COUNT(*)::integer, 0, 'employee cannot change own employee row') FROM changed;
SELECT results_eq(
  $$ SELECT id FROM public.time_entries $$,
  $$ VALUES ('e2000000-0000-0000-0000-000000000001'::uuid) $$,
  'employee reads only own time entries'
);
SELECT lives_ok($$ INSERT INTO public.time_entries (employee_id) VALUES ('e1000000-0000-0000-0000-000000000001') $$, 'employee can clock in');
SELECT throws_ok($$ INSERT INTO public.time_entries (employee_id) VALUES ('e1000000-0000-0000-0000-000000000002') $$, '42501', NULL, 'employee cannot clock in a coworker');
WITH changed AS (
  UPDATE public.time_entries SET notes = 'changed' WHERE id = 'e2000000-0000-0000-0000-000000000002' RETURNING 1
) SELECT is(COUNT(*)::integer, 0, 'employee cannot change a coworker time entry') FROM changed;

-- Employees on a verified PIN session --------------------------------------------

SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000004', TRUE);
SELECT results_eq(
  $$ SELECT id FROM public.employees $$,
  $$ VALUES ('e1000000-0000-0000-0000-000000000003'::uuid) $$,
  'PIN session reads only its own employee row'
);
SELECT results_eq(
  $$ SELECT id FROM public.time_entries $$,
  $$ VALUES ('e2000000-0000-0000-0000-000000000003'::uuid) $$,
  'PIN session reads only own time entries'
);
SELECT lives_ok($$ INSERT INTO public.time_entries (employee_id) VALUES ('e1000000-0000-0000-0000-000000000003') $$, 'PIN session can clock in');
WITH changed AS (
  UPDATE public.time_entries SET clock_out = NOW(), total_hours = 1
  WHERE employee_id = 'e1000000-0000-0000-0000-000000000003' AND clock_out IS NULL
  RETURNING 1
) SELECT is(COUNT(*)::integer, 1, 'PIN session can clock out') FROM changed;

-- Admins -------------------------------------------------------------------------

SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', TRUE);
SELECT is((
  SELECT COUNT(*)::integer FROM public.employees
  WHERE id::text LIKE 'e1000000-%'
), 4, 'admin reads every employee');
SELECT lives_ok($$ SELECT id, name, hourly_rate, is_active, address_line_1, city, created_at FROM public.employees $$, 'admin can read the roster columns');
SELECT throws_ok($$ SELECT pin_hash FROM public.employees $$, '42501', NULL, 'admin cannot read pin_hash through the API roles');
SELECT lives_ok($$
  INSERT INTO public.employees (id, name, pin_hash, pin_salt, hourly_rate, is_active)
  VALUES ('e1000000-0000-0000-0000-000000000005', 'Access Test Five', 'hash-5', 'salt-5', 25, TRUE)
$$, 'admin can create an employee with PIN columns');
WITH changed AS (
  UPDATE public.employees SET pin_hash = 'hash-new', pin_salt = 'salt-new', hourly_rate = 26
  WHERE id = 'e1000000-0000-0000-0000-000000000005'
  RETURNING 1
) SELECT is(COUNT(*)::integer, 1, 'admin can change a rate and reset a PIN') FROM changed;
WITH changed AS (
  DELETE FROM public.employees WHERE id = 'e1000000-0000-0000-0000-000000000005' RETURNING 1
) SELECT is(COUNT(*)::integer, 1, 'admin can delete an employee') FROM changed;
SELECT is((
  SELECT COUNT(*)::integer FROM public.time_entries
  WHERE employee_id::text LIKE 'e1000000-%' AND id::text LIKE 'e2000000-%'
), 3, 'admin reads every time entry');
WITH changed AS (
  UPDATE public.time_entries SET notes = 'admin edit' WHERE id = 'e2000000-0000-0000-0000-000000000002' RETURNING 1
) SELECT is(COUNT(*)::integer, 1, 'admin can edit a time entry') FROM changed;
WITH changed AS (
  DELETE FROM public.time_entries WHERE id = 'e2000000-0000-0000-0000-000000000002' RETURNING 1
) SELECT is(COUNT(*)::integer, 1, 'admin can delete a time entry') FROM changed;

-- Edge functions -----------------------------------------------------------------

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.sub', '', TRUE);
SELECT set_config('request.jwt.claim.role', 'service_role', TRUE);
SELECT is((
  SELECT COUNT(*)::integer FROM public.employees
  WHERE id::text LIKE 'e1000000-%' AND pin_hash IS NOT NULL AND pin_salt IS NOT NULL AND is_active
), 4, 'service role still reads what verify-employee-pin needs');
RESET ROLE;

-- Chat name lookup ---------------------------------------------------------------
-- Last on purpose: before the migration the function is missing and this aborts.

SELECT ok(to_regprocedure('public.get_chat_employee_names(uuid[])') IS NOT NULL, 'chat name lookup exists');
SELECT is(
  pg_get_function_result('public.get_chat_employee_names(uuid[])'::regprocedure),
  'TABLE(id uuid, name text)',
  'chat name lookup returns only id and name'
);
SELECT ok(NOT has_function_privilege('anon', 'public.get_chat_employee_names(uuid[])', 'EXECUTE'), 'anon cannot run the chat name lookup');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', TRUE);

SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', TRUE);
SELECT set_eq(
  $$ SELECT id FROM public.get_chat_employee_names(ARRAY[
       'e1000000-0000-0000-0000-000000000001',
       'e1000000-0000-0000-0000-000000000002',
       'e1000000-0000-0000-0000-000000000003'
     ]::uuid[]) $$,
  $$ VALUES ('e1000000-0000-0000-0000-000000000001'::uuid), ('e1000000-0000-0000-0000-000000000003'::uuid) $$,
  'vendor resolves only employees in own threads, including past senders'
);

SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000003', TRUE);
SELECT set_eq(
  $$ SELECT id FROM public.get_chat_employee_names(ARRAY[
       'e1000000-0000-0000-0000-000000000002',
       'e1000000-0000-0000-0000-000000000003'
     ]::uuid[]) $$,
  $$ VALUES ('e1000000-0000-0000-0000-000000000003'::uuid) $$,
  'employee resolves only coworkers in shared threads'
);

SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', TRUE);
SELECT is((
  SELECT COUNT(*)::integer FROM public.get_chat_employee_names(ARRAY[
    'e1000000-0000-0000-0000-000000000003',
    'e1000000-0000-0000-0000-000000000004'
  ]::uuid[])
), 2, 'admin resolves any employee');

SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000005', TRUE);
SELECT is((
  SELECT COUNT(*)::integer FROM public.get_chat_employee_names(ARRAY[
    'e1000000-0000-0000-0000-000000000001',
    'e1000000-0000-0000-0000-000000000003'
  ]::uuid[])
), 0, 'anonymous sign-in without a PIN resolves no names');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
