---
id: P3-T05
phase: 3
title: Landing — this week's collection
status: done
depends_on: [P3-T04]
estimate_hours: 2
owner: ai
last_updated: 2026-05-29
---

# Goal

A named, dated collection block ("This week: Monsoon resin colors")
with a Newsreader italic intro paragraph and a 4-product horizontal
scroll-snap row of `<ProductCard>`s.

# Prerequisites (read first)

- claude/architecture/design-system.md §"Landing page composition" #4
- P3-T01 — `<ProductCard>`
- `web/src/lib/db/products.ts` — `listProducts`

# Files to touch

- `web/src/app/(storefront)/_landing/weekly-collection.tsx` (new).
- `web/src/app/(storefront)/page.tsx` (modified) — mount.

# Implementation notes

- **Data source (locked):** `is_featured = true`, newest 4
  (`listProducts({ sort:'newest', perPage:4 })` filtered to featured —
  add an `onlyFeatured` opt to `listProducts` if not present, or filter
  post-fetch). Wrap in `unstable_cache(..., { tags:
  ['products','featured','homepage'] })`.
- **Title + intro are static copy** for MVP (no CMS until Phase 4).
  Keep "This week: <name>" + the italic intro in a constant the owner
  edits. Document that Phase 4's homepage settings replace this.
- **Scroll-snap row:** `flex overflow-x-auto snap-x snap-mandatory`
  with each card `snap-start shrink-0 w-[70%] sm:w-[45%] lg:w-1/4`.
- Empty state: if < 1 featured product, hide the section entirely
  (don't render an empty row).

# Acceptance criteria

- [ ] Renders title + italic intro + up to 4 featured products in a
      scroll-snap row.
- [ ] Section hides when there are zero featured products.
- [ ] Cards reuse `<ProductCard>`; read wrapped in `unstable_cache`.
- [ ] Mobile scroll-snap works; no page horizontal overflow.
- [ ] tsc + lint + build green.

# Verification

```bash
cd web && pnpm dev
# / → weekly row; mark 4 products featured in admin → they appear
```

# Dependencies added

(none)

# Notes for next agent

  - `_landing/weekly-collection.tsx`; `getProductCards({onlyFeatured,
    perPage:4})`, cached `["landing-weekly-collection"]`, tags
    `products/featured/homepage`. Title/intro are static constants
    (Phase 4 homepage settings replaces). Scroll-snap row. HIDES when no
    featured products — seed now marks 3 featured so the happy path has
    E2E coverage (anon/landing.spec.ts).
