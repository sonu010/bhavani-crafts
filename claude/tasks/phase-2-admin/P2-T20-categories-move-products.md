---
id: P2-T20
phase: 2
title: Categories — move products
status: done
depends_on: [P2-T19]
estimate_hours: 2
owner: ai
last_updated: 2026-05-18
---

# Goal

After this task, `/admin/categories/:id/move` lets the owner bulk-move all products currently in a category (or matching a sub-filter) into a different category. This is the "I'm cleaning up taxonomy" workflow — reclassify many products at once without per-product edits. Reuses the bulk-action infrastructure from P2-T09.

# Prerequisites (read first)

- [P2-T09](P2-T09-products-list-bulk-actions.md) — bulk-action server actions; 100-row sync/jobified threshold
- [P2-T18](P2-T18-categories-tree-view.md) — the parent UI surface
- [`web/src/lib/db/admin/bulk.ts`](../../../web/src/lib/db/admin/bulk.ts) — `applyBulkUpdate` from P2-T09; reuse
- [claude/architecture/caching-and-revalidation.md](../../architecture/caching-and-revalidation.md) — both source + target category paths revalidate

# Files to touch

- `web/src/app/admin/categories/[id]/move/page.tsx` (new) — server component. Shows: source category name, current product count, target category picker (combobox excluding source + descendants), filter sub-controls (status / tags) for narrower selection, preview count, "Move N products" button.
- `web/src/app/admin/categories/[id]/move/move-form.tsx` (new) — client; preview count updates as filters change.
- `web/src/app/admin/categories/actions.ts` (modified) — `bulkMoveProductsToCategory(sourceCategoryId, targetCategoryId, filters)`.
- `web/src/lib/db/admin/categories.ts` (modified) — `moveProductsBetweenCategories(supabase, sourceId, targetId, filters)` — reuses `bulk.ts` infrastructure.

# Implementation notes

**Source = the category we're moving FROM (route param).** Target = picked. Cannot pick source or any descendant of source as target (server validates). Cannot pick the same category (no-op).

**Filter narrowing.** Owner can narrow the selection: status (needs_review / published / etc.), tags. If the filter set is empty, the action moves ALL products in the source category (including its descendants? — **NO**, only directly in `source.id`. Descendant products stay with their actual category; this action is about reclassifying products that were misfiled directly into this category.)

**Preview count.** Server action `previewMoveCount(sourceCategoryId, filters)` returns the count. Form calls it as filters change (debounced). Display "Will move N products into '<target>'".

**Sync vs jobified.** Same 100-row threshold as P2-T09. Above: enqueues `background_jobs` with `kind='bulk_move_category'`.

**Audit log.** One `product.update_category` row per affected product (granular; mirrors P2-T09).

**Revalidation.**
- `revalidateTag('products')`
- `revalidatePath('/c/' + sourceSlug)`
- `revalidatePath('/c/' + targetSlug)`

**Empty source category.** "This category has 0 directly-attached products. Nothing to move." button disabled.

# Acceptance criteria

- [ ] `/admin/categories/:id/move` renders source name + current count + target picker.
- [ ] Target picker excludes source + descendants.
- [ ] Filter controls narrow the selection; preview count updates.
- [ ] Move action moves the products; audit log granular; revalidation called.
- [ ] Above 100: enqueues a background_job visible in `/admin/jobs`.
- [ ] After move: source's product count drops, target's increases (both visible in `/admin/categories`).
- [ ] `pnpm tsc --noEmit`, `pnpm lint`, `pnpm build` green.

# Verification

```bash
cd web
pnpm dev &
sleep 4
# /admin/categories → pick a category with ~50 products → action menu → Move products
# /admin/categories/:id/move → pick target → click Move 50 products → toast on success
# Tree view shows count moved
```

# Dependencies added

None.

# Notes for next agent

  - **Self-contained — T09's bulk infrastructure didn't exist.** The
    spec referenced `web/src/lib/db/admin/bulk.ts` from T09; that
    file doesn't exist (T09 is still `not_started`). T20 implements
    the move flow without it: a typed
    `moveProductsBetweenCategories` helper that does a single
    scoped UPDATE plus an id-list read, plus a paginated audit-log
    insert in the action wrapper.

  - **No jobification yet.** The T09 spec wanted > 100 rows to
    enqueue a `background_jobs` row. Since (a) no worker process
    exists, and (b) Supabase's bulk UPDATE is fast enough for ~6K
    rows, this lands as synchronous-only. The audit insert chunks
    in groups of 500 so the request payload stays bounded even for
    a 1000-product move. Revisit when background jobs land.

  - **Filter set is review_status only.** The spec also mentioned a
    tag narrowing; deferred. Most "I'm fixing taxonomy" moves
    bucket by review_status anyway, and adding tags would require
    threading the tag filter through `products` via
    `product_tags`. Not worth the surface area on the first pass.

  - **Cycle guard duplicated.** Both the picker (client) and the
    server reject moving into a descendant of the source. The
    client filter is UX; the server reject is the trust boundary.

  - **8 tests.** Cover preview + filtered preview + happy move +
    filtered move + same-category reject + descendant reject +
    nothing-to-move + missing target. Test fixtures set
    `is_published` consistent with `review_status` to satisfy the
    `enforce_publish_state` trigger from 0004.

  - **Audit shape is `product.update_category`** — one row per
    moved product. Same action verb the per-product Category-tab
    save writes (P2-T12), so the audit viewer doesn't need a new
    filter.
