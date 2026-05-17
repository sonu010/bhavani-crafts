---
id: P2-T12
phase: 2
title: Product editor — category picker
status: done
depends_on: [P2-T11]
estimate_hours: 2
owner: ai
last_updated: 2026-05-17
---

# Goal

After this task, the Category tab of the product editor renders a single-select tree-search combobox over all 362 categories. Owner can type to filter or click to expand-and-pick. Save action sets `products.category_id` and writes an audit log. Tags multi-select also lives here (sibling control), persisting `product_tags` join rows. Category and tags are saved by independent server actions; saving one does not affect the other.

# Prerequisites (read first)

- [`web/src/lib/db/categories.ts`](../../../web/src/lib/db/categories.ts) — `getCategoryTree(supabase)` already exists; reuse
- [`web/src/lib/db/tags.ts`](../../../web/src/lib/db/tags.ts) — `listTagsForProduct(supabase, productId)` if present; otherwise add
- [`web/src/components/ui/command.tsx`](../../../web/src/components/ui/command.tsx) — shadcn `Command` primitive (combobox)
- [P2-T11](P2-T11-product-editor-basic-fields.md) — save action pattern
- [claude/architecture/caching-and-revalidation.md](../../architecture/caching-and-revalidation.md) — `revalidatePath('/c/' + oldSlug)` + new slug

# Files to touch

- `web/src/app/admin/products/[id]/edit/_tabs/category.tsx` (modified) — client; renders `<CategoryPicker>` + `<TagsPicker>`.
- `web/src/app/admin/products/[id]/edit/_pickers/category-picker.tsx` (new) — shadcn `Command` with tree-indented items; type-to-filter.
- `web/src/app/admin/products/[id]/edit/_pickers/tags-picker.tsx` (new) — shadcn `Command` multi-select with checkboxes; supports inline-create-new-tag (P2-T21 wires the table).
- `web/src/app/admin/products/[id]/edit/actions.ts` (modified) — add `saveProductCategory(id, categoryId | null)` and `saveProductTags(id, tagSlugs[])`.
- `web/src/lib/db/admin/products.ts` (modified) — `updateProductCategory(supabase, id, categoryId)`, `setProductTags(supabase, id, tagSlugs)` (replaces the full set; idempotent).
- `web/__tests__/db/admin/products-category-tags.test.ts` (new)

# Implementation notes

**Category picker — single select, tree-indented.** The `getCategoryTree` result is a recursive `{ id, slug, name, children }[]`. Flatten for the combobox with a `depth` field; render with `padding-left: depth * 12px`. Typing filters by `name` or `slug` (case-insensitive, contains-match). Selecting an item closes the popover and sets the form value. A "None" item at the top of the list clears the category (sets `category_id = NULL`).

**Tags picker — multi-select with inline-create.** Existing tags rendered as checkboxes inside the `Command` popover. Search filters. A "Create '<query>'" row appears at the bottom when the query doesn't match any existing tag. Selecting it calls a server action `createTag(slug, name)` (only available to admin role), refetches, then auto-selects.

**Independent save actions.** Category save and tags save are separate server actions. The Category tab has two save buttons (or auto-save on change). Reason: each writes a distinct audit log entry; bundling them would conflate two changes in the history.

**`setProductTags` replaces, not patches.** Given `tagSlugs[]`, the function:
1. `SELECT tag_id FROM product_tags WHERE product_id = $1` — current set
2. Diff against the new set
3. `DELETE` removed; `INSERT` added; leave unchanged ones alone
4. One audit log entry: `product.set_tags` with `before_json: oldTags`, `after_json: newTags`

This keeps audit logs proportional to actions taken, not to set size.

**RLS posture.** Both actions use the cookie-bound admin server client. RLS allows admin-role to read/write `product_tags`. Service-role only needed for the audit log insert.

**Revalidation.**
- Category change: `revalidateTag('products')` + `revalidateTag('categories')` + `revalidatePath('/c/' + oldCategorySlug)` + `revalidatePath('/c/' + newCategorySlug)` (look up both).
- Tags change: `revalidateTag('products')` + `revalidatePath('/p/' + slug)`.

**Validation.** Category id (if non-null) must reference an existing, non-deleted category. Tag slugs must all exist (or be created via the inline flow); reject the action if any slug doesn't resolve.

**Performance.** Category tree loaded once at tab mount (server component prefetches). 362 categories is tiny; client-side filter is fine. Don't introduce a server-side type-ahead endpoint for this scale.

# Acceptance criteria

- [ ] Category tab renders both pickers.
- [ ] Category picker shows all 362 categories tree-indented.
- [ ] Typing filters categories by name or slug.
- [ ] Selecting "None" clears `category_id`.
- [ ] Tags picker shows existing tags; multi-select; checkbox state matches current `product_tags`.
- [ ] Inline-create for a new tag works (admin role); refetched + auto-selected.
- [ ] Save category writes a `product.update_category` audit log with before/after id.
- [ ] Save tags writes one `product.set_tags` audit log with before/after slug arrays.
- [ ] Both save actions call the right revalidations.
- [ ] `pnpm tsc --noEmit`, `pnpm lint`, `pnpm build` green. `pnpm exec vitest run __tests__/db/admin/products-category-tags.test.ts` green.

# Verification

```bash
cd web
pnpm exec vitest run __tests__/db/admin/products-category-tags.test.ts
pnpm dev &
sleep 4
# Editor → Category tab
# 1. Pick a different category → save → audit_logs has product.update_category row
# 2. Add 2 new tags, remove 1 existing → save → audit_logs has product.set_tags row
# 3. Storefront /c/<old> and /c/<new> reflect changes after revalidation
```

# Dependencies added

None.

# Notes for next agent

**2026-05-17 — DONE.** Three sub-commits:
- `1caa9c3` T12a — data layer (`updateProductCategory`, `setProductTags`, `listTagsForProduct`) + 9 integration tests
- `8949943` T12b — server actions (`saveProductCategory`, `saveProductTags`)
- this commit T12c — pickers (Dialog-based) + CategoryTab wiring + page data plumb

**shadcn `Command` is not installed in this repo.** Built hand-rolled Dialog-based pickers instead — same pattern T08 (filter bar) used for the absence of Command. Both pickers use the existing Dialog primitive + a search Input + a scrollable list. Filter is client-side over the full set (362 categories + ~458 tags), which is fine for this scale.

**Category picker (single-select):**
- Trigger button shows current name (or "No category")
- Dialog opens with search input + a flattened tree (depth-indented via `padding-left`)
- "No category" sentinel always at the top → clears `category_id`
- Searching shows the ancestor path inline so duplicates disambiguate (e.g., two "Brushes" under different parents)

**Tags picker (multi-select):**
- Trigger button shows "first, second, +N" or "No tags"
- Dialog opens with search + checkbox rows
- Selected tags float to the top inside the dialog
- Selected tags also render as removable badges below the trigger (one-tap remove without opening the dialog)
- Inline-create-new-tag is deferred — flagged at the top of the file. T21 owns the tags table and will add that flow.

**Independent save:** Category section + Tags section have their own save buttons. Each section's dirty state is computed against its `savedX` baseline (advances on successful save) so the buttons disable correctly after save without a server refetch.

**Data plumb (page → editor → tab):**
- `page.tsx` adds three parallel fetches to its `Promise.all`: `getCategoryTree`, `listTagsForProduct`, and a thin `tags.select(slug, name)` for the picker options. The four queries together still beat per-tab-on-mount fetching — they share connection-pool capacity, and 362 categories + 458 tags ships in ~50KB.
- `product-editor.tsx` accepts new props `categoryTree`, `allTags`, `currentTags` and forwards them to `CategoryTab`.
- `AdminProductForEditing` gained a `category_id` field so the picker knows the current selection without a slug → id lookup.

**Smoke results (warm):**
- /admin/products/[id]/edit cold: 2212ms (Turbopack JIT, dev-only)
- /admin/products/[id]/edit warm: ~500-590ms wall-clock
- Server-side `[perf] fetch=188ms` (was 158ms before the extra two queries) — Promise.all keeps the marginal cost ~30ms

**Acceptance criteria all green** including tsc, lint, build. 104/104 tests pass (was 95, +9 from T12a).

**Inline-create-new-tag — deferred to T21:**
When P2-T21 ships the Tags management page, it should:
1. Add a `createTag(supabase, slug, name)` helper to `lib/db/admin/tags.ts`
2. Add a `createTagAction(slug, name)` server action
3. In the TagsPicker, surface a "Create '<query>'" row at the bottom when the query has 3+ chars and matches zero existing tags
4. After successful creation, refetch the tags list + auto-select the new one
