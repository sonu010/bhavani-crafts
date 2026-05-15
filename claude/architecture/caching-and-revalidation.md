# Caching and revalidation

The storefront feels fast because it's mostly static. It feels live because every admin mutation invalidates the right caches deterministically.

## Layers

1. **Browser cache** — `Cache-Control` on static assets, `next/font` self-hosting, `next/image` with explicit sizes.
2. **Vercel Edge CDN** — caches the HTML of ISR pages until the next revalidation.
3. **Next.js Data Cache** — `fetch(..., { next: { revalidate: 60, tags: [...] } })`. Revalidated by time AND by tag.
4. **Postgres query plan cache** — Supabase's connection pooler reuses prepared statements; indexes do the rest.

## Rendering strategy per route

| Route | Strategy | `revalidate` | Tags |
|---|---|---|---|
| `/` | ISR (`force-static` + revalidate) | 60s | `products`, `categories`, `featured` |
| `/c/<slug>` | ISR | 60s | `products`, `category:<slug>` |
| `/p/<slug>` | ISR | 60s | `product:<slug>` |
| `/search` | Dynamic | — | none |
| `/admin/*` | Dynamic (`force-dynamic`) | — | none |
| `/api/*` | Dynamic | — | none |

## Mutation → revalidation map

Every server action that mutates state ends with calls to `revalidateTag()` / `revalidatePath()`. The table below is **mandatory** — if a server action mutates the catalog without calling the right invalidations, the storefront serves stale data and a review reviewer flags the PR.

| Mutation | Revalidations |
|---|---|
| Create / update / delete product | `revalidateTag('products')`; `revalidatePath('/p/' + oldSlug)`; if slug changed → `revalidatePath('/p/' + newSlug)`; `revalidatePath('/c/' + categorySlug)`; if `is_featured` toggled → `revalidatePath('/')` |
| Toggle `is_published` / `review_status='published'` | same as above |
| Bulk publish / unpublish | `revalidateTag('products')`; `revalidateTag('categories')` |
| Reorder / upload / delete image | `revalidatePath('/p/' + slug)`; `revalidateTag('product:' + slug)` |
| Update attributes / variants | `revalidatePath('/p/' + slug)` |
| Create / update / soft-delete category | `revalidateTag('categories')`; `revalidatePath('/c/' + oldSlug)`; if slug changed → `revalidatePath('/c/' + newSlug)`; `revalidatePath('/')` (if it's a top-level category shown in the Atlas) |
| Update homepage content settings (Phase 4) | `revalidatePath('/')`; `revalidateTag('homepage')` |

## How fetches participate

In server components and data-layer functions:

```ts
// web/src/lib/db/products.ts
import { unstable_cache } from 'next/cache';

export const listFeaturedProducts = unstable_cache(
  async () => {
    const supabase = createServerClient();
    return supabase
      .from('products')
      .select('id, name, slug, base_price_inr, product_images(url, alt)')
      .eq('is_published', true)
      .eq('is_featured', true)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(8);
  },
  ['featured-products'],
  { tags: ['products', 'featured'], revalidate: 60 }
);
```

The pattern: every read that's cached lives behind `unstable_cache` (or `fetch` with the same options) with explicit tags + revalidate. Tags match the mutation table above.

## On-demand revalidation guardrails

- Server actions call `revalidateTag` / `revalidatePath` **after** the DB commit, not before. Otherwise we invalidate against the old state and the next request re-caches the stale read.
- All revalidation calls are at the end of the action, after the `await supabase.from(...).upsert(...)` resolves.
- Background jobs (bulk publish, CSV import) call revalidation **after each chunk**, not just at the end — otherwise the storefront stays stale for the whole job duration. Cost is acceptable: tag invalidation is cheap.

## What we deliberately don't cache

- `/admin/*` — never cached at all. Owner needs to see writes immediately.
- `/search?q=` — uncached at the page level. Postgres FTS is fast enough; caching by `q` would balloon. We cache *inside* the request via React's `cache()` to dedupe within the same render.
- `auth.getSession()` — never cached; calls Supabase auth every request.

## When changing this map

If you add a new mutation or a new public route, update the table above **in the same PR** as the code change. Anyone reading this file should be able to predict what gets invalidated when.
