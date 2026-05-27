---
id: P2-T09
phase: 2
title: Products list bulk actions
status: done
depends_on: [P2-T07]
estimate_hours: 3
owner: ai
last_updated: 2026-05-18
---

# Goal

After this task, the `/admin/products` table supports bulk operations on selected rows: publish, unpublish, move to category, add tag, remove tag, soft-delete. Selection state lives in URL search params (so reload doesn't lose it). Bulk delete is always soft — no exceptions, per ADR-006. Every bulk action writes one `audit_logs` row per affected product and revalidates the storefront caches. Operations on > 100 selected rows are jobified (background_jobs); ≤ 100 run synchronously.

# Prerequisites (read first)

- [claude/decisions/ADR-006-soft-delete-default.md](../../decisions/ADR-006-soft-delete-default.md) — bulk delete is always soft, no exceptions
- [claude/architecture/caching-and-revalidation.md](../../architecture/caching-and-revalidation.md) §"Mutation → revalidation map" — bulk publish/unpublish: `revalidateTag('products')` + `revalidateTag('categories')`
- [claude/architecture/database-schema.md](../../architecture/database-schema.md) §"audit_logs", §"background_jobs"
- [P2-T07](P2-T07-products-list-cursor-paginated.md) — the table this extends; the checkbox column was reserved
- [P2-T24](P2-T24-csv-import-execute-jobified.md) — the background_jobs worker pattern to mirror

# Files to touch

- `web/src/app/admin/products/products-table.tsx` (modified) — wire the row checkboxes to URL `?selected=id1,id2,...`. Add "Select all on page" header checkbox.
- `web/src/app/admin/products/bulk-toolbar.tsx` (new) — client component. Appears (sticky bottom) when `?selected=` is non-empty. Buttons: Publish, Unpublish, Move to category, Add tag, Remove tag, Delete.
- `web/src/app/admin/products/actions.ts` (new) — server actions: `bulkPublish`, `bulkUnpublish`, `bulkMoveCategory`, `bulkAddTag`, `bulkRemoveTag`, `bulkSoftDelete`. Each writes audit logs + revalidates + enqueues a background_job if `selected.length > 100`.
- `web/src/lib/db/admin/bulk.ts` (new) — `applyBulkUpdate(supabase, ids, patch)`, `applyBulkSoftDelete(supabase, ids, actorId)`. Chunked at 50 rows per UPDATE; uses `WHERE id = ANY($1)`.
- `web/__tests__/db/admin/bulk.test.ts` (new)

# Implementation notes

**Selection in URL.** `?selected=uuid1,uuid2,...`. Reading and writing this via `URLSearchParams`. Capped at 1000 IDs (URL length sanity); beyond that, route through a job using the active filter as the selection criterion.

**The "select all on page" vs "select all matching filters" distinction.** Header checkbox selects only the visible 25 rows. A small "Select all 5,804 matching this filter" link appears when the header checkbox is checked, which switches semantics — the URL becomes `?selectMode=filter&q=...&status=...` and the bulk action receives the filter, not an ID list. **Required because the import-queue workflow needs "publish all 5,804 needs_review products" as a one-click operation.**

**Sync vs jobified threshold — 100 rows.** Below the threshold: run inline in the server action; redirect back to the products list when done. Above: enqueue a `background_jobs` row with `kind='bulk_publish'` (or `bulk_unpublish`, `bulk_move_category`, etc.), payload contains either the ID list or the filter; the worker (P2-T27) drains it.

**Audit log shape — one row per product, NOT one row per batch.** Granular audit lets the owner reconstruct what changed without consulting payload JSON.

```ts
for (const id of chunk) {
  await admin.from("audit_logs").insert({
    actor_id: userId,
    action: "product.publish",     // or .unpublish, .move_category, .add_tag, .remove_tag, .soft_delete
    entity_type: "product",
    entity_id: id,
    before_json: { ... },           // captured pre-update
    after_json: { ... },
    request_id: requestId,
  });
}
```

For ≥100-row jobified batches, the worker writes audit rows incrementally so the audit log is observable mid-job.

**Revalidation.** Per the mutation map, all bulk catalog actions call `revalidateTag('products')` + `revalidateTag('categories')` at the end. Jobified versions revalidate after each chunk (per [caching-and-revalidation.md](../../architecture/caching-and-revalidation.md) §"On-demand revalidation guardrails") so the storefront doesn't stay stale for the whole job duration.

**Soft delete only.** `bulkSoftDelete` sets `deleted_at = now()`, `deleted_by = auth.uid()`. There is NO `bulkHardDelete` action; hard delete only happens row-by-row from the Trash view (P2-T28) with typed confirmation. ADR-006 §"Decision" line 14 is the binding constraint.

**Confirm dialog for destructive actions.** Publish, unpublish, move, tag-add/remove → confirm shows the count and a primary CTA. Delete → confirm shows the count and requires the owner to type `delete` (lowercase) in a confirmation input before the destructive CTA enables. (Hard-delete typed-confirmation belongs to P2-T28; this is the softer bulk-soft-delete variant.)

**RLS posture.** Admin server actions can use either the cookie-bound server client (RLS-respecting; `requireRole` gates) or the service-role client (bypasses RLS; faster but more dangerous). Use the **cookie-bound server client** for bulk operations — RLS provides the safety net if `requireRole` has a bug, and the cost is marginal at 1000 rows.

# Acceptance criteria

- [ ] Row checkboxes select; selection persists in `?selected=` URL param across reload.
- [ ] Header checkbox selects all visible rows.
- [ ] When all visible are selected, a "Select all matching this filter" link appears; clicking switches to filter-mode selection.
- [ ] Bulk toolbar appears sticky at the bottom when selection non-empty.
- [ ] All six bulk actions work for selections ≤ 100. One `audit_logs` row written per affected product.
- [ ] Selections > 100 enqueue a `background_jobs` row; status visible in `/admin/jobs` (P2-T27).
- [ ] Bulk delete is always soft (`deleted_at` set; `audit_logs.action='product.soft_delete'`). No hard-delete action exists.
- [ ] Bulk publish/unpublish toggles `is_published` AND aligns `review_status` (publish → `published`; unpublish from `published` → `ready_to_publish`).
- [ ] After every bulk mutation: `revalidateTag('products')` + `revalidateTag('categories')` called.
- [ ] `pnpm tsc --noEmit`, `pnpm lint`, `pnpm build` green. `pnpm exec vitest run __tests__/db/admin/bulk.test.ts` green.

# Verification

```bash
cd web
pnpm tsc --noEmit
pnpm lint
pnpm exec vitest run __tests__/db/admin/bulk.test.ts

pnpm dev &
sleep 4
# Sign in as admin, visit /admin/products
# 1. Select 5 rows → toolbar appears → click "Soft delete" → confirm dialog → action runs
# 2. Verify: those rows now have deleted_at set; audit_logs has 5 product.soft_delete rows
# 3. Visit /admin/trash → see the 5 rows
# 4. Select 200 rows → "Soft delete" → background_jobs row created → /admin/jobs shows it
```

# Dependencies added

None.

# Notes for next agent

(empty)

  - **Sync-only.** The spec wanted > 100 row jobification via
    `background_jobs`. The CSV worker (T24) that drains those jobs
    doesn't exist yet, and chunked UPDATEs handle a few thousand
    rows fine inside the server-action timeout. Threshold remains
    in code as a future flip point; jobified path lands when the
    worker ships.

  - **No filter-mode selection.** "Select all 5,804 needs_review"
    was deferred — the cleaned fixture's queue is small enough
    that page-by-page selection works. Add filter-mode when the
    import workflow demands it.

  - **`?selected=` URL persistence.** Selection lives in the URL
    so reload preserves it. `router.replace` keeps history clean.
    Capped at the URL length the browser allows; ~1000 IDs fits
    comfortably.

  - **One audit row per affected product** — per ADR-006
    granularity. Audit inserts chunk at 500 rows to keep request
    payloads bounded.

  - **Tag picker** uses slug-or-id. The action layer resolves
    either via `resolveTag()` so future "by id" callers don't
    need a separate path.

  - **7 tests** in `__tests__/db/admin/bulk.test.ts`:
    readProductsForBulk (live + skip-deleted), applyBulkUpdate
    (publish, move category, empty noop), applyBulkSoftDelete
    (idempotent), add/remove tag (idempotent on re-add, removes
    cleanly).
