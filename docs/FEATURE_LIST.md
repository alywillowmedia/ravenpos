# RavenPOS Feature List (Fresh Codebase Analysis)

Updated from direct code inspection on 2026-03-06.

## 1. App Overview

RavenPOS is a multi-portal retail platform for consignment operations with:
- POS checkout and register workflows
- Inventory and labeling operations
- Vendor/consignor management and payout accounting
- Employee PIN/timeclock/scheduling tools
- Public storefront and vendor pages
- Messaging and email campaign tooling
- Shopify and Stripe integrations
- Optional Electron desktop runtime with thermal printer support

Core stack:
- Frontend: React + TypeScript + Vite
- Backend: Supabase (Postgres, Auth, Storage, Edge Functions)
- Payments: Stripe Terminal + Stripe refunds
- Commerce sync: Shopify bi-directional inventory sync
- Email: Resend-backed edge functions for receipts/invoices/refunds/campaigns

## 2. Portals, Roles, and Route Surfaces

### Public storefront routes
- `/` browse homepage with hero, featured products, filterable catalog, pagination
- `/categories`, `/category/:category` category discovery and category item listing
- `/vendors`, `/vendor/:id` vendor discovery and vendor storefront pages
- `/vendor/:vendorSlug/:itemSlug`, `/item/:id` item detail views

### Admin authenticated routes
- `/admin` dashboard and analytics
- `/admin/consignors`, `/admin/consignors/:id` consignor CRUD and detail management
- `/admin/inventory`, `/admin/add-items`, `/admin/import`, `/admin/scan`, `/admin/labels`
- `/admin/pos`, `/admin/sales`, `/admin/payouts`
- `/admin/finances/invoices`, `/admin/finances/categories`, `/admin/finances/marketing-fees`
- `/admin/customers`
- `/admin/employees`, `/admin/employees/roles`, `/admin/employees/schedule`
- `/admin/messages`, `/admin/email-campaigns`
- `/admin/integrations`, `/admin/shopify-setup`
- `/admin/profile`

### Vendor authenticated routes
- `/vendor` dashboard
- `/vendor/inventory`, `/vendor/import`, `/vendor/labels`
- `/vendor/sales`, `/vendor/payouts`
- `/vendor/storefront`, `/vendor/profile`
- `/vendor/messages`

### Employee (PIN-oriented) routes
- `/employee/login` PIN login with device authorization checks
- `/employee/action-selection` clock in/out + POS entry decision screen
- `/employee/pos`, `/employee/schedule`, `/employee/customers`, `/employee/labels`, `/employee/messages`

### Shared/standalone routes
- `/login` admin/vendor email-password auth
- `/display` customer-facing live order display screen

## 3. Authentication and Access Control

- Role-based app auth for admins/vendors via Supabase auth + `users` table role metadata.
- Employee auth is separate and PIN-based, using anonymous auth/session mapping and device-token checks.
- Device authorization system controls whether employee terminals can use PIN login.
- Route-level protection enforces admin vs vendor areas and redirects cross-role access attempts.
- Logout flow hard-clears Supabase auth tokens and forces route-safe reload.

## 4. POS and Checkout Features

- Barcode/SKU scan-driven carting with scanner autofocus behavior.
- Smart item search modal and custom sale-item entry support.
- Mixed cart with per-item and order-level discounts.
- Category-driven tax calculations and cart total engine.
- Customer attach/create/edit in-flow during checkout.
- Store credit application and balance deduction/restore logic.
- Gift card lookup, issuance, redemption, and rollback on failed transactions.
- Cash, card, and check payment method support.
- Card fee model with consignor-aware fee allocation behavior.
- Stripe Terminal reader discovery, connect/reconnect, simulated/live modes, reader registration by code, card collection and processing.
- Refund launch path from POS with item-level partial refunding and restock flags.
- Invoice creation from current cart for customer or vendor recipients.
- Receipt generation, print flow, and delivery options (email/print).
- Broadcast channel updates to real-time customer-facing display page.

## 5. Sales, Refunds, and Transaction History

- Sales history with expandable per-sale line detail.
- Date-range filtering presets and custom range filtering.
- Sales totals with consignor/store share calculations.
- Refund history tab and refund-adjusted financial summaries.
- Partial/full refund handling with status updates.
- Stripe refund processing for card transactions.
- Inventory restock on refund with unlabeled quantity tracking.
- Optional customer attachment/reattachment to historical sales.
- Check-number editing on historical sales records.
- Historical receipt reprint support.

## 6. Inventory and Catalog Operations

- Full item CRUD with consignor ownership.
- Single-item add workflow and spreadsheet-like batch entry workflow.
- Bulk edit mode with staged changes, summary review, and commit.
- Bulk transfer selected items between consignors.
- Consignor and category filtering in inventory list.
- SKU management and duplicate-SKU handling.
- Image upload support for inventory and storefront assets.
- Quantity tracking including `qty_unlabeled` and `printed_quantity` style label-state behavior.
- Scan Inventory mode for rapid add/remove stock by SKU.
- Public listing toggles (`is_listed`, `show_in_public_browse`, `storefront_featured`).

## 7. CSV Import Features

- Admin and vendor CSV import flows.
- Template download support.
- Column mapping UI (name/sku/category/qty/price/image/variant).
- Auto-detection of common column names.
- Shopify-export detection and preprocessing path when Handle-based exports are detected.
- Preview table before import.
- Bulk creation pipeline tied to selected consignor context.

## 8. Labeling and Print Workflows

- Admin and vendor label generation pages.
- Label filters by consignor/category/printed status/date ranges.
- Select-all and per-item selection.
- Print modes: all qty, unlabeled qty only, or custom quantity overrides.
- PDF generation for printable label sheets.
- Two-step “generate and confirm printed” workflow to update unlabeled counts safely.
- Basic print audit behavior through labeled quantity updates.

## 9. Consignor / Vendor Management

- Consignor CRUD with richer identity model:
  - business and individual naming
  - pay-to derivation and display formatting
  - contact and address fields
  - booth location and booth-cost formula fields
  - status fields (active/scheduled activation)
- Commission split and card-fee responsibility settings.
- Scheduled rate changes via `consignor_rate_schedules`.
- Detail view with consignor inventory, account status, and upcoming rate changes.
- Vendor credential management (create/update/delete vendor user account via edge function).
- Vendor portal:
  - inventory management (list/single/batch)
  - own sales tracking
  - own payout history and pending earnings
  - editable profile/contact/password
  - storefront settings and per-item visibility controls
  - live sale notifications in dashboard

## 10. Payouts and Finance Workflows

- Pending payout computation by consignor since last payout.
- Deductions and components included in payout math:
  - commission/store share
  - card fee pass-through logic
  - booth rent deductions
  - marketing fee allocations
  - refund effects on effective payout amounts
  - deferred carryover and partial payout handling
- Mark-as-paid flow with notes and partial payout metadata.
- Payout history and date filtering.
- Printable payout report generation.
- Vendor-facing payout transparency view with pending-balance breakdown.

## 11. Customers and CRM Features

- Customer CRUD with notes and marketing opt-in flag.
- Customer searchable list and profile editing.
- Store credit balance management (credit add and checkout application).
- Customer order history drill-down with line-item detail and payment method context.
- Customer assignment at checkout and from historical sale records.
- Marketing audience integration via `accepts_marketing` + valid email.
- Kit subscriber sync hook for customer marketing sync.

## 12. Employee Operations

- Employee account CRUD with PIN hash/salt authentication fields.
- Employee role system (`employee_roles`) with ordering and active flags.
- Timeclock workflows:
  - clock in/out
  - open entry detection
  - manual clock-out by admin
  - time entry editing (clock times, notes, lunch)
- Timecard/admin oversight table and per-employee history.
- Device authorization management modal (duration presets, revoke support).
- Employee schedule management (admin):
  - one-time shifts
  - recurring templates by weekday and effective date
  - week/month calendar views
  - shift editing/removal
- Employee self-schedule view and time-off request submission.
- Time-off request review (approve/deny) and conflict-aware schedule behavior (full/partial-day logic).

## 13. Messaging and Internal Communication

- In-app threaded chat system across admins/vendors/employees.
- System and direct-thread support with role-aware contact resolution.
- Unread counts, message previews, timestamp formatting, mark-read behavior.
- Thread navigation via URL query deep-linking.
- Mobile-friendly list/chat split view behavior.
- Backend RPC helpers for direct-thread creation and admin contact discovery.

## 14. Marketing and Outreach

- Email template builder with block-based editor:
  - text, image, button, divider, spacer blocks
- HTML + text email generation for campaigns.
- Campaign audience modes:
  - opted-in customers with email
  - manual recipient list
- Campaign send history and status tracking (`sent`/`partial`/`failed`).
- Edge-function dispatch for bulk email campaigns.

## 15. Public Storefront Experience

- Home hero area configurable from admin profile (`storefront_home_settings`).
- Category and vendor discovery pages.
- Featured product support and vendor-specific storefront branding.
- Product filtering by text/category/price/vendor and paginated browse.
- Vendor storefront controls respected publicly:
  - show/hide vendor inventory
  - images-only mode
  - per-item listing toggles
- Item detail pages with vendor cross-linking and branding.
- Optional embed mode and browse-page search query support.

## 16. Integrations

### Shopify
- Setup wizard for store, location, webhook secret, and import consignor naming.
- Product import from Shopify into RavenPOS.
- Force quantity sync from Shopify.
- Push quantity changes from RavenPOS to Shopify on sale/edit/refund restock.
- Webhook receiver for Shopify inventory updates.
- Loop-prevention via `last_sync_source` and `last_synced_at`.
- Sync logging table for audit/troubleshooting.

### Stripe
- Stripe Terminal payment intents, reader registration, capture/cancel/detail actions.
- Card-present checkout via terminal SDK in frontend + edge function backend.
- Stripe refund processing edge function.

### Email/Comms
- Receipt, invoice, and refund email delivery edge functions.
- Bulk marketing campaign email sends.

### Kit
- Customer marketing subscriber sync edge function.

## 17. Invoice Features

- Create invoice from cart in POS.
- Recipient type support (customer or vendor).
- Invoice and invoice-item persistence.
- Invoice list management with searchable table.
- Invoice detail modal with line-item totals.
- Paid/unpaid status toggling and paid timestamping.
- Invoice email delivery flow.

## 18. Display and Front-of-House UX

- Dedicated `/display` customer-facing screen.
- Live cart visualization via BroadcastChannel updates.
- Real-time subtotal/tax/discount/store-credit/gift-card/card-fee summary.
- Completed-sale state with success confirmation and payment/change details.

## 19. Desktop Runtime and Hardware Support

- Electron runtime option with hash-router compatibility.
- Native IPC bridge for:
  - sale receipt printing
  - refund receipt printing
  - printer enumeration
  - printer selection persistence
- Thermal print formatting and ESC/POS output handling.
- Printer settings UI in app (Electron-only feature surface).

## 20. Data Model (Core Operational Tables)

Primary tables actively used in runtime logic:
- `users`
- `consignors`
- `consignor_rate_schedules`
- `items`
- `categories`
- `sales`
- `sale_items`
- `refunds`
- `payouts`
- `booth_rent_payments`
- `marketing_fees`
- `marketing_fee_allocations`
- `customers`
- `gift_cards`
- `employees`
- `time_entries`
- `employee_roles`
- `employee_schedules`
- `employee_recurring_schedules`
- `employee_time_off_requests`
- `employee_sessions`
- `employee_pin_attempts`
- `device_authorizations`
- `chat_threads`
- `chat_thread_members`
- `chat_messages`
- `shopify_config`
- `sync_log`
- `email_templates`
- `email_campaign_sends`
- `storefront_home_settings`
- `invoices`
- `invoice_items`

## 21. RPC and Server-Side Function Surface

### RPCs used by app
- `create_gift_card`
- `get_gift_card_by_code`
- `redeem_gift_card`
- `restore_gift_card_balance`
- `adjust_customer_store_credit`
- `get_chat_admin_contacts`
- `create_or_get_direct_thread`

### Supabase edge functions used by app
- `manage-admin`
- `manage-vendor`
- `verify-employee-pin`
- `verify-device-token`
- `stripe-terminal`
- `process-stripe-refund`
- `import-shopify-products`
- `force-sync-from-shopify`
- `push-to-shopify`
- `shopify-webhook`
- `get-shopify-locations`
- `send-receipt-email`
- `send-refund-receipt-email`
- `send-invoice-email`
- `send-gift-card-email`
- `send-bulk-email-campaign`
- `sync-kit-subscriber`

## 22. Quality, Testing, and Operational Notes

- Existing automated tests are currently smoke-level and focused on:
  - cart totals/discount-tax stability
  - Supabase error-to-user-message formatting
- Significant behavior is integration-heavy (Supabase + edge functions), so production confidence depends on end-to-end/manual verification for critical flows.
- Multi-surface architecture means route role boundaries and RLS policies are core to app correctness.

## 23. Practical Orientation for New Contributors

Start here for fast system understanding:
- Routing and role boundaries: `src/App.tsx`
- Auth and user-role state: `src/contexts/AuthContext.tsx`
- Employee PIN/timeclock session model: `src/contexts/EmployeeContext.tsx`
- POS core: `src/pages/POS.tsx` + `src/hooks/useSales.ts` + `src/hooks/useRefunds.ts`
- Inventory and item lifecycle: `src/hooks/useInventory.ts`
- Payout engine: `src/hooks/usePayouts.ts`
- Messaging engine: `src/hooks/useMessaging.ts`
- Public storefront data flow: `src/hooks/usePublicInventory.ts`
- Shopify pipeline: `src/components/integrations/ShopifySync.tsx` + `supabase/functions/*shopify*`
- Printer/electron runtime: `electron/main.cjs`, `electron/printing.cjs`, `src/lib/printReceipt.ts`

