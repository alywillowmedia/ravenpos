# Raven POS v2 visual QA

## Scope

Visual and semantic QA was run against the local Vite application on July 13, 2026. Public and unauthenticated screens were exercised live. Authenticated admin, employee and vendor route families were reviewed through their shared production shells, route registry, shared primitives and source-level route inventory; live data and financial actions were not performed without store credentials.

## Captures

- `ravenpos-components-light.png`: operational tokens, analytical cards and detail patterns in light mode
- `ravenpos-components.png`: the same component system in dark mode
- `ravenpos-login-desktop.png`: account login in dark mode
- `ravenpos-login-mobile.png`: responsive login review capture
- `ravenpos-employee-device.png`: unauthorized PIN-device recovery state
- `ravenpos-customer-display.png`: idle customer-display state with readable brand treatment
- `ravenpos-storefront.png`: public Ravenlia storefront and primary navigation
- `ravenpos-storefront-mobile.png`: responsive storefront review capture
- `ravenpos-components-narrow.png`: narrow content simulator for adaptive detail rows

Captures are stored in:

`/Users/jonah/.codex/visualizations/2026/07/13/019f59ea-9d11-7b32-88b8-525721dbe906/`

## Verified states

### Account and authorization

- Login has one main landmark, labeled email/password fields and a clear portal boundary.
- Empty submit produces an announced `alert` with recovery copy.
- Employee device authorization state presents two unambiguous recovery routes and the correct setup path.
- Logo remains visible in both themes because brand imagery uses a neutral white panel.
- Touch targets and inputs are at least 44 px in the entry flows.

### Customer display

- Idle state exposes a main landmark, visible logo, welcome copy and a polite waiting status.
- Large fixed minimum widths were removed from completion state.
- Active-order layout uses bounded cart and summary columns with mobile stacking.
- Total typography now scales down safely and allows long currency values to wrap.
- Register channel name, payload and terminal-settings query remain unchanged.

### Public storefront

- Navigation, search, hero actions, content articles, visit information and footer retain semantic structure.
- Muted text, borders and input boundaries were strengthened without changing the editorial direction.
- Existing routes, phone, maps and email-list links remain present.

### Shared operational system

- Light/dark surfaces remain distinct without excessive cards or shadows.
- Primary clay, success, warning and danger roles remain semantically separated.
- Component preview has no browser console warnings/errors.
- Narrow detail rows retain both labels and values rather than removing columns.

## Automated semantic/accessibility evidence

- Modal focus containment/restoration and inert background behavior are implemented centrally.
- Tabs expose tablist/tab state and keyboard movement centrally.
- Tables expose a caption-equivalent name, sort state and keyboard row activation centrally.
- Inputs associate generated field, hint and error IDs centrally.
- Reduced-motion styles cover animation, transition and smooth scrolling.
- Page zoom is no longer disabled by viewport metadata.

## Remaining manual release gates

- Keyboard-only pass with real authenticated datasets across every route
- 200% zoom and exact 320 CSS px verification in the supported Windows/Electron environment
- POS scan/cart/tender/refund with a physical keyboard-wedge scanner and Stripe reader
- Customer display with active long cart, each tender type and monitor disconnect/reconnect
- Receipt, refund, till, Avery and DYMO physical output
- Offline cash sale across disconnect, restart and later sync
- Windows installed and portable package smoke tests

These are preserved in `REGRESSION_CHECKLIST.md` and should be completed during the user's final review/release pass.
