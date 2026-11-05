# Vendor Payouts Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the vendor payout flow with one date-driven queue, batch prepare, a pay run and statement emails, on the shared design system, with vendor earnings that agree with payouts.

**Architecture:** One idempotent migration adds a `through_date` payout type, store-time date helpers and a single shared scope calculation that both the queue and `save_payout_draft` read. The screens are rebuilt on `src/components/ui/`, with all arithmetic in two pure `.ts` modules so Vitest can reach it. A new edge function sends statements and logs each attempt.

**Tech Stack:** React 19, TypeScript, Tailwind v4 tokens, Supabase (Postgres, pgTAP, Deno edge functions), Resend, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-05-vendor-payouts-rework-design.md`. Screen layout, copy and the Terms table live there; this plan does not repeat them.

## Global Constraints

- All work on branch `vendor-payouts-rework`. Never commit to `main`.
- Commit messages carry no `Co-Authored-By` or Claude attribution (it blocks Vercel builds).
- Nothing is pushed, merged to `main`, migrated to the linked project, or deployed. Local backups stay local.
- Migration is idempotent: `CREATE OR REPLACE`, `ADD COLUMN IF NOT EXISTS`, `DROP ... IF EXISTS` then add. It must re-run cleanly.
- Existing function signatures stay valid. `get_payout_queue` and `get_payout_range_preview` are not removed.
- New functions: `REVOKE ALL ... FROM PUBLIC, anon, authenticated`, then `GRANT` as each task says. All `SECURITY DEFINER` with `SET search_path = public, pg_temp`.
- Never use Tailwind `dark:` variants. Use tokens, which follow `data-theme`.
- `cn()` is a plain join and does not merge conflicting classes.
- UI uses `src/components/ui/` and `Header` from `src/components/layout/Header.tsx`. Money uses `Money`. No all-caps labels, no `font-display`, no square bordered boxes.
- At most one thin bar per page. Green and red only mean good and bad.
- Use the spec's Terms exactly: Earnings through, Carried in, Earned, Deductions, Payable, Paying now, Rolls forward, Not in this payout.
- Logic goes in `.ts`. Vitest only runs `tests/**/*.test.ts` in a node environment.
- `npm run lint` has two known errors in `supabase/functions/send-employee-weekly-schedules/index.ts`. No others are acceptable.
- Test dates in pgTAP use 2025, so they are always in the past of `NOW()`.

## Review Focus

1. An empty or non-numeric payment amount must be an error, never a silent $0 payment. Pinned in Task 5.
2. A second finalize from a stale tab or double click must read as "already paid", not a raw server error. Pinned in Task 5.
3. A junk or future `through` value in the URL must fall back to the default date. Pinned in Task 4.
4. A payout where invoices absorb everything ($0 cash) must finalize and must not demand a check number. Pinned in Tasks 2 and 5.
5. A vendor drafted at an older date must keep showing that draft's figures and date, and stay out of the Prepare count. Pinned in Tasks 2 and 4.

---

### Task 1: Branch, store-time cutoffs and through-date drafts

**Files:**
- Create: `supabase/migrations/20261105120000_vendor_payouts_rework.sql`
- Create: `supabase/tests/vendor_payouts_run.sql`
- Modify: `scripts/local-supabase-clone.sh:8-9,228-262,271-274`

**Interfaces:**
- Produces (SQL): `payout_store_time_zone() → TEXT`, `payout_day_start(DATE) → TIMESTAMPTZ`, `payout_day_end(DATE) → TIMESTAMPTZ` (exclusive: start of the next store day), `payout_sale_in_scope(TIMESTAMPTZ, TEXT, DATE, DATE, BOOLEAN) → BOOLEAN`, `get_vendor_payout_threshold(UUID) → NUMERIC`, `get_payout_scope_summary(UUID, TEXT, DATE, DATE, BOOLEAN, TIMESTAMPTZ DEFAULT NOW())`.
- `get_payout_scope_summary` returns one row: `carried_in, earned, source_available, legacy_available, booth_rent, other_required, required_total, invoices_applied, payable_before_invoices, payable, pending_total NUMERIC; pending_count INTEGER; pending_type TEXT; sales_count, items_count, legacy_item_count INTEGER`.

- [ ] **Step 1: Create the branch and bring in the audit fixes**

```bash
git checkout -b vendor-payouts-rework design-system-foundation
git merge --no-edit fix-audit-bugs
npm test
```
Expected: merge has no conflicts (checked with `git merge-tree`); tests pass.

- [ ] **Step 2: Commit the spec and plan**

```bash
git add docs/superpowers/specs/2026-11-05-vendor-payouts-rework-design.md docs/superpowers/plans/2026-11-05-vendor-payouts-rework.md
git commit -m "Add vendor payouts rework spec and plan"
```

- [ ] **Step 3: Teach the local script about the new work**

In `scripts/local-supabase-clone.sh`:
- Add `PAYOUT_RANGE_PREVIEW` (20261012120000) and `PAYOUT_RUN_MIGRATION` (20261105120000) beside the existing path variables.
- Add `apply_payout_rework()`, which applies both files with `psql --set ON_ERROR_STOP=1 --file` and sends `NOTIFY pgrst, 'reload schema';`.
- Call it from `apply_payout_migration` on both paths. The "already present" branch must call it before its `return`.
- Add `supabase/tests/vendor_payouts_run.sql` to the `test_payouts` file list.

- [ ] **Step 4: Write the failing pgTAP tests**

Create `supabase/tests/vendor_payouts_run.sql`. Open with `BEGIN;`, the pgtap extension, `SELECT * FROM no_plan();` and the `service_role` claim, as `vendor_payouts_behavior.sql` does. Close with `SELECT * FROM finish(); ROLLBACK;`. Later tasks append above that footer.

Add `\set v1 'a0000000-0000-0000-0000-000000000001'` and likewise for each vendor, so `:'v1'` works outside dollar-quoted strings. Add a `pg_temp.add_sale(sale_id, item_id, consignor_id, at TIMESTAMPTZ, price NUMERIC)` helper that inserts a cash `sales` row and one `sale_items` row with `commission_split` 0.60 and `consignor_pays_card_fee` FALSE.

Fixtures:

| Vendor | State | Sales (price, store time) |
|---|---|---|
| `...0001` RUN-1 | active, minimum 50 | 100 on 2025-09-15 12:00; 50 on 2025-10-31 23:00; 10 on 2025-11-01 00:30 |
| `...0002` RUN-2 | inactive, minimum 50, no email | 20 on 2025-10-10 12:00 |
| `...0003` RUN-3 | active, minimum 1 | 100 on 2025-09-10 12:00; 50 on 2025-10-10 12:00 |
| `...0004` RUN-4 | active, no override | none |

Assertions:

```sql
SELECT is(public.payout_day_start('2025-11-02'), '2025-11-02 04:00:00+00'::timestamptz, 'store day starts in daylight time');
SELECT is(public.payout_day_end('2025-11-02'), '2025-11-03 05:00:00+00'::timestamptz, 'store day ends in standard time');
SELECT is((SELECT earned FROM public.get_payout_scope_summary(:'v1'::uuid, 'through_date', NULL, '2025-10-31', TRUE)), 90.00::numeric, 'cutoff keeps 11pm on the last day and older sales, drops 12:30am next day');
SELECT is(public.get_vendor_payout_threshold(:'v2'::uuid), 0::numeric, 'inactive vendor has no minimum');
SELECT is(public.get_vendor_payout_threshold(:'v1'::uuid), 50::numeric, 'override wins');
SELECT is(public.get_vendor_payout_threshold(:'v4'::uuid), 100::numeric, 'shop default applies');
```

Then, by calling `save_payout_draft`:
- `through_date` through 2025-10-31 for RUN-1: `amount` 90.00, 2 allocations, `source_range_start` null, `include_prior_balance` TRUE, `earned_snapshot` 90.00, `carried_in_snapshot` 0, `cutoff_at` = `payout_day_end('2025-10-31') - INTERVAL '1 microsecond'`.
- `throws_ok` on `through_date` with a null end date, SQLSTATE `22023`.
- Saving that draft again as `selected_range` 2025-10-01 to 2025-10-31 with prior FALSE gives `amount` 30.00: older money stays out.
- RUN-2 draft succeeds with `threshold_snapshot` 0, and `finalize_payout` succeeds with no reason.
- RUN-3: draft through 2025-09-30, pay $40 of $60, finalize. Then `get_payout_scope_summary` through 2025-10-31 gives `carried_in` 20.00 and `earned` 30.00.

- [ ] **Step 5: Run the tests to see them fail**

Run: `npm run local:test:payouts`
Expected: FAIL on `vendor_payouts_run.sql` with `function public.payout_day_start(unknown) does not exist`.

- [ ] **Step 6: Write the schema and helpers**

Schema as the spec's Schema section, including `payout_statement_emails` with RLS enabled, one admin `SELECT` policy using `(SELECT public.is_admin())`, and `GRANT SELECT` to `authenticated`, `ALL` to `service_role`.

Replace both constraints. `payouts_range_dates_check` becomes:

```sql
CHECK (
  range_mode = 'all_outstanding'
  OR (range_mode = 'through_date' AND source_range_end IS NOT NULL AND source_range_start IS NULL)
  OR (range_mode = 'selected_range' AND source_range_start IS NOT NULL AND source_range_end IS NOT NULL
      AND source_range_start <= source_range_end)
)
```

Helpers are `service_role` only. `payout_day_start(d)` is `d::TIMESTAMP AT TIME ZONE tz`. `payout_day_end(d)` is `(d + 1)::TIMESTAMP AT TIME ZONE tz`.

`payout_sale_in_scope`:

```sql
SELECT CASE p_range_mode
  WHEN 'all_outstanding' THEN TRUE
  WHEN 'through_date' THEN p_sale_timestamp < public.payout_day_end(p_end)
  ELSE (p_sale_timestamp >= public.payout_day_start(p_start) AND p_sale_timestamp < public.payout_day_end(p_end))
    OR (p_include_prior AND p_sale_timestamp < public.payout_day_start(p_start))
END;
```

`get_payout_scope_summary`:

1. `last_cutoff` = `MAX(COALESCE(cutoff_at, period_end, paid_at))` over the vendor's `paid` payouts.
2. In-scope rows are `get_payout_sale_financials(consignor, p_as_of)` where `remaining_amount > 0`, `allocation_status <> 'legacy_uncertain'` and `payout_sale_in_scope(...)`.
3. `carried_in` = their remaining on sales at or before `last_cutoff`, plus `get_legacy_balance_remaining` when older balances are in scope (`all_outstanding`, `through_date`, or `p_include_prior`). `earned` = the rest. `source_available` = the sum.
4. From `get_vendor_required_adjustments(consignor, source_available, p_as_of)`: `booth_rent` and `other_required` sum `amount` where `will_apply`; `pending_total` and `pending_count` cover the rest; `pending_type` is the `adjustment_type` of the largest pending row.
5. `invoices_applied` = `LEAST(open vendor invoice balance, GREATEST(source_available - required_total, 0))`.
6. `payable_before_invoices` = `GREATEST(source_available - required_total, 0)`. `payable` = `GREATEST(source_available - required_total - invoices_applied, 0)`.
7. `legacy_item_count` counts all `legacy_uncertain` rows, not just in-scope ones.

- [ ] **Step 7: Replace `save_payout_draft`**

Copy the body from `20260827210000_fix_stale_payout_draft_allocations.sql:6-383` and change only:

- Mode check accepts `through_date`. It requires `p_source_range_end`, else `22023`.
- Add locals `v_source_start` (null for `through_date`) and `v_include_prior` (TRUE for `through_date`). Use them everywhere the parameters were read.
- Replace the active-vendor check with a plain exists check, message `Vendor not found.`
- Cutoff for dated modes is `public.payout_day_end(p_source_range_end) - INTERVAL '1 microsecond'`.
- Threshold comes from `get_vendor_payout_threshold`.
- Both sale filters call `payout_sale_in_scope`.
- The final `UPDATE` also sets both snapshots from `get_payout_scope_summary`.

- [ ] **Step 8: Run all payout SQL tests**

Run: `npm run local:test:payouts`
Expected: no `not ok` in any of the four files, including the three existing ones.

- [ ] **Step 9: Commit**

```bash
git add scripts/local-supabase-clone.sh supabase/migrations/20261105120000_vendor_payouts_rework.sql supabase/tests/vendor_payouts_run.sql
git commit -m "Add through-date payouts with store-time cutoffs"
```

---

### Task 2: Run list, batch prepare and discard

**Files:**
- Modify: `supabase/migrations/20261105120000_vendor_payouts_rework.sql`
- Modify: `supabase/tests/vendor_payouts_run.sql`

**Interfaces:**
- Consumes: Task 1 helpers.
- Produces (SQL, granted to `authenticated` and `service_role`, admin-checked inside):
  - `get_payout_run(p_through DATE DEFAULT NULL) → JSONB` `{ rows, paid_in_month: {count, total}, legacy: {payouts, items} }`
  - `get_vendor_payout_preview(p_consignor_id UUID, p_through DATE DEFAULT NULL) → JSONB` (one row)
  - `prepare_payout_run(p_through DATE, p_consignor_ids UUID[]) → JSONB` array of `{consignor_id, payout_id, status, message}`
  - `discard_payout_draft(p_payout_id UUID) → UUID`
- Row keys match `PayoutRunRow` in Task 4.

- [ ] **Step 1: Append failing tests**

- RUN-5, active, minimum 1, sale of 100: add a `vendor_ledger_entries` charge of 4, a vendor invoice of 5, and a `payout_legacy_balances` row of 7 on a `legacy_unverified` paid payout whose window covers a 2025-08-01 sale. Assert `get_payout_run('2025-10-31')` row `payable` equals `original_amount_due` on the draft from `prepare_payout_run`. **The queue equals the draft.**
- A new active vendor with a draft through 2025-09-30 shows the draft's `paying_now`, `draft_through` = `2025-09-30` and status `draft` from `get_payout_run('2025-10-31')`.
- RUN-7, inactive, sale of 20: `get_payout_run` lists it while owed, and no longer lists it once paid up.
- `paid_in_month` counts a payout paid in the month and excludes a voided one.
- `legacy` reports payouts and items above zero with the RUN-5 fixture.
- `prepare_payout_run` given a drafted vendor, a fresh vendor and a random UUID returns `skipped`, `created` and `failed`, and the created draft exists.
- `discard_payout_draft` removes the row and its allocations; `prepare_payout_run` then creates a new draft for that vendor.
- `throws_like` on discarding a paid payout, and on `get_payout_run` as a vendor (use the role switch from `vendor_payouts_rls.sql:39-41`).
- RUN-6, sale of 10 with a vendor invoice of 50: the draft has `amount` 0, and `finalize_payout` succeeds with method `check` and no reference.

- [ ] **Step 2: Run them to see them fail**

Run: `npm run local:test:payouts`
Expected: FAIL with `function public.get_payout_run(unknown) does not exist`.

- [ ] **Step 3: Implement the four functions**

An internal `build_payout_run_row(consignor, through)` (`service_role` only) holds the row logic.

- No draft: from `get_payout_scope_summary(id, 'through_date', NULL, through, TRUE)`. `paying_now` = `payable`.
- With a draft: stored figures. `carried_in_snapshot`, `earned_snapshot`, `booth_rent_deduction`, `invoice_deduction`, `original_amount_due` as `payable`, `amount` as `paying_now`, `payable_before_invoices_snapshot`, `threshold_snapshot`. `other_deductions` is the sum of negative adjustments that are neither booth rent nor invoices. When snapshots are null, `carried_in` is 0 and `earned` is `payable_before_invoices_snapshot` plus required deductions.
- Status: draft, else paid_up when `payable_before_invoices <= 0`, else ready when at or above the minimum, else accruing.
- `cutoff_at` = `payout_day_end(through) - INTERVAL '1 microsecond'`.

`get_payout_run` defaults `p_through` to the current store date and sorts as `get_payout_queue` does. It keeps vendors where `is_active`, or `payable_before_invoices > 0`, or a draft exists.

`prepare_payout_run` wraps each `save_payout_draft` call in `BEGIN ... EXCEPTION WHEN OTHERS` and records `SQLERRM`. A vendor with a draft is `skipped`.

`discard_payout_draft` locks the row, requires `status = 'draft'` (else `P0002`, message `Only drafts can be discarded.`), then deletes adjustments, allocations and the payout.

- [ ] **Step 4: Run all payout SQL tests**

Run: `npm run local:test:payouts`
Expected: no `not ok`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261105120000_vendor_payouts_rework.sql supabase/tests/vendor_payouts_run.sql
git commit -m "Add payout run list, batch prepare and draft discard"
```

---

### Task 3: Statement, workspace and vendor earnings on the server

**Files:**
- Modify: `supabase/migrations/20261105120000_vendor_payouts_rework.sql`
- Modify: `supabase/tests/vendor_payouts_run.sql`

**Interfaces:**
- Produces (SQL):
  - `get_vendor_sale_earnings(p_consignor_id UUID) → JSONB` array of `{sale_item_id, vendor_earnings}`, for admins or that vendor.
  - `get_payout_statement` adds `actors` and `latest_email`, both null for vendors.
  - `get_vendor_payout_workspace` vendor object adds `email`.

- [ ] **Step 1: Append failing tests**

Add a vendor login for RUN-1 and a second for RUN-3, as `vendor_payouts_rls.sql:5-24` does.

- As the RUN-1 vendor: `throws_like` on `get_payout_statement` of RUN-1's draft (`%not found%`); `lives_ok` on a paid one, with `actors` and `latest_email` null.
- As admin: `actors->>'paid_by_name'` is not null after finalizing as that admin.
- As the RUN-1 vendor: `get_vendor_sale_earnings` for RUN-1 returns 60.00 for the Sep item; for RUN-3 it throws `42501`.
- A card sale with the card fee on the vendor returns less than `net × split`: `vendor_earnings` equals `final_vendor_cut`.
- Vendor reads 0 rows from `payout_statement_emails`; `throws_like` on insert as `authenticated`.
- `get_vendor_payout_workspace` for the inactive vendor reports `threshold` 0 and `vendor->>'email'` null.

- [ ] **Step 2: Run them to see them fail**

Run: `npm run local:test:payouts`
Expected: FAIL with `function public.get_vendor_sale_earnings(unknown) does not exist`.

- [ ] **Step 3: Implement**

- `payout_actor_name(UUID)` (`service_role` only): `COALESCE(employees.name, users.email)` through `users.employee_id`.
- Copy `get_payout_statement` from M1 lines 2009-2100. Refuse drafts for non-admins with `Payout not found.` (`P0002`). Add `actors` and `latest_email` (newest `payout_statement_emails` row) for admins.
- Copy `get_vendor_payout_workspace` from M1 lines 899-1095. Replace the two date casts with `payout_day_end(...)` minus 1 microsecond and `payout_day_start(...)` minus 1 microsecond. Use the threshold helper. Add `email`.
- `get_vendor_sale_earnings`: same access check as the workspace, reads `get_payout_sale_financials(p_consignor_id, NOW())`.

- [ ] **Step 4: Run all payout SQL tests**

Run: `npm run local:test:payouts`
Expected: no `not ok`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261105120000_vendor_payouts_rework.sql supabase/tests/vendor_payouts_run.sql
git commit -m "Lock drafts from vendors and add server earnings"
```

---

### Task 4: Types, calls and run logic

**Files:**
- Create: `src/lib/payoutRun.ts`, `tests/smoke/payoutRun.test.ts`
- Modify: `src/types/payouts.ts`, `src/hooks/usePayouts.ts`

**Interfaces:**
- Produces, in `src/types/payouts.ts`:

```ts
export type PayoutRangeMode = 'all_outstanding' | 'selected_range' | 'through_date';

export interface PayoutRunRow {
    consignor_id: string; consignor_number: string; name: string; business_name: string | null;
    pay_to_name: string; email: string | null; is_active: boolean; threshold: number;
    carried_in: number; earned: number; booth_rent: number; other_deductions: number;
    invoices_applied: number; payable_before_invoices: number; payable: number; paying_now: number;
    status: PayoutReadiness; threshold_remaining: number;
    pending_total: number; pending_count: number; pending_type: string | null;
    draft_id: string | null; draft_through: string | null; override_reason: string | null;
    last_paid_at: string | null; legacy_item_count: number;
    items_count: number; sales_count: number; cutoff_at: string;
}
export interface PayoutRunData {
    rows: PayoutRunRow[];
    paid_in_month: { count: number; total: number };
    legacy: { payouts: number; items: number };
}
export interface PrepareRunResult {
    consignor_id: string; payout_id: string | null;
    status: 'created' | 'skipped' | 'failed'; message: string | null;
}
export interface PayoutHistoryRow {
    id: string; status: PayoutLifecycleStatus; amount: number; paid_at: string | null;
    payment_method: string | null; payment_reference: string | null;
    historical_confidence: HistoricalConfidence;
    consignor: { name: string; business_name: string | null; consignor_number: string };
}
```

Also add `carried_in_snapshot`, `earned_snapshot`, `original_amount_due`, `is_partial`, `paid_by` to the statement's `payout` type; `actors` and `latest_email` to `PayoutStatementData`; and `email` to `PayoutVendorIdentity`.

- Produces, in `src/hooks/usePayouts.ts`: `getPayoutRun(through: string): Promise<PayoutRunData>`, `getVendorPayoutPreview(consignorId, through): Promise<PayoutRunRow>`, `preparePayoutRun(through, consignorIds): Promise<PrepareRunResult[]>`, `discardPayoutDraft(id): Promise<void>`, `getPayoutHistory({ month, status, page, pageSize }): Promise<{ rows: PayoutHistoryRow[]; total: number }>`, `getVendorSaleEarnings(consignorId): Promise<Map<string, number>>`, `sendPayoutStatement(payoutId): Promise<'sent' | 'failed' | 'no_email'>`, `getDefaultThreshold(): Promise<number>`, `updateDefaultThreshold(amount)`, `updateVendorThreshold(consignorId, amount | null)`, and `usePayoutRun(through)` returning `{ data, isLoading, error, refetch }`.
- Produces, in `src/lib/payoutRun.ts`:

```ts
export function defaultThroughDate(today: Date): string;
export function parseThrough(value: string | null, today: Date): string;
export function formatDay(date: string): string;      // 'Oct 31'
export function monthName(date: string): string;      // 'October'
export function statusLine(row: PayoutRunRow): string | null;
export function filterRows(rows: PayoutRunRow[], filter: { search: string; status: RunFilter }): PayoutRunRow[];
export function readyToPrepare(rows: PayoutRunRow[]): PayoutRunRow[];
export function runTotals(rows: PayoutRunRow[]): RunTotals;
export function splitBarParts(totals: RunTotals): SplitBarProps['parts'] | null;
export function payRunTotal(rows: PayoutRunRow[], selectedIds: Set<string>): { count: number; total: number };
export function shortId(id: string): string;          // first 8 chars, uppercased
```

`RunFilter` is `'all' | 'ready' | 'draft' | 'accruing' | 'paid_up'`. `RunTotals` has `ready`, `accruing` and `drafts`, each `{ count, total }`, plus `run: { vendors, payable, boothRent, invoicesAndFees }`.

- [ ] **Step 1: Write the failing tests**

Use a `row(overrides)` factory. Cover:

```ts
expect(defaultThroughDate(new Date(2026, 10, 5))).toBe('2026-10-31');
expect(defaultThroughDate(new Date(2026, 0, 15))).toBe('2025-12-31');
expect(defaultThroughDate(new Date(2024, 2, 10))).toBe('2024-02-29');
expect(parseThrough('2026-09-30', today)).toBe('2026-09-30');
expect(parseThrough('nonsense', today)).toBe('2026-10-31');
expect(parseThrough('2026-13-40', today)).toBe('2026-10-31');
expect(parseThrough('2027-01-01', today)).toBe('2026-10-31');   // future
expect(parseThrough(null, today)).toBe('2026-10-31');

expect(statusLine(row({ status: 'accruing', threshold_remaining: 27.45 }))).toBe('$27.45 to go');
expect(statusLine(row({ pending_count: 1, pending_total: 26.1, pending_type: 'booth_rent' }))).toBe('Booth rent $26.10 still owed');
expect(statusLine(row({ pending_count: 3, pending_total: 40 }))).toBe('$40.00 in deductions still owed');
expect(statusLine(row({ status: 'draft', draft_id: 'a1b2c3d4-0000', draft_through: '2026-09-30' }))).toBe('Draft #A1B2C3D4 · through Sep 30');
expect(statusLine(row({ is_active: false, status: 'paid_up' }))).toBe('Inactive');

expect(readyToPrepare([row({ status: 'ready' }), row({ status: 'draft' })])).toHaveLength(1);
```

Also: In drafts total sums `paying_now`, not `payable`. The run counts ready and draft rows only. `splitBarParts` returns null at $0 and labels Payable, Booth rent, Invoices and fees. `filterRows` matches name, business name, pay-to name and number. `payRunTotal` counts only selected ids.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/smoke/payoutRun.test.ts`
Expected: FAIL, cannot resolve `payoutRun`.

- [ ] **Step 3: Implement the types, calls and logic**

Dates work on local calendar parts, never `toISOString`. Pending labels: `booth_rent` Booth rent, `marketing_fee` Marketing fee, `manual_ledger` Ledger charge, `refund_reversal` Refund. Status lines take priority in this order: draft, inactive, pending, accruing.

`getPayoutHistory` selects from `payouts` with `consignor:consignors(name, business_name, consignor_number)`, `.in('status', ['paid', 'voided'])`, ordered by `paid_at` descending, with `{ count: 'exact' }` and `.range()`.

`sendPayoutStatement` calls `supabase.functions.invoke('send-payout-statement', { body: { payoutId } })` and maps any thrown or failed result to `'failed'`.

`updateDefaultThreshold` writes `default_threshold`, `updated_at` and `updated_by` (the signed-in user) on the `payout_settings` row, where `singleton` is true.

- [ ] **Step 4: Run the tests and the type check**

Run: `npx vitest run tests/smoke/payoutRun.test.ts && npx tsc -b`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/payoutRun.ts tests/smoke/payoutRun.test.ts src/types/payouts.ts src/hooks/usePayouts.ts
git commit -m "Add payout run types, calls and logic"
```

---

### Task 5: Draft logic

**Files:**
- Create: `src/lib/payoutDraft.ts`, `tests/smoke/payoutDraft.test.ts`

**Interfaces:**
- Produces:

```ts
export const PAYMENT_METHODS: SelectOption[];   // check, ach, cash, other, labels as today
export interface DraftFigures { carriedIn: number; earned: number; required: number; invoices: number }
export function draftPayable(figures: DraftFigures): number;
export function rollsForward(payable: number, payingNow: number): number;
export function notInThisPayout(currentPayable: number, payableBeforeInvoices: number): number;
export function nextPayingNow(input: { payable: number; typed: string; following: boolean }): string;
export type DraftScope = { kind: 'through'; date: string } | { kind: 'between'; from: string; to: string };
export function scopeFromPayout(payout: PayoutStatementData['payout'], today: string): DraftScope;
export function scopeToSaveInput(scope: DraftScope): Pick<SavePayoutDraftInput, 'rangeMode' | 'sourceRangeStart' | 'sourceRangeEnd' | 'includePriorBalance'>;
export function validatePayingNow(value: string, payable: number): string | null;
export function validatePayment(input: { method: string; date: string; reference: string; amount: number; reasonRequired: boolean; reason: string }): { reference?: string; reason?: string; date?: string };
export function describeFinalizeError(message: string): string;
export function statementFigures(payout: PayoutStatementData['payout'], adjustments: PayoutAdjustmentSnapshot[]): DraftFigures & { hasSnapshots: boolean };
```

- [ ] **Step 1: Write the failing tests**

```ts
expect(draftPayable({ carriedIn: 20, earned: 30, required: 5, invoices: 10 })).toBe(35);
expect(draftPayable({ carriedIn: 0, earned: 5, required: 3, invoices: 9 })).toBe(0);
expect(rollsForward(35, 20)).toBe(15);
expect(notInThisPayout(50, 35)).toBe(15);
expect(notInThisPayout(30, 35)).toBe(0);

expect(nextPayingNow({ payable: 35, typed: '40.00', following: true })).toBe('35.00');
expect(nextPayingNow({ payable: 35, typed: '20.00', following: false })).toBe('20.00');

expect(validatePayingNow('', 35)).toBe('Enter an amount.');
expect(validatePayingNow('abc', 35)).toBe('Enter an amount.');
expect(validatePayingNow('-1', 35)).toBe('Must be between $0.00 and $35.00.');
expect(validatePayingNow('35.01', 35)).toBe('Must be between $0.00 and $35.00.');
expect(validatePayingNow('0', 35)).toBeNull();

const base = { method: 'check', date: '2026-11-05', reference: '', amount: 10, reasonRequired: false, reason: '' };
expect(validatePayment(base).reference).toBe('Enter the check number.');
expect(validatePayment({ ...base, amount: 0 }).reference).toBeUndefined();
expect(validatePayment({ ...base, method: 'cash' }).reference).toBeUndefined();
expect(validatePayment({ ...base, reference: '1042', reasonRequired: true }).reason).toBe('Say why this payout is below the minimum.');

expect(describeFinalizeError('Finalizable payout draft not found.')).toBe('This payout was already paid or removed.');
expect(describeFinalizeError('A sale allocation is no longer available.')).toBe('This draft changed after it was prepared. Open it and recalculate.');
```

Also:
- `scopeFromPayout`: `selected_range` with prior FALSE gives `between`. `through_date`, `all_outstanding`, and `selected_range` with prior TRUE give `through`, using `source_range_end`, else the store date of `cutoff_at`, else `today`.
- `scopeToSaveInput`: `through` gives `rangeMode 'through_date'`, null start, prior TRUE. `between` gives `selected_range`, prior FALSE.
- `statementFigures` with null snapshots gives `hasSnapshots` false and `earned` = `payable_before_invoices_snapshot` + required.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/smoke/payoutDraft.test.ts`
Expected: FAIL, cannot resolve `payoutDraft`.

- [ ] **Step 3: Implement `src/lib/payoutDraft.ts`**

All arithmetic goes through `toCents` and `fromCents` from `payoutLedger.ts`. `describeFinalizeError` also maps every `changed after the draft was prepared` message to the second string, and passes other messages through.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/smoke/payoutDraft.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/payoutDraft.ts tests/smoke/payoutDraft.test.ts
git commit -m "Add payout draft logic"
```

---

### Task 6: Shared payout components

**Files:**
- Create: `src/components/payouts/ThroughDateButton.tsx`, `DraftPanel.tsx`, `MarkPaidDialog.tsx`, `PayoutSettingsModal.tsx`, `LegacyNote.tsx`
- Create: `tests/smoke/payoutEquation.test.ts`
- Modify: `src/components/payouts/PayoutLedgerUI.tsx`, `src/components/ui/Table.tsx:5-12,85-87,268-270`, `src/hooks/usePayouts.ts`

**Interfaces:**
- Consumes: Tasks 4 and 5.
- Produces:

```ts
// PayoutLedgerUI.tsx
export interface EquationLine { label: string; amount: number; sign?: '+' | '−' | '='; strong?: boolean }
export function PayoutEquation(props: { lines: EquationLine[]; className?: string }): JSX.Element;
export function ReadinessBadge(props: { status: PayoutReadiness }): JSX.Element;

// Table.tsx
export interface Column<T> { /* existing */ hideBelow?: 'md' | 'lg' }

// ThroughDateButton.tsx
export function ThroughDateButton(props: { value: string; max: string; onChange: (date: string) => void }): JSX.Element;

// MarkPaidDialog.tsx
export interface MarkPaidTarget {
    payoutId: string; vendorName: string; payToName: string; amount: number;
    rollsForward: number; email: string | null; reasonRequired: boolean; reason: string;
}
export function MarkPaidDialog(props: {
    target: MarkPaidTarget | null;
    beforeFinalize?: () => Promise<boolean>;
    onClose: () => void;
    onPaid: (payoutId: string) => void;
}): JSX.Element;

// DraftPanel.tsx
export function DraftPanel(props: { row: PayoutRunRow; onOpen: () => void; onDiscard: () => void; onMarkPaid: () => void }): JSX.Element;

// PayoutSettingsModal.tsx
export function PayoutSettingsModal(props: { isOpen: boolean; current: number; onClose: () => void; onSaved: () => void }): JSX.Element;

// LegacyNote.tsx
export function LegacyNote(props: { items: number; payouts: number; onDownload: () => void }): JSX.Element | null;

// usePayouts.ts
export async function markPayoutPaid(input: FinalizePayoutInput & { sendEmail: boolean }): Promise<{ email: 'sent' | 'failed' | 'skipped' | 'no_email' }>;
export async function downloadReconciliationCsv(): Promise<void>;
```

- [ ] **Step 1: Write the failing test**

Use `renderToStaticMarkup(createElement(PayoutEquation, { lines }))`. Assert the labels, the `−` sign and the money appear in order, and a null `LegacyNote` at zero items.

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/smoke/payoutEquation.test.ts`
Expected: FAIL, `PayoutEquation` is not exported.

- [ ] **Step 3: Implement**

- `PayoutLedgerUI.tsx`: add `PayoutEquation` and `ReadinessBadge` on `Badge` and tokens. Restyle `TransactionLedger`, and change its `<a href>` links to `Link`. Keep the old exports (`LedgerPageHeader`, `FinancialEquation`, `ReadinessStatus`, `ThresholdProgress`, `PayToName`) until Task 14 removes them, so unconverted pages keep working.
- `Table.tsx`: `hideBelow` adds `hidden md:table-cell` or `hidden lg:table-cell` to both `<th>` and `<td>`.
- `ThroughDateButton`: a `Button variant="secondary"` labeled "Earnings through {formatDay}", which calls `showPicker()` on a visually hidden date input with `max` set.
- `MarkPaidDialog`: spec's dialog. State is method, date (today), reference, reason, email ticked. `validatePayment` gates the button. Confirm runs `beforeFinalize` if given, then `markPayoutPaid`. Errors show inline through `describeFinalizeError`. The email outcome shows as a toast.
- `DraftPanel`: spec's panel, with `PayoutEquation`.
- `PayoutSettingsModal`: spec's dialog.
- `downloadReconciliationCsv`: moves the CSV building from `Payouts.tsx:240-264` and lets errors throw, so callers can toast.

- [ ] **Step 4: Run the tests and the type check**

Run: `npm test && npx tsc -b`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/payouts src/components/ui/Table.tsx src/hooks/usePayouts.ts tests/smoke/payoutEquation.test.ts
git commit -m "Add shared payout components"
```

---

### Task 7: Vendor payouts page and Queue tab

**Files:**
- Create: `src/pages/payouts/QueueTab.tsx`
- Modify: `src/pages/Payouts.tsx` (full replacement)

**Interfaces:**
- Consumes: `usePayoutRun`, `parseThrough`, `runTotals`, `splitBarParts`, `statusLine`, `filterRows`, `readyToPrepare`, Task 6 components.
- Produces: `QueueTab` props `{ data: PayoutRunData; through: string; onPrepareVendor: (id: string) => void; onDiscard: (row: PayoutRunRow) => void; onMarkPaid: (row: PayoutRunRow) => void; onDownloadCsv: () => void }`. `Payouts.tsx` owns the prepare, discard and mark-paid dialogs, so Task 8's tabs reuse them.

- [ ] **Step 1: Replace `Payouts.tsx`**

Shell per spec: `Header`, the note, four `StatCard`s and `Tabs`. URL params `tab` and `through` via `useSearchParams`, with `replace: true`.

Load failure shows the inline error with Retry, never an empty table. Per-vendor Prepare calls `preparePayoutRun(through, [id])` and opens the created draft. A `failed` result toasts the message.

The Prepare dialog copy and failure list follow the spec. CSV errors toast. "Payout settings" opens `PayoutSettingsModal` with `getDefaultThreshold`.

Remove `usePayouts`, `getPayoutQueue`, `getPayoutRangePreview` and the `PayoutRangePreview` type if `grep -rn` shows no other importers.

- [ ] **Step 2: Build `QueueTab.tsx`**

Spec's SplitBar, Drafts in progress (first two rows with a draft, link to the Drafts tab when more), vendors `Table` with `flat` and `paginated`, status `Tabs` at `size="sm"`, search `Input`, `LegacyNote`.

Carried in and Last paid use `hideBelow: 'lg'`. Below 640px render stacked `Card` rows (`sm:hidden`) and hide the table (`hidden sm:block`). Row click opens `/admin/payouts/vendor/:id?through=…&tab=queue`.

- [ ] **Step 3: Check it builds**

Run: `npx tsc -b && npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Payouts.tsx src/pages/payouts/QueueTab.tsx src/hooks/usePayouts.ts src/types/payouts.ts
git commit -m "Rebuild vendor payouts queue"
```

---

### Task 8: Drafts and History tabs

**Files:**
- Create: `src/pages/payouts/DraftsTab.tsx`, `HistoryTab.tsx`
- Modify: `src/pages/Payouts.tsx`, `src/App.tsx:175-178`

**Interfaces:**
- Consumes: `DraftPanel`, `getPayoutHistory`, `payRunTotal`, `Payouts.tsx` dialogs.
- Produces: route `/admin/payouts/pay-run`, pointing at a stub until Task 11.

- [ ] **Step 1: Build both tabs**

- `DraftsTab`: every draft row as a `DraftPanel`, "Pay run · N drafts · $X" button, `EmptyState` when none.
- `HistoryTab`: spec's columns, month `Select` (last 24 months plus All) and status `Select`, page size 25. Badges: Paid, Voided, Legacy (paid and `legacy_unverified`). Row click opens the statement.

- [ ] **Step 2: Add the route**

Register `payouts/pay-run` before `payouts/vendor/:consignorId`. Until Task 11 it renders `<Navigate to="/admin/payouts?tab=drafts" replace />`.

- [ ] **Step 3: Check it builds**

Run: `npx tsc -b && npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Payouts.tsx src/pages/payouts/DraftsTab.tsx src/pages/payouts/HistoryTab.tsx src/App.tsx
git commit -m "Add payout drafts and history tabs"
```

---

### Task 9: Vendor page

**Files:**
- Modify: `src/pages/payouts/VendorPayoutWorkspace.tsx` (full replacement)
- Modify: `src/hooks/usePayouts.ts` only if a call is missing

**Interfaces:**
- Consumes: `getVendorPayoutWorkspace(id)`, `getVendorPayoutPreview(id, through)`, `preparePayoutRun`, `updateVendorThreshold`, `PayoutEquation`, `TransactionLedger`.

- [ ] **Step 1: Rebuild the page per spec**

Reads `through` with `parseThrough` and `tab` for the back link. Header, equation, minimum with Change (a small `Modal`: amount or "Use shop default"), then `Tabs`.

Unpaid items compare `sale_timestamp` to `preview.cutoff_at`. Later items are dimmed under the line "{n} items after {day} are not in this payout." Add a `dimmedAfter?: string` prop to `TransactionLedger`.

History rows show a Voided badge. Remove the `mode` param, the report equation and `createDraft`'s range branch. Legacy line stays as one quiet sentence.

- [ ] **Step 2: Check it builds**

Run: `npx tsc -b && npm test`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/pages/payouts/VendorPayoutWorkspace.tsx src/components/payouts/PayoutLedgerUI.tsx
git commit -m "Rebuild vendor payout page"
```

---

### Task 10: Draft page

**Files:**
- Modify: `src/pages/payouts/PayoutDraftReview.tsx` (full replacement)

**Interfaces:**
- Consumes: `scopeFromPayout`, `scopeToSaveInput`, `nextPayingNow`, `draftPayable`, `rollsForward`, `notInThisPayout`, `validatePayingNow`, `describeFinalizeError`, `statementFigures`, `MarkPaidDialog`, `discardPayoutDraft`.

- [ ] **Step 1: Rebuild the page per spec**

State: `scope`, `invoiceAmounts`, `payingNow` (string), `following` (true until typed in, reset by "Pay full amount"), `notes`, `overrideReason`.

- Equation uses `statementFigures` for carried in, earned and required, and live `invoiceAmounts` for invoices. With no snapshots, hide the Carried in line.
- Each invoice input change runs `nextPayingNow`.
- "Save" sends current scope, `paymentAmount` and `invoiceApplications`. It never sends null for those.
- A dirty scope shows Recalculate. If `payingNow` or invoices differ from what loaded, a `Modal` warns first. Recalculate sends null for both.
- Mark paid is disabled while the scope is dirty or `validatePayingNow` fails. `MarkPaidDialog` gets `beforeFinalize` that runs Save quietly.
- Discard uses the spec's dialog and returns to `/admin/payouts?tab=drafts`.
- Load redirect for non-draft status stays.
- A save or discard that hits a paid payout shows the spec's message and opens the statement.
- Pending deductions come from `workspace.required_adjustments` where `will_apply` is false.

- [ ] **Step 2: Check it builds**

Run: `npx tsc -b && npm test`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/pages/payouts/PayoutDraftReview.tsx
git commit -m "Rebuild payout draft page"
```

---

### Task 11: Pay run

**Files:**
- Create: `src/pages/payouts/PayRunPage.tsx`
- Modify: `src/App.tsx`, `src/lib/payoutRun.ts`, `tests/smoke/payoutRun.test.ts`

**Interfaces:**
- Consumes: `usePayoutRun`, `validatePayment`, `markPayoutPaid`, `describeFinalizeError`, `payRunTotal`.
- Produces: `export function payRunBlocked(rows: PayRunEntry[], method: string, date: string): boolean` in `payoutRun.ts`, where `PayRunEntry` is `{ row: PayoutRunRow; selected: boolean; reference: string; reason: string }`.

- [ ] **Step 1: Write the failing test**

`payRunBlocked` is true when a selected check row above $0 has no reference, or a selected below-minimum row has no reason; false for a $0 row with no reference; false when the only bad row is unticked; true when nothing is selected.

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/smoke/payoutRun.test.ts`
Expected: FAIL, `payRunBlocked` is not exported.

- [ ] **Step 3: Implement and route**

Load `getPayoutRun` with today's date and keep rows with a draft. Layout and copy per spec.

- Confirm runs a sequential `for` loop over `markPayoutPaid`, tracking per-row state: `idle`, `paying`, `paid`, `failed`.
- Failed rows show `describeFinalizeError` and an Open draft link. Paid rows link to the statement and show "Emailed" or "Paid, email failed".
- Inputs lock during the run.
- Register `beforeunload` only while running.
- The route replaces Task 8's redirect.

- [ ] **Step 4: Run the tests and the type check**

Run: `npm test && npx tsc -b`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/payouts/PayRunPage.tsx src/App.tsx src/lib/payoutRun.ts tests/smoke/payoutRun.test.ts
git commit -m "Add payout pay run screen"
```

---

### Task 12: Statement and dead code

**Files:**
- Modify: `src/pages/payouts/PayoutStatementPage.tsx` (full replacement), `src/lib/completedPayoutReport.ts`, `src/lib/consignorReports.ts`, `tests/smoke/vendorStoreCreditIsolation.test.ts:11`
- Delete: `src/components/payouts/CompletedPayoutDetails.tsx`

**Interfaces:**
- Consumes: `statementFigures`, `PayoutEquation`, `sendPayoutStatement`, `isVendor` logic that exists today.

- [ ] **Step 1: Rebuild the statement per spec**

Keep `download`, `print` and `confirmVoid` as they are. Allocation and adjustment tables move to `Table` or `Card` with tokens. Keep the `print:` classes. Scope line: "Earnings through Oct 31", or the date range, or "All outstanding" for older rows, followed by the cutoff.

Invoice links on both lists use `href` only when `!isVendor`. Show `actors` and `latest_email` when present. "Email statement" is hidden when `isVendor` or status is not `paid`.

- [ ] **Step 2: Remove dead code**

Delete `CompletedPayoutDetails.tsx`, `printCompletedPayoutReport` (`completedPayoutReport.ts:179`) and `loadCompletedPayoutDetails` (`consignorReports.ts:1403`). Keep the `CompletedPayoutDetails` type, which `buildPayoutStatementDetails` uses. Replace line 11 of `vendorStoreCreditIsolation.test.ts` with `src/pages/payouts/PayRunPage.tsx`.

- [ ] **Step 3: Run the tests and the type check**

Run: `npm test && npx tsc -b`
Expected: PASS, including `completedPayoutReport.test.ts`.

- [ ] **Step 4: Commit**

```bash
git add -A src/pages/payouts/PayoutStatementPage.tsx src/lib/completedPayoutReport.ts src/lib/consignorReports.ts src/components/payouts/CompletedPayoutDetails.tsx tests/smoke/vendorStoreCreditIsolation.test.ts
git commit -m "Rebuild payout statement and remove dead code"
```

---

### Task 13: Statement email function

**Files:**
- Create: `supabase/functions/send-payout-statement/index.ts`, `supabase/functions/send-payout-statement/statement.ts`, `tests/smoke/payoutStatementEmail.test.ts`
- Modify: `supabase/config.toml`

**Interfaces:**
- Produces, in `statement.ts` (no Deno or remote imports, so Vitest can load it):

```ts
export interface StatementEmailInput {
    vendorName: string; amount: number; paidDate: string; method: string; reference: string | null;
    scopeLabel: string; carriedIn: number | null; earned: number | null;
    deductions: Array<{ label: string; amount: number }>; rollsForward: number; statementUrl: string | null;
}
export function buildStatementEmail(input: StatementEmailInput): { subject: string; html: string };
```

- HTTP contract: `POST { payoutId }` returns `{ status: 'sent' | 'failed' | 'no_email' }`.

- [ ] **Step 1: Write the failing test**

```ts
const email = buildStatementEmail(input);
expect(email.subject).toBe('Your Ravenlia payout statement · $367.00');
expect(email.html).toContain('$367.00');
expect(buildStatementEmail({ ...input, vendorName: '<b>Al</b>' }).html).toContain('&lt;b&gt;Al&lt;/b&gt;');
expect(buildStatementEmail({ ...input, statementUrl: null }).html).not.toContain('href=');
expect(buildStatementEmail({ ...input, carriedIn: null, earned: null }).html).not.toContain('Carried in');
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/smoke/payoutStatementEmail.test.ts`
Expected: FAIL, cannot resolve `statement`.

- [ ] **Step 3: Implement**

`statement.ts` escapes every interpolated value.

`index.ts` follows `manage-vendor/index.ts:50-100` for the admin check. Load the payout and `consignors.email` with the service client. Refuse non-`paid` payouts with 400. With no email, return `no_email`.

Send through Resend from `Ravenlia <email@ravenlia.com>`, as `send-invoice-email` does. Insert a `payout_statement_emails` row with `sent_by` for every attempt. The link is `${PORTAL_URL}/vendor/payouts/${id}` when `PORTAL_URL` is set.

Add `[functions.send-payout-statement]` with `verify_jwt = false` to `config.toml`.

- [ ] **Step 4: Run the tests and lint**

Run: `npm test && npm run lint`
Expected: PASS. Lint shows only the two known errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/send-payout-statement supabase/config.toml tests/smoke/payoutStatementEmail.test.ts
git commit -m "Add payout statement email function"
```

---

### Task 14: Vendor portal and matching earnings

**Files:**
- Modify: `src/pages/vendor/VendorPayouts.tsx` (full replacement), `src/pages/vendor/VendorDashboard.tsx`, `src/pages/vendor/VendorSales.tsx`, `src/components/payouts/PayoutLedgerUI.tsx`, `src/lib/payoutRun.ts`, `tests/smoke/payoutRun.test.ts`

**Interfaces:**
- Consumes: `getVendorSaleEarnings`, `PayoutEquation`, `ReadinessBadge`.
- Produces: `export function sumEarnings(itemIds: string[], earnings: Map<string, number>): number` in `payoutRun.ts`, summing in cents and treating a missing id as $0.

- [ ] **Step 1: Write the failing test**

`sumEarnings(['a', 'b', 'x'], new Map([['a', 0.1], ['b', 0.2]]))` is `0.3` exactly.

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/smoke/payoutRun.test.ts`
Expected: FAIL, `sumEarnings` is not exported.

- [ ] **Step 3: Implement**

- `VendorPayouts.tsx`: shared components, keeps the report dates. Draft explanation becomes "The shop is preparing a payout for you." Statements list shows a Voided badge.
- `VendorSales.tsx`: load the map once with the sales. Column and total use it (lines 154-156, 217-222). Label: "After card fees and refunds".
- `VendorDashboard.tsx`: month earnings use `sumEarnings` (lines 273-281). Recent sales show `vendor_earnings` (line 559).
- Dashboard live updates (lines 343-410): after a new sale, fetch the map and use `row.id`. If it is missing, skip the stat increment and show "{n} sold" in the notification with no amount.
- Remove `LedgerPageHeader`, `FinancialEquation`, `ReadinessStatus` and `ThresholdProgress` from `PayoutLedgerUI.tsx` now that nothing imports them. Confirm first with `grep -rn` across `src`.

- [ ] **Step 4: Run the tests and the type check**

Run: `npm test && npx tsc -b`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/vendor src/components/payouts/PayoutLedgerUI.tsx src/lib/payoutRun.ts tests/smoke/payoutRun.test.ts
git commit -m "Move vendor portal to server earnings"
```

---

### Task 15: Full verification

**Files:** only what the checks turn up.

- [ ] **Step 1: Run every automated check**

```bash
npm test
npm run lint
npm run build
npm run local:test:payouts
```
Expected: all pass. Lint shows only the two known errors.

- [ ] **Step 2: Walk the flow in the browser on local data**

Start `npm run local:dev` through `.claude/launch.json`, adding an entry if there is none. Sign in with the local test logins in `docs/local-supabase-clone.md`. The `send-payout-statement` function is not served locally, so "Paid, email failed" is the expected result. Confirm:

- Date change updates the URL and survives a vendor page round trip.
- Queue figure equals the draft for one vendor.
- Prepare all; discard one; prepare it again.
- Draft: change an invoice amount and Paying now follows; type a lower amount and Rolls forward appears; narrow the dates and see the warning.
- Pay run: check with no number is blocked; pay two; a statement shows the method, reference and people.
- Void a payout; History and the statement show it.
- Vendor login: My payouts, statement with no invoice links, draft URL refused, Overview and My sales match.

- [ ] **Step 3: Check every screen in both themes and widths**

Queue, Drafts, History, vendor page, draft page, pay run, statement, My payouts. Light and dark, by setting `localStorage ravenpos-theme` and reloading. Desktop, 1024px with the sidebar open, phone width. No clipped columns and no horizontal page scroll.

- [ ] **Step 4: Fix what turned up, then re-run Step 1**

Each fix gets a test where the logic allows. Commit with a message naming the fix.
