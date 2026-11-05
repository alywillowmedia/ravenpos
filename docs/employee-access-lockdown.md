# Employee access lockdown

Closes public read access to `employees`. Migration:
`supabase/migrations/20261105120000_close_public_employee_access.sql`. Tests:
`supabase/tests/employee_access_rls.sql`.

Nothing here has run against production. The exposure was confirmed on the local
clone and in migrations only.

## What was wrong

- `employees`: migration 011 (added 2026-01-20) left a `USING (true)` select policy
  on every role. The anon key could read all columns, and so could any anonymous
  sign-in, vendor or employee.
- `time_entries`: not readable. Migration 053 already scoped its policies to
  `authenticated`, and `anon` got no rows. Only the grants were too wide.
- Writes: `anon` held write grants on both tables, but RLS blocked them.
- Other employee tables (`employee_sessions`, `employee_pin_attempts`, schedules,
  time off, roles, payroll, `employee_payouts`): no open policy. All need an admin,
  the service role or the caller's own employee id. Their `anon` grants are unchanged.

## What changed

- Removed the open policy and limited the admin policy to `authenticated`.
- `anon` has no privileges on `employees` or `time_entries`. Its reads now fail with
  a permission error instead of returning rows.
- `authenticated` can no longer select `pin_hash` or `pin_salt`, admins included.
  Admins can still write them, so setting a PIN works. Only the service role reads them.
- New `get_chat_employee_names(uuid[])` returns id and name only, and only for
  employees who share a thread with the caller or posted in one. Not callable by `anon`.
- Client: `useEmployees` lists columns instead of `*`, and `useMessaging` calls the
  new function.

## Who reads these tables without an admin or employee login

Nobody needs `anon` access, so no public function or view was added.

| Caller | How it reads | After the change |
| --- | --- | --- |
| `verify-employee-pin`, `manage-employee-account`, `send-employee-weekly-schedules` | Service role | Unchanged |
| PIN mode and POS | Anonymous sign-in, then `authenticated` through `employee_sessions` | Own rows only, which is all they read |
| `useEmployees`, `Sales.tsx:607` | Admin pages only (`Sales` skips this read in employee view) | Admin policy |
| `EmployeePortalDashboard` | Own row and own time entries | Own-row policies |
| `useMessaging` participant names | Vendors and employees relied on the open policy | New function |
| SQL functions and views | No views. Only `SECURITY DEFINER` functions touch these tables | Unchanged |

## What was checked

- Before the migration, 24 pgTAP assertions failed, including anon reading employees.
- `npm run local:test:payouts`: 132 assertions pass, 55 of them new. Rerunning the
  migration is clean.
- The 55 new assertions also pass on a current schema: the July backup schema plus
  every later migration, in a throwaway stack. The clone is older than `main`.
- Browser and real edge functions, on that throwaway stack with synthetic data only
  (the clone cannot run PIN sign-in, and it holds real staff data):
  - device check, PIN sign-in, wrong PIN, clock in and out, POS, reload, chat names
  - employee portal
  - admin roster, add employee, PIN reset then sign-in with the new PIN, schedule,
    payroll, sales
  - vendor chat names, with 0 employee and 0 time entry rows readable
- `tsc`, `eslint` and `npm run build` pass. `npm test` has 3 failing files, the same
  on clean `main`: `consignorTaxReports`, `stripeTerminalCustomerInputs` (missing
  Supabase env vars) and `portalNavigation`.

Not checked: production, the Electron app, Windows printing, and the real Stripe or
Shopify paths.

## Rollout order

1. Confirm `employees.removed_at` exists in production. The client now names it.
2. Ship the web and desktop client first. Old clients use `select=*`, which fails after
   the migration on the admin Timecards, Schedule and Payroll pages. Desktop updates
   itself, so any machine that has not updated hits this. PIN mode and POS do not.
3. Apply the migration straight after. Until it runs, the new client shows "Employee"
   in place of chat names.
4. Reset PINs.

To close the read before the client ships, the single statement
`DROP POLICY "Service role can read employees" ON public.employees;` is safe with every
client. Non-admin chat names on old clients fall back to "Employee".

The local clone now has this migration but predates `removed_at`, so the admin employee
pages need a fresh `npm run local:clone`.

## PIN reset recommendation

Reset all staff PINs, after the migration is live so the new hashes are never exposed.

If production matches the clone, anyone with the public key could read each hash and
salt. A PIN is one salted SHA-256 over 4 to 6 digits, so every PIN can be recovered in
seconds. Treat them as known, even with no sign of access. API logs may help, but
limited retention means a clean log proves little.

A PIN alone only works on an authorized device, so the main risk is someone at a
terminal clocking in or selling as a coworker. Resetting takes a minute per employee.

Use 4 digits: the admin form accepts 4 to 6, but the keypad submits at 4, so a longer
PIN cannot be entered.

Names, wages and addresses were readable too. Whether to tell staff is the owner's call.

## Follow-ups, not fixed here

- `get_chat_admin_contacts` is callable by `anon` and returns admin names and emails.
- Any signed-in user can add themselves to a chat thread whose id they know. A vendor
  joined the Admins + Employees thread in the local check. That also lets them resolve
  that thread's employee names through the new function.
- Employees can update their own `time_entries` through the API, including clock times.
