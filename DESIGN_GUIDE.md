# Miaro Verify — Design Guide

The rules every page follows. Tokens live in `app/globals.css`; reusable pieces in
`src/shared/dashboard-kit.jsx`, `src/shared/ui-kit.jsx` and `src/ui.jsx`. Reach for
those first; a new primitive goes into the kit, not inline.

## Type
- Fonts: **Lexend** for titles and numbers (`--font-display`), **Lexend Deca** for
  everything else (`--font-body`). Numbers use `className="tnum"` (tabular figures).
- Scale (px): **11 · 12 · 13 · 14 · 16 · 20 · 25 · 28**. Nothing in between.
  - 11 — uppercase eyebrow labels only (with letter-spacing).
  - 12 — captions, pills, table meta. The smallest size for normal text.
  - 13 — body, inputs, buttons, table cells (`--text-base`).
  - 14 — emphasised body, nav items.
  - 16 — section and card titles, small stat values.
  - 20 — secondary stat values, dialog titles.
  - 25 — page titles (`--text-page-title`).
  - 28 — headline KPI values.

## Spacing
- 4px base. Steps: **4 · 8 · 12 · 16 · 24 · 32 · 48** (`--space-1` … `--space-12`).
  1–2px only for hairlines.
- Page padding 24. Between sections 16. Inside cards 16 (big KPI tiles 16–24).
  Gaps in a row of controls 8; between cards 16.

## Color
- One accent: charcoal `--accent` (inverts in dark mode). Primary buttons, active
  tabs and selected states use it. No other color for primary actions.
- Status palette, the only hues in the app: `--c-red`, `--c-amber`, `--c-green`,
  `--c-slate`, `--c-indigo`, `--c-violet`, `--c-cyan`, `--c-blue`, `--c-teal`. In JS use
  `C.red` etc. from `src/constants.js`; for a soft background or border use
  `tint(C.red, 10)` / `tint(C.red, 30)`. **Never write hex colors in components.**
- Semantic: `--danger` (red), `--warning` (amber), `--success` (green). Soft pills use
  `TONES` (`--tone-*-bg` / `--tone-*-fg`). Text on a solid status fill uses `--on-status`.
- Color means something. A number is red only when it is a problem, green only when
  it is a good outcome; plain counts (projects by type, people by role) stay neutral.
  KPI values stay neutral text; the tile's colored top edge and its caption carry
  the status. Never use color alone: pair it with a word, icon or dot.
- Every color has a dark-mode value; check both themes.

## Buttons
- One primary (charcoal) button per view: the main next step.
- Secondary actions: ghost buttons. Destructive actions: red text or outline in the
  page, always confirmed; only the confirm dialog's final button is solid red.
- Cards and rows in a list use secondary buttons; the page's primary button sits in
  its header or toolbar (e.g. "+ New project", "+ New module").
- Decisions keep their meaning: Approve = solid green, Send back = red outline.

## Where an action opens
Pick by what the person is doing, not by what's easiest to build:
- **Modal** (`ModalShell`, centred): a short, focused task that ends with Save or
  Cancel: create or edit a record, manage a project's checklist and members,
  account settings.
- **Drawer** (`ModalShell variant="drawer"`, from the right): looking at one record
  while keeping its list in mind, with tabs or long content: a build's details,
  bugs and comments. Its header (title + Close) stays put while the body scrolls.
- **Menu** (`ActionMenu`, the ⋯ button): the less-used actions on a card or row
  (edit, delete, share, import). Destructive items are red and last.
- **Dropdown** (header menus): choices that start something elsewhere: New, account.
- **Inline / popover**: one-field changes in place (a status, an assignee).
- **Separate page**: multi-step or large work you stay in: a project, the WBS
  builder, analytics.
- **Confirm** (`confirmAction`): before anything that can't be undone. Never the
  browser's `confirm()`. Cancel has focus; the confirm button names the action
  ("Delete", "Revoke") and is red for deletions.
Every dialog closes with Esc, the ✕ in its header, or a click on the backdrop,
keeps Tab inside, and hands focus back to whatever opened it.

## Tooltips and accessibility
- Tooltips: give a control a `title` (or `data-tip`). The app's `TooltipLayer` shows
  it on hover and on keyboard focus, inside the screen, and an icon-only control
  gets it as its accessible name. Tooltips add context; never hide essential
  information in one.
- Every icon-only button has an `aria-label`; every field has a label (`<label>`,
  `htmlFor`, or `aria-label`). Filter dropdowns say what they filter.
- Anything clickable is reachable by keyboard. Use a `<button>`; for a clickable
  card or row spread `pressable(onOpen, 'Open …')` (Enter/Space, a tab stop, a
  name). Collapsible headers also set `aria-expanded`.
- Tabs use `role="tablist"`/`role="tab"` with `onTabListKeyDown` (arrow keys).
- Text contrast is at least 4.5:1: `--color-text-tertiary` is the lightest text
  colour allowed. For small amber/green text use `--tone-warning-fg` /
  `--tone-success-fg`, not `--warning` / `--success`.
- Touch screens get 44px targets on the header, menus, nav, tabs and filters; no
  target is under 32px.
- Check every role at 375, 768 and 1440px wide, in both themes.

## Surfaces
- Cards: `--card` background, `--border`, radius `--r-card` (14px), `--shadow-premium`.
  Clickable cards lift on hover (`.mgr-card.clickable`).
- Inner boxes and inputs: radius 8–12. Pills: fully rounded.

## Card sizes (the card-sizing system)
Cards never grow with their content. Each kind has one size at every screen width,
and long content is cut (with the full text in a tooltip) or scrolls inside.
- **KPI tiles** (`KpiTile`): `--kpi-h` 148px. Label one line, caption two lines.
- **Dashboard panels** (`Panel`): `lg` 640px (needs attention, where work waits,
  project health, people), `md` 480px (item lists), `sm` 460px (charts). Two panels
  in a row are always the same size. Header pinned, "Show all" footer pinned, the
  body scrolls.
- **Project cards**: `PROJECT_CARD_HEIGHT` 320px, buttons pinned to the bottom.
- **List cards** (builds, bugs): fixed rows. Title one line, notes/description one
  or two lines (`clamp-1` / `clamp-2`), tags one line with "+N". Full details open
  in a drawer, never by expanding the card.
- Grids of cards stretch every card to the row's height (`align-items: stretch`,
  `.card-grid`, `.stat-row`).
- Loading shows the same shapes at the same sizes (`Skeleton`, `SkeletonList`,
  `SkeletonCards`, `AppSkeleton`), never "Loading…" text.

## Page rhythm
- `PageHeader` (title + subtitle) → KPI row → filters → content.
- KPI rows: CSS grid, 16px gap. Card grids: `repeat(auto-fill, minmax(…))`, 16px gap.
- Cards in a grid share one height; content that varies goes in fixed rows.
