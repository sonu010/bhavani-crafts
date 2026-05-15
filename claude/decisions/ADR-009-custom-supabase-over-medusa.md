# ADR-009 — Custom Supabase, not Medusa, for MVP

**Status:** Accepted · **Date:** 2026-05-15

## Context

Medusa.js is a headless commerce platform that ships product/variant/inventory/cart/order/promo/tax/shipping models out of the box plus an admin UI. On paper it covers ~70% of what we're building. The temptation to adopt it is real.

## Decision

**Stay custom Supabase + Next.js for MVP. Do not adopt Medusa.**

## Why not Medusa (MVP-specific reasons)

1. **Our MVP is intentionally narrow.** Catalog + admin CRUD + client-side cart. Medusa's value props (orders, payments, fulfillments, promotions, regions, tax engines) are exactly the surface area we explicitly scoped out of MVP. Adopting Medusa pays for a full e-commerce engine to use 20% of it.

2. **Indian-craft-supply catalog has unusual shape.** Per-category attribute facets (resin volume, paper GSM, wood thickness, paint ml), bulk-school orders, "price on request" SKUs, India-only payment rails (Razorpay/UPI), GST invoicing. Each is bendable in Medusa but native in a custom Postgres schema — we don't fight the framework.

3. **The owner is non-technical.** Medusa Admin is a generic SaaS UI optimized for engineers and PMs. Our admin is being designed for one Hyderabad shop owner managing 8.5k+ growing SKUs: bulk-publish queues, CSV import workflows, AI-assisted category/tag suggestions, owner-tone language. A custom admin **is** the product, not infrastructure.

4. **AI-assisted features are first-class** in our plan. Bolting them onto Medusa means writing the same code *plus* fighting Medusa's data model and lifecycle hooks. In our schema they're a table and a server action.

5. **Supabase gives us Postgres + Auth + Storage + Edge Functions + RLS in one** managed service. Medusa needs its own Postgres + Redis + a Node service to host the API + a separate admin app. Operational surface doubles.

6. **Lock-in cost.** Medusa's data model is opinionated. Starting custom keeps every option open.

## Consequences

**Positive:**
- We move faster on the parts that matter (admin UX, AI features, catalog facets).
- Less operational surface; one Supabase dashboard, one Vercel project.

**Negative:**
- When checkout/payments/orders/promotions land (Phase 5+), we write that code ourselves. If we don't manage scope there, we re-invent badly.
- Mitigated by keeping the schema Medusa-compatible (see "Portability" below).

## Portability (kept open for future migration)

- `products` / `product_variants` / `product_options` / `product_option_values` table names and column shapes deliberately mirror Medusa's vocabulary (variant has own `sku` + `price` + `stock_quantity`; options are a separate table; option values join to variants through a junction).
- All write paths go through server actions. Swapping the implementation to Medusa SDK calls is a one-place change.
- Categories are slug-based with self-referential parents — Medusa-compatible.
- Images are CDN-agnostic; Medusa's file plugin can take over without schema change.

**Rollback test:** if a revisit trigger fires (below), we should be able to migrate the catalog into a fresh Medusa instance in under 2 person-weeks, no data loss, no public-facing downtime. If our schema ever makes that test impossible, we've drifted — revisit the schema, not the framework choice.

## Revisit triggers (concrete)

- **Trigger A — orders complexity:** When we add checkout/payments and find ourselves writing > 1,500 LoC of order/fulfillment/shipping/tax logic. Medusa's order modules become worth the integration cost.
- **Trigger B — multi-region / multi-currency:** If Bhavani opens a second physical store outside India, or starts selling internationally with currency/tax/shipping zones, Medusa's region engine pays for itself.
- **Trigger C — promotions engine:** When discount rules become more than `compare_at_price` + a flat % code (e.g. tiered, BOGO, conditional, segment-aware), Medusa's promo module avoids reinventing it badly.
- **Trigger D — team grows past 1 developer:** Medusa's docs/community become a real asset for onboarding new engineers. For solo / AI-assisted builds, that's overhead.
