# RavenPOS design system foundation

Status: awaiting review, 2026-11-05
Visual reference: [RavenPOS redesign concept canvas](https://claude.ai/artifact/FYKxDJUb8KkvjpiPXVzKfh)

## Goal

Give the admin, employee and vendor portals one rounded, gentle look in light and dark mode, so that later page work builds on finished parts instead of restyling each screen by hand.

This spec covers the shared layer only: tokens, type, shape, shared components, the app shell and the navigation. Every page inherits the new look, but no page's workflow changes here.

Done means:

- All three portals use the new tokens, shared components and shell in both themes.
- The public storefront looks the same as it does today.
- Every current admin, employee and vendor route is still reachable.
- No database or route changes.

## Scope

**In scope**

- Color, shadow, radius and font tokens
- Shared components in `src/components/ui/`
- One sidebar and one shell for all three portals, plus the top bar and page header
- The admin navigation regroup
- Two mechanical sweeps (all-caps labels, stray hard-coded colors)
- `/preview-components` as the living reference

**Out of scope, each with its own spec later**

| Sub-project | Covers |
|---|---|
| Bug fixes | Consignor CSVs and tax reports count draft and voided payouts; printed vendor statements say "Paid" when voided and don't add up; the balance line shows "+ −$86.00"; editing an employee drops address changes. Small enough to skip a spec |
| Vendor payouts | One cutoff date, batch prepare, discardable drafts, honest draft math, statement fixes |
| Employee payroll | Draft, approve, paid and void lifecycle, timecard locking, missed shifts, single hours calculation, paystub snapshots, employee pay history |
| POS and dashboard | POS layout from the mockup with the checkout flow unchanged, the new dashboard, a home for the analytics charts it drops |

Recommended order: bug fixes, this foundation, vendor payouts, employee payroll, POS and dashboard.

## Approach

**Chosen: retune tokens and restyle the shared components in place.** 133 page and component files already read `--color-*` tokens and no Tailwind palette classes remain, so changing tokens and about ten components reskins nearly everything. Component props stay compatible, so pages don't need edits to pick up the look.

Rejected:

- **A parallel component set migrated page by page.** The app would show two looks for months, and 78 files import `Button` alone.
- **Adopting a library such as shadcn/Radix.** It means rewriting working components, including focus-trapped modals and a virtualized table, to get a look we can reach with tokens.

## Tokens

New values go in the `@theme` block of `src/index.css`, with dark overrides in the existing `:root[data-theme='dark']` block. They are literal values and no longer point at `--dw-*`.

| Token | Light | Dark | Role |
|---|---|---|---|
| `--color-canvas` (new) | `#edf0ed` | `#0f1211` | Page ground in the portals |
| `--color-background`, `--color-card`, `--color-surface-elevated` | `#ffffff` | `#181c1a` | Cards, sidebar, menus |
| `--color-surface` | `#f3f5f3` | `#1f2421` | Fields, table headers, nested panels |
| `--color-surface-hover` | `#eef1ef` | `#232926` | Hover |
| `--color-track` (new) | `#e4e9e5` | `#272e2a` | Segmented control background |
| `--color-border` | `#e3e8e4` | `#29302c` | Hairlines |
| `--color-border-strong`, `--color-input` | `#d2d9d4` | `#363e39` | Control outlines |
| `--color-foreground` | `#17201b` | `#edf1ee` | Primary text |
| `--color-muted` | `#566159` | `#a9b3ad` | Secondary text |
| `--color-muted-foreground` | `#616c65` | `#909b94` | Tertiary text |
| `--color-primary`, `--color-ring` | `#2c6a59` | `#82c8ae` | Accent |
| `--color-primary-foreground` | `#ffffff` | `#0c1914` | Text on accent |
| `--color-primary-soft` (now defined) | `#e0ede7` | `rgb(130 200 174 / 13%)` | Accent tint |
| `--color-success` / `-bg` | `#276b44` / `#e2f0e7` | `#80c99c` / `rgb(128 201 156 / 13%)` | Ready, paid |
| `--color-warning` / `-bg` | `#8a5a0a` / `#f6edd9` | `#e2b55c` / `rgb(226 181 92 / 13%)` | Needs review |
| `--color-danger` / `-bg` | `#b03a2e` / `#f8e7e4` | `#ef8b80` / `rgb(239 139 128 / 13%)` | Refunds, void |
| `--color-info` / `-bg` | `#2f5f8f` / `#e6eef7` | `#8bb5df` / `rgb(139 181 223 / 13%)` | Drafts |
| `--color-success-foreground`, `--color-danger-foreground` | `#ffffff` | `#181c1a` | Text on solid fills |
| `--color-chart-1`, `-2`, `-3` (new) | `#00836a`, `#c5801f`, `#3f73c8` | `#2aa381`, `#bf8526`, `#5f8fe6` | Thin bar segments |

- Hover variants of primary, success, danger and warning use `color-mix` with black in light mode and white in dark mode.
- `--color-primary-hover` and `--color-warning-hover` are defined this way. `--color-warning-hover`, `--color-error` and `--color-bg-subtle` are referenced today but never defined; the last two are replaced at their call sites with `--color-danger` and `--color-surface`.
- All text pairs above were computed at 4.5:1 or better in both themes. `--color-muted-foreground` is darker than the mockup (`#69746d`) because that value failed on the canvas.
- The chart colors passed the dataviz palette validator in both themes.

The accent is Sage. It lives in the four `--color-primary*` values per theme, so changing it is a one-block edit. There is no runtime accent switcher.

**Shadows.** `--shadow-surface` becomes `0 1px 2px rgb(23 32 27 / 5%), 0 6px 20px rgb(23 32 27 / 4%)` in light and `inset 0 1px 0 rgb(255 255 255 / 4%), 0 8px 24px rgb(0 0 0 / 28%)` in dark. Cards have no border in either theme.

**Radius.** `--radius-sm` stays 6px. `--radius-md` becomes 10px, `--radius-lg` 12px, `--radius-xl` 20px, and `--radius-2xl` 24px. This updates the 520 existing `rounded-lg`, `rounded-xl` and `rounded-2xl` uses without editing them.

**Fonts.** Plus Jakarta Sans stays. `--font-mono` becomes JetBrains Mono, added to the Google Fonts link in `index.html`, and is used only for IDs, SKUs, receipt numbers and chart axis labels.

### Keeping the storefront unchanged

The tokens are global, and the public site reads them too. Scoping the new values to a portal wrapper would miss modals, which portal to `<body>`. So the new values stay global, and the storefront keeps its look by pinning the old mapping on `.ravenlia-storefront`: today's `--color-*: var(--dw-*)` lines and today's semantic colors, shadows and radii move into that block, with their dark values under `:root[data-theme='dark'] .ravenlia-storefront`. `New-Rav-design-sys.css` stays as the storefront's source. The public pages don't use modals, so nothing there escapes the pin. `BrowsePage` is the only public page using shared `Button` and `Select`; its two pagination buttons keep their fill through explicit classes.

The customer display (`/display`) and the login screens read the global tokens and take the new look.

## Type

| Role | Size / weight | Use |
|---|---|---|
| Money | 30 / 600, −0.03em | Headline figures, with cents at 62% size in `--color-muted` |
| Title | 26 / 600, −0.025em | Page `h1` |
| Section | 16 / 600 | Card titles |
| Body | 14 / 400 | Default |
| Label | 13, `--color-muted` | Field and stat labels |
| Mono | 12 | IDs, SKUs, receipt numbers |

Labels are sentence case. `.eyebrow` changes to the Label role, without capitals or tracking. All money uses tabular figures.

## Data display rules

These apply to each page as it is reworked. Existing charts stay until then.

1. A page gets at most one thin bar or one line chart, never both.
2. Every other figure is a number with its comparison, such as "+18.2% vs last Thursday, $1,086.40", or a plain line such as "$27.45 to go".
3. No sparklines, tick strips or per-row progress bars.
4. Green and red only mark good and bad changes. A neutral change, such as payroll going up, stays in plain text.
5. Bars use `--color-chart-*` with at most three segments; smaller parts fold into one. The label text stays in text colors.

## Shared components

Props stay compatible unless noted.

| Component | Change |
|---|---|
| `Button` | `primary` becomes the accent through tokens. `secondary` becomes an outline (card fill, `--color-border-strong`). New `soft` (accent tint) and `dangerQuiet` (no fill, danger text, outline). `danger` and `success` stay solid. Sizes keep their current heights |
| `Card` | `default` and `elevated` become borderless card fill with `--shadow-surface`. `outlined` (109 uses) becomes card fill with a hairline and no shadow, so it works both on the canvas and nested in a card. New `inset` uses `--color-surface` with no border or shadow for nested panels |
| `StatCard` | Label, value and one comparison line. `icon`, `highlight` and `trend` are removed; its three consumers are updated |
| `Money` (new) | Formats through `formatCurrency` and mutes the cents. For headline figures only |
| `Badge` | New `dot` prop. `default` loses its border and sits on `--color-surface`. Status always means pill, dot and plain label |
| `Tabs` | Segmented look: `--color-track` background, active tab on card fill with `--color-foreground` text |
| `Input`, `Select` | `--color-surface` fill. Focus is a primary border with a 4px `--color-primary-soft` ring |
| `Modal` | `rounded-2xl`, no border |
| `Table` | Standalone tables become a borderless card with a `--color-surface` header row and hairline rows. New `flat` prop drops the card for tables already inside one |
| `SplitBar` (new) | 8px bar with 2px gaps and rounded ends. Takes up to three `{ label, value, tone }` parts, renders a legend with swatches, and exposes the figures as `role="img"` text |
| `Header` | Loses its bottom border; title takes the Title role |
| `EmptyState`, `DetailCard`, `SectionHeader` | Inherit tokens, no change |

## App shell

**`PortalShell` (new)** holds the canvas background, sidebar, top bar, content area and mobile nav. `AdminLayout`, `EmployeeLayout` and `VendorLayout` become thin wrappers that pass navigation and portal details. The unused `Shell.tsx` is deleted.

**`PortalSidebar` (new)** replaces `Sidebar.tsx`, `EmployeeSidebar.tsx` and the aside inside `VendorLayout.tsx`.

- It floats on the canvas: fixed with a 12px inset, `rounded-2xl`, 248px wide or 76px collapsed. Page content is offset 272px or 100px to match.
- From top to bottom: brand, primary action, navigation, footer. Admin and employee get an "Open register" button; vendors get none.
- Active item: `--color-surface`, a hairline and an accent icon. No solid fills. Active children get a small accent dot.
- Collapsed groups keep the existing hover flyout.
- The footer holds the collapse control and a profile card that opens a menu: Profile & settings, Printer settings (Electron only), What's new, Switch portal (when more than one is available), Sign out.
- The employee footer keeps `ClockStatusWidget` and the sign-out confirmation.
- A shared `useSidebarCollapsed(storageKey)` hook replaces the duplicated state and the `sidebar-toggle` window event. Existing localStorage keys stay.
- On `/admin/pos` and `/employee/pos` the sidebar shows collapsed without changing the saved preference.

**`PortalTopBar`** sits directly on the canvas with no border or shadow, still sticky, with a canvas-tinted blur. On the left, a breadcrumb built from the nav config (`Money / Payroll`) replaces the role label and page name. On the right are the "Go to…" pill and round theme and notification buttons, all working as they do now.

**Mobile.** The bottom nav and More sheet keep their structure and take the new tokens. The More sheet picks up the regrouped nav from the shared config.

### Differences from the mockups

- Page titles stay in `Header` below the top bar, because 36 pages already render them there. The mockups put the title in the top bar row.
- The search pill keeps its real behavior and label, "Go to…", because global search doesn't exist.
- No clock chip in the top bar. Clock status exists only in the employee portal, and it stays in the sidebar footer there.
- Buttons keep their 36px and 44px heights rather than the mockups' 32px and 40px, to protect touch targets on the register.

## Admin navigation

Same routes in a new grouping. Only the labels and groups change.

| Entry | Items |
|---|---|
| Open register (button) | Point of sale |
| Dashboard | |
| Sales history | |
| Inventory | Products, Add products, Scan in / out, Import CSV, Labels |
| People | Consignors, Customers, Dealers, Purchase from dealer |
| Money | Vendor payouts, Payroll, Invoices, Till floats, Tax reports, Categories & tax, Marketing fees |
| Team | Timecards, Schedule, Roles |
| Store | Messages, Email campaigns, Integrations, Shopify setup |
| Sidebar footer | Profile & settings |

In the employee nav, "Relationships" becomes "People". The vendor nav keeps its items and labels.

## Dark mode

Both themes ship together and neither is a follow-up. The existing mechanism stays: `data-theme` on `<html>`, saved in localStorage, defaulting to the system setting, toggled from the top bar.

- `setTheme` also updates the `theme-color` meta tag to the current canvas color.
- Nothing uses Tailwind `dark:` variants, because they follow the OS rather than `data-theme`.
- Print output, receipts, labels and emails keep their literal colors in both themes.

## Sweeps

1. **All-caps labels.** Replace the 87 `uppercase tracking-*` class pairs with `.eyebrow` or plain label text.
2. **Stray colors.** Replace `#10b981` in the analytics charts with `--color-chart-1`, and remove the old clay glow from `AuthShell`.

Other small-text cleanup (`text-[10px]`, `text-[11px]`) happens as each page is reworked, because it can shift tight layouts.

## Rollout

Work on a branch. Each step is shippable by itself:

1. Tokens, storefront pin, radii, fonts, `theme-color`.
2. Shared components, with `/preview-components` showing every state in both themes.
3. `PortalShell`, `PortalSidebar`, top bar and the nav regroup.
4. Sweeps.

## Verification

- `npm run build`, `npm run lint` and `npm test` pass at each step.
- New unit tests: every route in today's admin, employee and vendor nav is still in the config, breadcrumb text comes out right, and `Money` splits cents correctly.
- Visual pass in both themes against the local clone: `/admin`, `/admin/pos`, `/admin/employees/payroll`, `/admin/payouts`, `/vendor`, `/employee/pos`, `/display` and `/login`.
- `/` and `/shop` compared against screenshots from before the change.
- Print a receipt, a label and a payout statement to confirm they're unchanged.
- Electron at its 1024×768 minimum and 1400×900 default, with sidebar expanded and collapsed.
- Mobile width in the admin and vendor portals.

## Risks

| Risk | Handling |
|---|---|
| Storefront drifts because tokens are global | Pin on `.ravenlia-storefront`, screenshot comparison |
| POS height depends on the shell around it (`min-h-0`, `overflow-hidden`) | `/admin/pos` is checked after step 3 at both Electron sizes |
| Larger radii look wrong on small elements | Reviewed on `/preview-components`; individual cases get `rounded-md` |
| `outlined` cards nested in cards look busy | Hairline treatment works in both places; pages move to `inset` during their own rework |
| Floating sidebar leaves less width at 1024px | Content keeps its existing responsive behavior, and the collapsed sidebar is available |

## Decisions to confirm in review

1. **Accent:** Sage, as in the mockups. Clay and Ink remain a one-block swap.
2. **Roadmap order:** the bug fixes ship before this foundation.
3. **Dropped analytics:** sales by category, busiest times and customer growth stay on the dashboard until the POS and dashboard spec gives them a new home.
