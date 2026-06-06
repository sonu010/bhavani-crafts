---
id: P3-T02
phase: 3
title: Landing — split editorial hero
status: done
depends_on: [P3-T01]
estimate_hours: 3
owner: ai
last_updated: 2026-05-29
---

# Goal

The homepage opens with the editorial split hero from the design
system: left 7-col oversized Newsreader headline (3 lines, one italic
word) + one body line + one teal-800 primary CTA; right 5-col a single
hand-photographed product bleeding off the right edge with a JetBrains
Mono margin caption ("Resin set · ₹680").

# Prerequisites (read first)

- claude/architecture/design-system.md §"Landing page composition" #1
- P3-T01 — `(storefront)` layout + `<ProductCard>` + tokens
- Reference only: `git show origin/main:src/components/sections/HeroSection.tsx`

# Files to touch

- `web/src/app/(storefront)/page.tsx` (modified) — replace the Phase 0
  placeholder; compose the landing sections (this task = hero only,
  rest land T03–T09).
- `web/src/app/(storefront)/_landing/hero.tsx` (new) — server
  component; the split hero.

# Implementation notes

- **The hero product** is a single curated item. Source it from
  `listProducts({ sort: 'newest', perPage: 1, ... })` filtered to
  `is_featured = true` OR hard-pick one featured product. Wrap the
  read in `unstable_cache(..., { tags: ['products','featured','homepage'] })`.
- **Type scale:** headline uses Newsreader display size from the type
  scale; the italic word uses `<em>`. Body is one line, Manrope.
- **CTA** is the primary button (teal-800 pill) → `/c/<top-category>`
  or `/search`. Caption is JetBrains Mono in the right margin.
- **Image** bleeds off the right edge (negative margin / overflow on
  the right column); next/image with blur placeholder.
- Grid: `lg:grid-cols-12`; left `col-span-7`, right `col-span-5`.
  Mobile stacks (image first or headline first — headline first per
  editorial convention).

# Acceptance criteria

- [ ] Homepage renders the split hero with real featured product.
- [ ] Headline is 3 lines with one italic word; CTA is teal-800 pill.
- [ ] Image bleeds off the right edge on desktop; stacks on mobile.
- [ ] Read wrapped in `unstable_cache` with homepage/products/featured tags.
- [ ] No horizontal scroll at 360px.
- [ ] `pnpm tsc --noEmit`, `pnpm lint`, `pnpm build` green.

# Verification

```bash
cd web && pnpm build && pnpm dev
# 1. / shows the hero; toggle a product's is_featured in admin →
#    revalidate → hero reflects it
# 2. 360px: stacks cleanly
```

# Dependencies added

(none)

# Notes for next agent

  - **Shared read helper born here:** `web/src/lib/db/storefront.ts` —
    `getProductCards(sb, opts)` (listProducts + ONE batched
    `getPrimaryImages` query → `ProductCardItem[]`) and
    `getCategoryCovers`. Reused by weekly/kits/atlas. Added an
    `onlyFeatured` opt to `listProducts`.
  - Hero reads the newest featured product, falling back to newest
    published so it's never empty. Cached as `["landing-hero"]`, tags
    `products/featured/categories/homepage`. CTA → first top category
    `/c/<slug>` (falls back to `/search`).
  - Each landing section is a self-contained server component doing its
    own `unstable_cache` read; `page.tsx` is pure composition and `/`
    stays `○ Static, Revalidate 5m`.
  - **GOTCHA:** `unstable_cache` persists across builds in `.next/cache`
    keyed only on its keyParts, NOT the target DB. Switching the build's
    Supabase target (live → local) without `rm -rf .next` serves STALE
    cross-environment data in the static prerender. CI unaffected (fresh
    checkout).
  - **next/image + unconfigured host:** seed uses `seed.local` image URLs
    (not in remotePatterns). Does NOT crash the prerender — next/image
    only rejects the host at the browser's `/_next/image` request, so the
    page renders (broken img) and E2E passes. Real images come from
    Supabase Storage / Just Kraft CDN (both allowed).
