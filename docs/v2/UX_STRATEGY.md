# Raven POS v2 UX strategy

## Product intent

Raven POS v2 should feel like a calm, precise retail operating system for consignment work: fast at the register, legible through a long shift, dense enough for real inventory and financial operations, and unmistakably Raven without behaving like a marketing site.

The strategy is frontend-only. It preserves every existing route, calculation, permission, payload, integration, printing path, and operational outcome.

## Design principles translated into decisions

### Put the next operational action first

- “Sell” is the first primary destination for admin and PIN employee shells.
- Scanner/search remains the first focus in POS.
- Page headers identify the object/workflow, current state, and one primary action.
- Secondary actions remain visible when frequent; rare or exceptional actions live in labeled menus.
- Destructive and financial exception actions never share the same treatment as routine completion.

### Dense, not compressed

- Use 12/14/16/20/24/32 px type roles; 14 px is the default operational text size and 16 px is used for prolonged reading/forms on touch.
- Use an 8 px base rhythm with 4/12/16/24/32 px steps.
- Prefer dividers, section labels and alignment over nested cards.
- Keep tables dense on desktop while preserving 40–44 px interactive rows and 44 px controls.
- Use progressive disclosure for secondary detail, not to hide primary state.

### Make system state explicit

Every async or hardware workflow must distinguish:

- idle/ready;
- working/scanning/authorizing/saving/printing;
- success/added/incremented/synced;
- recoverable warning/offline/pending;
- failure/declined/not found/disconnected;
- completion and next action.

Routine status uses polite live announcements. Payment, inventory and financial failures use assertive alerts.

### Preserve muscle memory while improving structure

- Keep route paths, entity names and workflow order.
- Keep scanner Enter behavior and focus rules.
- Keep shared admin/employee POS and Sales implementations.
- Keep all payment types, saved carts, credits, invoices, refunds, displays and print choices.
- Move controls only when their new location remains visible, labeled and easier to reach.

## Information architecture

### Admin navigation

1. Sell
   - Point of Sale
2. Inventory
   - Products
   - Add products
   - Scan in/out
   - Import CSV
   - Labels
3. Relationships
   - Consignors
   - Customers
   - Dealers
   - Purchase from dealer
4. Transactions
   - Sales
   - Payouts
   - Invoices
5. Team
   - Timecards
   - Schedule
   - Payroll
   - Roles
6. Reports & finance
   - Tax reports
   - Categories & tax
   - Marketing fees
7. Operations
   - Messages
   - Email campaigns
   - Integrations
8. Settings
   - Profile
   - Printer settings (Electron only)

The dashboard is accessed from the Raven home/logo and may remain a first item, but Sell receives the strongest visual emphasis. Desktop, mobile and collapsed navigation derive from the same route metadata.

### Vendor navigation

- Overview
- Inventory
- Import
- Labels
- Sales
- Payouts
- Storefront
- Messages
- Profile

### PIN employee navigation

- Sell
- Till count
- Sales
- Customers
- Labels
- Schedule
- Messages
- Profile

No feature restrictions are inferred from employment labels.

## Primary workflow strategy

### POS and checkout

Preserve the existing controller and handlers. Reorganize its presentation into:

1. Register status bar: online/offline, queue status, scanner ready, connected reader, customer display.
2. Persistent scan/search command field with visible product search and custom-item actions.
3. Dominant cart workspace with product, SKU, price, discount, quantity and clearly labeled row actions.
4. Sticky sale summary with customer/credit context, subtotal, discounts, tax, fees, credits and total.
5. Tender workspace with an accessible selected-state control and one unambiguous completion action.
6. Explicit transaction feedback lifecycle: adding → tendering → authorizing → approved/declined → saving → receipt → complete.

Interaction rules:

- Quantity/remove/discount controls use at least 44 px targets.
- Item removal offers undo when safe; Clear Sale requires confirmation.
- Search, saved carts and customer lookup are visible frequent actions.
- Refund, invoice, gift-card sale, display and exceptional adjustments remain labeled secondary actions.
- Keyboard shortcuts are documented and ignored while users type in unrelated controls.

Current card/refund external-money sequencing is a known backend risk. The redesign does not change it.

### Inventory and intake

- One filter toolbar with visible labels, active-filter count and Clear all.
- Server-backed sort where available; never imply global sorting when only the loaded page changes.
- Sticky name/SKU and actions on wide tables; meaningful compact row layout on narrow screens.
- Selection count is persistent and announced.
- Bulk edit retains staged changes, review summary and discard warning.
- Scan intake preserves exact SKU/Enter semantics and shows added/incremented/error feedback.

### Consignors

- List emphasizes consignor number, name/business, status, booth and contact.
- Detail becomes a workspace with overview, inventory, sales, payouts/ledger, booth/rent and profile/portal sections.
- Balance, amount due, active inventory and exceptions remain visible summary facts.
- Financial values use consistent labels and tabular numerals.
- Existing commission, rent, rate-schedule and payout calculations remain untouched.

### Sales, returns and payouts

- Replace div-based pseudo-tables with semantic responsive data views.
- Keep receipt ID, date, customer/consignor, tender, status and total scannable.
- Expanded transaction detail preserves every current item and adjustment.
- Refund/void confirmation states explicitly state amount, tender impact, restock behavior and irreversibility.
- Payout review places payee, period, gross, deductions, invoices, balance disposition and exact amount immediately above confirmation.
- Forgiven/deferred balances receive exception styling and explicit acknowledgement without inventing new approvals.

### Customer display

- Design for viewing distance, not employee density.
- Idle: clear store identity and ready message/idle image.
- Active cart: large item names, quantities and prices; sticky summary.
- Processing: clear authorization state without implying success.
- Complete: tender-neutral completion copy, total and change/receipt direction where applicable.
- Cancelled/reconnecting: explicit state and safe recovery message.
- Preserve `BroadcastChannel('ravenpos-cart')`; transport changes beyond compatible frontend fields are out of scope.

## Research principles adopted

- Configurable high-frequency action placement is common in modern retail systems. Raven applies the principle through route-driven navigation and prominent frequent actions, not through copied branding. See [Shopify POS smart-grid management](https://help.shopify.com/en/manual/sell-in-person/shopify-pos/customize-pos/smart-grid-management) and [Square item grid](https://squareup.com/help/us/en/article/8334-set-up-item-grid).
- Mature POS systems document keyboard accelerators for sale, search and lookup workflows. Raven adds discoverable, input-safe shortcuts around its existing scanner behavior. See [Lightspeed Retail keyboard shortcuts](https://retail-support.lightspeedhq.com/hc/en-us/articles/228839547-Keyboard-shortcuts).
- Payment completion and receipt choice should be separate, explicit states. See [Shopify receipt management](https://help.shopify.com/en/manual/sell-in-person/shopify-pos/receipt-management/managing-receipts).
- Inventory scan workflows benefit from accumulation followed by a review/commit step, matching Raven’s staged bulk-edit model. See [Square inventory receiving](https://squareup.com/help/us/en/article/6110-manage-inventory-with-the-retail-pos-app).
- Offline capability must be described feature by feature, with unsynced work visible. See [Shopify POS offline features](https://help.shopify.com/en/manual/sell-in-person/shopify-pos/selling-offline/offline-features).
- Customer displays use deliberately separate idle, cart and completion states. See [Shopify customer display](https://help.shopify.com/en/manual/sell-in-person/shopify-pos/customize-pos/customer-display) and [Clover order display](https://docs.clover.com/dev/docs/displaying-an-order).
- Accessible interactions follow WAI-ARIA Authoring Practices for [modal dialogs](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/), [comboboxes](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/), [tabs](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/) and [data grids](https://www.w3.org/WAI/ARIA/apg/patterns/grid/).

## Migration sequence

1. Correct semantic tokens and shared primitives.
2. Centralize navigation metadata and unify operational shells.
3. Redesign POS presentation without moving transaction logic.
4. Rebuild inventory, sales, consignors, customers and payouts on shared patterns.
5. Apply the system to remaining admin, employee, vendor and public pages.
6. Complete accessibility, responsive, Electron, hardware and visual QA.

