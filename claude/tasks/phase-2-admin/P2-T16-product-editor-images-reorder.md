---
id: P2-T16
phase: 2
title: Product editor — image reorder
status: not_started
depends_on: [P2-T15]
estimate_hours: 2
owner: ai
last_updated: 2026-05-17
---

# Goal

After this task, the Images tab supports drag-to-reorder via `@dnd-kit/sortable`. Reordering immediately persists a batch update of `product_images.sort_order` values via a single server action. Image-level actions (alt text edit, license status change, soft delete) also live here.

# Prerequisites (read first)

- [P2-T15](P2-T15-product-editor-images-upload.md) — the upload pipeline + the thumbnail grid this task makes draggable
- [claude/architecture/database-schema.md](../../architecture/database-schema.md) §"product_images" — `sort_order` integer column
- [`web/supabase/migrations/0007_indexes_views.sql`](../../../web/supabase/migrations/0007_indexes_views.sql) — `product_images_sort_idx` partial index on `(product_id, sort_order) WHERE deleted_at IS NULL`

# Files to touch

- `web/src/app/admin/products/[id]/edit/_tabs/images.tsx` (modified) — wrap thumbnail grid in `<DndContext>` + `<SortableContext>`.
- `web/src/app/admin/products/[id]/edit/_images/sortable-thumbnail.tsx` (new) — draggable thumbnail; shows alt-text input, license-status badge, "Edit" / "Delete" actions.
- `web/src/app/admin/products/[id]/edit/_images/alt-text-edit.tsx` (new) — popover with text input.
- `web/src/app/admin/products/[id]/edit/_images/license-edit.tsx` (new) — popover with `license_status` select.
- `web/src/app/admin/products/[id]/edit/actions.ts` (modified) — add `reorderImages(productId, orderedIds)`, `updateImageAlt(imageId, alt)`, `updateImageLicense(imageId, licenseStatus)`, `softDeleteImage(imageId)`.
- `web/src/lib/db/admin/images.ts` (modified — extends P2-T15) — `batchUpdateImageOrder(supabase, productId, orderedIds)`, `updateImageMeta`, `softDeleteImage`.

# Implementation notes

**Drag library: `@dnd-kit/sortable`.** Lightweight, accessible (keyboard reorder), framework-agnostic. Already installed (or added by P2-T14). Don't introduce a second dnd lib.

**Reorder write — single batch UPDATE.** Avoid N round-trips:

```ts
export async function batchUpdateImageOrder(
  supabase: SC,
  productId: string,
  orderedIds: string[],
) {
  // Use a single SQL with a VALUES list:
  //   UPDATE product_images SET sort_order = v.ord
  //   FROM (VALUES (id1, 0), (id2, 1), ...) AS v(id, ord)
  //   WHERE product_images.id = v.id AND product_id = $productId;
  const values = orderedIds.map((id, i) => `('${id}'::uuid, ${i})`).join(",");
  await supabase.rpc("batch_update_image_order", { p_product_id: productId, p_values: values });
}
```

Add a Postgres function in a new migration if there isn't already a clean way to do parameterized VALUES through the Supabase JS client. Validate via pglite first. (Alternative: loop client-side with N `.update()` calls — accept the cost given that products rarely have > 20 images.)

**Optimistic UI.** Client maintains the visual order during drag; server is the source of truth. On drag-end → trigger the server action → if it fails, revert to the prior order. Toast on failure.

**Alt text.** Stored in `product_images.alt` (text). Empty alt is allowed but storefront uses `name` as fallback. Editor shows a warning chip on images missing alt text (accessibility hint).

**License status change.** Owner sets `license_status` to `owned` / `licensed` / `public_domain` / `disputed` / `removed`. Changing from `unverified` → `owned` (or similar) unblocks publishing. Audit log: `product.update_image_license` with before/after.

**Soft delete.** `softDeleteImage` sets `deleted_at`. The image disappears from the editor + storefront but is recoverable in `/admin/trash`. The bin button has a single-step confirm (no typed-confirmation; soft delete is reversible).

**Audit log entries.**
- Reorder: `product.reorder_images` with `after_json = { ordered_ids: [...] }`
- Alt edit: `product.update_image_alt`
- License edit: `product.update_image_license`
- Soft delete: `product.soft_delete_image`

**Revalidation.** All four: `revalidatePath('/p/' + slug)` + `revalidateTag('product:' + slug)`.

# Acceptance criteria

- [ ] Drag-reorder updates `sort_order` for affected rows in a single round-trip (batch update or RPC).
- [ ] Keyboard reorder works (arrow keys + space — `@dnd-kit` defaults).
- [ ] Optimistic UI; failed save reverts.
- [ ] Alt-text edit persists; missing alt shows a warning badge on the thumbnail.
- [ ] License status edit persists; storefront RLS reflects the change immediately.
- [ ] Soft delete moves the image to Trash (P2-T28).
- [ ] All four actions write audit log rows.
- [ ] `pnpm tsc --noEmit`, `pnpm lint`, `pnpm build`, `pnpm validate:migrations` (if 0008+ added) green.

# Verification

```bash
cd web
pnpm validate:migrations    # if new migration added for batch reorder RPC
pnpm exec vitest run __tests__/db/admin/images.test.ts
pnpm dev &
sleep 4
# Editor → Images tab
# 1. Drag thumbnail #3 to position 1 → order persists on reload
# 2. Edit alt text → save → reload → still there
# 3. Change license from unverified → owned → no warning badge anymore
# 4. Delete an image → moves to Trash
```

# Dependencies added

`@dnd-kit/core` + `@dnd-kit/sortable` (if not installed by P2-T14).

# Notes for next agent

(empty)
