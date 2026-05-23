---
id: P2-T22
phase: 2
title: Attribute definitions admin
status: done
depends_on: [P2-T05]
estimate_hours: 3
owner: ai
last_updated: 2026-05-18
---

# Goal

After this task, `/admin/attributes` lists every `attribute_definitions` row and supports create / edit / soft-delete. Each attribute has: slug, name, type (text / number / boolean / select), unit, applies_to_category_id (null = global), options_json (for select-type), is_filterable, sort_order. Delete is blocked if `product_attributes` rows still reference the definition (preserves the values entered by P2-T13).

# Prerequisites (read first)

- [claude/architecture/database-schema.md](../../architecture/database-schema.md) §"attribute_definitions, product_attributes"
- [`web/supabase/migrations/0002_attributes.sql`](../../../web/supabase/migrations/0002_attributes.sql) — table shape; 7 seeded attributes (resin volume / paper gsm / wood thickness / paint ml / etc.)
- [P2-T13](P2-T13-product-editor-attributes.md) — the consumer of these definitions
- [P2-T05](P2-T05-admin-shell-layout.md) — shell

# Files to touch

- `web/src/app/admin/attributes/page.tsx` (new) — server component. Table of all definitions grouped by `applies_to_category_id`.
- `web/src/app/admin/attributes/attributes-table.tsx` (new) — client; per-row actions
- `web/src/app/admin/attributes/[id]/edit/page.tsx` (new) — edit form
- `web/src/app/admin/attributes/new/page.tsx` (new) — create form (reuses `<AttributeForm>`)
- `web/src/app/admin/attributes/attribute-form.tsx` (new) — react-hook-form + Zod; conditional fields based on `type`
- `web/src/app/admin/attributes/actions.ts` (new) — `createAttribute`, `updateAttribute`, `softDeleteAttribute`
- `web/src/lib/db/admin/attributes.ts` (new — extends `lib/db/attributes.ts`)
- `web/src/lib/schemas/attribute.ts` (new) — Zod schema; `options_json` only required when `type === 'select'`
- `web/__tests__/db/admin/attributes.test.ts` (new)

# Implementation notes

**Form fields:**

| Field | Type | Notes |
|---|---|---|
| slug | text | regex `^[a-z0-9][a-z0-9-]{0,79}$`; auto-derived; unique |
| name | text | 1–80 chars |
| type | enum select | `text` / `number` / `boolean` / `select` |
| unit | text optional | e.g. "ml", "gsm", "mm"; only shown when type=number |
| applies_to_category_id | UUID nullable | combobox over categories; null = global |
| options_json | JSON | only required + shown when type=select; render as tag-input (one option per line or chips) |
| is_filterable | bool | default true |
| sort_order | integer | default 0 |

**`options_json` editor.** For `type=select`, render a chips input: each option is a chip; backspace deletes; Enter adds. Stored as a JSON array of strings: `["matte", "glossy", "satin"]`. Reorder via dnd-kit (optional; keep flat for MVP — order = insertion order).

**Type change after creation.** If an attribute already has `product_attributes` values, changing the type is destructive. **Block the type change** if existing values exist; show "X products have values for this attribute. Cannot change type. Delete those values first (in product editors) or create a new attribute."

**Soft delete blocked if referenced.** `softDeleteAttribute` first checks `SELECT count(*) FROM product_attributes WHERE attribute_id = $1`. If > 0, throw `{ error: 'in_use', count }`. Surface in UI as: "This attribute is used by N products. Remove the values first, then delete."

**Audit log.** `attribute.create`, `attribute.update`, `attribute.soft_delete`.

**Revalidation.** Affects which attributes appear in product editor's Attributes tab (P2-T13) + storefront faceted filter. `revalidateTag('attributes')` (a new tag — extend the caching map in `caching-and-revalidation.md` to include `attributes`; cite this task in that doc's history).

**Storefront filterable.** `is_filterable=true` attributes appear as faceted filters on storefront category pages (Phase 3). Toggle here propagates via revalidation.

# Acceptance criteria

- [ ] `/admin/attributes` lists all definitions grouped by category (with "Global" group for null).
- [ ] Create form: type-dependent fields render correctly (unit appears for number, options_json appears for select).
- [ ] Edit blocks type change if values exist; surfaces the count.
- [ ] Soft delete blocks if `product_attributes` rows reference it; surfaces count.
- [ ] Successful soft delete: definition no longer appears in product editor (P2-T13).
- [ ] Slug uniqueness enforced.
- [ ] Audit logs written; revalidation called.
- [ ] `caching-and-revalidation.md` updated with the new `attributes` tag.
- [ ] `pnpm tsc --noEmit`, `pnpm lint`, `pnpm build`, `pnpm exec vitest run __tests__/db/admin/attributes.test.ts` green.

# Verification

```bash
cd web
pnpm exec vitest run __tests__/db/admin/attributes.test.ts
pnpm dev &
sleep 4
# /admin/attributes → all 7 seeded attributes visible
# Create "Finish" with type=select, options=["matte","glossy"] → appears in editor for products in the relevant category
# Try to delete "Resin volume" with active values → blocked
```

# Dependencies added

None.

# Notes for next agent

  - **Hard-delete, not soft-delete.** `attribute_definitions` has no
    `deleted_at` column in 0002 — the spec assumed one. Did not add a
    migration; delete is permanent and gated by a reference guard
    (`in_use` error with the referenced product-value count). The
    Trash view (T28) skips attributes for the same reason.

  - **Type-change guard.** Editing the `type` is blocked once any
    `product_attributes` row exists. The form disables the field with
    a hint pointing at the value count; the server enforces too
    (`type_change_blocked` error). Owner must clear all values via the
    product editor before changing the type.

  - **Options schema mirrors DB CHECK.** Zod `superRefine` enforces
    that `type='select'` carries a non-empty `options_json` array AND
    that other types do NOT carry one. Duplicates within options are
    rejected before round-tripping. The DB has the same CHECK so a
    leaked invalid payload would fail at insert, but the typed error
    is nicer.

  - **`attributes` is a new cache tag.** Server actions
    `updateTag("attributes")` + `updateTag("products")`. The
    storefront facet code in Phase 3 should also `await unstable_cache(
    ..., { tags: ["attributes"] })` for its definitions read so this
    tag actually flushes anything. Until then it's a no-op marker.

  - **No DnD for options.** Order is insertion order; click × to
    remove. dnd-kit reorder for options can land if we ever need it
    (the storage column is a plain array, no schema change required).

  - **13 tests.** Cover create (text + select happy, validation
    failures, slug collision, missing-category), update (rename +
    type-change block when values exist), delete (happy + in_use
    block + not_found), and list-with-counts.

  - **List uses paginated product_attributes read** — same
    `range(offset, offset+999)` loop tags introduced, since
    product_attributes is on the same ~8K-row scale.
