---
id: P3-T16
phase: 3
title: Related products
status: done
depends_on: [P3-T13]
estimate_hours: 1
owner: ai
last_updated: 2026-05-29
---

# Goal

The PDP ends with a "You might also like" row of up to 8 related
products — same category, excluding the current product.

# Prerequisites (read first)

- P3-T13 — PDP shell; P3-T01 — `<ProductCard>`
- `web/src/lib/db/products.ts` — `listProducts`

# Files to touch

- `web/src/app/(storefront)/p/[slug]/related.tsx` (new) — server
  component.
- `web/src/lib/db/products.ts` (modified, optional) — a
  `listRelated(supabase, { categoryId, excludeId, limit })` helper, or
  just `listProducts({ categoryIds:[catId], perPage:9 })` then filter
  out the current id client-side.

# Implementation notes

- **Source:** same category (the product's direct `category_id`),
  newest, limit 9, drop the current product → show up to 8. If the
  category has too few, fall back to newest published overall.
- Wrap in `unstable_cache(…, ['related', categoryId], { tags:
  ['products'], revalidate: 600 })`.
- Reuse `<ProductCardGrid>` / scroll-snap row. Hide the section if
  zero related.

# Acceptance criteria

- [ ] PDP shows up to 8 same-category products, current excluded.
- [ ] Falls back to newest overall when the category is thin.
- [ ] Read wrapped in `unstable_cache`.
- [ ] Hides when empty; no horizontal page overflow at 360px.
- [ ] tsc + lint + build green.

# Verification

```bash
cd web && pnpm dev
# /p/<slug> → related row shows siblings, not the product itself
```

# Dependencies added

(none)

# Notes for next agent

  - `related.tsx` server. Same-category newest, current excluded, up to
    8. Falls back to newest overall when the category is thin. Reuses
    `getProductCardsPage` for the batched-image read. Cached as
    `[pdp-related, categoryId, excludeId]` with tags `products`/`categories`
    (revalidate 600). Wrapped in `readOrEmpty` (build-time resilience).
    Scroll-snap row; hides when empty.
