# ADR-008 — ISR + tag-based revalidation for storefront

**Status:** Accepted · **Date:** 2026-05-15

## Context

Storefront has high read volume (8k+ products, many category pages, many product pages) and low write volume (admin edits a few per day). The owner expects edits to appear publicly within ~5 seconds of saving. Options:

- **A:** Static export — fastest reads, slowest write→read latency (full rebuild on every change).
- **B:** Server-rendered on every request — freshest, slowest reads, highest cost.
- **C:** ISR with tag-based revalidation — static reads with on-demand invalidation.

## Decision

**C — ISR with tag-based revalidation.**

- Storefront pages cache with `revalidate: 60` and tags like `products`, `categories`, `category:<slug>`, `product:<slug>`.
- Every admin server action that mutates the catalog ends with the right `revalidateTag()` and `revalidatePath()` calls (see [caching-and-revalidation.md](../architecture/caching-and-revalidation.md)).
- Background jobs (bulk publish, CSV import) revalidate **after each chunk**, not just at the end.

## Consequences

**Positive:**
- Storefront pages are CDN-cached at the edge → near-instant TTFB for repeat visitors.
- Admin edits appear publicly within ~5 seconds without a full rebuild.
- Vercel handles the cache mechanics; no separate CDN config.

**Negative:**
- Every mutation must call the right revalidations. Forgetting one means stale data. We mitigate with a mandatory mutation-to-revalidation table in the architecture doc, enforced via code review.
- 60-second background revalidation means worst-case 60s of stale data even without admin action. Acceptable.

## Cache key strategy

- Page-level cache key = route + querystring. Pagination/filter querystrings each cache separately.
- Data Cache key for `fetch` / `unstable_cache` = explicit `tags`. Tags are short, semantic, and shared across pages.

## Revisit trigger

If revalidation calls become unreliable in practice (we see stale data we can't explain), consider moving to ETag-based revalidation or a tag-revalidation reliability layer.
