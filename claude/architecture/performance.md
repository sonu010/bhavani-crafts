# Performance

How we keep the storefront and admin fast. This is the cross-phase
reference; the per-task acceptance criteria (especially P3-T23) and
[caching-and-revalidation.md](caching-and-revalidation.md) enforce it.

Written after the pre-Phase-3 system-design review (2026-05-18).

## The one idea: two systems, opposite levers

The app is two systems with opposite performance profiles. Optimise
each for its own nature; don't apply one's playbook to the other.

| | Storefront (public) | Admin (authenticated) |
|---|---|---|
| Per-user state | none | yes (session, role) |
| Data freshness need | seconds–minutes | live |
| Dominant cost | — (cache hits are ~free) | auth round-trips |
| Primary lever | **cache aggressively** | **cut fixed per-request overhead** |

### Storefront — cache, and a hit is effectively free

Public pages have no per-user state, so they can be cached and served
from Vercel's edge. A cache hit is < 50ms regardless of how slow the
DB or auth is. That is the entire "no lag browsing" guarantee.

The contract (enforced as P3 acceptance criteria):

- **Cached, never `force-dynamic`.** The only dynamic branch in all of
  Phase 3 is the PDP `?preview=<token>` path (P3-T13), read uncached +
  token-gated.
- **ISR + tags, both.** Each catalog page sets `export const
  revalidate = <N>` (a static-fast baseline) AND wraps its reads in
  `unstable_cache(fn, keyParts, { tags })`. ISR keeps it fast; the
  tags keep it fresh — admin mutations call `updateTag('products' |
  'categories' | 'product:'+slug | 'homepage' | 'featured')` (see
  caching-and-revalidation.md) and flush the matching pages on demand.
  Without the tag subscription, edits never propagate; without ISR,
  every cold cache pays full TTFB.
- **Minimal client JS.** Storefront is server components. The only
  client islands are the cart store, search box, gallery, and variant
  selector. No accidental `"use client"` on a big server tree.
- **Images.** next/image with `blur_data_url` placeholders; LCP image
  (hero, first PDP gallery image) gets `priority` + correct `sizes`;
  everything below the fold is lazy. The 4:5 ProductCard reserves
  aspect ratio so images never cause layout shift.

### Admin — the bottleneck is auth, not queries

Admin data is live + per-user, so it can't be cached. The measured
cost (from the `[perf]` instrumentation) was never the queries — it
was the auth round-trips.

- **Proxy verifies the JWT locally.** `proxy.ts` uses
  `supabase.auth.getClaims()` (WebCrypto signature check against the
  cached JWKS — this project uses ES256 asymmetric keys, so no network
  call) instead of `getUser()`. It returns both `sub` and `aal` in one
  local op, replacing the former two network calls (`getUser` +
  `getAuthenticatorAssuranceLevel`). This stays the *cheap* gate;
  `requireRole()` / `requireAAL2()` in the data layer remain the
  authoritative check (they call `getUser()` + re-verify role), so a
  revoked-but-unexpired token still can't do work. See
  auth-and-roles.md §"Three layers of authorization".
- **Queries are already in shape — don't re-tune speculatively.**
  Counts go through SQL aggregation RPCs (`products_status_counts`,
  `tag_product_counts`, `attribute_value_counts`); lists use keyset
  (cursor) pagination, never OFFSET; the hot filter/sort columns are
  indexed (migrations 0008, 0012, 0013). The thumbnail-embed N+1 and
  the `product_tags` 1000-row-cap count bug were already fixed.
- **Per-request dedup.** `createServerClient`, `getCurrentProfile`,
  and `requireAAL2` are wrapped in React's `cache()` so a layout + its
  page share auth round-trips within one render pass.

## Budgets

Measured in **production mode** (`pnpm build && pnpm start`) or a
preview deploy — NEVER `pnpm dev`. Turbopack cold-compile inflates
dev first-hits to multiple seconds; those numbers are meaningless.

| Surface | Budget |
|---|---|
| Storefront cached route TTFB | < 200ms (warm cache) |
| Storefront LCP (mobile) | < 2.5s |
| Storefront CLS | < 0.1 |
| Lighthouse mobile (`/`, `/c/[slug]`, `/p/[slug]`) | Perf ≥ 90, A11y ≥ 95, Best Practices ≥ 95, SEO ≥ 95 |
| Admin nav p75 | < 800ms |

## Measurement ritual

The `[perf]` helper (`web/src/lib/perf.ts`) already logs
`[perf] <route> total=… auth=… queries=…` for any request ≥ 200ms,
to the dev terminal + Vercel function logs.

1. `pnpm build && pnpm start`.
2. Hit each route twice; read the `[perf]` line on the **second** hit
   (warm cache).
3. Lighthouse (mobile) on the three storefront routes.
4. `grep -rn "force-dynamic" web/src/app/(storefront)` → expect only
   the PDP preview exception.
5. Edit a product in admin → reload its `/p/<slug>` → confirm the
   change appears (tag revalidation working).

## What we deliberately do NOT do

At this scale (single region, ~6K products, internal admin) these add
effort without payoff:

- **No Redis / external cache.** Vercel's data cache + `unstable_cache`
  is enough.
- **No data-layer rewrite.** It's already DI (ADR-010), indexed, and
  keyset-paginated.
- **No client-side data fetching on the storefront** (no TanStack
  Query). Server components + cache is simpler and faster. TanStack is
  admin-only (overview.md).
- **No premature query tuning.** Add an index when a real query is
  measured slow in prod, not on a hunch.

## Region

Supabase `ap-south-1` + Vercel `bom1` — same region, low RTT. Nothing
to do.
