# Raven POS v2 design system

## Context and goals

Design intent: a restrained, warm, highly legible operational interface that feels distinctly Raven while prioritizing speed, error prevention and comfort over decoration.

The public storefront may retain its more editorial Fraunces moments. Operational screens use a clear system sans by default; serif display typography is reserved for brand moments and selected totals, never dense tables or form labels.

## Design tokens and foundations

### Color roles

- `background`: application canvas
- `surface`: recessed/secondary workspace
- `surface-elevated`: navigation, menus and high-priority panels
- `card`: grouped content where a border is needed
- `foreground`: primary text
- `muted`: secondary text that must still meet 4.5:1 for normal text
- `muted-foreground`: placeholder/tertiary use only, also raised to accessible contrast
- `border`: structural separation; interactive boundaries use a stronger `border-strong`
- `primary`: Raven clay for selected state and primary action
- `success`, `warning`, `danger`, `info`: state roles with foreground, background and border tokens

Color must never be the only state cue. Status always includes text and, when helpful, an icon.

### Type

- Display: 32 px / 1.15, rare operational hero/total
- Page title: 24 px / 1.25, 650–700 weight
- Section title: 20 px / 1.3, 600 weight
- Component title: 16 px / 1.4, 600 weight
- Body: 14 px / 1.5
- Comfortable body/form: 16 px / 1.5
- Caption: 12 px / 1.4; never used for primary instructions or controls
- Money/SKU/barcode/IDs: tabular numbers; mono only where character distinction matters

Do not use 10–11 px text for navigation, required information or actions.

### Spacing and sizing

- Spacing: 4, 8, 12, 16, 24, 32 px
- Compact control: 36 px, pointer/keyboard use only
- Standard control: 44 px
- Touch/critical control: 48–56 px
- Table row: 44 px minimum when interactive
- Radius: 6 px compact, 8 px controls, 10–12 px panels, full only for pills/status
- Borders carry most separation; shadows are reserved for overlays and floating menus

### Motion

- Micro state: 100 ms
- Standard enter/exit: 150 ms
- Complex drawer: 200–250 ms maximum
- Never delay input or completion feedback
- `prefers-reduced-motion: reduce` disables transform/scroll animation and shortens nonessential transitions

### Layout

- Operational content max width is route-dependent; tables and POS use the available viewport.
- Standard pages use 16 px compact, 24 px desktop horizontal padding.
- Desktop sidebar: 256 px expanded, 72 px compact.
- Compact Electron mode begins before content becomes horizontally unusable, not at a device-name breakpoint.
- Two-dimensional data may scroll horizontally only when key identity/actions remain visible and the container clearly signals overflow.

## Component-level rules

### Buttons

Anatomy: optional icon, visible label, optional shortcut hint/spinner.

- Primary: one per action region.
- Secondary: routine alternative.
- Quiet/ghost: low-emphasis utility.
- Danger: destructive/irreversible action.
- Success color is status, not a generic primary-action replacement.
- States: default, hover, focus-visible, active, disabled, loading.
- Loading preserves button width and communicates busy state.
- Icon-only buttons require an accessible name and at least 44 px for frequent/touch actions.
- Do not use color-only icon buttons for remove versus edit.

### Inputs, selects and textareas

Anatomy: persistent label, optional/required indicator, control, hint/error.

- Every control has a unique stable ID.
- Hint/error IDs are referenced through `aria-describedby`.
- Invalid controls set `aria-invalid=true`; errors are announced.
- Placeholder is an example, never the only label.
- Currency/date/barcode fields use appropriate input mode and formatting without changing submitted values.
- Disabled and read-only states are visually distinct.

### Search and combobox

- Search fields use `type=search`, visible label or unique accessible name and clear action.
- Suggestion lists use combobox/listbox semantics, arrow navigation, Enter selection and Escape dismissal.
- Scanner input remains a simple exact-entry field and is not converted into a debounced combobox.

### Tabs

- Container uses `tablist`; triggers use `tab`, `aria-selected` and roving tab index.
- Arrow keys move between tabs; Enter/Space activates when activation is manual.
- Panels are associated by ID.
- Tabs scroll horizontally on narrow screens rather than compressing labels.
- Use tabs for peer views, not for unrelated actions.

### Tables and data grids

Anatomy: caption/accessible name, toolbar, header, body, selection/status, pagination.

- Native table semantics are preferred for read-only/tabular data.
- Sorting is operated through a button inside the header and exposes `aria-sort`.
- Clickable rows must have an equivalent keyboard-operable link/action.
- Row actions have visible labels in menus or accessible names with 44 px targets.
- Sticky headers use opaque backgrounds and visible separation.
- Loading uses stable skeleton rows; empty/error states retain table context.
- Currency is right aligned with tabular numerals.
- Server-paginated data must use server sorting or clearly state “this page.”
- Narrow fallback uses labeled record rows/cards; it never drops critical values or actions.

### Cards and panels

- Use a card only when content has a genuine shared boundary.
- Avoid cards inside cards; use dividers/sections within a panel.
- Default panel has 1 px border and no shadow.
- Hover elevation is only for a genuinely clickable object.

### Dialogs and drawers

- Use `role=dialog`, `aria-modal`, unique title/description IDs.
- Move focus inside on open, trap Tab/Shift+Tab, restore focus on close.
- Background is inert while open.
- Escape closes unless an in-progress critical workflow explicitly blocks it.
- Destructive dialogs focus the safe action first.
- Footer actions remain visible when body scrolls.
- On narrow screens, complex dialogs may become full-height drawers.

### Menus and popovers

- Trigger exposes expanded state and controls relationship.
- Opening transfers focus to the first appropriate item.
- Arrow/Home/End/Escape keyboard model is supported.
- Menus contain actions; selectable view modes use listbox/radio semantics.
- Popovers stay within viewport and do not depend on hover alone.

### Status, alerts and toasts

- Success: polite status.
- Routine scan added/incremented: short polite live message and local visual pulse.
- Warning/offline/pending: persistent inline status until resolved.
- Payment/inventory/financial failure: assertive alert near the action plus recovery.
- Toasts never contain the only copy of an important error.
- Undo is used for safe routine removal; irreversible actions use review/confirmation.

### Navigation and shell

- Desktop, compact and mobile views derive from one route registry.
- Active state uses color, weight and a non-color indicator.
- Collapsed groups remain buttons, work on focus/click and provide labels.
- Sidebar scrolls independently; account/settings actions remain reachable.
- Mobile bottom navigation uses 12 px minimum labels and 44 px targets.
- Global top bar shows current operational context and compact utilities; it does not repeat a static “Team Messaging” title on every route.

## Accessibility requirements and acceptance criteria

- Text contrast is at least 4.5:1 for normal text and 3:1 for large text.
- Interactive boundaries and focus indicators reach 3:1 against adjacent colors.
- All functionality is keyboard reachable with a logical order.
- Focus is never hidden behind sticky bars, drawers or bottom navigation.
- At 200% zoom and 320 CSS px width, content reflows except essential two-dimensional data.
- Frequent targets are 44 px; no target is smaller than WCAG 2.2’s 24 px minimum without required spacing/exception.
- Dialog, tab, combobox and menu patterns match WAI-ARIA behavior.
- Form errors identify the field, explain recovery and are programmatically associated.
- Tables expose headers and sort state; row actions are keyboard accessible.
- Reduced-motion mode removes nonessential transforms and long animation.
- Screen reader QA covers login, POS scan/cart/tender, inventory selection, consignor navigation, refund, payout review and customer display.

## Content and tone standards

- Use direct retail language: “Add product,” “Complete cash sale,” “Retry sync.”
- State the object and outcome: “Remove Oak Side Table from this sale?”
- Explain disabled states next to the control when operationally important.
- Errors say what happened and what to do: “Card was declined. Ask for another payment method or retry.”
- Avoid vague labels such as “Submit,” “Proceed,” “Options” when a specific action fits.
- Use “consignor” and “vendor” only where the current product meaning requires each established term.

## Anti-patterns and prohibited implementations

- No backend/schema/RPC changes for visual convenience.
- No hidden or removed existing feature.
- No hover-only navigation, title-only icon action, or color-only state.
- No nested card stacks, oversized empty hero area, glassmorphism or decorative gradient.
- No page-specific raw color when a semantic token exists.
- No tiny text to make cramped navigation fit.
- No global keyboard shortcut firing inside unrelated inputs.
- No client-only sort presented as a complete dataset sort.
- No modal without focus containment and restoration.
- No success message before an actual result is known.

## QA checklist

- All component states render in light and dark themes.
- Long names, IDs, currency values and translated-length labels do not clip.
- Keyboard order and visible focus are verified.
- Touch targets are measured.
- 320 px, 768 px, 1024×768, 1280×800, 1400×900, 1920×1080 and customer-display dimensions are checked.
- Sticky elements do not overlap content or focus.
- Menus/dialogs stay within viewport.
- Tables preserve identity/action columns and expose overflow.
- Loading, empty, error, offline, success and partial-result states are present.
- Electron title/window bounds and print-only CSS remain intact.

