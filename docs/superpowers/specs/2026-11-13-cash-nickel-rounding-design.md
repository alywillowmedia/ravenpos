# Cash rounding to the nearest nickel — design

Approved by the owner 2026-11-13.

## Intent
The store no longer gives pennies. Any amount paid or handed back in cash is a
multiple of $0.05. Card, check, store credit and gift card tenders stay exact.

## Rule
Round the cash amount to the nearest 5 cents, working in whole cents: endings
1, 2, 6, 7 round down; 3, 4, 8, 9 round up; 0 and 5 are unchanged. Whole cents
have no exact midpoint, so there is no tie rule.

## Approaches
1. **Separate `cash_rounding` amount on the sale (picked).** Signed, −0.02 to
   +0.02. Treated like `card_fee_amount`: `sales.total` = subtotal − discounts +
   tax + card fee + cash rounding, and tenders still sum to `total`. Item
   prices, tax and vendor payouts stay exact; reports show rounding on its own
   line.
2. Change the total with no separate amount. Rejected: tax and payout figures
   drift by pennies and nothing explains the difference.
3. Keep `total` exact and let tenders differ from it. Rejected: breaks the
   "tenders sum to total" rule the server and refunds rely on.

## Where it applies
- Register cash sale, including cash left after store credit / gift card.
- Split payment: the cash part is rounded to a nickel. With a card in the
  split the card takes the exact rest (no rounding difference); cash + check
  only, the cash remainder is rounded and the difference recorded.
- Gift cards sold for cash: amount paid is rounded, card balances are not.
- Offline cash sales (Electron queue).
- Cash refunds, and cash paid out on dealer purchases: rounded to a nickel.
- Old sales are untouched (`cash_rounding` defaults to 0).

## Shown to people
- Register and gift card screen: cash amount due and change are nickel
  multiples; a "Cash rounding" line appears when it is not zero.
- Receipts (screen, print, email): "Cash rounding" line when not zero.
- Sales summary / till count: a "Cash rounding" line so totals reconcile.

## Non-goals
No change to pricing, tax, card fees or payouts. No backfill of old sales.

## Left to the builder
Helper location and names, exact report wording, migration details. Tests cover
every cent ending, zero, negatives (refunds) and split payments.
