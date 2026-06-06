---
id: P3-T06
phase: 3
title: Landing — workshop kits row
status: done
depends_on: [P3-T04]
estimate_hours: 2
owner: ai
last_updated: 2026-05-29
---

# Goal

A horizontal scroller of workshop kits, each numbered "01 / 02 / 03"
in JetBrains Mono.

# Prerequisites (read first)

- claude/architecture/design-system.md §"Landing page composition" #5
- P3-T01 — `<ProductCard>`
- `web/src/lib/db/products.ts` + `categories.ts`

# Files to touch

- `web/src/app/(storefront)/_landing/kits-row.tsx` (new).
- `web/src/app/(storefront)/page.tsx` (modified) — mount.

# Implementation notes

- **Data source (locked):** products in the `workshop-kits` category.
  Resolve the category id by slug (`getCategoryBySlug(supabase,
  'workshop-kits')`), then `listProducts({ categoryIds:[id],
  perPage:8 })`. Wrap in `unstable_cache(..., { tags:
  ['products','categories','homepage'] })`.
- **If the category doesn't exist yet,** hide the section (don't
  error). Document that the owner creates a `workshop-kits` category
  and assigns products to populate this row.
- **Numbering:** overlay "01", "02", … in JetBrains Mono on each card
  (a wrapper around `<ProductCard>` adding the index badge).
- Same scroll-snap pattern as T05.

# Acceptance criteria

- [ ] Renders kits from the `workshop-kits` category with mono index
      badges; hides gracefully if the category is absent/empty.
- [ ] Read wrapped in `unstable_cache`.
- [ ] Mobile scroll-snap; no page overflow at 360px.
- [ ] tsc + lint + build green.

# Verification

```bash
cd web && pnpm dev
# Create workshop-kits category + assign products in admin → row appears
```

# Dependencies added

(none)

# Notes for next agent

  - `_landing/kits-row.tsx`; resolves `workshop-kits` by slug then
    `getProductCards({categoryIds:[id], perPage:8})`. Cached
    `["landing-kits-row"]`, tags `products/categories/homepage`.
    Numbered 01/02/… badge overlay. HIDES if the category is absent —
    seed now creates `workshop-kits` + 3 products so the path is
    E2E-covered.
