---
id: P3-T01
phase: 3
title: Public layout + nav + shared ProductCard
status: done
depends_on: [P3-T00]
estimate_hours: 3
owner: ai
last_updated: 2026-05-18
---

# Goal

After this task the public storefront has its own layout: a top nav
(brand wordmark, category links, search trigger, cart trigger), the
font + design-token wiring, and the shared `<ProductCard>` every
catalog surface reuses. This is the chrome every Phase 3 page renders
inside — distinct from the admin `(shell)` layout.

# Prerequisites (read first)

- claude/architecture/design-system.md §"Landing page composition",
  §"Component patterns" (ProductCard spec ~line 138), §"Buttons"
- claude/architecture/caching-and-revalidation.md §"Mutation →
  revalidation map" (tag vocabulary storefront reads subscribe to)
- `web/src/app/layout.tsx` — root layout (fonts already loaded)
- `web/src/components/ui/*` — shadcn primitives (Sheet, Button, Badge)
- Reference only: `git show origin/main:src/components/product/ProductCard.tsx`

# Files to touch

- `web/src/app/(storefront)/layout.tsx` (new) — route group for all
  public pages; renders `<SiteHeader>` + `{children}` + footer slot.
  Public metadata (indexable, unlike admin's noindex).
- `web/src/app/(storefront)/site-header.tsx` (new) — client; brand +
  nav + search-open + cart-open triggers.
- `web/src/components/storefront/product-card.tsx` (new) — the shared
  card. Server-renderable; takes a `ProductListItem`.
- `web/src/components/storefront/product-card-grid.tsx` (new) —
  responsive grid wrapper reused by category + search + related.
- Move `web/src/app/page.tsx` under the `(storefront)` group so the
  homepage uses the storefront layout.

# Implementation notes

- **Route group, not nested path.** `(storefront)` keeps URLs clean
  (`/`, `/c/...`, `/p/...`) while giving public pages a shared layout
  separate from `(shell)` admin.
- **ProductCard spec:** 4:5 aspect image, name Manrope 600 with hover
  underline-grow, price JetBrains Mono 500 tabular-nums `bark-900`,
  stock pill (moss in-stock / brick out), saffron "Sale" chip
  top-left when `compare_at_price_inr` set. Links to `/p/[slug]`.
  next/image with `blur_data_url` placeholder when present.
- **Cart + search triggers** open client components from T20 (cart
  Sheet) and T18 (search). Wire the trigger buttons now with open
  handlers stubbed; panels land in their own tasks.
- **No admin-token leak.** Never import `requireAdminContext` or
  service-role here. Storefront reads use the anon cookie-bound
  client — RLS gives public-select only.
- **Header sticky** on scroll; collapses to hamburger + Sheet on
  mobile (reuse the admin shell Sheet pattern, P2-T05).

# Acceptance criteria

- [ ] `(storefront)/layout.tsx` renders the header on `/`; page is
      indexable (no `robots: noindex`).
- [ ] `<ProductCard>` renders name, price, stock pill, sale chip,
      blur-up image; links to `/p/[slug]`.
- [ ] Header search + cart triggers exist (panels stubbed).
- [ ] Mobile (360px): header collapses to hamburger + Sheet, no
      horizontal scroll.
- [ ] `pnpm tsc --noEmit`, `pnpm lint`, `pnpm build` green.

# Verification

```bash
cd web
pnpm tsc --noEmit && pnpm lint && pnpm build
pnpm dev
# 1. Open / — header renders, brand + nav + search + cart icons
# 2. Resize to 360px — hamburger + Sheet
# 3. Confirm a <ProductCard> shows 4:5 image + mono price + stock pill
```

# Dependencies added

(none)

# Notes for next agent

  - **`(storefront)` route group** created; homepage moved to
    `(storefront)/page.tsx` (still the Phase 0 placeholder — T02
    replaces it). After the move, `rm -rf .next && pnpm build`
    regenerated the route validators (a stale `src/app/page.js`
    reference in `.next/types` caused a transient tsc error;
    expected on any page move).
  - **Build confirms the perf contract:** `/` renders as
    `○ Static, Revalidate 5m` — the cached nav read makes the
    homepage statically prerendered + ISR, not dynamic. This is the
    pattern every catalog page follows.
  - **New primitive: `lib/db/public-client.ts`** — a cookie-LESS
    anon client for cacheable public reads. Cookie-bound
    `createServerClient` can't go inside `unstable_cache` (it reads
    `cookies()` → forces dynamic). T02/T04/T10/T13/T16 reuse
    `createPublicClient()` for their cached reads. Anything needing
    the user session still uses `createServerClient`.
  - **Nav categories** are cached via `unstable_cache(['nav-
    categories'], { tags: ['categories'], revalidate: 300 })` in the
    layout. Admin category edits emit `updateTag('categories')` →
    flush.
  - **`<ProductCard>` + `<ProductCardGrid>`** built in
    `components/storefront/`. `ProductCardItem = ProductListItem &
    { imageUrl, blurDataUrl, imageAlt }` — consumers fetch the
    product list + its primary image (batched query keyed on visible
    ids, same as the admin list) and map to that shape. First LIVE
    render is T02 (hero) / T04 (Atlas) / T10 (category grid).
  - **`formatInr()`** in `lib/storefront/format.ts` —
    `Intl.NumberFormat('en-IN')`, `₹680` / `₹1,250`, em-dash for
    null. Reuse everywhere a price renders.
  - **Header search + cart triggers**: search routes to `/search`
    (404s until T18 — documented dep order). Cart is an inert button
    until T20 wires the drawer + T21 the count badge. Mobile nav is a
    left Sheet.
  - tsc + lint + build green.
