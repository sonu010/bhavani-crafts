---
id: P3-T04
phase: 3
title: Landing — the Atlas (category grid)
status: done
depends_on: [P3-T01]
estimate_hours: 3
owner: ai
last_updated: 2026-05-29
---

# Goal

"The Atlas" — the 8 top categories as a 2×4 grid (desktop) / 2-col
stack (mobile). Each tile: real product photo + Newsreader category
name (mix-blend-multiply for legibility over the photo) + stone-500
caption. Tiles link to `/c/[slug]`.

# Prerequisites (read first)

- claude/architecture/design-system.md §"Landing page composition" #3
- `web/src/lib/db/categories.ts` — `listTopLevelCategories`
- claude/architecture/caching-and-revalidation.md — `categories` tag

# Files to touch

- `web/src/app/(storefront)/_landing/atlas.tsx` (new) — server
  component; fetches top categories + a representative image each.
- `web/src/app/(storefront)/page.tsx` (modified) — mount.
- Possibly `web/src/lib/db/categories.ts` (modified) — add
  `listTopCategoriesWithCover(supabase, limit)` if a category cover
  image isn't already resolvable (categories have `image_url`; if a
  top category lacks one, fall back to a product image from that
  category).

# Implementation notes

- **8 categories.** Use `listTopLevelCategories` ordered by sort_order;
  take the first 8. Wrap in `unstable_cache(..., { tags:
  ['categories','homepage'] })`.
- **Tile image:** prefer `categories.image_url`; fall back to the
  newest published product image in that category (one extra batched
  query keyed on the 8 category ids).
- **mix-blend-multiply** on the category name over the photo for
  legibility; Newsreader, large. stone-500 caption below (e.g. product
  count or a tagline).
- Grid: `grid-cols-2 lg:grid-cols-4` → 2×4 desktop, 2-col mobile.
  4:5 or square tiles; consistent aspect ratio.

# Acceptance criteria

- [ ] 8 top categories render as 2×4 (desktop) / 2-col (mobile).
- [ ] Each tile has a real image, Newsreader name, caption; links to
      `/c/[slug]`.
- [ ] Read wrapped in `unstable_cache` with categories/homepage tags.
- [ ] No horizontal scroll at 360px.
- [ ] tsc + lint + build green.

# Verification

```bash
cd web && pnpm dev
# / → Atlas grid; click a tile → /c/<slug>
```

# Dependencies added

(none)

# Notes for next agent

  - `_landing/atlas.tsx`; cached `["landing-atlas"]`, tags
    `categories/products/homepage`. Uses `getCategoryCovers` (in
    `lib/db/storefront.ts`): category.image_url first, else newest
    published product image in the category's DESCENDANT subtree (3
    batched queries via `category_with_descendants`). Names overlaid
    mix-blend-multiply. Hides if no categories.
