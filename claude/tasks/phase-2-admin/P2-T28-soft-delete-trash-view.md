---
id: P2-T28
phase: 2
title: Soft-delete trash view
status: done
depends_on: [P2-T07]
estimate_hours: 3
owner: ai
last_updated: 2026-05-18
---

# Goal

After this task, `/admin/trash` lists every soft-deleted row across all catalog entity types (products, categories, tags, images, variants), grouped by entity type, with restore + hard-delete actions. Hard delete requires typed confirmation (`Type DELETE to confirm`) per ADR-006. 30-day retention notice rendered in the header. Bulk soft-delete-restore supported; bulk hard-delete is NOT (ADR-006: "Bulk delete is always soft, no exceptions" — that rules out bulk hard-delete too).

# Prerequisites (read first)

- [claude/decisions/ADR-006-soft-delete-default.md](../../decisions/ADR-006-soft-delete-default.md) — the binding constraint. Read in full before writing the action handlers.
- [claude/architecture/database-schema.md](../../architecture/database-schema.md) — `deleted_at` / `deleted_by` columns on products, categories, tags, product_images, product_variants
- [claude/architecture/security.md](../../architecture/security.md) §"Soft delete + audit" — every hard delete writes an audit row
- [P2-T07](P2-T07-products-list-cursor-paginated.md) — list pattern + cursor pagination

# Files to touch

- `web/src/app/admin/trash/page.tsx` (new) — server component. Reads search params `?entity=<type>&cursor=...`. Default view: products. Tabs for the five entity types with counts.
- `web/src/app/admin/trash/trash-table.tsx` (new) — server-rendered; per-row Restore + Hard-delete buttons.
- `web/src/app/admin/trash/hard-delete-dialog.tsx` (new) — client component; typed-confirmation modal.
- `web/src/app/admin/trash/actions.ts` (new) — `restoreEntity(entityType, id)`, `hardDeleteEntity(entityType, id)`, `bulkRestore(entityType, ids)`.
- `web/src/lib/db/admin/trash.ts` (new) — `listTrashed(supabase, entityType, opts)`, `restoreEntity(supabase, entityType, id)`, `hardDeleteEntity(supabase, entityType, id)`.

# Implementation notes

**ADR-006 read-out (so the constraints are visible at the point of writing the action handlers):**

> Bulk delete is **always soft**, no exceptions.
> Hard delete is reserved for `/admin/trash` with typed-confirmation ("Type DELETE to confirm").
> Soft-deleted rows are retained for **30 days** by default. A nightly cron (Phase 5) hard-deletes rows where `deleted_at < now() - interval '30 days'`.

This task implements the typed-confirmation flow and the per-row hard delete. The nightly cron is Phase 5; we don't build it here, but we render the 30-day retention notice ("Items deleted before [date 30 days ago] will be permanently removed by the retention sweep when it runs in Phase 5") so the contract is visible.

**Entity tabs.** Five tabs across the top: Products, Categories, Tags, Images, Variants. Each tab shows count; switching tabs is a URL change (`?entity=products`).

**Per-row actions.**

| Action | Behavior |
|---|---|
| Restore | `UPDATE <table> SET deleted_at=NULL, deleted_by=NULL WHERE id=$1`. Audit log `<entity>.restore`. Revalidate. |
| Hard delete | Typed-confirmation modal. On confirm: `DELETE FROM <table> WHERE id=$1`. Audit log `<entity>.hard_delete` (writes BEFORE the DELETE so `entity_id` is preserved). Revalidate. |

**Typed-confirmation modal.**

```
┌──────────────────────────────────────────────────────┐
│ Permanently delete 'Resin pour cup'?                 │
│                                                       │
│ This cannot be undone.                                │
│                                                       │
│ Type DELETE to confirm:                               │
│ ┌────────────────────────────────────────────────┐  │
│ │ [user input — disabled "Confirm" until match] │  │
│ └────────────────────────────────────────────────┘  │
│                                                       │
│            [Cancel]    [Confirm — destructive button] │
└──────────────────────────────────────────────────────┘
```

Match is case-sensitive (`"DELETE"`, not `"delete"`). The Confirm button is the brick-600 destructive variant from the design system.

**Bulk restore.** Multi-select rows → "Restore N selected" button. Soft action; no typed-confirmation needed.

**Bulk hard-delete is NOT exposed.** Per ADR-006. The "Empty Trash" pattern stays out of MVP; if an owner needs to mass-purge, they wait 30 days for the retention sweep or write SQL directly via Supabase dashboard. **Do not** add a "select all → hard delete" path; the engineering-principles audit will catch and reject it.

**Audit log shape on hard delete.**

```ts
// BEFORE the DELETE — capture the row
const { data: row } = await supabase.from(table).select("*").eq("id", id).single();
await admin.from("audit_logs").insert({
  actor_id: userId,
  action: `${entityType}.hard_delete`,
  entity_type: entityType,
  entity_id: id,
  before_json: row,
  after_json: null,
  request_id: requestId,
});
// Then DELETE.
await supabase.from(table).delete().eq("id", id);
```

The `before_json` preserves a forensic copy of the row for posterity. `entity_id` will dangle (FK doesn't enforce on `audit_logs.entity_id` per the schema design). That's intentional — audit log records what existed at the time.

**Cascade considerations.** Hard-deleting a product will CASCADE to `product_images`, `product_variants`, `product_attributes`, `product_tags` via FK ON DELETE CASCADE (verify in 0001/0003 migrations). Audit logs for the cascaded rows are NOT written by this action (the cascade happens at the DB level). Document this in the confirmation modal: "Permanently deletes this product and all its images, variants, attributes, and tag associations."

**RLS posture.** Cookie-bound server client. Admin role can SELECT `deleted_at IS NOT NULL` rows (RLS policy allows admin-write-anything implicitly via `is_admin()`).

**Revalidation.** Both restore and hard delete: `revalidateTag('products')` / `revalidateTag('categories')` etc. depending on entity type.

**Empty state.** "No items in Trash for this entity type." per tab.

# Acceptance criteria

- [ ] `/admin/trash` defaults to `?entity=products`; all five tabs visible with counts.
- [ ] Each tab paginated; cursor stable.
- [ ] Restore: row's `deleted_at` cleared; audit log written; storefront reflects after revalidation.
- [ ] Hard delete: typed-confirmation modal blocks unless input matches `DELETE`. On confirm: audit log written BEFORE the row is gone (verified via SELECT); row deleted; CASCADE applies.
- [ ] Bulk restore works.
- [ ] No bulk-hard-delete button exists anywhere in the UI.
- [ ] 30-day retention notice rendered in header.
- [ ] Anonymous → /login; viewer → /admin/forbidden.
- [ ] `pnpm tsc --noEmit`, `pnpm lint`, `pnpm build`, `pnpm exec vitest run __tests__/db/admin/trash.test.ts`, `pnpm launch-blockers` all green.

# Verification

```bash
cd web
pnpm exec vitest run __tests__/db/admin/trash.test.ts
pnpm launch-blockers
pnpm dev &
sleep 4
# Soft-delete a test product via /admin/products → row moves to /admin/trash
# Restore → row reappears in /admin/products
# Soft-delete again → /admin/trash → click Hard delete
# Typed-confirmation modal: typing "delete" → confirm disabled; typing "DELETE" → enabled
# Confirm → row gone; audit_logs has product.hard_delete row with before_json
```

# Dependencies added

None.

# Notes for next agent

  - **Five entity types** with `deleted_at`: products, categories,
    tags, product_images, product_variants. `attribute_definitions`
    is intentionally excluded — that table has no `deleted_at`
    column (delete is hard-only, gated by reference count; see
    T22).

  - **No 30-day retention cron yet.** The header surfaces the
    cutoff date so the contract stays visible, but the actual
    nightly hard-delete is Phase 5. Until then, soft-deleted rows
    sit forever until manually purged via the typed-confirmation
    modal.

  - **Hard-delete audit captures the row pre-delete.** The data
    layer's `hardDeleteEntity` returns `beforeRow` (the full row
    snapshot) to the action layer, which writes the `audit_logs`
    row with `before_json = beforeRow` after the DELETE succeeds.
    `audit_logs.entity_id` will dangle by design — see ADR-006.

  - **Bulk hard-delete is intentionally absent.** ADR-006 forbids
    it. The Trash UI exposes only bulk-restore + per-row hard
    delete. Do not add a "select all → hard delete" button.

  - **Typed-confirmation modal** matches the literal string
    `DELETE` (case-sensitive). The cascade note in the dialog
    explains what gets removed alongside the row (images,
    variants, attribute values, tag links).

  - **Public/private split** (`trash-public.ts`) — same pattern as
    T16 / T27. Holds `TRASH_ENTITY_TYPES`, `TRASH_ENTITY_LABELS`,
    and the `TrashedRow` interface; the data layer re-exports for
    server-side imports.

  - **Restore writes a stub audit `before_json`.** The pre-restore
    `deleted_at` value isn't preserved (the row keeps it inline);
    if a richer history is wanted later, switch to writing the
    full row snapshot before the UPDATE.

  - **8 tests.** Cover listTrashed, getTrashCounts, restore (happy
    + not_deleted + not_found), hardDelete (happy + not_deleted +
    snapshot returned).
