# Store credit & gift card as tenders — diagnosis and plan

Status (2026-10-15): Phases 1–3 implemented and verified against a local clone of the
2026-07-15 backup; not yet deployed. Migration:
`supabase/migrations/20261015120000_store_credit_gift_card_tenders.sql` (apply it before
deploying the web/Electron build; older POS builds keep working against it). Live data after
July 15 has not been checked yet.

## Root cause (items 1–3)

Store credit and gift cards are **discounts off the total, not tenders.**

- POS subtracts them before payment: `cashPrice = total − giftCard − storeCredit`
  ([POS.tsx:356-425](../src/pages/POS.tsx)).
- `sales.total` is saved **after** that subtraction. `subtotal` and `tax_amount` stay at the full price.
- `sales.payment_method` only allows `cash | card | check | split`
  ([077_split_payments.sql](../supabase/migrations/077_split_payments.sql)). The default button is
  **card** ([POS.tsx:196](../src/pages/POS.tsx)).
- So a sale paid fully by credit is saved as `payment_method='card', total=0` (button reads
  "Complete Sale (Credit Only)"). Partial credit is saved as cash or card for the remainder, and
  the credit itself isn't a payment line anywhere.
- Every "Payment" label treats an unknown or credit sale as **Card**
  ([Customers.tsx:760](../src/pages/Customers.tsx), [Sales.tsx:127](../src/pages/Sales.tsx)).
  The customer order view and the CSV export never show `store_credit_used` or `gift_card_used`.
- Proof: order **C183AD29** (6/27, Aliya). Subtotal $19.90 + tax $1.05, `store_credit_used`
  $20.95, `total` $0.00, `payment_method` card.

**Auto-apply works** (item 3). General credit is applied whenever a customer is attached, and
Aliya's balance went $100.00 → $79.05 on that order. It just isn't visible after the sale. Real
gaps:

- Credit stays off after an offline blip (desktop app) until the customer is re-selected
  ([POS.tsx:526](../src/pages/POS.tsx)).
- Vendor-scoped credit never auto-applies. The cashier must switch a dropdown that only shows
  when the cart has that vendor's items.
- Vendor credit is dropped from the selected customer after a saved-cart restore or a POS
  customer edit ([POS.tsx:1587](../src/pages/POS.tsx), [useCustomers.ts:126](../src/hooks/useCustomers.ts)).
- The balance is a snapshot from when the customer was selected and is never refetched.

**Gift card redemption exists but is easy to miss** (item 4). It's a small grey "Gift card" link
beside "Add discount", visible only once the cart has items. No gift card had been redeemed as of
July. Gaps:

- No gift card id is stored on the sale.
- `expires_at` is never checked.
- It isn't a tender.
- Same failure-after-card-charge risk as store credit (below).

**No history exists** (item 5). The only records are `customers.store_credit` (a balance), the
`customer_vendor_store_credits.balance` table, and `sales.store_credit_used`, which doesn't say
whether general or vendor credit was used. Manual adjustments leave no record of who, when, why
or how much. Past adjustments **cannot be reconstructed**.

**Split payments** (item 8). Split payment exists for cash + check + card only
(`payment_breakdown` JSONB). Credit + card already works today, because credit is applied first
and card pays the rest. It's just recorded as "card".

## Aliya's credit (items 6–7)

From the July 15 backup, customer `5d2a7a3c` "Aliya Trinity", linked to vendor RAV-111:

| Date | What | Effect |
|---|---|---|
| 3/28 | Order 36835646: Mountain Hat $85 + tax = $89.51, **real cash**, $100 tendered, $10.49 change | none |
| before 6/27 | Manual general credit, amount **$100** (no record of when) | balance $100.00 |
| 6/24 | Manual **ALY vendor-scoped** credit $20 | vendor balance $20.00 |
| 6/27 | Order C183AD29, paid fully by credit, shows "Card" | balance $79.05 |

She also has gift card **GC-43C8F9FF6F** (from Jonah, $50, unredeemed as of July).

**Total as of July: $79.05 general + $20 ALY credit + $50 gift card.** There was no duplicate
Aliya customer in July. The other customer rows tied to her are vendor-sync profiles: "Ravenlia
Galleria" `2a282a0d` and "Alywillow" `da7fc205`.

**Before she deletes the duplicate**, run the read-only queries (kept outside the repo) to find
it and see what it holds. Deleting a customer:

- Clears the customer link (sets `customer_id` to NULL) on its sales, refunds, gift cards,
  invoices and saved carts, so those orders drop out of order history.
- **Silently destroys** its general balance and **deletes** its vendor-credit rows.
- Has no warning about credit in the delete dialog.
- Gets undone if the duplicate is linked to a vendor (`consignor_id` set): the sync trigger
  recreates it on the next vendor edit.

If the duplicate holds credit or orders, move them to the main account with SQL first. Don't
delete.

## Decision (made 2026-10-15)

**`sales.total` is the full order total**, with tenders (including credit and gift card)
summing to it.

- Every report that sums `total` (analytics, Sales page, employee summary) becomes correct
  without extra work.
- The tender list carries the "money actually received" split.
- Required alongside it: card-fee basis must come from the **card tender line** and never from
  `total`. This applies to the payout SQL
  ([20260715120000…:489](../supabase/migrations/20260715120000_vendor_payout_ledger_rework.sql)),
  [Sales.tsx:682](../src/pages/Sales.tsx) and [consignorReports.ts:335](../src/lib/consignorReports.ts).
  Otherwise vendors get charged card fees on credit.
- Refunds must become per-tender.

## Plan

### Phase 0 — Live data check (no code)
- Run the diagnosis SQL. Confirm the current balance, find the duplicate account, and check it
  for credit or orders.
- Merge by SQL if needed. Then she can delete it.

### Phase 1 — Tenders on the sale (items 1, 2, 3, 4, 8)
- **Migration:**
  - Add `store_credit` and `gift_card` to `valid_payment_method`.
  - Write `payment_breakdown` on **every** sale. Entries: `store_credit {amount, consignor_id|null}`,
    `gift_card {amount, gift_card_id}`, `cash`, `check`, `card`.
  - `payment_method` = the single tender, or `split` when there are several.
- **New `create_pos_sale_with_items` version:**
  - Takes the tender list and rejects it unless it sums to `total`.
  - Does the credit, vendor-credit and gift-card deductions **in the same transaction** (today
    they are separate client calls, [useSales.ts:178-209](../src/hooks/useSales.ts)).
- **POS payment step:**
  - Add **Store Credit** and **Gift Card** buttons next to Cash, Check and Card. Each adds a tender
    line.
  - The credit line is pre-added and visible when the customer has a balance, and it can be
    removed or edited. Lines show "Store Credit −$20.95 · balance after $79.05".
  - The remaining amount is paid with cash, check or card (or the existing split panel).
  - When fully covered, the button reads "Complete with Store Credit".
  - Refetch the customer's balance when payment starts.
  - Fix the offline re-enable and dropped vendor credit.
  - Allow general + vendor credit together.
- **Labels and output:** show tender lines on the receipt, email receipt, customer display, Sales
  page, Customers order view and CSV export. Remove the "anything else = Card" fallbacks.
- **Backfill** past sales with `store_credit_used > 0` or `gift_card_used > 0` into the new shape.
  It was 1 sale as of July.
- **Split tests** (extend `tests/smoke/splitPayments.test.ts`):
  - credit + card
  - credit + cash with change
  - gift card + card
  - credit + gift card + card
  - vendor credit + card
  - full credit
  - full gift card
  - failure rollback

### Phase 2 — Credit history (item 5)
- **Ledger table** `store_credit_transactions`:
  - Columns: customer, vendor|null, ±amount, balance_after, type, sale_id/refund_id, reason,
    actor, created_at.
  - Types: manual, sale, refund, rollback, merge, opening balance.
- **Matching table** `gift_card_transactions`.
- **Writes:** only through the existing functions, so every change is logged. The adjust modal
  requires a reason.
- **Backfill:**
  - An "opening balance as of <date>" row per customer.
  - Past redemptions from `sales.store_credit_used`.
  - Earlier manual adjustments can't be recovered.
- **Customer account:** a Store Credit history panel with date, type, order link, +/− and running
  balance, for general and per-vendor credit.

### Phase 3 — Reports and refunds (the tax side)
- **Sales page:** add Store Credit and Gift Card buckets. The headline total = all tenders.
- **Till accountability:**
  - Credit and gift card are excluded from the drawer but shown.
  - Fix the "Difference" being off by gift cards sold and redeemed.
  - Add cash from gift card sales to the expected drawer amount.
  - Stop subtracting refund tax from net sales.
- Fix `EmployeeSalesSummary` ignoring split sales.
- **Per-tender refunds:**
  - The credit portion goes back to credit and the gift card portion back to the card (both
    logged). Cash and card portions go back to the original method.
  - Fixes the existing bugs: **split sales can't be refunded** (DB check rejects `split`) and
    credit-only sales can't be refunded ("amount is zero").
  - Optional: a "refund to store credit" choice.

### Phase 4 — Hardening (implemented 2026-10-15)
Done: card payments are authorized, then captured only after the sale saves (released or
refunded if it didn't); sales history batches id lists; vendor filter is a server join; phone
lookup searches all customers; sync trigger compares phone digits; `merge_customers` + merge UI;
manual credit adjustments limited to admins/employees
(`supabase/migrations/20261015130000_customer_merge_and_credit_guardrails.sql`). The Stripe
capture/release path has not been exercised against Stripe yet.

Original notes:
- **Card charged but sale lost:** if the sale fails after the card is charged, nothing records it
  ([POS.tsx:1027-1057](../src/pages/POS.tsx)). Fix by switching Terminal to manual capture
  (capture after the sale is saved), or by automatically cancelling or refunding on failure.
- **Duplicate customers:**
  - POS phone lookup only scans 100 rows ([useCustomers.ts:239](../src/hooks/useCustomers.ts)).
  - The sync trigger's `'\\D'` regex is a no-op.
  - Add a customer merge tool, and a delete dialog that warns about credit and orders.
- **Permissions:** vendor-role users can currently call `adjust_customer_store_credit` for any
  customer. Restrict to admin and employees.

## Existing bugs found along the way (independent of the feature)
1. Split-payment sales can't be refunded. `refunds.valid_refund_payment_method` rejects `split`
   ([RefundModal.tsx:174](../src/components/pos/RefundModal.tsx)).
2. If the card is charged and then credit or gift card deduction or the sale insert fails, the
   customer is charged and no sale is recorded.
3. The Sales page vendor-share view charges card fees on cash and check sales
   ([Sales.tsx:682](../src/pages/Sales.tsx)). Display only; payouts are computed server-side and
   are correct.
4. `consignorReports.ts:335` charges a made-up card fee on credit-only "card" sales.
5. The till "Difference" is off by gift card activity, and cash from gift card sales is missing
   from the expected drawer amount.
