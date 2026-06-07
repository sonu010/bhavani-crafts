# Architecture overview

A 5-minute mental model of the Bhavani Crafts rebuild. Read this before any task that touches application architecture.

> **Phase 0 + Phase 1 + Phase 1.5 are complete** as of 2026-05-16. Schema is live, data layer is typed + tested, CI is green. See `progress.md` for the current snapshot.

## What we are building

A Hyderabad-based craft supplies retailer's e-commerce site. Three audiences:

1. **Public visitors** — browse the catalog, search, filter, add to cart. No accounts in MVP.
2. **The owner (admin)** — one non-technical person manages 8.5k+ growing products: add/edit/delete, bulk-import, manage images, organize categories. Most stakes here.
3. **Future audiences (out of MVP)** — paying customers (checkout/payments), staff editors (sub-admin roles), creators (community feed).

## Stack at a glance

```
┌──────────────────────────────────────────────────────────────┐
│                       Browser (mobile-first)                  │
│  Next.js 15+ App Router · React 19 · Tailwind v4 · shadcn/ui  │
│  Zustand (cart) · TanStack Query (admin only)                 │
└────────────────────┬─────────────────────────────────────────┘
                     │ Server Actions + Route Handlers
┌────────────────────▼─────────────────────────────────────────┐
│                    Next.js Server (Vercel)                    │
│  Storefront: ISR + tag-based revalidation                     │
│  Admin: dynamic, server-rendered, gated by middleware + authz │
│  Edge middleware: rate limit + admin route gate               │
└────────────────────┬─────────────────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────────────────┐
│                          Supabase                             │
│  Postgres (RLS, FTS, pg_trgm) · Auth · Storage · Edge Funcs   │
└──────────────────────────────────────────────────────────────┘
                     │
            ┌────────┴───────┬─────────────┐
            ▼                ▼             ▼
       Anthropic API      Sentry        Plausible / Vercel
       (deferred)        (errors)       (analytics)
                          │
                          ▼
                  GitHub Actions
                  (long-running jobs, nightly backups)
```

## Why this shape

- **One backend (Supabase)** — Postgres + Auth + Storage + Edge Functions in one managed service. See [ADR-001](../decisions/ADR-001-supabase-over-neon-prisma.md) and [ADR-009](../decisions/ADR-009-custom-supabase-over-medusa.md).
- **Next.js App Router** — Server Actions give us typed mutations; ISR + tag revalidation give us a fast storefront that updates on admin writes.
- **Postgres FTS + pg_trgm** — handles search up to ~100k products without an external service. See [search.md](search.md) and [ADR-004](../decisions/ADR-004-postgres-fts-no-meilisearch.md).
- **No client-side calls to the database** — every mutation goes through a Server Action that does its own server-side authz check. RLS is the second line of defense, not the only one. See [security.md](security.md).
- **Long-running work is chunked** — Vercel/Edge function timeouts are tight; bulk publish, CSV import, image rehost all run as `background_jobs` with checkpointing. Jobs > 5 min run on GitHub Actions, not Edge Functions. See [background-jobs.md](background-jobs.md).

## Rendering strategy per route family

| Routes | Strategy | Cache key | Notes |
|---|---|---|---|
| `/` | ISR, revalidate 60s + tag `products`, `categories` | global | Sections fetched in parallel server-side. |
| `/c/<slug>` | ISR, revalidate 60s + tag `products`, `category:<slug>` | per slug + filter querystring | Filters and pagination use server-side params. |
| `/p/<slug>` | ISR per slug, tag `product:<slug>` | per slug | JSON-LD structured data inline. |
| `/search?q=` | Dynamic (uncached) | — | Server-rendered; deduped via React cache. |
| `/admin/*` | Dynamic, server-rendered, no cache | — | Auth required. Service-role key only in `lib/db/admin.ts`. |

After any admin mutation, the relevant `revalidateTag()` and/or `revalidatePath()` calls run inside the same Server Action. See [caching-and-revalidation.md](caching-and-revalidation.md).

## Data shape

A short version of the schema. The full thing is in [database-schema.md](database-schema.md).

- `profiles(id, role, full_name)` — joined to `auth.users` 1:1, source of admin roles.
- `categories(id, slug, name, parent_id, ...)` — self-referential tree, globally unique slugs.
- `products(id, sku, slug, name, base_price_inr, stock_status, category_id, is_published, review_status, source, ...)` — the catalog.
- `product_images(product_id, url, storage_path, license_status, source, ...)` — ordered images per product.
- `product_variants(...)` + `product_options` + `product_option_values` + `variant_option_values` — purchasable forms.
- `attribute_definitions` + `product_attributes` — faceted filtering per category.
- `tags` + `product_tags` — free-form keywords.
- Ops: `audit_logs`, `background_jobs`, `job_events`, `import_runs`, `import_run_rows`, `search_synonyms`, `search_logs`, `ai_generations`.
- `orders(id, order_number, status, customer_*, shipping_*, subtotal_inr, total_inr, razorpay_*, created_at, paid_at, ...)` + `order_items(order_id, product_id, variant_id, sku, name, unit_price_inr, quantity, line_total_inr, ...)` — Razorpay-backed checkout. Prices + names are snapshotted on `order_items` so historical orders are immutable when the catalog changes. See [ADR-011](../decisions/ADR-011-razorpay-payments.md).

All tables have RLS enabled. Child catalog tables join back to the parent product's `is_published` and `deleted_at` in their public-select policies, so unpublished/deleted products can't leak children to anon clients. Orders contain PII — anon can INSERT a pending order, never SELECT; admin reads all. See [security.md](security.md) §RLS.

## What's deliberately not in MVP

- ~~Checkout, payments (Razorpay), orders~~ — **reversed 2026-05-18** by the owner; now in scope. See [ADR-011](../decisions/ADR-011-razorpay-payments.md) for the scope boundary (no refunds in-app, no subscriptions, no saved cards, no customer accounts).
- **AI assists in the admin** (category/tag/alt-text/description suggest, duplicate detect, CSV cleanup helper, search synonym mining) — **deferred 2026-06-07** by the owner. To be revisited after Phase 5 or in a later month as a potential paid add-on; the admin handles all those tasks manually for launch. Phase 4 task files stay parked under `tasks/phase-4-ai-and-polish/` with status ⏸️; see [plans.md](../plans.md) §"Phase 4". Anthropic API env var stays in `.env.example` as a placeholder.
- Fulfillment, shipping calculation, tax computation, invoices — still out. Shipping is a flat-rate constant at checkout; tax is owner-below-GST-threshold for now.
- Customer accounts, sign-up, wishlist — still out. Orders capture name/phone/email per-order; no `customers` table.
- Creator community / feed / project showcase (designed in `extracted_ideas/` but deferred).
- Recommendations, personalization, WhatsApp shopping bot.
- Multi-region, multi-currency, multi-warehouse.

We keep schema shapes Medusa-compatible (variant has own SKU/price/stock; options are separate) so a future migration is a column-rename, not a re-architecture. See [ADR-009](../decisions/ADR-009-custom-supabase-over-medusa.md).

## Where to go next

- For schema details → [database-schema.md](database-schema.md)
- For design / colors / fonts → [design-system.md](design-system.md)
- For auth flow → [auth-and-roles.md](auth-and-roles.md)
- For how the storefront stays fresh → [caching-and-revalidation.md](caching-and-revalidation.md)
- For search / filter mechanics → [search.md](search.md)
- For image upload → [image-pipeline.md](image-pipeline.md)
- For bulk jobs → [background-jobs.md](background-jobs.md)
- For Sentry / analytics / audit log → [observability.md](observability.md)
- For RLS / rate limit / CSP → [security.md](security.md)
- For AI rules (development + product features) → [ai-workflow.md](ai-workflow.md)
