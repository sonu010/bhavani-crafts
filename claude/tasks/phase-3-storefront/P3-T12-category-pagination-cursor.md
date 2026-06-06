---
id: P3-T12
phase: 3
title: Category cursor pagination
status: done
depends_on: [P3-T10]
estimate_hours: 2
owner: ai
last_updated: 2026-05-29
---

# Goal

The category grid paginates with a stable cursor (no offset drift) —
a "Load more" control that appends the next page, preserving active
filters + sort. Mirrors the admin products list pattern.

# Prerequisites (read first)

- P3-T10 — category shell; P3-T11 — filters
- `web/src/lib/db/products.ts` — `ListProductsCursor` +
  `nextCursor` already returned by `listProducts`
- Reference: admin `load-more.tsx`

# Files to touch

- `web/src/app/(storefront)/c/[slug]/load-more.tsx` (new) — client;
  "Load more" appends results.
- `web/src/app/(storefront)/c/[slug]/page.tsx` (modified) — pass +
  read cursor in URL or via a client-accumulated list.

# Implementation notes

- **Cursor shape** is `(created_at, id)` from `listProducts` — already
  implemented; encode as base64url in `?cursor=` (same as admin audit
  viewer). Cursor only valid for the default `newest` sort; if sort
  switches to price, fall back to that sort's pagination axis (already
  handled in `listProducts`).
- **"Load more" vs numbered pages:** prefer Load more (append) — it's
  the storefront norm and avoids the offset-drift problem. The button
  fetches the next page via a server action or a client fetch to a
  route handler, appends to the rendered list.
- Preserve filters: the cursor request carries the same min/max/stock
  params.

# Acceptance criteria

- [ ] "Load more" appends the next page; no duplicates, no skips.
- [ ] Cursor stable across catalog inserts (no offset drift).
- [ ] Filters + sort preserved across page loads.
- [ ] Button hides when `nextCursor` is null.
- [ ] tsc + lint + build green.

# Verification

```bash
cd web && pnpm dev
# /c/<slug> with > 1 page → Load more appends; combine with a filter
```

# Dependencies added

(none)

# Notes for next agent

  - `load-more.tsx` (client) + `actions.ts` (`loadMoreCategoryProducts`
    server action) + base64url cursor codec (`encode/decodeProductCursor`
    in products.ts). Page 1 is server-rendered (cached, SEO); Load more
    appends pages 2+ client-side via the server action — true append, no
    scroll jump, stable `(created_at,id)` cursor. Cursor is encoded on the
    SERVER (page) and passed as a string so the client never touches
    `Buffer`. Button hides when nextCursor is null. Filters preserved
    (passed to the action). Seed has <12 products/category so the button
    is hidden in the current fixture — append path covered by code + the
    shared cursor logic (same as admin).
