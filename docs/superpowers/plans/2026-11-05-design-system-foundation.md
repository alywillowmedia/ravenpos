# Design System Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the admin, employee and vendor portals one rounded, gentle look in light and dark mode, through shared tokens, components and one app shell.

**Architecture:** Retune the global `--color-*` tokens and restyle the components in `src/components/ui/` in place, so all 133 token-reading files pick up the look without edits. The public storefront pins the old values on `.ravenlia-storefront`. Three separate sidebars collapse into `PortalShell` and `PortalSidebar`, driven by the nav config.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4 (`@theme`), Vitest (node environment), lucide-react, Electron.

**Spec:** `docs/superpowers/specs/2026-11-05-design-system-foundation-design.md`. Read it first. Token values, type sizes, component behavior and the nav table live there and are not repeated here.

## Global Constraints

- No database changes and no route changes.
- Work on branch `design-system-foundation`, never `main`.
- Never add `Co-Authored-By` or Claude attribution to commits. It blocks Vercel builds.
- Every change must work in both themes. Never use Tailwind `dark:` variants; they follow the OS, not `data-theme`.
- The public storefront (`/`, `/shop` and everything under `PublicLayout`) must look the same as before.
- Component props stay compatible, except `StatCard` losing `icon`, `highlight` and `trend`.
- Colors come from tokens only. Print, receipt and email HTML keep their literal colors.
- Vitest only runs `tests/**/*.test.ts` in node, so testable logic goes in `.ts` files and there are no component render tests. Visual tasks are verified with `npx tsc -b`, `npm run build` and a browser check.
- Baseline before Task 1: `npx tsc -b` is clean. `npm test` has 1 failure (`portalNavigation.test.ts`, fixed in Task 6). `npm run lint` has 2 errors in `supabase/functions/send-employee-weekly-schedules/index.ts`, which stay out of scope, and 14 warnings. Add no new errors or warnings.

## Review Focus

1. **Nested routes.** On `/admin/employees/payroll/123` or `/admin/dealers/purchases`, a parent item (`/admin/employees`, `/admin/dealers`) also matches. Only the deepest item should be active, and the breadcrumb should name it. Pinned in Task 6.
2. **Leaving the register.** Someone with an expanded sidebar opens the POS, which forces the rail. The saved preference must survive, and the sidebar must re-expand on the next page. Pinned by `resolveSidebarState` in Task 6 and checked in the browser in Task 7.
3. **Awkward money values.** Refunds (negative), zero, thousands, and `NaN` while data loads must never render `$NaN`. Pinned in Task 2.
4. **Empty breakdowns.** A period with no payroll gives all-zero `SplitBar` parts. It must show an empty track with no `NaN` widths. Pinned in Task 2.
5. **Storefront in dark mode.** The pin has to carry dark values too, or public pages pick up the new dark palette. Pinned in Task 1.

---

### Task 1: Tokens, storefront pin and theme color

**Files:**
- Modify: `src/index.css`, `index.html`, `src/lib/theme.ts`
- Test: `tests/smoke/designTokens.test.ts`

**Interfaces:**
- Produces: every token in the spec's table, including new `--color-canvas`, `--color-track`, `--color-primary-soft`, `--color-chart-1..3`; `themeColorFor(theme: ThemeMode): string` in `src/lib/theme.ts`.

- [ ] **Step 1: Create the branch and capture the storefront baseline**

```bash
git checkout -b design-system-foundation
```

Start the `ravenpos-local-clone` preview (Docker Desktop must be running). Screenshot `/` and `/shop` at 1440px wide in light and dark, and keep the four images in the scratchpad for Task 10.

- [ ] **Step 2: Write the failing test**

`tests/smoke/designTokens.test.ts` reads `src/index.css` with `readFileSync`. Extract a block with `new RegExp(escapedSelector + '\\s*\\{([\\s\\S]*?)\\n\\}')` and a token with `--name:\\s*([^;]+);`. Tests:

- `defines the light palette`: for each row of the spec's token table, expect the `@theme` value to equal the Light column.
- `defines the dark palette`: the same against `:root[data-theme='dark']` and the Dark column.
- `keeps text at 4.5:1`: compute WCAG contrast for `foreground`, `muted` and `muted-foreground` on `card`, `surface` and `canvas`, `primary-foreground` on `primary`, and each status color on its `-bg`, in both themes. Blend `rgb(... / 13%)` backgrounds over `card` first. Expect every ratio `>= 4.5`.
- `pins the storefront in both themes`: the `.ravenlia-storefront` block contains `--color-background: var(--dw-bg)`, `--color-primary: var(--dw-ink)`, `--radius-lg: var(--dw-radius)` and `--color-success: #4a6b3a`. The `:root[data-theme='dark'] .ravenlia-storefront` block contains `--color-success: #82a86a`.
- `maps the theme to the canvas color`: `themeColorFor('light')` is `#edf0ed` and `themeColorFor('dark')` is `#0f1211`.

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run tests/smoke/designTokens.test.ts`
Expected: FAIL, with `themeColorFor` undefined and token values not matching.

- [ ] **Step 4: Implement the tokens**

In `src/index.css`:

- Replace the color values in `@theme` and in `:root[data-theme='dark']` with the spec's literal values. Hover tokens use `color-mix(in srgb, <token> 88%, black)` in light and `white` in dark.
- Set `--font-mono` to `'JetBrains Mono', ui-monospace, monospace`, the radii and `--shadow-surface` per the spec.
- Move today's values into `.ravenlia-storefront`: the `--color-*: var(--dw-*)` lines, semantic colors, shadows and radii. Add `--color-ring: var(--dw-ink)` and `--color-primary-soft: color-mix(in srgb, var(--dw-ink) 12%, transparent)`.
- Add `:root[data-theme='dark'] .ravenlia-storefront` with today's dark semantic colors and shadows.

In `index.html`, add `&family=JetBrains+Mono:wght@400;500` to the Google Fonts link.

In `src/lib/theme.ts`, add `themeColorFor` and have `setTheme` set `content` on `meta[name="theme-color"]` when that tag exists.

- [ ] **Step 5: Run the tests and build**

Run: `npm test`, then `npx tsc -b`, then `npm run build`
Expected: `designTokens.test.ts` passes, the only failure is the known `portalNavigation.test.ts` one, and the build succeeds.

- [ ] **Step 6: Compare the storefront**

Reload `/` and `/shop` in both themes and compare against the Step 1 screenshots.
Expected: no visible difference.

- [ ] **Step 7: Commit**

```bash
git add docs/superpowers src/index.css index.html src/lib/theme.ts tests/smoke/designTokens.test.ts
git commit -m "Add design system tokens and pin the storefront theme"
```

---

### Task 2: Money, SplitBar and StatCard

**Files:**
- Create: `src/lib/money.ts`, `src/lib/splitBar.ts`, `src/components/ui/Money.tsx`, `src/components/ui/SplitBar.tsx`
- Modify: `src/components/ui/StatCard.tsx`, `src/pages/Dashboard.tsx`, `src/pages/PreviewComponents.tsx`
- Test: `tests/smoke/money.test.ts`, `tests/smoke/splitBar.test.ts`

**Interfaces:**
- Consumes: `formatCurrency` from `src/lib/utils.ts`; `--color-chart-1..3`, `--color-track` from Task 1.
- Produces:
  - `splitMoney(amount: number): { whole: string; cents: string }`
  - `Money({ amount, className }: { amount: number; className?: string })`
  - `SplitBarPart = { label: string; value: number; display: string; tone: 1 | 2 | 3 }`
  - `toSplitBarSegments(parts: SplitBarPart[]): Array<SplitBarPart & { share: number }>`
  - `SplitBar({ parts, label, className })`, where `parts` is a tuple of one to three `SplitBarPart` and `label` names the whole for the `aria-label`
  - `StatCard` props: `label`, `value`, `subtext?`, `className?`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/smoke/money.test.ts
expect(splitMoney(1284.5)).toEqual({ whole: '$1,284', cents: '.50' });
expect(splitMoney(0)).toEqual({ whole: '$0', cents: '.00' });
expect(splitMoney(-22)).toEqual({ whole: '-$22', cents: '.00' });
expect(splitMoney(Number.NaN)).toEqual({ whole: '$0', cents: '.00' });
```

```ts
// tests/smoke/splitBar.test.ts
const part = (value: number, tone: 1 | 2 | 3 = 1) => ({ label: 'x', value, display: '', tone });
expect(toSplitBarSegments([part(75), part(25, 2)]).map((s) => s.share)).toEqual([75, 25]);
expect(toSplitBarSegments([part(0), part(0, 2)])).toEqual([]);
expect(toSplitBarSegments([part(50), part(-10, 2)]).map((s) => s.share)).toEqual([100]);
expect(toSplitBarSegments([part(Number.NaN), part(10, 2)]).map((s) => s.share)).toEqual([100]);
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/smoke/money.test.ts tests/smoke/splitBar.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the two `.ts` helpers**

`splitMoney` splits `formatCurrency(amount)` at the last `.` and treats non-finite input as 0. `toSplitBarSegments` drops parts that aren't finite and positive, then computes `share` as a percentage of the remaining total.

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run tests/smoke/money.test.ts tests/smoke/splitBar.test.ts`
Expected: PASS

- [ ] **Step 5: Build `Money`, `SplitBar` and the new `StatCard`**

- `Money` renders `whole` then cents at `0.62em` in `--color-muted`, weight 500.
- `SplitBar` renders a legend row (10px swatch, label, `display` in semibold foreground text) above an 8px bar with 2px gaps, using each segment's `share` as `flex-grow` and `--color-chart-<tone>` as fill. First and last segments get fully rounded outer ends. With no segments, render one `--color-track` bar. The bar is `role="img"` with an `aria-label` of `label` plus each part's label and `display`.
- `StatCard` is a `Card` with the label (13px, `--color-muted`), the value (`text-[30px] font-semibold tracking-[-0.03em] leading-[1.15]`) and `subtext` (12.5px, `--color-muted`). Remove `icon`, `highlight` and `trend`.
- Remove those props at the call sites in `Dashboard.tsx` and `PreviewComponents.tsx`, and delete icon helpers that become unused. `Sales.tsx` passes none of them.

- [ ] **Step 6: Verify**

Run: `npx tsc -b`, then `npm run lint`
Expected: clean types, no new lint errors or warnings.

- [ ] **Step 7: Commit**

```bash
git add src tests/smoke/money.test.ts tests/smoke/splitBar.test.ts
git commit -m "Add Money and SplitBar and simplify StatCard"
```

---

### Task 3: Button, Card, Badge and Header

**Files:**
- Modify: `src/components/ui/Button.tsx`, `src/components/ui/Card.tsx`, `src/components/ui/Badge.tsx`, `src/components/layout/Header.tsx`, `src/pages/public/BrowsePage.tsx:436-476`

**Interfaces:**
- Produces: `Button` variants `soft` and `dangerQuiet`; `Card` variant `inset`; `Badge` prop `dot?: boolean`.

- [ ] **Step 1: Restyle `Button`**

- `secondary`: `bg-[var(--color-card)] text-[var(--color-foreground)] border border-[var(--color-border-strong)] hover:bg-[var(--color-surface-hover)]`.
- `ghost`: text becomes `--color-muted`, foreground on hover.
- New `soft`: `bg-[var(--color-primary-soft)] text-[var(--color-primary)]`.
- New `dangerQuiet`: transparent fill, `--color-danger` text, `--color-border-strong` border, `--color-danger-bg` on hover.
- Sizes and `primary`, `danger`, `success` stay as they are.

- [ ] **Step 2: Keep the storefront buttons unchanged**

On the two pagination `Button`s in `BrowsePage.tsx`, add `className="!bg-[var(--color-surface)] !border-transparent"`.

- [ ] **Step 3: Restyle `Card`, `Badge` and `Header`**

- `Card`: `default` and `elevated` become `bg-[var(--color-card)] shadow-[var(--shadow-surface)]`. `outlined` becomes `bg-[var(--color-card)] border border-[var(--color-border)]`. New `inset` is `bg-[var(--color-surface)]`. `CardTitle` becomes `text-base font-semibold tracking-[-0.01em]`.
- `Badge`: `default` becomes `bg-[var(--color-surface)] text-[var(--color-muted)]` with no border. `md` height is 26px. `dot` renders an 8px `bg-current` circle before the children.
- `Header`: remove `pb-5 border-b` and its border color, keep `mb-5`. The title becomes `text-[26px] font-semibold tracking-[-0.025em] leading-tight`.

- [ ] **Step 4: Verify**

Run: `npx tsc -b`, then `npm run build`
Expected: both succeed.

Open `/admin`, `/admin/sales` and `/shop` in both themes.
Expected: cards are borderless on the portal pages, and the `/shop` pagination matches the Task 1 baseline.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "Restyle Button, Card, Badge and Header"
```

---

### Task 4: Form controls, Tabs, Modal and Table

**Files:**
- Modify: `src/components/ui/Input.tsx:127-138,290-301`, `src/components/ui/Select.tsx`, `src/components/ui/Tabs.tsx`, `src/components/ui/Modal.tsx`, `src/components/ui/Table.tsx:227,241`, plus `Table` call sites that sit inside a `Card`

**Interfaces:**
- Produces: `TableProps.flat?: boolean`.

- [ ] **Step 1: Restyle `Input`, `Textarea` and `Select`**

Replace the focus classes with `focus:outline-none focus:border-[var(--color-primary)] focus:ring-4 focus:ring-[var(--color-primary-soft)]`. Error states keep danger: `border-[var(--color-danger)] focus:ring-[var(--color-danger-bg)]`.

- [ ] **Step 2: Restyle `Tabs` and `Modal`**

- `Tabs`: the container becomes `rounded-[14px] bg-[var(--color-track)] p-1` with no border. The active tab becomes `bg-[var(--color-card)] font-semibold text-[var(--color-foreground)] shadow-[var(--shadow-surface)]`.
- `Modal`: `rounded-xl` becomes `rounded-2xl`.

- [ ] **Step 3: Restyle `Table` and add `flat`**

Both wrappers (lines 227 and 241) become `rounded-xl bg-[var(--color-card)] shadow-[var(--shadow-surface)] overflow-hidden`. When `flat` is true, they drop the radius, fill and shadow.

- [ ] **Step 4: Pass `flat` where a `Table` is already in a card**

Run `grep -rn "<Table" src --include='*.tsx'` and check each of the 14 uses. Add `flat` wherever the nearest surface is a `Card`.

- [ ] **Step 5: Verify**

Run: `npx tsc -b`, then `npm run build`
Expected: both succeed.

Open `/admin/consignors`, `/admin/inventory` and `/admin/customers` in both themes, and open one modal.
Expected: no table has a card inside a card, and focus rings show on inputs.

- [ ] **Step 6: Commit**

```bash
git add src
git commit -m "Restyle form controls, Tabs, Modal and Table"
```

---

### Task 5: Living reference page

**Files:**
- Modify: `src/pages/PreviewComponents.tsx`

**Interfaces:**
- Consumes: everything from Tasks 2 to 4.

- [ ] **Step 1: Show every state**

Add sections for all `Button` variants and sizes, all `Card` variants including `inset` nested in `default`, `Badge` with `dot` in each tone, `Tabs`, `Input` (default, error, disabled), `Select`, `Table` standalone and `flat`, a `Modal` trigger, `Money` (positive, negative, zero), `SplitBar` (three parts, and all zeros) and `StatCard`.

- [ ] **Step 2: Review in both themes**

Open `/preview-components` and switch themes with its toggle.
Expected: all text is readable and nothing looks clipped. Where the 12px radius looks wrong on a small element in the app, change that element to `rounded-md`.

- [ ] **Step 3: Commit**

```bash
git add src
git commit -m "Show every component state on the preview page"
```

---

### Task 6: Navigation regroup and route helpers

**Files:**
- Modify: `src/components/layout/portalNavigation.ts`
- Test: `tests/smoke/portalNavigation.test.ts`

**Interfaces:**
- Produces, all in `portalNavigation.ts`:
  - `PortalNavItem.placement?: 'footer'`
  - `getActiveHref(pathname: string, entries: PortalNavEntry[]): string | null`
  - `getBreadcrumb(pathname: string, entries: PortalNavEntry[]): string[]`
  - `isRegisterRoute(pathname: string): boolean`
  - `resolveSidebarState(savedCollapsed: boolean, pathname: string): { isCollapsed: boolean; canToggle: boolean }`

- [ ] **Step 1: Update the tests**

In `tests/smoke/portalNavigation.test.ts`:

- Replace the "Relationships" test: `employeeNavigation` has a group named `People` with `/employee/consignors`, `/employee/customers`, `/employee/dealers` and `/employee/dealers/purchases`.
- Add `keeps every admin destination`: the flattened admin hrefs, sorted, equal the 27 hrefs in today's `adminNavigation`, copied into the test.
- Add these assertions:

```ts
expect(adminNavigation.map((e) => e.name)).toEqual(['Dashboard', 'Point of Sale', 'Sales history', 'Inventory', 'People', 'Money', 'Team', 'Store', 'Profile & settings']);
expect(getActiveHref('/admin/employees/payroll/123', adminNavigation)).toBe('/admin/employees/payroll');
expect(getActiveHref('/admin/dealers/purchases', adminNavigation)).toBe('/admin/dealers/purchases');
expect(getActiveHref('/admin', adminNavigation)).toBe('/admin');
expect(getActiveHref('/somewhere', adminNavigation)).toBeNull();
expect(getBreadcrumb('/admin/employees/payroll/123', adminNavigation)).toEqual(['Money', 'Payroll']);
expect(getBreadcrumb('/admin/payouts/vendor/abc', adminNavigation)).toEqual(['Money', 'Vendor payouts']);
expect(getBreadcrumb('/admin', adminNavigation)).toEqual(['Dashboard']);
expect(getBreadcrumb('/vendor/payouts', vendorNavigation)).toEqual(['My payouts']);
expect(getBreadcrumb('/somewhere', adminNavigation)).toEqual([]);
expect(isRegisterRoute('/employee/pos')).toBe(true);
expect(isRegisterRoute('/admin/sales')).toBe(false);
expect(resolveSidebarState(false, '/admin/pos')).toEqual({ isCollapsed: true, canToggle: false });
expect(resolveSidebarState(false, '/admin/sales')).toEqual({ isCollapsed: false, canToggle: true });
expect(resolveSidebarState(true, '/admin/sales')).toEqual({ isCollapsed: true, canToggle: true });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/smoke/portalNavigation.test.ts`
Expected: FAIL, helpers undefined and groups not matching.

- [ ] **Step 3: Regroup the nav and add the helpers**

- `adminNavigation` follows the spec's table. Keep `/admin/pos` as an entry with `emphasis: 'primary'`, placed second. Rename `Sales` to `Sales history` and `Payouts` to `Vendor payouts`.
- The profile entries in all three navs get `placement: 'footer'`.
- Rename the employee `Relationships` group to `People`.
- `getActiveHref` flattens the entries and returns the longest href where `pathIsActive` is true. `getBreadcrumb` uses it and prefixes the group name for grouped items.

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: all tests pass, including the previously failing one.

- [ ] **Step 5: Commit**

```bash
git add src tests/smoke/portalNavigation.test.ts
git commit -m "Regroup navigation and add route helpers"
```

---

### Task 7: PortalShell and PortalSidebar

**Files:**
- Create: `src/components/layout/PortalShell.tsx`, `src/components/layout/PortalSidebar.tsx`, `src/hooks/useSidebarCollapsed.ts`
- Modify: `src/components/layout/AdminLayout.tsx`, `src/components/layout/EmployeeLayout.tsx`, `src/components/layout/VendorLayout.tsx`
- Delete: `src/components/layout/Sidebar.tsx`, `src/components/layout/EmployeeSidebar.tsx`, `src/components/layout/Shell.tsx`

**Interfaces:**
- Consumes: `getActiveHref`, `resolveSidebarState` from Task 6; `--color-canvas` from Task 1.
- Produces:

```ts
export interface ProfileMenuAction {
    label: string;
    icon: LucideIcon;
    onSelect: () => void;
    tone?: 'danger';
}

export interface PortalShellProps {
    portalBasePath: '/admin' | '/employee' | '/vendor';
    navigation: PortalNavEntry[];
    collapseStorageKey: 'sidebar-collapsed' | 'sidebar-collapsed-employee' | 'sidebar-collapsed-vendor';
    profile: { name: string; roleLabel: string; avatarUrl: string | null };
    menuActions: ProfileMenuAction[];
    footerSlot?: ReactNode;
    messaging: ReturnType<typeof useMessaging>;
    children: ReactNode;
}

function useSidebarCollapsed(storageKey: string): { isCollapsed: boolean; canToggle: boolean; toggle: () => void };
```

- [ ] **Step 1: Add the hook**

`useSidebarCollapsed` keeps the saved value in state and localStorage, reads `useLocation().pathname`, and returns `resolveSidebarState(saved, pathname)` plus `toggle`. `toggle` changes only the saved value, so forcing the rail on the register never overwrites it.

- [ ] **Step 2: Build `PortalSidebar`**

Port group expansion, flyouts and initials from `Sidebar.tsx`, then apply the spec:

- Container: `fixed left-3 top-3 bottom-3 z-40 flex flex-col rounded-2xl bg-[var(--color-card)] shadow-[var(--shadow-surface)]`, `w-[248px]` or `w-[76px]`. The flyout moves to `left-[100px]`.
- An `emphasis: 'primary'` entry renders as a full-width `Button` labeled "Open register", or an icon link in the rail. Vendors have none.
- Entries with `placement: 'footer'` leave the list and become the first item of the profile menu.
- Active state comes from `getActiveHref`. Active item: `bg-[var(--color-surface)] border border-[var(--color-border)] font-semibold text-[var(--color-foreground)]`, with the icon in `--color-primary`. Active child: the same fill plus a 6px `--color-primary` dot.
- Footer: `footerSlot`, the collapse control (hidden when `canToggle` is false), and a profile card that toggles a menu listing the footer nav entries, then `menuActions`. The menu closes on outside click and Escape.

- [ ] **Step 3: Build `PortalShell`**

It calls `useSidebarCollapsed`, renders `bg-[var(--color-canvas)]`, `PortalSidebar` when not mobile, and `MobileBottomNav` when mobile, with its variant derived from `portalBasePath`. Content is offset `lg:pl-[272px]` or `lg:pl-[100px]`, or `mobile-content-padding` on mobile. It renders `PortalTopBar` and then `children` inside the existing `px-4 py-5 sm:px-6 lg:px-7` wrapper.

- [ ] **Step 4: Move the layouts onto `PortalShell`**

- `AdminLayout`: owns `ChangelogModal` and `PrinterSettings`. `menuActions` are Printer settings (Electron only), What's new, and Sign out with `tone: 'danger'`.
- `VendorLayout`: `menuActions` are Switch portal (when `portalChoices.length > 1`) and Sign out.
- `EmployeeLayout`: move the avatar loading effect and the sign-out confirmation `Modal` here from `EmployeeSidebar`, call them before the early returns, and pass `ClockStatusWidget` as `footerSlot`.
- Add Switch portal to `AdminLayout` with the same `portalChoices.length > 1` rule.
- Keep `<Outlet key={location.pathname} context={{ messaging }} />` as `children`.

- [ ] **Step 5: Delete the old sidebars**

Delete the three files, then run `grep -rn "EmployeeSidebar\|layout/Sidebar\|layout/Shell\|sidebar-toggle" src`.
Expected: no matches.

- [ ] **Step 6: Verify**

Run: `npx tsc -b`, `npm run lint`, `npm test`, then `npm run build`
Expected: all succeed with no new lint problems.

In a browser, in both themes:

- `/admin`: expand, collapse, reload (state persists), open a group, use the flyout in the rail, open the profile menu.
- Expanded sidebar, open `/admin/pos`: the rail shows with no collapse control. Go to `/admin/sales`: it expands again.
- `/employee/pos`: clock widget and sign-out confirmation still work. `/vendor`: no register button.
- `/admin/pos` at 1024×768 and 1400×900: the cart and payment panels fit as before.

- [ ] **Step 7: Commit**

```bash
git add -A src
git commit -m "Replace portal sidebars with one shared shell"
```

---

### Task 8: Top bar

**Files:**
- Modify: `src/components/layout/PortalTopBar.tsx`

**Interfaces:**
- Consumes: `getBreadcrumb` from Task 6.

- [ ] **Step 1: Replace the left side with a breadcrumb**

Render `getBreadcrumb(location.pathname, navigationEntries)` in `<nav aria-label="Breadcrumb">` at 13px, joined with ` / `. The last part is `font-medium text-[var(--color-foreground)]`, the rest `--color-muted`. Fall back to "Raven POS" when it's empty. Remove the role label and `currentPage`. Keep `navigation` for the "Go to" list, and add the unflattened entries for the breadcrumb.

- [ ] **Step 2: Restyle the bar and buttons**

- Header: keep `sticky top-0 z-30 h-16`, use `bg-[color-mix(in_srgb,var(--color-canvas)_85%,transparent)] backdrop-blur`, and drop the border and shadow.
- "Go to…" pill: `rounded-full bg-[var(--color-card)] shadow-[var(--shadow-surface)]`, no border.
- Theme, notification and mobile search buttons: `rounded-full bg-[var(--color-card)] shadow-[var(--shadow-surface)]`, no border, same 40px size.

- [ ] **Step 3: Verify**

Run: `npx tsc -b`, then `npm run build`
Expected: both succeed.

In a browser: `/admin/employees/payroll` shows `Money / Payroll`, `/vendor/payouts` shows `My payouts`, the theme toggle persists after reload, ⌘K opens "Go to", and the unread badge and notification panel still work.

- [ ] **Step 4: Commit**

```bash
git add src
git commit -m "Restyle the top bar with a breadcrumb"
```

---

### Task 9: Sweeps

**Files:**
- Modify: `src/index.css`, `src/components/layout/AuthShell.tsx`, `src/components/analytics/CustomerGrowthChart.tsx`, `src/components/analytics/BusyTimesCard.tsx`, and the 30 files containing `uppercase tracking-`

**Interfaces:**
- Consumes: `--color-chart-1` from Task 1.

- [ ] **Step 1: Change `.eyebrow` and pin the old rule**

`.eyebrow` becomes `font-size: 13px; font-weight: 500; line-height: 1.4; color: var(--color-muted);` with no transform or tracking. Add `.ravenlia-storefront .eyebrow` carrying the old rules (uppercase, `letter-spacing: 0.14em`, `font-size: 0.6875rem`, weight 600).

- [ ] **Step 2: Remove the all-caps classes**

In every `.tsx` file, delete `uppercase` and its `tracking-*` class wherever they appear as a pair. Leave other classes on the element.

- [ ] **Step 3: Replace stray colors and undefined tokens**

- Replace `#10b981` with `var(--color-chart-1)` in the two analytics files.
- Remove the `rgba(138,43,34,0.12)` glow element from `AuthShell.tsx`.
- Replace `var(--color-error)` with `var(--color-danger)`, and `var(--color-bg-subtle)` with `var(--color-surface)`.

- [ ] **Step 4: Verify**

Run:

```bash
grep -rnE "uppercase tracking-|#10b981|--color-error|--color-bg-subtle|138,43,34" src --include='*.tsx'
```

Expected: no matches.

Run: `npx tsc -b`, then `npm run build`
Expected: both succeed.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "Remove all-caps labels and stray colors"
```

---

### Task 10: Full verification

**Files:**
- Modify: only what the checks below find

- [ ] **Step 1: Run the automated checks**

Run: `npx tsc -b`, `npm run lint`, `npm test`, then `npm run build`
Expected: all pass, and lint shows only the 2 baseline errors.

- [ ] **Step 2: Check the portals in both themes**

Against the local clone, sign in with the credentials in `docs/local-supabase-clone.md` and visit `/admin`, `/admin/pos`, `/admin/employees/payroll`, `/admin/payouts`, `/vendor`, `/employee/pos`, `/display` and `/login`.
Expected: no unreadable text, no doubled cards, and nothing clipped.

- [ ] **Step 3: Compare the storefront**

Compare `/` and `/shop` in both themes with the Task 1 screenshots, including the `.eyebrow` labels.
Expected: no visible difference.

- [ ] **Step 4: Check printing**

Print a receipt, a label and a payout statement.
Expected: same output as on `main`.

- [ ] **Step 5: Check sizes**

Check `/admin/pos` and `/admin/inventory` in Electron at 1024×768 and 1400×900, sidebar expanded and collapsed. Check `/admin` and `/vendor` at 390px wide, including the More sheet.
Expected: everything is usable, and the regrouped nav shows in the More sheet.

- [ ] **Step 6: Commit any fixes**

```bash
git add -A src
git commit -m "Fix issues found in final verification"
```

Skip this step if nothing changed.
