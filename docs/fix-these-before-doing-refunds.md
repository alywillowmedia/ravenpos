# Fix These Before Doing Refunds

These are still open after the quick math fixes to payouts/refunds:

1. Sales reporting consignor/store split is still pre-discount in parts of the app.
- `src/hooks/useSalesHistory.ts` calculates consignor/store share from `price * qty` and `sale.subtotal`.
- This can overstate both shares when discounts exist.

2. Vendor-facing dashboard/sales earnings views do not reflect refunds or card-fee deductions.
- `src/pages/vendor/VendorSales.tsx`
- `src/pages/vendor/VendorDashboard.tsx`
- These can show higher earnings than actual pending payout.

3. Add a reconciliation view that compares:
- `sales.card_fee_amount` (what we charged customer)
- Actual Stripe processing fee from `balance_transaction`
- This catches fee drift quickly if pricing or logic changes.

4. Decide and document one canonical `sales.subtotal` meaning.
- Right now checkout uses `subtotal` as pre-discount and stores `discount_total` separately.
- Some summaries assume subtotal is net of discounts.
- Standardize this to avoid future payout/refund/reporting drift.
