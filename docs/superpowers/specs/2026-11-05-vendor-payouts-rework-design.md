# Vendor payouts rework

Status: awaiting review, 2026-11-05
Visual reference: VendorPayouts board on the [RavenPOS redesign concept canvas](https://claude.ai/artifact/FYKxDJUb8KkvjpiPXVzKfh)
Builds on: [design system foundation](2026-11-05-design-system-foundation-design.md)
Accounting history: [July ledger spec](../../design/vendor-payouts/implementation-spec.md). Its rules still apply; its clay and Fraunces look does not.

## Goal

Give the shop one clear way to pay vendors: pick a date, see who is owed what, prepare the payouts, record the checks. Do the look and the workflow together so these screens are only rebuilt once.

Done means:

- Every vendor payout screen uses the shared components, in light and dark.
- The payout date is chosen once and carried across every screen.
- The queue figure for a vendor equals the draft that vendor gets.
- A payday run of many vendors takes one screen, not one trip per vendor.
- Vendors see earnings that agree with their payouts, and get a statement by email.
- Every problem under "Known problems closed" is fixed.

## Scope

**In scope**

- Admin: Vendor payouts (Queue, Drafts, History), vendor page, draft page, pay run, statement.
- Vendor portal: My payouts, statement, and the earnings figures on Overview and My sales.
- Server: new payout functions, store-time date boundaries, discard, batch prepare.
- Paying inactive vendors.
- Default payout minimum and per-vendor override settings.
- Emailing a statement when a payout is paid.

**Out of scope, kept as follow-ups**

- Manual ledger entries and write-offs in the UI.
- Making the marketing fee save atomic (`MarketingFees.tsx:139-162`).
- A correction email when a paid payout is voided.
- The old date-window logic in `consignorReports.ts:457-560`.
- Removing `get_payout_queue` and `get_payout_range_preview`, once no desktop build calls them.

## Decisions

Made with the owner:

| Question | Decision |
|---|---|
| Older unpaid money | A payout covers everything unpaid through one date. A single draft may be narrowed to specific dates as an exception. |
| Recording payment | A pay run screen: method and date once, a reference per vendor, one confirmation. Drafts can still be paid one at a time. |
| Extra scope | Inactive vendors, payout minimum settings, matching vendor earnings, and statement emails are all in. |

Assumptions the owner has seen and not changed:

1. "Earnings through" defaults to the last day of the previous month.
2. Date boundaries use Eastern time, stored as a setting.
3. Inactive vendors skip the payout minimum, since they will not earn more.
4. Work happens on a new branch, `vendor-payouts-rework`, cut from `design-system-foundation`, with `fix-audit-bugs` merged in first. Both touch statements and the equation.

Added while writing this spec:

5. A check number is required when the method is Check and the amount is above $0. Today it is optional everywhere.

## Accounting rules that do not change

- Older unpaid balances are never dropped by a date filter.
- Partial payouts settle oldest sales first. The remainder stays owed.
- Required deductions apply only when affordable. Anything unapplied stays visible as pending.
- Invoice payments are append-only.
- Paid and voided payouts are immutable. A void adds a reversal and keeps the original.
- Paid statements read stored snapshots, never recalculated figures.
- Legacy records are never presented as exact proof unless reconciled.
- Vendor screens are read-only and use the same server results as admin.

## Terms

These words mean the same thing on every screen, in the email and in the code.

| Term | Meaning |
|---|---|
| Earnings through | The cutoff date. Sales up to the end of this day, in store time, are in scope. |
| Carried in | Unpaid money on sales dated on or before the cutoff of the vendor's last paid payout, plus any legacy balance. Zero for a vendor never paid. |
| Earned | All other unpaid sale money in scope. |
| Deductions | Required deductions applied, plus invoice amounts applied. The draft page shows invoices on their own line because they can be edited there. |
| Payable | Carried in + Earned − Deductions, floored at $0. |
| Paying now | The amount actually paid. Defaults to Payable and may be lower. |
| Rolls forward | Payable − Paying now. |
| Not in this payout | Money the vendor is owed outside the draft's scope, such as sales after the cutoff. |

Status, using the figure before invoices (matching the existing finalize check):

| Status | Rule |
|---|---|
| Draft | The vendor has a draft. |
| Paid up | Nothing is payable before invoices. |
| Ready | Payable before invoices reaches the vendor's minimum. |
| Accruing | Above $0 but below the minimum. |

## The workflow

1. Open Vendor payouts. The date defaults to the end of last month.
2. Read the queue: who is ready, who is accruing, what is already drafted.
3. Press "Prepare 6 ready payouts" and confirm. Each ready vendor gets a draft. One vendor can also be prepared from their row.
4. Open any draft that needs care: change invoice amounts, pay less, narrow the dates, or discard it.
5. Open the pay run. Set the method and date, type each check number, confirm the total.
6. Each vendor is marked paid and emailed a statement. Anything that fails stays listed with the reason.

## Server

One new migration, `supabase/migrations/20261105130000_vendor_payouts_rework.sql`. Existing function signatures stay valid so older desktop builds keep working.

### Schema

- `payouts.range_mode` gains `through_date`. Replace `payouts_range_mode_check` and `payouts_range_dates_check`. A `through_date` row has `source_range_end` set and `source_range_start` null.
- `payouts` gains `carried_in_snapshot` and `earned_snapshot`, `NUMERIC(12,2)`, nullable.
- `payout_settings` gains `time_zone TEXT NOT NULL DEFAULT 'America/New_York'`. It has no UI.
- New table `payout_statement_emails`: `id`, `payout_id`, `recipient`, `status` (`sent` or `failed`), `provider_id`, `error`, `sent_by`, `created_at`. Admins can read it. Only the service role writes. Rows are never updated, which is why this is a table and not a column on the locked payout row.

### Shared helpers (service role only)

- `payout_day_start(date)` and `payout_day_end(date)` turn a date into exact timestamps in the store time zone.
- `get_vendor_payout_threshold(consignor)` returns 0 for inactive vendors, otherwise the override, the shop default, or 100.
- `get_payout_scope_summary(consignor, mode, start, end, include_prior)` returns carried in, earned, booth rent, other required deductions, invoices applied, payable before invoices, payable, pending totals, and sale and item counts.

`save_payout_draft` and the queue both read `get_payout_scope_summary`. This single calculation is what keeps the queue equal to the draft.

### New functions (admin only unless stated)

- **`get_payout_run(p_through DATE)`** returns `{ rows, paid_in_month, legacy }`.
  - One lean row per vendor with no sale-item detail: identity, `is_active`, minimum, carried in, earned, booth rent, other deductions, invoices applied, payable, status, amount to minimum, `pending_total`, `pending_count`, `pending_type`, draft id and through date, last paid date, legacy item count.
  - Includes active vendors, and inactive vendors with money owed.
  - A vendor with a draft shows the draft's stored figures, whatever date is on screen.
  - `paid_in_month` is the count and total paid in the month of `p_through`, excluding voids.
  - `legacy` is the count of unreconciled payouts and of legacy-uncertain sold items.
- **`get_vendor_payout_preview(p_consignor_id, p_through)`** returns the same row for one vendor, plus `cutoff_at` so the vendor page can mark items after the cutoff.
- **`prepare_payout_run(p_through DATE, p_consignor_ids UUID[])`** creates a `through_date` draft per vendor. Each vendor runs in its own exception block, so one failure leaves the others alone. Returns `{ consignor_id, payout_id, status, message }` per vendor, with status `created`, `skipped` (already has a draft) or `failed`.
- **`finalize_payout_checked(p_payout_id, p_expected_amount, p_payment_method, p_payment_date, p_payment_reference, p_notes, p_below_threshold_override_reason)`** finalizes a draft only if the stored amount still equals the amount the screen confirmed. The check runs inside the row lock, then it calls `finalize_payout`. A changed amount, or a stale draft that `finalize_payout` rejects with `40001`, is answered as `PT409` (HTTP 409), because PostgREST retries `40001` forever instead of answering.
- **`discard_payout_draft(p_payout_id UUID)`** deletes a draft and its allocations and adjustments. It refuses any row that is not a draft.
- **`get_vendor_sale_earnings(p_consignor_id UUID)`**, for admins or that vendor, returns `sale_item_id` and `vendor_earnings` (`final_vendor_cut`) for each of the vendor's sale items.

### Changed functions

- **`save_payout_draft`**
  - Accepts `through_date`: end date required, start null, older balances forced on.
  - Removes the active-vendor check.
  - Uses store-time boundaries and the shared summary.
  - Stores both snapshots.
  - Stores a threshold of 0 for inactive vendors, so `finalize_payout` needs no change.
- **`get_vendor_payout_workspace`**: store-time boundaries and the shared threshold helper.
- **`get_payout_statement`**: refuses drafts for vendors. For admins only, adds `prepared_by_name`, `paid_by_name`, `voided_by_name`, `reversed_by_name` and `latest_email`. Staff names fall back to a login email, which vendors should not see.
- **`get_vendor_payout_workspace`** also adds `email` to the vendor object, for the Mark paid dialog.

## Admin screens

The whole area follows the data display rule: at most one thin bar per page, numbers with a plain line beneath them, no sparklines or per-row progress. Green and red only mean good and bad. Money uses `Money`.

### Vendor payouts `/admin/payouts`

URL holds `tab` and `through`, so back links and refreshes keep them. The title is "Vendor payouts", matching the nav.

Header: date button "Earnings through Oct 31", "Payout settings", "Reconciliation CSV", and the primary "Prepare 6 ready payouts", which is disabled at zero. Beneath it, this note: "Older unpaid balances are always included. The date only sets the cutoff for new earnings."

**Queue tab**

- Four stat cards. Ready to pay, Accruing and In drafts each show a total and a vendor count. In drafts sums draft amounts. Paid in {month} shows a total and a payout count.
- One SplitBar, "Earned by the 8 vendors in this run", counting Ready and Draft vendors, split into Payable, Booth rent, and Invoices and fees. Hidden when the total is $0.
- "Drafts in progress": up to two panels side by side, each with the equation and Discard, Open and "Mark paid · $367.00". A link goes to the Drafts tab when there are more.
- Vendors table:
  - Columns: Vendor, Carried in, Earned, Deductions, Payable, Status, Last paid, action.
  - Search, plus status filters All, Ready, Drafts, Accruing, Paid up, with pagination.
  - Status sub-lines: "$27.45 to go", "Booth rent $26.10 still owed", "Draft #A1B2C3D4", "Inactive".
  - Actions: Ready shows Prepare, Draft shows Open, others show View. Row click opens the vendor page.
  - Nothing clips at 1024px with the sidebar open. Below 1024px, hide Carried in and Last paid. Below 640px, rows stack.
- Legacy note under the table, replacing the red tile: "{items} sold items sit under {payouts} older payouts that can't be matched to exact sales. They count as paid, so nothing is owed on them." Hidden at zero, with a link to the CSV.

**Drafts tab**: every draft as a panel, with "Pay run · 6 drafts · $1,842.50" at the top. Empty state when none.

**History tab**: paid and voided payouts across vendors, newest first, read directly from `payouts`. Columns: Paid date, Vendor, Amount, Method, Reference, Status (Paid, Voided, Legacy). Month and status filters, paginated. Row click opens the statement.

**Prepare dialog**: "Prepare 6 payouts through Oct 31? This creates a draft for each vendor, $1,842.50 in total. Nothing is paid yet." Afterwards the Drafts tab opens. Any failures are listed by vendor with the reason.

**Payout settings dialog**: "Minimum payout" edits `payout_settings.default_threshold` and records who changed it. Existing drafts keep the minimum they were saved with.

### Vendor page `/admin/payouts/vendor/:id?through=`

- Header: vendor, pay-to name, booth, W-9 status, and "Prepare payout" or "Open draft". Back link keeps `through` and `tab`.
- Equation for the chosen date, with status and "$27.45 to go".
- "Minimum payout $100 (shop default)" with Change, which sets or clears the override.
- Tabs: Unpaid items, Deductions, Invoices, History. Items after the cutoff are dimmed, with a line saying how many are not in this payout.
- History marks voided payouts.
- Accruing vendors can still be prepared; the draft asks for a reason.

The old report equation, the range mode param and the date inputs on this page are removed.

### Draft page `/admin/payouts/drafts/:id`

**Left column**

- Scope: "Everything through [date]" or "Only sales between [from] and [to]". The second warns that older money stays out and rolls forward.
- Sale items in this payout.
- Deductions applied, and pending deductions shown beneath with the reason.
- Invoices, with editable amounts.

**Right column, sticky**

- Equation: Carried in + Earned − Deductions − Invoices = Payable. Then Paying now, Rolls forward, and Not in this payout, the last two hidden at $0.
- Payment amount, notes, and the override reason when below the minimum.
- Actions: Save, Discard, "Mark paid · $367.00".

**Behavior**

- Paying now follows Payable as invoice amounts change, until the amount is typed by hand. "Pay full amount" returns it to following.
- Save keeps invoice and payment edits. It never silently resets them.
- Changing the scope needs "Recalculate". If invoice or payment edits would be lost, a dialog says so first.
- Mark paid is disabled while a scope change is pending.
- Drafts saved before this release have no snapshots. They show one combined Earned line until saved.
- Older `all_outstanding` drafts, and `selected_range` drafts that include prior balance, open as "Everything through" and convert when saved.

**Mark paid dialog**, shared with the queue panels: vendor, amount, method, date, reference, the override reason when needed, Rolls forward if any, and the "Email statement to name@example.com" checkbox, on by default. With no address on file it shows "No email on file for this vendor" and no checkbox. From the draft page it saves first and then finalizes, as today. From a queue panel there are no edits to save, so it finalizes the stored draft.

### Pay run `/admin/payouts/pay-run`

- Top: payment method and date, set once.
- One row per draft: tick box, vendor, pay-to, amount, reference input, override reason when required.
- Footer stays visible: "5 payouts · $1,842.50", "Email statements to vendors" with a count of vendors with no address, and "Mark 5 paid · $1,842.50".
- A confirm dialog repeats the count, total, method and date.
- On confirm, the browser calls `finalize_payout_checked` once per draft, with the amount shown on screen, in order. Each payout is its own transaction.
- Drafts are not re-saved first, so the amount confirmed is the amount recorded.
- Rows update to Paid or Failed with the reason and an Open draft link. Emails follow each success.
- Leaving mid-run shows a browser warning.
- The end summary reads "5 paid, 1 failed". Paid rows link to statements.

### Statement `/admin/payouts/history/:id`

Restyled. Keeps print and CSV export. Adds:

- The through date or date range, and the cutoff.
- The equation, when snapshots exist.
- A clear void banner with reason, who and when.
- Admins see who prepared and who paid.
- Admins see "Emailed to a@b.com on Nov 5" and "Email statement" to send or resend. Voided payouts cannot be emailed.

## Vendor portal

- **My payouts** moves to the shared components and keeps its read-only report dates. The draft message becomes "The shop is preparing a payout for you", with no amount, because the old figure was wrong. History marks voided payouts.
- **Statement** uses the same page. Invoice links show only for admins.
- **Overview and My sales** stop computing earnings in the browser and sum `vendor_earnings` from `get_vendor_sale_earnings`, keeping today's date filters. The label reads "After card fees and refunds". Vendors will see lower numbers on card sales, because the old figure ignored card fees.

## Statement email

New function `supabase/functions/send-payout-statement`, modeled on `send-invoice-email`, with `verify_jwt = false` and an in-function admin check like `manage-vendor`.

- Input is `{ payoutId }` only. The recipient comes from `consignors.email` on the server, never from the browser.
- Sends only for `paid` payouts, from `Ravenlia <email@ravenlia.com>`, through Resend.
- Subject: "Your Ravenlia payout statement · $367.00".
- Body: amount, paid date, method, reference, the through date, the equation, and deductions by line. No sale-level detail.
- Links to the vendor statement when a `PORTAL_URL` secret is set, and leaves the link out when it isn't.
- Every attempt writes a `payout_statement_emails` row.
- A failed email never affects the payout.

## Errors

| Situation | Behavior |
|---|---|
| Queue fails to load | Inline error with Retry. Never an empty table that looks like no vendors. |
| Draft changed since it was prepared (`PT409`) | The draft page says what changed and offers Recalculate. The pay run marks the row Failed and links to the draft. |
| Batch prepare partly fails | Created drafts stay. Failures are listed by vendor. |
| Reconciliation CSV fails | Error toast, button resets. |
| Discard or save hits a paid payout | Message says it was already paid, then opens the statement. |
| Email fails | Row or dialog says "Paid, email failed". Resend from the statement. |
| Payment outside $0 to Payable | Field error. Mark paid is disabled. |
| Check method, no reference, above $0 | Field error, blocked in both the dialog and the pay run. |

## Known problems closed

- Range chosen in three places, and back links drop it: one URL date.
- Two ways to create a draft, and "Create payout" only focusing search: one Prepare action, batch or per vendor.
- Drafts cannot be discarded, and a stale draft blocks new ones: discard.
- "Remains unpaid" reads $0 after save, and true rollover is never shown: Rolls forward and Not in this payout.
- Payment does not follow invoice edits: Paying now follows Payable.
- Pending obligations hidden on the draft: shown there.
- Save silently resets edits on scope change: separate Recalculate, with a warning.
- "Mark paid and lock" has no confirmation or amount: Mark paid dialog.
- Drafts tile sums current payable: sums draft amounts.
- History lists hide voids: marked on every list.
- Statement ignores reversal, range, cutoff and people: added.
- Vendor invoice links point to admin: admin only.
- Vendors can open drafts by URL: refused on the server.
- Vendor sees "being reviewed" with the wrong amount: amount removed.
- `TransactionLedger` full page reloads: router links.
- Reconciliation CSV has no error handling: handled.
- Table clips the Action column: fits at 1024px.
- Title "Payouts" against nav "Vendor payouts": matched.
- Queue downloads every vendor's sale history: lean rows.
- Evening sales on the last day fall into the next run: store-time boundaries.
- Inactive vendors cannot be paid, thresholds need SQL, vendor earnings disagree, statements are never sent: all in scope.
- Dead code: remove `CompletedPayoutDetails.tsx`, `loadCompletedPayoutDetails`, `printCompletedPayoutReport`.

## Code layout

| Path | Job |
|---|---|
| `src/lib/payoutRun.ts` | Default date, status lines, filters, totals, bar parts |
| `src/lib/payoutDraft.ts` | Draft equation, Paying now following, rollover, validation |
| `src/types/payouts.ts`, `src/hooks/usePayouts.ts` | New types and calls |
| `src/pages/Payouts.tsx` | Header, stats, tab shell only |
| `src/pages/payouts/QueueTab.tsx`, `DraftsTab.tsx`, `HistoryTab.tsx`, `PayRunPage.tsx` | One screen each |
| `src/pages/payouts/VendorPayoutWorkspace.tsx`, `PayoutDraftReview.tsx`, `PayoutStatementPage.tsx` | Rebuilt in place |
| `src/components/payouts/PayoutLedgerUI.tsx` | Reduced to the equation, status cell and transaction list, on shared components |
| `src/components/payouts/DraftPanel.tsx`, `MarkPaidDialog.tsx`, `PayoutSettingsModal.tsx` | Shared pieces |

Logic goes in `.ts` files so Vitest can reach it.

## Testing

**SQL (pgTAP):** a new `supabase/tests/vendor_payouts_run.sql`, added to `test_payouts` in `scripts/local-supabase-clone.sh`.

- `get_payout_run` equals the draft built from it, with deductions, invoices, legacy balances and ledger charges present.
- A sale at 11pm Eastern on the cutoff day is in; 12:30am the next day is out.
- `through_date` includes older sales. A narrowed draft leaves them owed.
- A vendor with a draft shows draft figures at any date.
- Discard frees the vendor for a new draft and refuses paid rows and non-admins.
- `prepare_payout_run` skips drafted vendors and survives one failure.
- Inactive vendors appear only when owed, and finalize below the minimum with no reason.
- Vendors cannot read drafts, or another vendor's earnings.
- Only the service role writes email rows.

**Vitest:** default date across month and year ends, status lines, totals, bar parts, draft equation, Paying now following and un-following, rollover, reference rule.

**Browser:** on the local copy after `npm run local:test:payouts`: full prepare, draft, pay run and statement path in light and dark, at desktop, 1024px and phone width. Printing and real email need the owner's check.

## Rollout

1. Run the migration before shipping the front end. Old functions stay, so desktop builds on the old version keep working.
2. Deploy `send-payout-statement`. `RESEND_API_KEY` already exists. `PORTAL_URL` is optional.
3. Ship the front end.

Nothing is merged, pushed, migrated or deployed without the owner saying so.

## Build order

Each step leaves the app working.

1. Branch, merge `fix-audit-bugs`, migration and SQL tests.
2. Types, hooks, `payoutRun.ts`, `payoutDraft.ts`, shared payout components.
3. Vendor payouts page: Queue, Drafts, History, prepare, discard, settings.
4. Vendor page and draft page.
5. Pay run.
6. Statement and dead code removal.
7. Email function and its wiring.
8. Vendor portal and matching earnings.
9. Full browser pass.
