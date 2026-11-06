# Vendor payouts rework: handoff

Branch: `vendor-payouts-rework`, cut from `design-system-foundation`, with `fix-audit-bugs` merged in. Nothing is pushed, migrated to the live project or deployed.

## Hold

Do not push or deploy until the owner clears it. Aliya is running real payouts on the current system.

## Rollout, once the hold ends

1. Ship the staff records fix first (`claude/eloquent-cori-0a02ca`). It has its own migration, `20261105120000_close_public_employee_access.sql`, and both branches touch `scripts/local-supabase-clone.sh`.
2. Confirm `20260827210000` and `20261012120000` are applied on the live project.
3. Apply `20261105130000_vendor_payouts_rework.sql`. The old functions stay, so older desktop builds keep working.
4. Run `send-payout-statement` once with a stubbed Resend against four callers: no token, vendor, employee, admin. It has never run end to end.
5. Deploy `send-payout-statement`. `RESEND_API_KEY` already exists. `PORTAL_URL` is optional and adds a link to the email.
6. Ship the front end.
7. Tell vendors their earnings figures now account for card fees and refunds, so they will read lower on card sales.

Drafts open at rollout keep working. They show one combined Earned line until saved.

## Not verified

- Printing on paper
- Real email delivery, and the email function end to end
- Production data and the live migration
- The Electron desktop build
- A vendor statement with invoice payments (no such local data; checked by reading the code)
- The 704 legacy count against live rows

## Open decision

Admin draft notes appear to vendors on their statement. That behavior predates this work, and the spec doesn't address it.

## Rulings made during the build

- Task 1 steps 1-2 (branch, merge, docs commit) done by the controller — keeps the merge out of Task 1's review diff — cost if wrong: none, commits are in git.
- Task 9 may edit PayoutLedgerUI.tsx for dimmedAfter — its commit step already names the file — cost if wrong: one file list note.
- Task 4 also exports localDateString(date: Date): string from payoutRun.ts, used for "today" in Tasks 6 and 11 — avoids toISOString timezone slips — cost if wrong: one small helper.
- Task 12 finds printCompletedPayoutReport and loadCompletedPayoutDetails by name, not line number — the merge moved lines — cost if wrong: none.
- forced through_date locals and store-time range start get tests in Task 2 — money path, trivial to pin — cost if wrong: two extra assertions.
- Task 3 also moves get_payout_range_preview to store-time boundaries — old desktop builds still call it and the draft now uses store time — cost if wrong: two changed lines in a retained function.
- older desktop builds re-saving a through_date draft get a 22023 error — fails closed, no money moves — cost if wrong: admin on an old build must update before editing new drafts.
- drafted rows return the draft's stored cutoff_at, not the on-screen date — spec says a draft shows its own figures, and the vendor page would otherwise leave items outside the draft undimmed — cost if wrong: one field.
- paid_in_month and the Task 8 History month filter use COALESCE(payment_date, store date of paid_at) — the admin-entered date is what statements show, so a run recorded Nov 1 and dated Oct 31 belongs in October — cost if wrong: month totals shift for those rows.
- OFFSET 0 re-graded from Minor to in-scope — the planner re-runs the row builder about five times, on the main page load — cost if wrong: one line.
- vendor RLS on payouts, allocations and adjustments excludes drafts — the spec says vendors can't open drafts and the RPC lock is pointless otherwise; the plan missed the table path — cost if wrong: vendors lose direct reads of their own drafts, which no portal screen uses.
- extra paid_at store-time filters in the workspace stand — the reviewer proved the source filter inflates activity once the opening boundary moves — cost if wrong: none found.
- staff table open to anon is out of scope; verified locally, proposed as its own session, surfaced to the owner — cost if wrong: none to this branch.
- stale-draft messages mapped in describeFinalizeError, re-graded from Minor — a pay run row would otherwise show a raw UUID — cost if wrong: none.
- Carried in and Last paid hide below xl, not lg — at 1024px with the sidebar open the content is 688px wide and lg clipped by 190px; the spec's rule is that nothing clips — cost if wrong: two columns hidden between 1024 and 1280px.
- skipped outcomes, a shared prepare ref guard and refetch after skipped ride with Task 8, which edits the same file — cheap and user-visible — cost if wrong: a few lines.
- spec wording governs Recalculate — warn whenever edits would be lost, not only when inputs differ from load — saved partial payments were being wiped silently — cost if wrong: one extra dialog.
- pending deductions = required adjustments absent from the draft, replacing the brief's will_apply filter — the workspace tests affordability against all money, hiding real obligations on the draft — cost if wrong: a row shown as pending that later applies.
- draft links carry through and back links keep it — the spec's done-means is one date across every screen — cost if wrong: longer URLs.
- add finalize_payout_checked wrapper with an expected amount inside the row lock, used by every client path, departing from the spec's "existing finalize_payout" — the spec's rule that the amount confirmed is the amount recorded outranks the mechanism — cost if wrong: one extra server function, and old desktop builds keep the unchecked path.
- amount-changed error uses SQLSTATE PT409, not 40001 — PostgREST retries 40001 forever and never answers — cost if wrong: none, tests assert it.
- finalize_payout_checked maps finalize_payout's six 40001 raises to PT409 with the same message — stale drafts would otherwise hang the pay run and Mark paid — cost if wrong: a true serialization failure surfaces as an error rather than retrying.
- email equation uses the spec Terms including "Paying now", matching the statement page — the spec says Terms hold in the email — cost if wrong: one label reads slightly odd on a past payment.
- LedgerPageHeader stays in PayoutLedgerUI.tsx — src/pages/InvoiceDetail.tsx still imports it and invoices are out of scope — cost if wrong: one old-style header on that page.
- "Your balance today" stays on My payouts while a draft exists — it is the vendor's true current balance, not a draft amount; the spec only removes the amount from the draft message because that figure was mislabelled — cost if wrong: one sentence to hide.
- vendor page items and statement allocation tables scroll inside their card at 1024px — they are contained, nothing is cut off, and the spec's no-clip rule is about the queue table — cost if wrong: hide Gross and Discounts below xl later.
- fold in with the two Important items: amount check respects status, Last paid store-date slip, email timeout, removed-draft message — small, user-visible, in files already open — cost if wrong: a few lines.

## Deferred minor items

Fixed in the final pass, so ignore these below: the hung email stalling rows, the amount check ignoring status.

- summary scans get_payout_sale_financials twice; fold legacy_item_count into one pass if the run list is slow.
- v_month repeats a COALESCE; legacy > 0 checks cannot prove the fixture was counted on a clone with legacy rows.
- paid_in_month upper bound and null threshold_snapshot fallback have no test; drafts with null cutoff_at or range_mode have no fallback in build_payout_run_row (range_mode is NOT NULL; cutoff_at null only on hand-made rows).
- RUN-3 vendor login is an unused fixture.
- History month filter uses UTC bounds for null payment_date rows; July backfill and finalize make those rows essentially nonexistent.
- monthBounds has no test.
- '-0' passes validatePayingNow as zero; hasSnapshots needs both snapshots non-null.
- PayoutEquation first strong row has conflicting py-1.5 and pt-3 under plain cn().
- MarkPaidDialog headline and DraftPanel use formatCurrency where Money fits.
- MarkPaidDialog state reset runs in an effect, so one frame can show the previous vendor's reference; a key on an inner body would remove it. No in-flight ref guard; beforeFinalize false shows nothing.
- DraftPanel recomputes rolls forward instead of using rollsForward().
- PayoutSettingsModal validateMinimum is logic in tsx with no test; Cancel stays enabled during save; $0 accepted.
- markPayoutPaid and hideBelowClass untested; a vi.mock test of supabase would work in node.
- TransactionLedger still has formatCurrency and square row borders; later page tasks to finish.
- date change or tab switch unmounts QueueTab and resets search and status filter; mobile cards unpaginated; stale-response guard has no test.
- null payment_date paid_at bounds are UTC; refetch inside prepareVendor's try can show the wrong error; prepareAll returns silently if a vendor prepare is running; getPayoutHistory query shape and monthBounds untested.
- HistoryTab column key still 'paid_at' though it shows payment_date.
- Prepare outcomes and useVendorPage guard untested, skipped-then-open-draft branch not exercised; LinkList children typed ReactNode[].
- phantom invoice amounts if paid before the page opened (fails safe); success toast still fires after a failed refresh; invalid Paying now shows $0 in the equation; legacy row outside the section total; replace.text dead code; 'already paid' message on a removed draft.
- PayRun component is long; hung email call stalls later rows (no timeout); totals use formatCurrency in the footer; MarkPaidDialog has no status read-back after a lost response.
- amount check ignores status, so MarkPaidDialog on an already-paid payout at a different amount says the amount changed rather than already paid.
- blank references collide in matchesRun, so another admin's same-day same-amount no-reference payment reads Paid and can resend a statement; compare paid_by to tighten.
- View statement, Open draft and app navigation stay live during a run; the loop keeps paying unseen after SPA navigation.
- email line and void banner dates use the browser time zone; Audit details hand-formats currency; partial_reason and balance disposition no longer shown (Rolls forward carries the meaning).
- month table, plainDay and scope label are copied into statement.ts because Deno can't import src; a parity test guards drift. .claude worktree copy inflates lint; eslint ignores only dist.
- live sale missing from the map still increments counts but not earnings until reload; each live sale refetches the whole map; VendorSales awaits earnings before sales; My payouts shows the previous range during a reload; discount_amount still fetched on the dashboard.
- formatSupabaseError network phrases are generic substrings and only the Chrome form is tested; spec's Mark paid paragraph doesn't name the checked function; 375px screenshots only for queue and draft page in light mode; local vendor has no invoices, so vendor invoice links are verified by reading only.
- pay run round trip drops a non-default through; SPA navigation mid-run loses results; concurrent Prepare surfaces a raw duplicate-key message; hardcoded store time zone in two client files; small duplicate helpers.
- typed future date greys Recalculate with no reason shown; draft page today is browser-local, not store date; a timed-out email can still deliver, so the screen may say failed; page stays live during the not-found lookup; queue Last paid uses paid_at while History uses payment_date.
