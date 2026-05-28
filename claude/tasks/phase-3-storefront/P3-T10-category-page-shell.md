---
id: P3-T10
phase: 3
title: Category page shell
status: not_started
depends_on: [P3-T01]
estimate_hours: 3
owner: ai
last_updated: 2026-05-18
---

# Goal

`/c/[slug]` renders a category landing: header (name, description,
optional cover), a product grid of `<ProductCard>`s scoped to the
category + its descendants, and slots for the filter sidebar (T11) and
pagination (T12).

# Prerequisites (read first)

- claude/architecture/caching-and-revalidation.md — `/c/<slug>`
  revalidation path + `categories` tag (admin already emits these)
- `web/src/lib/db/categories.ts` — `getCategoryBySlug`,
  `getDescendantIds`
- `web/src/lib/db/products.ts` — `listProducts({ categoryIds, ... })`
- P3-T01 — `<ProductCard>` + `<ProductCardGrid>`

# Files to touch

- `web/src/app/(storefront)/c/[slug]/page.tsx` (new) — server
  component. `force-dynamic` OR `unstable_cache` keyed read (prefer
  cached read tagged `categories` + `products` so it benefits from
  admin revalidation).
- `web/src/app/(storefront)/c/[slug]/category-header.tsx` (new).

# Implementation notes

- **Route is `/c/[slug]`** (matches admin revalidation paths). 404 via
  `notFound()` when `getCategoryBySlug` returns null.
- **Descendant scoping:** `getDescendantIds(supabase, category.id)`
  → pass the full id list to `listProducts({ categoryIds })` so a
  parent category shows everything beneath it. This mirrors the admin
  behaviour.
- **Caching:** wrap the category + product reads in `unstable_cache(
  async () => …, ['category', slug], { tags: ['categories',
  'products', 'category:'+slug], revalidate: 300 })`. Admin edits emit
  `categories` / `products` tags → auto-flush.
- **Empty state:** "No products in this category yet."
- Reserve layout columns: sidebar (T11) on the left at lg+, grid on
  the right; mobile stacks with filters behind a Sheet (T11).
- `generateMetadata` for SEO (title = category name, description).

# Acceptance criteria

- [ ] `/c/[slug]` renders header + product grid scoped to category +
      descendants.
- [ ] Unknown slug → 404.
- [ ] Reads wrapped in `unstable_cache` with categories/products tags;
      editing a product in admin reflects after revalidation.
- [ ] Page is cached (`export const revalidate` set), NOT
      `force-dynamic` — per the T00 performance contract.
- [ ] `generateMetadata` produces a category title/description.
- [ ] No horizontal scroll at 360px.
- [ ] tsc + lint + build green.

# Verification

```bash
cd web && pnpm dev
# /c/<real-slug> → grid; edit a product's category in admin → appears
# /c/does-not-exist → 404
```

# Dependencies added

(none)

# Notes for next agent

(empty)
