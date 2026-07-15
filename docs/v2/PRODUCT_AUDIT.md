# Raven POS v2 product audit

Status: discovery baseline, created before major redesign changes on 2026-07-13.

## Executive finding

Raven POS is a React 19, TypeScript, Tailwind 4, Supabase, and Electron application with four distinct product surfaces: public storefront, admin operations, vendor portal, and employee access (PIN terminal plus email-auth self-service). The application is operationally mature but its presentation layer is distributed across several large controller/view pages and three partially duplicated shells.

The redesign boundary is therefore strict: visual primitives, layout, information architecture, and frontend interaction state may change; calculation modules, hooks, payloads, RPCs, Edge Functions, authentication, Electron IPC, printing, and synchronization behavior are frozen unless a presentation-only adapter preserves the existing contract.

## Baseline and restore point

- Branch: `main`
- Baseline HEAD: `407944e45f0f24ff54613a2c4de444df30894b58`
- Pre-existing local changes: modified `.gitignore`; untracked `ALYWILLOW_UPDATE_REFERENCE.md`
- Restore point: `backups/restore-points/2026-07-13-pre-v2/`
- Archive: 404 tracked and non-ignored untracked files, 22 MB compressed
- SHA-256: `fa324abd5ca8fc8ce80bbb13b232f3736b5526fbce89344fe8f2055f168e63b5`
- Verification: archive extracted successfully; 404 files restored; `.gitignore`, `ALYWILLOW_UPDATE_REFERENCE.md`, and `src/App.tsx` matched byte-for-byte

Baseline quality gates:

- `npm test`: 11 files, 38 tests passed
- `npm run build`: passed; main application chunk is 2.88 MB before gzip and triggers the Vite large-chunk warning
- `npm run lint`: pre-existing failure with 3 errors and 24 warnings

## Route and surface inventory

### Public storefront

| Route | Surface | Notes |
|---|---|---|
| `/` | Ravenlia home | Static/brand presentation |
| `/events`, `/vendors`, `/contact`, `/our-story` | Marketing and location pages | Static/brand presentation |
| `/shop` | Product browser | Public inventory, categories, consignors |
| `/shop/categories`, `/shop/vendors` | Public directories | Direct/read-only backend queries |
| `/shop/vendor/:vendorSlug/:itemSlug`, `/shop/item/:id` | Item detail | Public inventory lookup |
| `/shop/vendor/:id`, `/shop/category/:category` | Vendor/category detail | Public items/consignor queries |
| `/classes`, `/shopping`, `/categories`, `/category/:category`, `/vendor/:vendorSlug/:itemSlug`, `/item/:id`, `/vendor/:id`, `/blog`, `/feedback`, `/white-raven-warehouse` | Compatibility routes | Preserve every URL and redirect |

`PublicLayout` owns search-query routing and embed mode as well as visual navigation, so it is frontend workflow code rather than a pure wrapper.

### Standalone and authentication

| Route | Surface | Preserve-exactly dependency |
|---|---|---|
| `/login` | Admin/vendor sign-in | Supabase account auth |
| `/portal-select` | Multi-role portal selection | `sessionStorage` active-portal choice |
| `/employee/login` | Device-authorized PIN entry | anonymous auth, device token, employee session |
| `/employee/portal-login` | Employee account sign-in | account auth and PIN-device redirect |
| `/employee/action-selection` | Clock/POS choice | PIN session and clock mutations |
| `/employee-portal` | Employee self-service | account role guard, schedules, time off, profile |
| `/display` | Customer display | terminal settings and `BroadcastChannel` |
| `/preview-components` | Component sandbox | presentation-only; currently public |

### Admin operations

| Route | Workflow |
|---|---|
| `/admin` | Dashboard and analytics |
| `/admin/consignors`, `/admin/consignors/:id` | Consignor search, CRUD, inventory, booth rent, rates, reports and credentials |
| `/admin/inventory`, `/admin/add-items`, `/admin/import`, `/admin/scan` | Inventory list, bulk editing, intake, CSV, barcode stock adjustment |
| `/admin/labels` | Selection, quantities, PDF/DYMO printing and printed-count confirmation |
| `/admin/pos` | Full sales and checkout workflow |
| `/admin/sales` | Sales history, receipts, refunds and till accountability |
| `/admin/payouts` | Consignor payout calculation and recording |
| `/admin/finances/invoices` | Invoices and payment status |
| `/admin/finances/tax-reports` | Accounting/tax reports |
| `/admin/finances/categories` | Categories and tax rates |
| `/admin/finances/marketing-fees` | Fee definitions and allocations |
| `/admin/customers` | Customer CRUD, history and store credit |
| `/admin/dealers`, `/admin/dealers/purchases` | Dealer records and reverse-POS purchase workflow |
| `/admin/employees`, `/admin/employees/roles`, `/admin/employees/schedule` | Timecards, device authorization, employment labels and schedules |
| `/admin/employees/payroll`, `/admin/employees/payroll/:employeeId` | Payroll, withholding, payouts and paystubs |
| `/admin/employees/payouts`, `/admin/employees/payouts/:employeeId` | Legacy payroll routes; preserve behavior |
| `/admin/integrations`, `/admin/shopify-setup` | Shopify status, sync and configuration |
| `/admin/messages`, `/admin/email-campaigns`, `/admin/profile` | Messaging, campaigns and settings |

### PIN employee operations

| Route | Actual routed implementation |
|---|---|
| `/employee/pos` | Shared production `POS.tsx` |
| `/employee/sales` | Shared production `Sales.tsx` |
| `/employee/till-count` | Employee till reconciliation |
| `/employee/schedule` | Employee schedule/time-off view |
| `/employee/customers` | Shared customer workflow |
| `/employee/labels` | Shared label workflow |
| `/employee/messages` | Shared messaging workflow |
| `/employee/profile` | PIN employee profile/account link |

`pages/employee/EmployeePOS.tsx` and `EmployeeSales.tsx` are not the production routes. They must not be redesigned in place of the shared files.

### Vendor portal

| Route | Workflow |
|---|---|
| `/vendor` | Vendor dashboard |
| `/vendor/inventory`, `/vendor/import`, `/vendor/labels` | Vendor-scoped inventory/intake/labels |
| `/vendor/sales`, `/vendor/payouts` | Vendor sales and payouts |
| `/vendor/storefront` | Publication and storefront settings |
| `/vendor/profile`, `/vendor/messages` | Profile and messaging |

## Architecture and state map

- Global providers: `AuthProvider`, `ToastProvider`, `EmployeeProvider`.
- Account auth (`admin`, `vendor`, `employee`) and device/PIN employee auth are separate systems and must remain separate.
- `employee_roles` are employment labels, not feature permissions. The redesign must not invent capability gating.
- Web uses `BrowserRouter`; Electron/file execution uses `HashRouter`.
- Admin, vendor, and employee layouts keep messaging alive at shell scope and deliberately remount outlets on pathname changes.
- Page/controller state is predominantly local React state plus domain hooks; there is no central query cache.
- Persistence includes `sessionStorage` for active portal and active POS cart, `localStorage` for preferences and employee session, Supabase for held carts, and Electron Store for device/printer/offline state.
- `useCategories` populates a mutable tax-rate registry consumed by POS calculations. Category initialization ordering is a hidden behavioral dependency.

## Code classification

### Presentation-only or presentation-led

- `src/components/ui/*`
- `src/components/layout/*` visual portions
- analytics chart components
- public storefront cards/sections and static brand pages
- `src/index.css`, theme tokens, and component preview

### Frontend workflow code

- route/search/embed handling in `PublicLayout`
- navigation state and route remount behavior
- modal, drawer, filter, selection, saved-view, and bulk-edit state
- POS focus/scanner/keyboard behavior and held-cart coordination
- messaging UI/controller and unread state
- customer-display channel coordination

### Shared business logic: freeze results and signatures

- tax, discounts, card fees and sale discounts
- refund calculations
- consignor rate/status calculations
- cash/till reconciliation
- payroll, paystub and time calculations
- item pricing and inventory limits
- invoice, report and export builders

### Backend-dependent: preserve query/mutation contracts

- all Supabase hooks and direct page queries
- account/PIN/device authentication and RLS assumptions
- RPC and Edge Function payloads
- Electron IPC, printer behavior and offline queue
- email, Shopify, receipt, invoice, till and label output

## Reuse and consistency audit

- Operational page source totals roughly 42,763 lines across pages, UI primitives and layouts.
- `POS.tsx` is 3,677 lines; `Sales.tsx` 3,300; `EmployeePayouts.tsx` 2,698; `Payouts.tsx` 2,227; `EmployeeSchedule.tsx` 1,669; `EmailCampaigns.tsx` 1,527; `Labels.tsx` 1,438.
- 38 routed/page surfaces already use the shared `Header`, and 13 page/component surfaces use the shared `Table`.
- At least 220 raw form controls and 587 extra-small/custom small-text uses remain across page files, creating substantial consistency and accessibility drift.
- Admin, employee and vendor desktop shells duplicate collapse/profile/navigation behavior; admin mobile navigation separately duplicates route metadata and omits reachable routes.
- Admin navigation has 11 top-level entries plus four expandable groups, with important workflow concepts split across distant locations.
- The top bar always labels itself “Team Messaging” instead of giving page or operational context.
- The sidebar displays version `1.3.2` while `package.json` is `3.10.2`.

## Current UX and visual findings

### Strengths worth preserving

- Warm bone/charcoal/clay palette is distinct, restrained and already shared with the public Ravenlia brand.
- Existing input/button sizes generally meet 44 px touch targets at medium size.
- Shared semantic color tokens, dark theme, responsive mobile navigation and print rules already exist.
- POS exposes scanner entry immediately, separates cart from tender, supports offline status, and keeps all existing payment modes visible.
- Inventory already has server pagination, filters, bulk edit, transfer and explicit unsaved-change protection.
- Public storefront is visually coherent and substantially more polished than the operational surfaces.

### Navigation and shell problems

- Long hard-coded admin navigation becomes a scroll list and has different desktop/mobile coverage.
- Collapsed group flyouts are pointer-hover driven and do not offer an equivalent keyboard disclosure pattern.
- Layouts combine `useMobile` conditional rendering with CSS breakpoints, increasing mismatch risk around resize.
- Page content uses a decorative rounded top-left shell transition that consumes space without improving orientation.
- No global search or command access exists despite the number of routes and entities.

### Component/accessibility problems

- `Modal` provides dialog semantics and Escape handling but has no focus trap, initial focus, background inert state, or focus restoration.
- `Tabs` has no `tablist`, `tab`, `aria-selected`, panel association, or arrow-key behavior.
- `Input` and `Select` render visible errors but do not set `aria-invalid` or connect hint/error text with `aria-describedby`.
- Generated field IDs are based on label text and can collide when the same field appears more than once.
- Clickable table rows are not keyboard focusable; sortable headers are pointer-only and do not expose `aria-sort`.
- The table lacks a caption/accessible name, sticky header, column visibility, selection contract and keyboard row navigation.
- Icon-only actions commonly rely on `title`, which is insufficient as the sole accessible name.
- Customer display idle state uses a dark background with a black logo, making the brand mark nearly invisible.
- The employee unauthorized-device screen uses a separate navy visual system, while account login and display use warm charcoal.
- Reduced-motion preferences are not handled.

### Density, responsiveness and workflow problems

- The POS cart uses 32 px quantity buttons, below the project’s 44 px touch target.
- POS critical secondary actions are mixed in a generic Options menu; some are frequent (search/held carts) and some are exceptional (refund/clear sale).
- POS total/payment panels stack several card sections within a narrow right column and rely on independent scrolling.
- Inventory filters use fixed 240/190/160 px widths; Sales and Tax Reports contain rigid data layouts up to 1,260 px.
- Large operational pages mix shared primitives with raw controls and one-off interaction states.
- Loading treatment ranges from plain “Loading...” text to spinners and skeletons; empty/error patterns are inconsistent.
- Dashboard quick actions use unrelated bright green/violet/amber blocks, diluting the Raven visual hierarchy.

## Integration and preservation map

### POS and payments

Preserve the single shared POS controller, `create_pos_sale_with_items` atomic RPC, compensation order, tax initialization, card-fee math, split payments, vendor-specific store credit isolation, gift-card rollback, Stripe terminal lifecycle, customer reader input, saved carts, invoices and offline-cash queue.

### Customer display

Preserve `BroadcastChannel('ravenpos-cart')`, payload shapes, terminal-setting reads, Stripe reader display updates and sale-state events. Only the view and presentational state machine may change.

### Printing and barcode

Preserve Electron preload method names, IPC channel names, printer settings, driver fallback, receipt/refund structures, transaction barcodes, browser print-window flows, PDF labels, DYMO template/data exports, printed-count confirmation and SKU/barcode semantics.

### Auth and permissions

Preserve account-role guards, active-portal behavior, forceful logout cleanup, eight-hour PIN session, device authorization, anonymous session mapping, clock semantics and current RLS-enforced access.

## High-risk areas

1. POS transaction, payment and rollback orchestration
2. Refund calculation, Stripe refund and restock order
3. Consignor payout and deduction calculations
4. Payroll, withholding and paystub calculations
5. PIN/device auth and anonymous employee sessions
6. Inventory quantities, unlabeled counts, rate schedules and Shopify loop prevention
7. Receipt, label, report and till printing
8. Offline sale queuing and idempotent replay
9. Customer-display and Stripe-reader synchronization
10. Till accountability and split-payment inclusion
11. Vendor-specific store credit isolation
12. Legacy route and BrowserRouter/HashRouter compatibility

## Safe implementation boundaries

1. Establish semantic tokens and shared primitives first.
2. Centralize route/navigation metadata while preserving every current path and auth guard.
3. Rebuild shells as presentation wrappers while retaining messaging lifetime, storage keys and outlet remount semantics.
4. Improve tables/forms/dialogs through backward-compatible props and defaults.
5. Keep page controllers and mutations in place; extract only view regions with explicit props/callbacks.
6. Do not fork POS for admin versus employee.
7. Treat hardware, printing, display and network synchronization as ports with frozen contracts.
8. Add contract and interaction tests before relocating high-risk handlers.

## Out-of-scope backend recommendations

These are not authorized for this frontend redesign:

- true employee feature permissions/capabilities
- server-backed saved filters, column layouts or navigation pins across devices
- new audit-log or loss-prevention data
- new held-sale collaboration semantics
- changed tax, payout, commission, refund or payroll rules
- altered API/RPC payloads or database schemas
