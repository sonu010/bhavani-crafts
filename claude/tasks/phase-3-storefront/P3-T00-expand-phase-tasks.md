---
id: P3-T00
phase: 3
title: Expand Phase 3 task files
status: done
depends_on: [P2-T29]
estimate_hours: 2
owner: ai
last_updated: 2026-06-07
---

# Goal

Phase 3 task files were frontmatter-only stubs. This meta-task expanded
all of them with the storefront decisions baked in, cross-referenced
against what Phase 1 + Phase 2 actually shipped, and added the tasks
that were missing from the original plan.

# What was decided (locked this expansion)

1. **Routes are `/p/[slug]` and `/c/[slug]`** — NOT the legacy
   `/products/[id]`. The admin's revalidation map (caching-and-
   revalidation.md) already emits `revalidatePath('/p/'+slug)` and
   `'/c/'+slug`; the storefront routes must match or admin edits never
   flush the right paths.

2. **Every storefront read wraps `unstable_cache(..., { tags })`** so
   the admin's `updateTag('products' | 'categories' | 'product:'+slug
   | 'homepage' | 'featured')` calls actually invalidate. Without this
   the storefront serves stale data after every admin edit. Tag
   vocabulary is fixed in caching-and-revalidation.md.

   **Performance contract (the "no lag browsing" guarantee) — applies
   to every storefront task, enforced as an acceptance criterion:**
   - Storefront pages are cached, NOT `force-dynamic`. The ONLY
     dynamic branch in all of Phase 3 is the PDP `?preview=<token>`
     path (T13), which is read uncached + token-gated. Everything
     else serves from cache.
   - Each data-fetching page sets `export const revalidate = <N>`
     (ISR) AND wraps its reads in `unstable_cache` with the right
     tags. ISR gives a static-fast baseline; the tags give on-demand
     freshness when admin edits. Both, not either.
   - Budget: cached storefront route TTFB < 200ms; LCP < 2.5s; CLS
     < 0.1 (verified in T23 on `pnpm build && pnpm start`, NOT dev —
     Turbopack cold-compile makes dev numbers meaningless).
   - Client JS stays minimal: only the cart store, search box,
     gallery, and variant selector are client islands. No accidental
     `"use client"` on a big server tree.

   **Admin performance** (separate system — auth-gated, uncacheable
   data): the lever is fixed per-request overhead, not queries (those
   are already RPC-backed + keyset-paginated + indexed). The
   measured bottleneck was the auth round-trip; `proxy.ts` now uses
   local JWT verification (`getClaims()`, ES256/WebCrypto, no
   network) instead of `getUser()`. Keep it that way. See
   `claude/architecture/performance.md` if/when written.

3. **Shared `<ProductCard>`** is built ONCE in P3-T01 and reused by
   hero, Atlas-adjacent rows, weekly collection, kits, category grid,
   search results, related products. Do not fork it per consumer.

4. **Homepage dynamic sections** (no CMS until Phase 4):
   - "This week's collection" (T05) → `is_featured = true`, newest 4.
   - "Workshop kits" (T06) → products in the `workshop-kits` category.
   Owner curates via the `is_featured` toggle + category assignment in
   the admin product editor.

5. **Cart leads to Razorpay checkout** (owner decision 2026-05-18).
   This OVERRIDES overview.md §"Out of MVP" which listed payments as
   out of scope. Payments are now a dedicated task cluster
   (P3-T25..T28) gated behind a new ADR — see those files. T20/T21
   build the client cart; the checkout + payment + order-confirmation
   flow is the cluster.

6. **PDP honors `?preview=<token>`** via `verifyPreviewToken`
   (shipped in P2-T17). T13 is the consumer.

7. **Search page writes `search_logs`** (query + result_count) so the
   dashboard zero-result widget (P2-T06) has data. T18 is the
   producer.

# Tasks added during expansion

- **P3-T24** — sitemap.xml + robots.txt + storefront-indexable
  metadata (was unowned).
- **P3-T25..T28** — Razorpay payments cluster (orders schema,
  checkout page, payment verification, order confirmation). Each
  flags the new ADR + env/secret decisions payments require.

# Notes for next agent

- The legacy storefront is on `origin/main` (NOT a `web-legacy`
  folder — that path in the original stubs was wrong). Reference via
  `git show origin/main:src/store/cart.ts`,
  `:src/components/cart/CartDrawer.tsx`,
  `:src/components/sections/HeroSection.tsx`,
  `:src/components/product/ProductCard.tsx`. Treat them as design
  reference only — types + data layer changed.
- Storefront data layer already exists: `listProducts` (filters +
  cursor), `getProductBySlug`, `searchProducts`, `listTopLevelCategories`,
  `getCategoryTree`, `getDescendantIds`. ~80% of the read path is done.
- Payments cluster (T25-T28) is the one part that needs a real design
  pass + ADR before implementation; don't start it cold.
