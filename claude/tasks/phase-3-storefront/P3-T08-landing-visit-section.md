---
id: P3-T08
phase: 3
title: Landing — visit Bhavani Crafts
status: not_started
depends_on: [P3-T01]
estimate_hours: 2
owner: ai
last_updated: 2026-05-18
---

# Goal

A "Visit Bhavani Crafts" section: real store photo + address + hours +
embedded map. The address is the CTA (click-to-copy).

# Prerequisites (read first)

- claude/architecture/design-system.md §"Landing page composition" #7
- P3-T01 — layout

# Files to touch

- `web/src/app/(storefront)/_landing/visit.tsx` (new) — server shell.
- `web/src/app/(storefront)/_landing/copy-address.tsx` (new) — client;
  click-to-copy button with a "Copied" toast.
- `web/src/app/(storefront)/page.tsx` (modified) — mount.

# Implementation notes

- **Static content:** store photo, address string, hours — constants
  the owner edits in one place. Map = an embedded Google Maps iframe
  (lazy-loaded; `loading="lazy"`) OR a static map image link to avoid
  the iframe weight. Prefer a static image + "Open in Maps" link for
  Lighthouse; the iframe hurts the perf budget (T23).
- **Click-to-copy:** the address line is a button; on click,
  `navigator.clipboard.writeText(address)` + sonner toast "Address
  copied". Fall back to selecting the text if clipboard API
  unavailable.
- Layout: photo left / details right on desktop, stacked on mobile.

# Acceptance criteria

- [ ] Renders store photo, address, hours, map (static image + Maps
      link preferred over iframe).
- [ ] Address click-to-copy works with a confirmation toast.
- [ ] No layout shift / no horizontal scroll at 360px.
- [ ] tsc + lint + build green.

# Verification

```bash
cd web && pnpm dev
# / → visit section; click address → "copied" toast; clipboard has it
```

# Dependencies added

(none)

# Notes for next agent

(empty)
