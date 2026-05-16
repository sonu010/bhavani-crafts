---
id: P0-T03
phase: 0
title: Extract reusable bits from web-legacy/
status: deferred
depends_on: [P0-T02]
estimate_hours: 0.5
owner: ai
last_updated: 2026-05-16
---

> **Deferred.** The cart store is the only thing we plan to reuse from `web-legacy/`. It will be pulled directly from `origin/main` at the point of use (P3-T21). No upfront `_salvage/` folder is needed — Phase 3 fetches the file with `git show origin/main:web/src/store/cart.ts > web/src/store/cart.ts` when it's needed. Soft-delete this whole task at P3-T21 once the cart store lands fresh.

# Goal

After this task, a small `_salvage/` folder contains the bits from `web-legacy/` we plan to reuse in the fresh scaffold. P0-T04 onwards will copy from `_salvage/` into the new `web/`.

# Prerequisites (read first)

- `web-legacy/src/store/cart.ts` (Zustand cart store — port wholesale)
- `web-legacy/src/components/ui/` (shadcn primitives already installed)
- `extracted_ideas/stitch_bhavani_creator_studio/artisanal_modernity/` (design tokens reference)
- `assets/*.svg` (category SVG icons)

# Files to touch

Create:
- `_salvage/cart.ts` ← copy of `web-legacy/src/store/cart.ts`
- `_salvage/ui/` ← copy of `web-legacy/src/components/ui/*` (just files, no nested folders we don't want)
- `_salvage/icons/` ← copy of `assets/*.svg`

# Implementation notes

- **Cart store**: clean and well-isolated; port as-is into the new app at P3-T21. No edits during salvage.
- **UI primitives**: shadcn components already added with the radix-maia style. We'll re-install via `shadcn add` in P0-T06 (because dependencies and theme tokens differ), but having the legacy versions for visual diff is helpful.
- **Icons**: 7 SVGs (craft, diy, paint, paper, resin, school, wood). These become `web/public/icons/category/*.svg` later.
- **Do NOT salvage**: homepage sections (used Unsplash placeholders + the cookie-cutter "centered hero" layout we're avoiding), the file-based JSON db, the broken auth setup.

# Acceptance criteria

- [ ] `_salvage/cart.ts` exists and is identical to `web-legacy/src/store/cart.ts`.
- [ ] `_salvage/ui/` contains the shadcn primitives (button, card, dialog, sheet, etc.).
- [ ] `_salvage/icons/` contains the 7 category SVGs.
- [ ] Nothing in `web-legacy/` was modified.

# Verification

```bash
cd "/Users/vigneshthati/Developer/Public/Bhavani Crafts"
diff _salvage/cart.ts web-legacy/src/store/cart.ts && echo "OK: cart matches"
ls _salvage/ui/ | wc -l
ls _salvage/icons/*.svg | wc -l   # expect 7
```

# Dependencies added

None.

# Notes for next agent

(filled in when status → done)
