---
id: P2-T11
phase: 2
title: Product editor — basic fields
status: done
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

**2026-05-17 — DONE.** Three sub-commits:
- `ba9e1f6` — schema (ProductEditInputSchema, slugifyForProduct, SLUG/SKU regexes) + data layer (getProductForEditing, updateProductGeneral with typed error map) + 7 integration tests
- `02e4412` — `saveProductGeneral` server action: gate + update + audit_logs + revalidation
- this commit — GeneralTab form UI + MarkdownEditor + sticky save bar + Toaster mount

**Two Next 16 API gotchas surfaced, both documented inline:**

1. `revalidateTag(tag)` now requires a second `profile: string | CacheLifeConfig` arg. For server-action read-your-own-writes the new API is `updateTag(tag)`. Architecture spec still says "revalidateTag" — left it that way since the doc is about the conceptual map; code uses `updateTag` and notes why.

2. The React Compiler's `react-hooks/incompatible-library` rule rejects `form.watch()` (the rule's message names react-hook-form explicitly). Switched to `useWatch({ control, name })` for the slug-derive + stock-status subscriptions. Plain refs are also rejected when passed through callback options (the `react-hooks/refs` rule fires on `{ onChange: refMutatingFn }`); converted `slugTouchedRef` to `useState`.

**Field set + constraints all match the task spec.** Cross-field rules (compare > base, max >= min) in `.superRefine`. `.strict()` blocks unknown keys at the server boundary — category_id, images, variants can never tunnel through this action.

**Sonner mounted in `(shell)/admin-shell.tsx`** as `<Toaster position="top-right" richColors />`. Toasts only fire inside `/admin/*` (intended).

**Save flow:**
- `react-hook-form` + Zod resolver, mode: `onBlur`
- Submit calls `saveProductGeneral(id, values)`
- On success: `toast.success`, `form.reset(values)` so isDirty drops, `onClean()` on parent
- On validation: `setError` per issue path; surfaces inline below each field
- On `slug_in_use` / `sku_in_use`: setError on those specific paths
- On `constraint`: toast.error with message (DB rejected after Zod passed — e.g., a check we don't mirror in the schema)

**Slug auto-derive:** the initial-touched heuristic is `slugifyForProduct(name) !== slug` — products that came in with a manual slug pattern (e.g., `wpk-14` for the seeded data) start with slugTouched=true so the first name edit doesn't clobber them.

**Sticky save bar:** `fixed inset-x-0 bottom-0 z-40`, offset by `md:left-56` so it doesn't sit under the desktop sidebar. Inside is a flex with status text on the left ("Unsaved changes" / "All changes saved" / inline error) and the Save button on the right. Button disabled when not dirty.

**Form padding-bottom is `pb-24`** so the sticky bar doesn't cover the last fieldset.

**Smoke verified live:** GET `/admin/products/<id>/edit` returns 200, all five expected form ids present in the HTML. Warm 707ms wall-clock from the TOTP-authenticated probe. Server-side `[perf]` total ~470-585ms.

**Other tabs (Category, Attributes, Variants, Images, Publish) still placeholders.** They don't accept `product` props yet — when their content tasks (T12-T17) land, they'll do the same prop-drill pattern: `(product, onDirty, onClean)` from ProductEditor.

**Audit log shape ships as designed:** every successful save inserts `audit_logs(action='product.update', entity_type='product', entity_id, before_json, after_json, request_id, actor_id)`. P2-T26 (audit log viewer) can render these directly.

**Revalidation map covered:**
- `updateTag('products')` — admin list cache + storefront listing
- `revalidatePath('/p/' + oldSlug)` when slug changed
- `revalidatePath('/p/' + newSlug)` always
- `revalidatePath('/c/' + category_slug)` when product has a category
