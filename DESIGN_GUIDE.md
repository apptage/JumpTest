# JumpTest — Dashboard Design Guide

The look & feel established on the **Manager/Admin Analytics** dashboard is the house style.
Every page (main Dashboard, Bugs, Projects, Users, Teams, WBS, Settings) should follow it.
Reusable primitives live in **`src/shared/dashboard-kit.jsx`** — use them, don't re-roll.

## Principles
1. **Modular, not monolithic.** Split dense pages into **sub-tabs** under the page header instead of one endless scroll.
2. **Visual hierarchy.** A few **big primary KPI cards** (with a soft accent-tinted corner) + a tight row of **smaller secondary cards**. Use a **circular progress ring** for a single headline rate.
3. **Show state as shape/color, not raw text.** Pipelines as a **chevron wizard bar**; statuses/health as **soft-pill badges**; alerts as **icon cards**.
4. **Scannable tables.** Search + pagination (10/page) + sticky headers + segmented filters, with **pill-shaded cells** for outliers.
5. **Feels alive.** Row hover shading and card lift-on-hover on anything clickable.

## Tokens (already in `index.html` / CSS vars)
- Typography: IBM Plex Sans; metrics `font-weight:700` (display font var), muted helper labels in `--color-text-tertiary`.
- Radii ~8–12px; faint borders (`--color-border-primary/tertiary`); soft ambient shadow on hover.
- Palette via CSS vars: `--brand` (royal blue) · `--success` (emerald) · `--warning` (amber) · `--danger` (crimson).
- **Soft-pill tones** (`TONES` in the kit): danger `#FEE2E2`/`#991B1B` · warning `#FEF3C7`/`#92400E` · success `#DCFCE7`/`#166534` · info `#DBEAFE`/`#1E40AF` · neutral `#F1F5F9`/`#475569`.
- Hover classes in `index.html`: `.mgr-row:hover` (bg shade), `.mgr-card.clickable:hover` (lift + shadow).

## Kit components (`@shared/dashboard-kit.jsx`)
- `SubTabs({ tabs, active, onChange })` — page-level tab bar (bottom-border active indicator).
- `StatBig({ label, value, sub, accent })` — primary KPI card (tinted corner).
- `StatSmall({ label, value, color, sub })` — secondary KPI card.
- `PassRing({ pct, label, sub })` — circular progress ring, auto color by threshold.
- `Pill({ label, tone })` + `TONES`, `passTone(rate)`, `passColor(rate)` — soft badges.
- `AlertCard({ level, children })` (+ `AlertIcon`) — icon alert card (`over`/`warn`/`ok`).
- `Chevron({ stages })` — pipeline wizard bar.
- `DataTable({ columns, rows, rowKey, searchText, onRowClick, toolbar, pageSize })` — searchable, paginated, sticky-header table; columns render pills.

## Section rhythm
- `PageHeader` (title + subtitle) → optional `SubTabs` → `sideHead` section labels → content.
- KPI rows use `display:flex; gap:10–12; flex-wrap:wrap`; card grids use `auto-fill minmax(...)`.

## When adding a page / section
Reach for the kit first. New primitive? Add it to `dashboard-kit.jsx` (not inline) so it stays consistent everywhere. Reference this file.
