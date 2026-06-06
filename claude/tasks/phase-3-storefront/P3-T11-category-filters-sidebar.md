---
id: P3-T11
phase: 3
title: Category filters sidebar
status: done
depends_on: [P3-T10]
estimate_hours: 3
owner: ai
last_updated: 2026-05-29
---

# Goal

The category page gains a filter sidebar: price range, stock status,
and (optionally) filterable attributes. Filters live in URL search
params (shareable, server-rendered). On mobile the sidebar is a
bottom Sheet with an active-filter count badge.

# Prerequisites (read first)

- P3-T10 — category page shell
- `web/src/lib/db/products.ts` — `listProducts` already supports
  `minPriceInr` / `maxPriceInr` / `stockStatus`
- `attribute_definitions.is_filterable` (P2-T22) — filterable facets
- Reference: admin filter-bar pattern
  `web/src/app/admin/(shell)/products/filter-bar.tsx`

# Files to touch

- `web/src/app/(storefront)/c/[slug]/filters-sidebar.tsx` (new) —
  client; reads/writes URL params.
- `web/src/app/(storefront)/c/[slug]/page.tsx` (modified) — parse
  filter params, pass to `listProducts`.

# Implementation notes

- **URL params:** `?min=`, `?max=`, `?stock=`. Changing a filter does
  `router.replace` (scroll:false), resets the pagination cursor.
- **Attribute facets (optional for v1):** if time allows, surface
  `is_filterable` attributes for the category as checkbox groups,
  filtering via `product_attributes`. This needs a candidate-id
  intersection (same pattern as the admin tag filter). If deferred,
  document it — price + stock is the MVP minimum.
- **Mobile:** filters collapse into a bottom Sheet (reuse the admin
  products mobile filter Sheet pattern from P2-T08); trigger shows an
  active-filter count badge.
- **Server-side filtering** only — no client-side array filtering. The
  page re-renders server-side with the new params.

# Acceptance criteria

- [ ] Price + stock filters work; selection persists in URL across
      reload.
- [ ] Changing a filter resets pagination.
- [ ] Mobile: filters in a Sheet with an active-count badge.
- [ ] Filtering happens server-side via `listProducts`.
- [ ] No horizontal scroll at 360px.
- [ ] tsc + lint + build green.

# Verification

```bash
cd web && pnpm dev
# /c/<slug>?min=100&max=500&stock=in_stock → grid narrows; reload keeps it
# 360px → Sheet with count badge
```

# Dependencies added

(none)

# Notes for next agent

  - `filters-sidebar.tsx` (client): price min/max + stock, URL-driven.
    Reads from `searchParams`, writes via `router.replace` ONLY in
    onChange/onClick handlers — NO auto-firing effect (avoids the
    filter-bar infinite loop fixed earlier; mirrors the safe
    `products/filter-bar.tsx`). Price inputs debounced via a ref timer +
    `key={value}` remount so they reset on Clear. Mobile = bottom Sheet
    (`render` prop) with active-count badge. Server-side filtering proven
    via E2E (?max=700 drops the ₹1250 item).
