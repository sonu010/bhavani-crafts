---
id: P2-T29
phase: 2
title: Admin mobile pass
status: not_started
depends_on: [P2-T28]
estimate_hours: 3
owner: ai
last_updated: 2026-05-17
---

# Goal

After this task, every admin route renders cleanly at 360px viewport. Wide data tables collapse to card layouts. Tabs in the product editor become a stacked list with a "Back to all tabs" link. Modals fill the screen. The Sheet drawer from P2-T05 is the only navigation pattern. No horizontal scroll anywhere except on intentionally-wide content (the audit-log JSON diff and the import preview can scroll inside their containers).

# Prerequisites (read first)

- [claude/SESSION-RESUME.md](../../SESSION-RESUME.md) §"Admin mobile shape (360px)" — Sheet drawer locked
- [claude/architecture/design-system.md](../../architecture/design-system.md) — typography mobile sizes (`Body` 1rem vs desktop 1.0625rem, etc.)
- [P2-T05](P2-T05-admin-shell-layout.md) — shell already mobile-aware; this task ensures every page inside the shell follows through

# Files to touch

This is an audit pass over every page from P2-T05 through P2-T28. Modifications per route:

- `web/src/app/admin/products/page.tsx` — table → card list at < 640px
- `web/src/app/admin/products/products-table.tsx` — collapse columns; "Edit" button only visible action
- `web/src/app/admin/products/filter-bar.tsx` — collapses into a Sheet (slides up from bottom on mobile)
- `web/src/app/admin/products/[id]/edit/product-editor.tsx` — Tabs become a vertical stacked list at < 768px
- `web/src/app/admin/products/[id]/edit/_tabs/general.tsx` — full-width inputs; spacing reduced
- `web/src/app/admin/products/[id]/edit/_tabs/variants.tsx` — variants table → card list
- `web/src/app/admin/products/[id]/edit/_tabs/images.tsx` — thumbnail grid scales (2 columns at 360px instead of 4)
- `web/src/app/admin/categories/page.tsx` — tree view scrolls vertically; nodes get larger touch targets (≥ 44px height)
- `web/src/app/admin/tags/page.tsx`, `web/src/app/admin/attributes/page.tsx` — tables → cards
- `web/src/app/admin/imports/[id]/page.tsx` — preview/report adapts; CSV row table → card list
- `web/src/app/admin/activity/page.tsx`, `web/src/app/admin/jobs/page.tsx` — same table-to-card pattern
- `web/src/app/admin/trash/page.tsx` — same
- `web/src/components/admin/responsive-table.tsx` (new) — shared "auto-collapse to cards below 640px" wrapper. Drives the table-to-card transition consistently.

# Implementation notes

**Sheet drawer is the only navigation.** Already shipped in P2-T05. No bottom tab bar, no top-tab nav, no FAB. The hamburger is the single entry point to nav.

**44px minimum touch target.** Every clickable thing has a hit area ≥ 44×44px (iOS HIG / Material Design baseline). Buttons keep their visual size but pad their wrapping area. Action menu chevrons in tables need their parent row tappable.

**Table-to-card pattern.** A shared `<ResponsiveTable>` wrapper:

```tsx
<ResponsiveTable
  columns={[
    { header: "Name", render: (row) => <Link href={...}>{row.name}</Link>, primary: true },
    { header: "SKU", render: (row) => <span className="font-mono">{row.sku}</span> },
    { header: "Status", render: (row) => <StatusPill {...} /> },
    { header: "", render: (row) => <ActionMenu {...} /> },
  ]}
  rows={products}
/>
```

At ≥ 640px, renders as `<table>`. Below, renders as a stack of `<Card>`s; each card has the `primary` column as a large header and the other columns laid out inside.

**No horizontal scroll for tables.** Strict. If a table needs to display 8 columns, mobile drops to 3 most important. The "Edit" link takes them to the full detail view.

**Tabs → vertical list (product editor at < 768px).** The six tabs (General / Category / Attributes / Variants / Images / Publish) render as a list of large tap targets:

```
┌──────────────────────────────────┐
│ < Back to product list           │
├──────────────────────────────────┤
│ → General                        │
│ → Category                       │
│ → Attributes                     │
│ → Variants                       │
│ → Images                         │
│ → Publish                        │
└──────────────────────────────────┘
```

Tapping enters the tab as a full-screen view with a back arrow returning to the tab list. URL still uses `?tab=` for state.

**Modals fill the screen.** shadcn `Dialog` and `Sheet` primitives have responsive variants; pass `className="sm:max-w-md md:max-w-2xl"` etc. so at 360px, the modal is full-width minus 16px margins.

**Typography.** Use the design-system mobile sizes per [design-system.md](../../architecture/design-system.md) §"Type scale". Body: 1rem mobile, 1.0625rem desktop. Captions stay 0.8125rem both. JetBrains Mono numerics stay tabular.

**Performance.** Mobile users may be on 3G/4G. Each admin route's JS bundle should stay under 100kB gzipped. Server components keep most logic off the wire; the few client components (filter bar, tabs, dirty-guard hook) are tiny.

**No iOS auto-zoom on input focus.** Inputs use `font-size: 16px` or larger (smaller triggers Safari's input zoom). Verify in design-system tokens; if not enforced, add `font-size: 16px !important` to admin input styles at < 640px.

**Spacing.** Tight: 12px between cards, 8px between fields within a form. Maintains scanability without forcing scroll.

# Acceptance criteria

- [ ] At 360px viewport, no horizontal scrollbar on any admin route (except inside intentional scroll containers like JSON diff).
- [ ] All clickable targets ≥ 44px hit area.
- [ ] Tables on Products, Tags, Attributes, Activity, Jobs, Trash, CSV preview collapse to card layouts.
- [ ] Product editor Tabs become vertical list at < 768px.
- [ ] Filter bar collapses to a bottom Sheet at < 640px.
- [ ] Modals are full-width minus 16px margins at 360px.
- [ ] Body font ≥ 16px on inputs to prevent iOS auto-zoom.
- [ ] Lighthouse mobile Accessibility score ≥ 95 on /admin/products, /admin/products/<id>/edit, /admin/trash.
- [ ] `pnpm tsc --noEmit`, `pnpm lint`, `pnpm build` green.

# Verification

```bash
cd web
pnpm build
pnpm dev &
sleep 4
# Chrome DevTools mobile emulator at 360px (iPhone SE 1st gen)
# Walk through every admin route + the product editor flow
# Verify no horizontal scroll, all buttons hit-targetable, modals full-width
# Run Lighthouse on three key routes; capture scores
```

# Dependencies added

None.

# Notes for next agent

(empty)
