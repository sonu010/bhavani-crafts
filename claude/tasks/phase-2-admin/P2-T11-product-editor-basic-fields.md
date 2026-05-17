---
id: P2-T11
phase: 2
title: Product editor — basic fields
status: not_started
depends_on: [P2-T10]
estimate_hours: 3
owner: ai
last_updated: 2026-05-17
---

# Goal

After this task, the General tab of the product editor renders + saves: name, slug (auto-derived from name, editable), SKU, short_description, description (markdown), base_price_inr, compare_at_price_inr, stock_status, stock_quantity, allow_backorder, min_order_qty, max_order_qty, meta_title, meta_description. All fields validated via Zod (reusing `lib/schemas/product.ts`) on both client and server. Save writes an `audit_logs` row, calls `revalidateTag` per the mutation map. Form uses react-hook-form; submit is a Next server action.

# Prerequisites (read first)

- [`web/src/lib/schemas/product.ts`](../../../web/src/lib/schemas/product.ts) — existing Zod schemas; reuse `ProductDetail` and derive a `ProductEditInput` from it
- [claude/architecture/database-schema.md](../../architecture/database-schema.md) §"products" — column constraints (slug regex, price check constraints, qty constraints)
- [claude/architecture/caching-and-revalidation.md](../../architecture/caching-and-revalidation.md) §"Mutation → revalidation map" — what to revalidate after update
- [claude/architecture/security.md](../../architecture/security.md) §"Markdown sanitization" — description is markdown, sanitized via `rehype-sanitize`
- [P2-T10](P2-T10-product-editor-shell.md) — the surrounding shell + dirty-guard

# Files to touch

- `web/src/app/admin/products/[id]/edit/_tabs/general.tsx` (modified) — client component. `useForm` with Zod resolver. Fields render via shadcn `Input`, `Textarea`, `Select`, `Switch`.
- `web/src/app/admin/products/[id]/edit/actions.ts` (new) — server action `saveProductGeneral(id, input)`. Calls `requireRole(supabase, 'admin')` + `requireAAL2(supabase)`. Updates via cookie-bound admin client (RLS-respecting). Writes audit log via service-role. Revalidates.
- `web/src/lib/schemas/product.ts` (modified) — add `ProductEditInput` schema (omit fields managed by other tabs: category_id, attributes, images, variants).
- `web/src/lib/db/admin/products.ts` (modified) — add `updateProductGeneral(supabase, id, patch)`.
- `web/src/components/ui/markdown-editor.tsx` (new) — thin wrapper around a textarea with a live preview pane (rendered via `react-markdown` + `rehype-sanitize`). No fancy WYSIWYG; the owner writes light markdown.
- `web/__tests__/db/admin/products-update.test.ts` (new)

# Implementation notes

**Field set (this tab only):**

| Field | Type | Constraint |
|---|---|---|
| name | text, required | 1–200 chars |
| slug | text, required | regex `^[a-z0-9][a-z0-9-]{0,79}$`; auto-derived from name on first edit, editable thereafter; unique check on save |
| sku | text, optional | unique if present; uppercase alphanumeric + `-`; renders in JetBrains Mono in the input |
| short_description | text, optional | ≤ 280 chars; helper text "Shows on product cards" |
| description | markdown | unlimited; markdown editor with live preview |
| base_price_inr | integer paise (or rupees?) | per [database-schema.md](../../architecture/database-schema.md), confirm units — the seed stores rupees as integers. Form input is rupees; conversion not needed if column is `bigint` storing rupees |
| compare_at_price_inr | integer | optional; if present must be > base_price_inr (DB check constraint) |
| stock_status | enum | `in_stock` / `low_stock` / `out_of_stock` / `made_to_order` / `unknown` |
| stock_quantity | integer | ≥ 0; only shown when stock_status is in_stock/low_stock |
| low_stock_threshold | integer | optional |
| allow_backorder | bool | default false |
| min_order_qty | integer | ≥ 1; default 1 |
| max_order_qty | integer | optional; if present must be ≥ min_order_qty |
| meta_title | text | optional; ≤ 60 chars; helper "SEO; defaults to product name" |
| meta_description | text | optional; ≤ 160 chars; helper "SEO" |

**Zod schema reuse.** Don't duplicate the `ProductDetail` schema. Derive:

```ts
// web/src/lib/schemas/product.ts
export const ProductEditInput = ProductDetail.pick({
  name: true, slug: true, sku: true,
  short_description: true, description: true,
  base_price_inr: true, compare_at_price_inr: true,
  stock_status: true, stock_quantity: true, low_stock_threshold: true,
  allow_backorder: true, min_order_qty: true, max_order_qty: true,
  meta_title: true, meta_description: true,
}).strict();
```

`.strict()` rejects unknown keys — important because category_id, attributes, images live in other tabs and shouldn't tunnel through this action.

**Slug auto-derive.** On name input, if the slug field is still the auto-derived value (or empty), update it via `slugify(name)`. Once the user edits slug manually, stop auto-deriving (track a `slugTouched` flag). `slugify`: `name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80)`.

**Server-side validation.** Zod again on the server. Don't trust the client's validation. Return `{ error: 'validation', details: ... }` on failure; the form renders inline errors.

**Audit log shape.**

```ts
await admin.from("audit_logs").insert({
  actor_id: userId,
  action: "product.update",
  entity_type: "product",
  entity_id: id,
  before_json: previousRow,           // SELECT before UPDATE
  after_json: newRow,                 // RETURNING after UPDATE
  request_id: requestId,
});
```

**Revalidation.** Per [caching-and-revalidation.md mutation map](../../architecture/caching-and-revalidation.md):
- `revalidateTag('products')`
- `revalidatePath('/p/' + oldSlug)`
- If slug changed → `revalidatePath('/p/' + newSlug)`
- `revalidatePath('/c/' + categorySlug)` — need to look up category slug from category_id

**Optimistic save UX.** Form has a sticky Save bar at the bottom of the editor that becomes active when `isDirty`. On submit: show inline spinner, on success → toast "Saved" via sonner, mark form clean. On error → toast "Save failed", keep dirty.

**Markdown sanitization.** Description is rendered storefront-side via `react-markdown` + `rehype-sanitize`. The editor preview uses the same sanitizer so the preview matches storefront output. Reject `<script>`, `<iframe>`, event handlers, `javascript:` URLs.

# Acceptance criteria

- [ ] General tab renders all 14 fields with the right input types.
- [ ] Slug auto-derives from name; manual edit takes precedence.
- [ ] Unique violations on slug or sku surface inline as field errors (not a global toast).
- [ ] Save action writes a `product.update` audit log with before/after JSON.
- [ ] Save calls `revalidateTag('products')` + the right `revalidatePath`s.
- [ ] Markdown preview matches storefront rendering (sanitizer applied).
- [ ] Dirty guard (from P2-T10) trips when any field changes.
- [ ] Validation runs on both client and server; server rejects extra keys.
- [ ] `pnpm tsc --noEmit`, `pnpm lint`, `pnpm build` green. `pnpm exec vitest run __tests__/db/admin/products-update.test.ts` green.

# Verification

```bash
cd web
pnpm tsc --noEmit
pnpm lint
pnpm exec vitest run __tests__/db/admin/products-update.test.ts

pnpm dev &
sleep 4
# Visit /admin/products/<id>/edit
# 1. Edit name → slug auto-updates
# 2. Edit slug manually → name edits no longer affect slug
# 3. Set compare_at_price below base_price → server rejects (DB check constraint surfaces as field error)
# 4. Save → toast "Saved"; audit_logs has new product.update row; storefront /p/<slug> reflects change
```

# Dependencies added

None — `react-markdown`, `rehype-sanitize`, `react-hook-form`, `@hookform/resolvers`, `zod` all installed.

# Notes for next agent

(empty)
