---
id: P2-T14
phase: 2
title: Product editor — variants
status: not_started
depends_on: [P2-T11]
estimate_hours: 4
owner: ai
last_updated: 2026-05-17
---

# Goal

After this task, the Variants tab of the product editor manages `product_options` (e.g., "Size", "Color"), `product_option_values` (e.g., "Small/Medium/Large"; "Red/Blue"), and the Cartesian-product `product_variants` rows. Owner can add/remove options, add/remove values, and then generate-all or hand-edit the variant matrix. Each variant has its own SKU, price, compare_at_price, stock_status, stock_quantity, is_default. Default-variant constraint is enforced (exactly one default if any variants exist).

# Prerequisites (read first)

- [claude/architecture/database-schema.md](../../architecture/database-schema.md) §"Variants model" — `product_options`, `product_option_values`, `product_variants`, `variant_option_values`. Composite PK on `variant_option_values`.
- [`web/src/lib/db/variants.ts`](../../../web/src/lib/db/variants.ts) — `listVariantsForProduct(supabase, productId)` already exists
- [P2-T11](P2-T11-product-editor-basic-fields.md) — save action pattern + audit log shape
- [`web/supabase/migrations/0003_variants_images_tags.sql`](../../../web/supabase/migrations/0003_variants_images_tags.sql) — table definitions

# Files to touch

- `web/src/app/admin/products/[id]/edit/_tabs/variants.tsx` (modified) — client; renders `<OptionsEditor>` + `<VariantsTable>`
- `web/src/app/admin/products/[id]/edit/_variants/options-editor.tsx` (new) — add/remove options + values; sort_order via dnd-kit (lightweight; same lib P2-T16 uses for images)
- `web/src/app/admin/products/[id]/edit/_variants/variants-table.tsx` (new) — one row per existing variant; columns: option-value combo (read-only), SKU, price, stock_status, stock_quantity, is_default, actions (soft-delete)
- `web/src/app/admin/products/[id]/edit/_variants/generate-button.tsx` (new) — "Generate all variants" creates the Cartesian product
- `web/src/app/admin/products/[id]/edit/actions.ts` (modified) — `saveProductOptions(id, options)`, `saveProductVariants(id, variants)`, `softDeleteVariant(variantId)`, `setDefaultVariant(variantId)`
- `web/src/lib/db/admin/variants.ts` (new) — `setProductOptions(supabase, productId, options)`, `setProductVariants(supabase, productId, variants)`, `softDeleteVariant(supabase, id)`, `enforceSingleDefault(supabase, productId, defaultVariantId)`
- `web/__tests__/db/admin/variants.test.ts` (new)

# Implementation notes

**Three-layer model (locked from schema).** A product has 0–N **options** (e.g., "Size"). Each option has 1–N **values** (e.g., "Small", "Medium", "Large"). Each **variant** is a unique combination of one value per option (via `variant_option_values` join). Variants carry the purchasable attributes (SKU, price, stock).

**No variants is fine.** Many products are single-SKU; the variants tab handles "no options defined" with a "This product has no variants. Add options below to create variants." empty state.

**Adding/removing options.** Removing an option deletes (soft) its `product_option_values` (CASCADE-equivalent at the application layer; check the migration for actual CASCADE behavior — if hard FK CASCADE, the soft-delete contract is broken; flag for revisit). Removing a value with active variants requires a confirm — those variants will become invalid (the join row gone). For MVP, just block: if any active variant references the value, the delete fails with "X variants depend on this value; remove them first."

**Generate-all flow.** Given existing options + values, "Generate all variants" creates the Cartesian product of option-value combinations and inserts variants where the combo doesn't already exist. Existing variants are untouched. New variants get: SKU = `<product.sku>-<value1>-<value2>` (slug-cased), price = product.base_price_inr, stock_status = `unknown`, stock_quantity = NULL, is_default = first variant if no current default. Owner can edit any of these.

**Default-variant constraint.** Exactly one variant has `is_default = true` if any variants exist. Enforced server-side via `setDefaultVariant`: a single SQL transaction `UPDATE product_variants SET is_default = false WHERE product_id = $1 AND id != $2; UPDATE product_variants SET is_default = true WHERE id = $2;`. The DB doesn't currently enforce this — flag for a follow-up partial-unique index `CREATE UNIQUE INDEX ON product_variants (product_id) WHERE is_default = true AND deleted_at IS NULL;`. **If that index isn't present in migrations 0001–0007, add it in a new 0008 migration scoped to this task — validate via pglite first.**

**SKU uniqueness.** Variant SKUs share the `products.sku` unique namespace? Check migration 0003 — likely a separate unique index on `product_variants.sku`. Server validates and surfaces collision as a field error.

**Audit log granularity.**
- `product.set_options` — one row per save of the options/values structure
- `product.create_variant`, `product.update_variant`, `product.soft_delete_variant`, `product.set_default_variant` — one row each

**Revalidation.** Variants affect PDP rendering and the option pickers there. `revalidatePath('/p/' + slug)` after each variant mutation.

**Soft delete only.** `softDeleteVariant` sets `deleted_at`. Variants in Trash (P2-T28) can be restored. Storefront filters via the RLS policy that joins back to parent + checks `variants.deleted_at IS NULL`.

# Acceptance criteria

- [ ] Variants tab lists existing options + values + variants.
- [ ] Add an option ("Size"), add three values ("S","M","L"), click "Generate all variants" → three rows appear with `<sku>-s`, `<sku>-m`, `<sku>-l` SKUs.
- [ ] Add a second option ("Color") with two values → "Generate all variants" creates the missing 6 = 3×2 - 3 already-present.
- [ ] Edit a variant's price → save → `product.update_variant` audit log.
- [ ] Soft-delete a variant → `deleted_at` set; row hidden from table but visible in Trash.
- [ ] Set is_default on a different variant → only one variant has `is_default = true` (verified by integration test).
- [ ] Removing an option-value with active variants is blocked with a clear error.
- [ ] If migration 0008 (partial unique index for is_default) was needed: `pnpm validate:migrations` green; smoke block asserts the constraint.
- [ ] `pnpm tsc --noEmit`, `pnpm lint`, `pnpm build` green. `pnpm exec vitest run __tests__/db/admin/variants.test.ts` green.

# Verification

```bash
cd web
pnpm validate:migrations    # if 0008 added
pnpm exec vitest run __tests__/db/admin/variants.test.ts
pnpm dev &
sleep 4
# Editor → Variants tab → walk through the add/generate/edit/delete flow
```

# Dependencies added

`@dnd-kit/core` + `@dnd-kit/sortable` (also used by P2-T16) — if not already installed.

# Notes for next agent

(empty)
