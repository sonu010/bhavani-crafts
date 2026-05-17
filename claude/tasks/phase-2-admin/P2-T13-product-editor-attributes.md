---
id: P2-T13
phase: 2
title: Product editor — attributes
status: not_started
depends_on: [P2-T11]
estimate_hours: 3
owner: ai
last_updated: 2026-05-17
---

# Goal

After this task, the Attributes tab of the product editor lists every `attribute_definition` applicable to the product's category (plus globally-applicable definitions where `applies_to_category_id IS NULL`) and lets the owner enter a value for each. Per-attribute input type is driven by `attribute_definitions.type`: text, number, boolean, select. Save writes one `product.set_attributes` audit log with the full before/after JSON; revalidates the storefront PDP.

# Prerequisites (read first)

- [claude/architecture/database-schema.md](../../architecture/database-schema.md) §"attribute_definitions, product_attributes" — table shapes, composite PK, type-discriminated value columns (`value_text` / `value_number` / `value_boolean`)
- [`web/src/lib/db/attributes.ts`](../../../web/src/lib/db/attributes.ts) — `listAttributesForCategory(supabase, categoryId)`, `getProductAttributes(supabase, productId)` already exist; reuse
- [P2-T11](P2-T11-product-editor-basic-fields.md) — save action pattern
- [P2-T22](P2-T22-attribute-definitions-admin.md) — CRUD on `attribute_definitions` itself (the admin defines the schema there; this tab consumes it)

# Files to touch

- `web/src/app/admin/products/[id]/edit/_tabs/attributes.tsx` (modified) — client. Server-component parent fetches applicable definitions + current values; client renders dynamic inputs.
- `web/src/app/admin/products/[id]/edit/_attrs/attribute-input.tsx` (new) — renders the right input for a given `attribute_type`: `<Input type="text">` for text, `<Input type="number">` with `unit` suffix for number, shadcn `Switch` for boolean, shadcn `Select` for select-type (uses `options_json`).
- `web/src/app/admin/products/[id]/edit/actions.ts` (modified) — add `saveProductAttributes(id, attributes)`.
- `web/src/lib/db/admin/products.ts` (modified) — `setProductAttributes(supabase, productId, attrs)` — same replace-semantics as `setProductTags`.
- `web/__tests__/db/admin/products-attributes.test.ts` (new)

# Implementation notes

**Applicable definitions = category attributes ∪ global attributes.** The query:

```sql
SELECT * FROM attribute_definitions
WHERE applies_to_category_id IS NULL
   OR applies_to_category_id = $categoryId
ORDER BY sort_order, slug;
```

If product has no category yet, only the global attributes show, with a helper text "Pick a category first to see category-specific attributes."

**Type-discriminated input rendering:**

| type | Input | Value column |
|---|---|---|
| `text` | shadcn `Input` | `value_text` |
| `number` | shadcn `Input type=number` with `unit` rendered as a suffix label | `value_number` |
| `boolean` | shadcn `Switch` | `value_boolean` |
| `select` | shadcn `Select` populated from `options_json` (JSON array of strings) | `value_text` (the chosen option string) |

Empty value = no row in `product_attributes` for that `(product_id, attribute_id)`. Don't write null-valued rows.

**Replace semantics.** `setProductAttributes(supabase, productId, attrs)`:
1. `SELECT attribute_id, value_text, value_number, value_boolean FROM product_attributes WHERE product_id = $1` — current
2. Diff: deletions, insertions, updates (changed value)
3. Apply in one transaction (or three statements; the volume is small)
4. One audit log entry: `product.set_attributes` with `before_json: oldMap`, `after_json: newMap`

**Validation.** Per-attribute:
- `text`: ≤ 500 chars
- `number`: numeric finite
- `boolean`: actual boolean
- `select`: value must be in `options_json`

Server re-validates. Reject the whole submission with field-level errors if any attribute fails.

**Filterable flag isn't enforced here.** The `is_filterable` column on the definition is used storefront-side (faceted filtering) and admin-side (P2-T08 filter generation), not in the editor.

**Revalidation.** `revalidatePath('/p/' + slug)` per the mutation map.

**Empty state.** If zero applicable definitions, render "No attributes defined for this category. [Manage attributes →](/admin/attributes)" — link to P2-T22.

# Acceptance criteria

- [ ] Attributes tab lists every applicable definition for the product's category + globals.
- [ ] Per-type input rendering: text/number/boolean/select.
- [ ] Number inputs show `unit` suffix when `unit` is set (e.g., "200 ml", "120 gsm").
- [ ] Select inputs populate from `options_json`.
- [ ] Clearing a value removes the `product_attributes` row.
- [ ] Save writes a `product.set_attributes` audit log with the full before/after attribute map.
- [ ] Server rejects out-of-range / wrong-type submissions with field-level errors.
- [ ] `revalidatePath('/p/' + slug)` called after save.
- [ ] Empty state links to `/admin/attributes`.
- [ ] `pnpm tsc --noEmit`, `pnpm lint`, `pnpm build` green. `pnpm exec vitest run __tests__/db/admin/products-attributes.test.ts` green.

# Verification

```bash
cd web
pnpm exec vitest run __tests__/db/admin/products-attributes.test.ts
pnpm dev &
sleep 4
# Open editor for a product in "Resin art" category
# 1. Attributes tab lists the seeded resin-volume + finish + cure-time attrs
# 2. Set value_number for "Resin volume" → save → audit_logs has product.set_attributes
# 3. Clear the value → save → row removed
# 4. Try setting an out-of-range select value → field-level error
```

# Dependencies added

None.

# Notes for next agent

(empty)
