---
id: P3-T22
phase: 3
title: Storefront mobile pass (360px)
status: done
depends_on: [P3-T13, P3-T18, P3-T27]
estimate_hours: 2
owner: ai
last_updated: 2026-06-07
---

# Goal

Every storefront route renders cleanly at 360px: no horizontal scroll,
44px touch targets, native-select font ≥ 16px (no iOS auto-zoom),
images responsive, scroll-snap rows behave, the header Sheet + cart
Sheet + filters Sheet all usable one-handed.

# Prerequisites (read first)

- P2-T29 — the admin mobile pass (same playbook + the
  `text-base md:text-sm` select fix + `<NativeSelect>` component)
- claude/architecture/design-system.md §"Type scale" mobile sizes
- All storefront routes from T01–T21

# Files to touch

- Audit pass across: `(storefront)/page.tsx` + `_landing/*`,
  `c/[slug]/*`, `p/[slug]/*`, `search/page.tsx`, cart drawer, header,
  footer. Patch the offenders.

# Implementation notes

- **Reuse the admin learnings:** any `<select>` uses
  `text-base md:text-sm` (or the shared `<NativeSelect>`); icon
  buttons keep a ≥ 44px hit area where they're primary actions; flex
  rows get `min-w-0` to let `truncate` clamp.
- **Hero + Atlas + scroll-snap rows:** verify the right-edge image
  bleed (T02) doesn't cause page overflow at 360px; scroll-snap rows
  scroll internally, never the page.
- **PDP gallery + variant selector:** thumbnails wrap/scroll; option
  pickers don't overflow.
- **Sticky elements** (header, cart Checkout bar) don't cover content;
  account for safe-area-inset on mobile.

# Acceptance criteria

- [ ] No horizontal scrollbar on any storefront route at 360px
      (clientWidth == scrollWidth).
- [ ] All primary tap targets ≥ 44px.
- [ ] No iOS input auto-zoom (inputs/selects ≥ 16px on mobile).
- [ ] Scroll-snap rows scroll internally, not the page.
- [ ] tsc + lint + build green.

# Verification

```bash
cd web && pnpm dev
# DevTools iPhone SE (360px): walk /, /c/<slug>, /p/<slug>, /search,
#   open cart + filters Sheets; confirm clientWidth==scrollWidth each
```

# Dependencies added

(none)

# Notes for next agent

(empty)
