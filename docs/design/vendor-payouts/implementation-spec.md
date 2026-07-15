# Vendor payouts implementation spec

Approved July 15, 2026. The images in this directory are the visual source of truth.

## Design system

- Canvas: warm bone `#f7f4ef`; surfaces: white `#ffffff`; inset surface: `#f1ece3`.
- Text: charcoal `#1a1714`; muted stone `#625a50`; rules: `#d9d1c6`.
- Primary: deep clay `#8a2b22`; success: olive; warning: ochre; information: muted blue.
- Inter is the UI and control face. Fraunces is reserved for statement headings and large money values.
- Use open ledger bands, ruled lists, and tables. Avoid nested cards, gradients, glass, and badge-heavy status treatment.
- Icons use the existing Lucide family at approximately 1.75px stroke weight.
- Desktop preserves the existing RavenPOS sidebars. Mobile preserves the existing bottom navigation.

## Component families

- `PayoutPageHeader`: breadcrumb, title, description, actions, lock/read-only state.
- `FinancialEquation`: opening balance, activity, adjustments, payments, and ending/current balance.
- `PayoutStatus`: semantic dot, label, optional explanation, and legacy warning.
- `ThresholdProgress`: threshold snapshot, progress, and remaining amount.
- `TransactionLedger`: transactions grouped by sale with inline expandable item allocations.
- `AdjustmentLedger`: applied adjustments and pending obligations kept visibly separate.
- `InvoiceApplicationLedger`: oldest-first invoice applications with editable draft amounts.
- `StatementMeta`: lifecycle, actor, method, reference, cutoff/range, and confidence.
- `AuditTimeline`: append-only preparation, finalization, void, and invoice-payment events.

## Routes

- `/admin/payouts`: payout queue and report/range modes.
- `/admin/payouts/vendor/:consignorId`: vendor financial workspace.
- `/admin/payouts/drafts/:payoutId`: draft review and payment.
- `/admin/payouts/history/:payoutId`: immutable payout statement.
- `/admin/finances/invoices/:invoiceId`: invoice detail and append-only payment timeline.
- `/vendor/payouts`: read-only vendor financial workspace.
- `/vendor/payouts/:payoutId`: read-only immutable vendor statement.

## Accounting invariants shown in every surface

- Date filters are a reporting lens and never remove older unpaid balances.
- Range payouts store the range, cutoff, and carryover choice as fields.
- Sale status comes from active payout allocations, never payout dates.
- Partial payouts allocate FIFO and keep the final remainder owed automatically.
- Required deductions are affordability-limited; unapplied obligations remain visible.
- Invoice applications create append-only invoice payments.
- Paid statements use stored allocation and adjustment snapshots.
- Legacy records never present reconstructed sale lines as proof unless reconciliation succeeds.
- Vendor screens are read-only and consume the same canonical RPC results as admin screens.

## Approved concept corrections

- The desktop draft concept's item-level `$80.60` remainder is distinct from the total `$136.18` vendor rollover. Implementation must label the total rollover as `$136.18`.
- Empty invoice-payment timelines have no invented event date.
- The real repository navigation labels and routes override any image-generation text artifacts.
