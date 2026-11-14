# Cash Nickel Rounding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cash paid or handed back in RavenPOS is always a multiple of $0.05, with the difference recorded so reports reconcile.

**Architecture:** One pure helper (`src/lib/cashRounding.ts`) owns the rule. A sale stores the signed difference in `sales.cash_rounding`, treated like `card_fee_amount`: it is part of `sales.total`, so tenders still sum to total and the server check is unchanged. Refunds round the cash share inside `allocateRefundToTenders`; gift card batches derive their rounding from the batch total (no schema change).

**Tech Stack:** React + TypeScript, Vitest (`npm test`), Supabase SQL migration.

**Spec:** `docs/superpowers/specs/2026-11-13-cash-nickel-rounding-design.md`

## Global Constraints

- Only cash is rounded. Card, check, store credit, gift card amounts stay exact.
- Work in whole cents; nearest multiple of 5.
- Do not commit, push or release. No attribution lines.
- Other session owns uncommitted edits in `src/components/giftcards/*`, `src/lib/giftCardBatch.ts`, `tests/smoke/giftCardBatch.test.ts`: do not edit `giftCardBatch.ts`; keep `GiftCardSaleScreen.tsx` edits minimal.
- Never touch the live database; migration is applied to the local clone only.
- Receipt/report label copy: `Cash rounding`.

## Review Focus

- Cash remainder of 1–2¢ rounds to $0.00: sale completes with no cash tender and `cash_rounding` −0.01/−0.02.
- Cashier types pennies as tendered (20.01): change is still a nickel multiple.
- Refund of an old penny-priced cash sale: cash share never exceeds what is left on the tender.
- Float noise (e.g. 0.1+0.2 dollars) must not change the rounding.
- Split with a card: no rounding difference; card takes the exact rest.

---

### Task 1: Rounding helper

**Files:** Create `src/lib/cashRounding.ts`; Test `tests/smoke/cashRounding.test.ts`

**Produces:**
- `roundCashCents(cents: number): number` — nearest 5, sign-symmetric
- `roundCashAmount(amount: number): number` — dollars
- `getCashRounding(amount: number): number` — `roundCashAmount(amount) - amount`, 2dp, signed
- `floorCashCents(cents: number): number`
- `getGiftCardCashRounding(cards: {original_amount?, purchase_payment_method?, batch_id?}[]): number` — dollars; cash cards grouped by `batch_id` (no batch = its own group), sum of each group's rounding

- [ ] Tests: endings 0–9 on $10.0x (→10.00,10.00,10.00,10.05,10.05,10.05,10.05,10.05,10.10,10.10), 0, 0.01, 0.02→0, 0.03→0.05, negatives mirror, 0.1+0.2, getCashRounding(10.02)=−0.02 / (10.03)=+0.02, gift batch grouping
- [ ] Run, see fail; implement; run, see pass

### Task 2: Refund allocation rounds cash

**Files:** Modify `src/lib/tenders.ts` (`allocateRefundToTenders`), `src/hooks/useRefunds.ts`, `src/components/pos/RefundModal.tsx`; Test `tests/smoke/tenders.test.ts`

- [ ] Tests: cash share rounds to nearest nickel; never above remaining cash (legacy 10.02 cash sale full refund → 10.00); non-cash shares exact; all-cash 3.33 → 3.35
- [ ] In `allocateRefundToTenders`, after shares: for cash entries `share = min(roundCashCents(share), floorCashCents(remaining))`
- [ ] `useRefunds.processRefund` and `RefundModal`: refund amount = sum of allocation

### Task 3: Sale records cash rounding

**Files:** Create `supabase/migrations/20261115120000_cash_rounding.sql`; Modify `src/types/index.ts`, `src/types/offline.ts`, `src/hooks/useSales.ts`

- [ ] Migration: `sales.cash_rounding NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (cash_rounding BETWEEN -0.02 AND 0.02)`; re-create `create_pos_sale_with_items` from 20261015120000 unchanged except inserting `cash_rounding` from the payload
- [ ] `CompleteSaleParams.cashRounding?: number`; sent as `cash_rounding` online and in the offline queue row

### Task 4: Register

**Files:** Modify `src/pages/POS.tsx`

- [ ] `cashDue = roundCashAmount(cashPrice)`, `cashRounding = getCashRounding(cashPrice)`; cash `amountDue = cashDue`; change = `roundCashAmount(tendered − cashDue)`; pass `cashRounding`; show a `Cash rounding` row when non-zero
- [ ] Split: cash part = nickel-rounded, never above `cashPrice`; split change nickel-rounded

### Task 5: Receipts

**Files:** Modify `src/types/receipt.ts`, `src/lib/printReceipt.ts`, `src/components/pos/Receipt.tsx`, `src/components/receipt/ReceiptTemplate.tsx`, `src/lib/emailReceipt.ts`, `supabase/functions/send-receipt-email/index.ts`, order views in `src/pages/Sales.tsx` / `src/pages/Customers.tsx` where card fee is listed

- [ ] `ReceiptData.cashRounding?: number`; `Cash rounding` line after Card Fee when non-zero (signed)

### Task 6: Reports and till

**Files:** Modify `src/lib/tillAccountability.ts`, `src/lib/salesSummary.ts`, `src/pages/employee/EmployeeTillCount.tsx`, `src/pages/Sales.tsx`; Tests `tests/smoke/tenderAccounting.test.ts`, `tests/smoke/salesSummary.test.ts`

- [ ] `metrics.cashRounding` = Σ `sales.cash_rounding` + `getGiftCardCashRounding`; added to `totalCollected`; cash gift card money in the drawer uses rounded batch totals
- [ ] Summary rows `cashRounding` (split + books) when non-zero
- [ ] Queries select `cash_rounding` and gift card `batch_id`
- [ ] Test: Collected − Received = 0 for a rounded cash sale and a rounded cash gift card batch

### Task 7: Gift card sale screen and dealer purchases

**Files:** Modify `src/components/giftcards/GiftCardSaleScreen.tsx` (minimal), `src/pages/DealerPurchases.tsx`

- [ ] Gift card cash: due = `roundCashAmount(total)`; suggestions, shortfall check, change and button label use it
- [ ] Dealer purchase paid in cash: `total = roundCashAmount(subtotal)` (create and edit); subtotal exact

### Task 8: Verify

- [ ] `npm test`, `npx tsc -b`
- [ ] Apply migration to the local clone; ring a cash sale at a penny total in `ravenpos-local-clone`; check receipt and summary
