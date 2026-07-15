# Raven POS v2 regression checklist

This checklist is a release gate. A visual match is not evidence of preserved behavior.

## Baseline

- [x] Restore archive created and verified
- [x] 38 existing tests pass before redesign
- [x] Production web build passes before redesign
- [x] Pre-existing lint failures recorded: 3 errors, 24 warnings

## Contract invariants

- [x] Same Supabase tables, RPC names and payload shapes
- [x] Same Edge Function names, request bodies and response handling
- [x] Same auth roles, portal selection, session duration and logout cleanup
- [x] Same PIN/device authorization flow and RLS assumptions
- [x] Same BrowserRouter/HashRouter behavior and legacy URLs
- [x] Same Electron preload method names and IPC channel contracts
- [x] Same customer display channel name and message compatibility
- [x] Same receipt, refund, till, invoice, label and report payloads

## POS and checkout

- [ ] Exact SKU scan + Enter adds one item
- [ ] Duplicate scan increments quantity within available stock
- [ ] Unknown, inactive and out-of-stock SKU errors are distinct
- [ ] Scanner focus returns after safe pointer/keyboard actions
- [ ] Scanner shortcuts do not fire while typing in another field
- [ ] Custom item sale preserves consignor, tax, quantity and price behavior
- [ ] Item and order discounts preserve calculations and reasons
- [ ] Dealer discount preserves eligibility and percent
- [ ] Customer attach/create/update preserves store-credit scope
- [ ] General and vendor-specific store credit remain isolated
- [ ] Gift-card redeem and rollback behavior is unchanged
- [ ] Cash tender/change and quick amounts are unchanged
- [ ] Check number and completion are unchanged
- [ ] Card fee, reader display and Stripe flow are unchanged
- [ ] Split cash/check/card totals and till attribution are unchanged
- [ ] Saved cart save/restore/delete semantics are unchanged
- [ ] Session cart survives reload within the same window
- [ ] Offline mode permits only existing cash behavior
- [ ] Offline queue pending/failed/retry status remains accurate
- [ ] Invoice creation from cart remains available
- [ ] Sale completion reaches receipt delivery and New Sale

## Sales, refunds and till

- [ ] Sales filters, pagination and totals query the same data
- [ ] Transaction expansion shows the same items/adjustments
- [ ] Receipt lookup and reprint work
- [ ] Refund amount, fee allocation and restock result are unchanged
- [ ] Stripe refund sequencing and local records are unchanged
- [ ] Shopify restock/sync follow-up is unchanged
- [ ] Till expected totals include the same tenders, refunds, purchases and gift cards
- [ ] Offline unsynced cash is included exactly as before
- [ ] Till report delivery and browser print remain functional

## Inventory, intake and labels

- [ ] Inventory pagination, search and filters use the same queries
- [ ] Create/update/delete writes are unchanged
- [ ] Bulk selection, staged changes, review and transfer preserve behavior
- [ ] Unsaved edits block unsafe close/navigation
- [ ] CSV preview/import mappings are unchanged
- [ ] Scan in/out quantity changes are unchanged
- [ ] SKU/barcode values are unchanged
- [ ] Avery PDF geometry and Code 128 output are unchanged
- [ ] DYMO direct and fallback flows remain available
- [ ] Printed quantities decrement only after confirmation
- [ ] Partial/error results do not display false success

## Consignors, customers and payouts

- [ ] Consignor CRUD and deactivation preserve data
- [ ] Rate schedules, status dates and booth formulas are unchanged
- [ ] Rent payments and history are unchanged
- [ ] Consignor exports contain the same fields and calculations
- [ ] Customer CRUD, history, opt-in and credit adjustments are unchanged
- [ ] Payout eligible sales/refunds/date boundaries are unchanged
- [ ] Rent, marketing fee, card fee, invoice and ledger deductions are unchanged
- [ ] Partial/deferred/forgiven payout behavior is unchanged
- [ ] Completed payout reports and print/export are unchanged

## Employees and vendor portal

- [ ] Timeclock, manual time edits and device authorization work
- [ ] Schedules, repeating cycles, overrides and partial-day time off work
- [ ] Payroll, withholding, payouts and paystubs calculate identically
- [ ] Employee account linking/profile behavior is unchanged
- [ ] Vendor inventory, import, labels, sales, payout and storefront queries remain scoped
- [ ] Dual-role portal switching remains functional
- [ ] Messaging actor resolution, unread counts and realtime updates remain functional

## Customer display

- [x] Idle image/ready state loads
- [ ] Display opened before a sale receives state
- [ ] Item name, quantity, price, discount, subtotal, tax, fee and credits match POS
- [ ] Long item names and large carts remain readable
- [ ] Customer intake states remain compatible with Stripe reader input
- [ ] Cash, check, card, split and offline completion use accurate neutral copy
- [ ] Cancel/reset/reconnect states cannot leave stale sale information

## Accessibility and responsive QA

- [ ] Keyboard-only pass across every route
- [ ] Dialog focus enters, traps, restores and respects Escape rules
- [ ] Tabs, menus, comboboxes and table sorting use documented keyboard models
- [ ] Form errors are associated and announced
- [ ] Focus remains visible around sticky elements
- [ ] 200% zoom and 320 CSS px reflow pass
- [ ] 44 px frequent touch targets; 24 px minimum elsewhere
- [ ] Light/dark contrast meets WCAG 2.2 AA
- [ ] Reduced-motion preference is honored
- [ ] 1024×768 Electron minimum has no clipped critical action
- [ ] 1400×900 default, 1280×800, 1920×1080 and customer-display sizes pass

## Manual Windows/hardware matrix

- [ ] Installed and portable Electron builds launch and persist auth/device settings
- [ ] Receipt printer enumeration, selection, unplug/replug and paper-out
- [ ] Native driver and Electron fallback output comparison
- [ ] Sale/refund receipt barcode rescans successfully
- [ ] Physical keyboard-wedge scanner: rapid, repeat, unknown and out-of-stock scans
- [ ] Stripe simulated and live reader: register, discover, connect, reconnect, decline, cancel and success
- [ ] Disconnect internet before/during cash checkout; restart and sync without duplication
- [ ] Secondary monitor display before/after cart, long cart and all tender types
- [ ] Avery 5160 alignment at 100% scale
- [ ] DYMO service available/unavailable and template+CSV fallback
- [ ] Till popup/print and popup-blocked recovery

## Final gates

- [x] Existing and new automated tests pass
- [x] Production web build passes
- [x] Electron build/preflight passes when run in the supported environment
- [x] No new lint errors
- [ ] Visual QA report covers every route family and state
- [x] No GitHub push before explicit user approval after final review
