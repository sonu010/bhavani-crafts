---
id: P2-T21
phase: 2
title: Tags management
status: done
depends_on: [P2-T05]
estimate_hours: 2
owner: ai
last_updated: 2026-05-18
---

# Goal

After this task, `/admin/tags` lists all 458 tags with product counts, lets the owner create / rename / soft-delete / merge tags. Merge ("combine tag A into tag B") is the high-value operation: products tagged with A get re-tagged to B; A is soft-deleted. The inline-create flow from P2-T12 also routes through this surface for shared ownership.

# Prerequisites (read first)

- [claude/architecture/database-schema.md](../../architecture/database-schema.md) §"tags, product_tags"
- [P2-T05](P2-T05-admin-shell-layout.md) — surrounding shell
- [P2-T12](P2-T12-product-editor-category-picker.md) — inline-create flow that also creates tags

# Files to touch

- `web/src/app/admin/tags/page.tsx` (new) — server component. Renders table of tags + create form + per-row actions.
- `web/src/app/admin/tags/tags-table.tsx` (new) — client component. Filterable by name (client-side, 458 tags is fine).
- `web/src/app/admin/tags/merge-dialog.tsx` (new) — modal: pick target tag, preview count of products being moved, confirm.
- `web/src/app/admin/tags/actions.ts` (new) — `createTag(slug, name)`, `renameTag(id, name, slug)`, `softDeleteTag(id)`, `mergeTags(sourceId, targetId)`.
- `web/src/lib/db/admin/tags.ts` (new) — DI Supabase pattern.
- `web/__tests__/db/admin/tags.test.ts` (new)

# Implementation notes

**Table columns:** name, slug (JetBrains Mono), product count, last used (most recent `product_tags.created_at`? — if no timestamp column, skip), actions (Rename, Merge, Delete).

**Inline create form.** Always visible at the top. Empty input + "Add" button. Slug auto-derived from name (same slugify as P2-T11).

**Soft delete.** `tags.deleted_at` set. Existing `product_tags` rows stay (the storefront filters them out via the storefront-side tag query's `deleted_at IS NULL` join). Trash view restores. **If migration 0001/0003 didn't add `deleted_at` to `tags`, add it via migration 0008+ in this task — validate via pglite.** (Check first.)

**Merge — the load-bearing feature.** "Combine 'craft-supplies' into 'craft-supply'". Server action:

```ts
export async function mergeTags(supabase: SC, sourceId: string, targetId: string) {
  // 1. Update all product_tags rows from source to target.
  //    ON CONFLICT (product_id, tag_id) DO NOTHING to handle products tagged with both.
  await supabase.rpc("merge_tags", { p_source: sourceId, p_target: targetId });
  // 2. Soft-delete the source tag.
  await supabase.from("tags").update({ deleted_at: ... }).eq("id", sourceId);
  // 3. Audit log: tag.merge with before/after.
  // 4. Revalidate.
}
```

The `merge_tags` RPC handles the join-table mutation atomically. Add it as a Postgres function in a new migration; pglite-validate first.

**Concurrency.** If two admins merge at the same time, last write wins; the audit log lets us reconstruct. Don't introduce row locking — the operations are idempotent enough.

**Revalidation.** `revalidateTag('products')` (because every tagged product's tag set changed) + `revalidatePath('/p/...')` paths for affected products if any are published. For simplicity, just `revalidateTag('products')` covers it; per-path revalidation is overkill.

**Audit log.** `tag.create`, `tag.rename`, `tag.soft_delete`, `tag.merge`.

# Acceptance criteria

- [ ] `/admin/tags` lists all live tags with counts.
- [ ] Create flow works; slug auto-derives; unique violation surfaces as field error.
- [ ] Rename works; slug auto-updates unless manually edited; unique check.
- [ ] Soft delete moves tag to Trash; storefront-side searches no longer find it.
- [ ] Merge moves all affected `product_tags` rows + soft-deletes source.
- [ ] After merge, source tag invisible; target's product count = sum minus duplicates.
- [ ] If migrations were added (0008+ for `tags.deleted_at` or merge RPC): `pnpm validate:migrations` green; smoke blocks pass.
- [ ] `pnpm tsc --noEmit`, `pnpm lint`, `pnpm build`, `pnpm exec vitest run __tests__/db/admin/tags.test.ts` green.

# Verification

```bash
cd web
pnpm validate:migrations
pnpm exec vitest run __tests__/db/admin/tags.test.ts
pnpm dev &
sleep 4
# /admin/tags → create + rename + merge flow
```

# Dependencies added

None.

# Notes for next agent

  - **No new migration needed.** `tags.deleted_at` already exists
    in 0003. Skipped the proposed `merge_tags` RPC and did the
    merge client-side via the Supabase JS client — three round-trips
    (read source rows, upsert into target with
    `ignoreDuplicates`, delete source links) plus the soft-delete.
    The volume is bounded (≤ a few hundred products per tag) and
    keeping the audit-log writer in the action layer keeps the
    granularity story consistent.

  - **PostgREST 1000-row cap bit us.** `product_tags` has ~8K rows
    in dev. The first version of `listTagsWithCounts` did a flat
    `.select("tag_id")` and got the first 1000 only — fixture
    products tagged in test runs ended up missing. Fixed by
    paginating in `.range(offset, offset+999)` chunks of 1000
    until the response is short. Same pattern will need to apply
    anywhere else we read every row of a large junction table.

  - **Merge writes two audit shapes.** One `tag.merge` summary row
    plus one `product.set_tags` row per affected product. The
    per-product rows mirror the granularity of the per-product
    Category-tab save action (T12), so the audit viewer in T26
    won't need a special filter.

  - **Dialogs use `key=<id>`** — same pattern as T16's
    license/alt-text edits to avoid the React Compiler
    set-state-in-effect rule. Parent passes `key={target?.id ??
    "empty"}` on each dialog.

  - **`createTagAction` re-fetches** the inserted row for the
    audit `after_json` because `createTag` only returns `{id}`.
    A two-line cost for a clean audit shape; trade-off accepted.

  - **10 tests.** Cover create (happy + collision + validation),
    rename (happy + collision), soft-delete (idempotent),
    list-with-counts, merge (happy + duplicate-skip behavior +
    self-merge reject + empty-source path).
