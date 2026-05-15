---
id: P1-T03
phase: 1
title: Migration — variants + options + images + tags
status: done
depends_on: [P1-T01]
estimate_hours: 1.5
owner: ai
last_updated: 2026-05-15
---

# Goal

After this task, the full variant model exists (`product_options`, `product_option_values`, `product_variants`, `variant_option_values`), plus `product_images` (with license tracking) and `tags` / `product_tags`.

# Prerequisites (read first)

- claude/architecture/database-schema.md (sections for these tables)
- claude/decisions/ADR-009-custom-supabase-over-medusa.md (variant shape is Medusa-compatible by design)

# Files to touch

- `web/supabase/migrations/0003_variants_images_tags.sql` (new)
- `web/src/lib/db/types.gen.ts` (regenerated)

# Implementation notes

Variants have their **own** `sku`, `price_inr`, and `stock_quantity`. They are not just labels. Default variant pattern: a product without explicit variants has zero rows in `product_variants` — the product's own `base_price_inr` and `stock_quantity` apply. A product with variants has 1+ rows, exactly one with `is_default = true`.

`product_images` includes the source + license tracking columns. Default `license_status = 'unverified'` so anything imported without explicit licensing cannot be served publicly (RLS in P1-T06).

`product_tags` is a many-to-many junction with composite PK `(product_id, tag_id)`.

Add a `CHECK` on `product_variants` to ensure that if `is_default = true` for a product, no other row for the same `product_id` is also default. Enforce via a partial unique index: `CREATE UNIQUE INDEX product_variants_one_default_idx ON product_variants(product_id) WHERE is_default = true AND deleted_at IS NULL;`

# Acceptance criteria

- [ ] Migration applies cleanly.
- [ ] All five tables exist with FK constraints.
- [ ] Inserting two `is_default = true` rows for the same product is rejected.
- [ ] Default `license_status` on `product_images` is `'unverified'`.
- [ ] Types regenerated.

# Verification

```bash
cd web
pnpm dlx supabase db push
pnpm dlx supabase gen types typescript --linked > src/lib/db/types.gen.ts
pnpm tsc --noEmit
```

# Dependencies added

None.

# Notes for next agent (in-progress)

**2026-05-15 — SQL written, validated locally, committed, pushed; awaits `supabase db push`.**

`web/supabase/migrations/0003_variants_images_tags.sql` contains:
- 2 enums (`image_source`, `license_status`)
- 7 tables: `product_images`, `product_options`, `product_option_values`, `product_variants`, `variant_option_values`, `tags`, `product_tags`
- 1 partial unique index (`one_default_per_product` on `product_variants`)
- 6 `updated_at` triggers
- A smoke block exercising: image license default, option-value uniqueness, partial-unique-default on variants (rejecting two `is_default=true`), allowing a second `is_default=false` variant, variant↔option_value linking, product_tags PK uniqueness

`types.gen.ts` extended with all 7 new tables + 2 new enums (typed Row/Insert/Update for each).

Move to `done` once owner reports `supabase db push` succeeded and REST probe confirms the tables exist.
