---
id: P2-T19
phase: 2
title: Categories edit + create
status: not_started
depends_on: [P2-T18]
estimate_hours: 2
owner: ai
last_updated: 2026-05-17
---

# Goal

After this task, `/admin/categories/:id/edit` and `/admin/categories/new` render a form to create/edit a category: name, slug (auto-derived, editable, unique), description, parent (combobox over the tree from P2-T18), sort_order, image_url (uses the same upload pipeline from P2-T15), meta_title, meta_description. Save writes an audit log + revalidates affected paths.

# Prerequisites (read first)

- [claude/architecture/database-schema.md](../../architecture/database-schema.md) §"categories"
- [P2-T18](P2-T18-categories-tree-view.md) — the tree this form mutates
- [P2-T11](P2-T11-product-editor-basic-fields.md) — form/save pattern
- [P2-T15](P2-T15-product-editor-images-upload.md) — image upload pipeline (reused for category cover image)
- [claude/architecture/caching-and-revalidation.md](../../architecture/caching-and-revalidation.md) §"Mutation → revalidation map" — categories: `revalidateTag('categories')` + old/new slug paths + `revalidatePath('/')` if top-level

# Files to touch

- `web/src/app/admin/categories/[id]/edit/page.tsx` (new) — server component
- `web/src/app/admin/categories/[id]/edit/category-form.tsx` (new) — client; react-hook-form + Zod
- `web/src/app/admin/categories/new/page.tsx` (new) — uses the same `<CategoryForm>` with empty defaults
- `web/src/app/admin/categories/actions.ts` (new) — `createCategory`, `updateCategory`
- `web/src/lib/db/admin/categories.ts` (modified — extends P2-T18) — `createCategory(supabase, input)`, `updateCategory(supabase, id, patch)`
- `web/src/lib/schemas/category.ts` (modified) — `CategoryEditInput` Zod schema (slug regex, etc.)
- `web/__tests__/db/admin/category-edit.test.ts` (new)

# Implementation notes

**Form fields:**

| Field | Type | Constraint |
|---|---|---|
| name | text required | 1–100 chars |
| slug | text required | regex `^[a-z0-9][a-z0-9-]{0,79}$`; auto-derived; unique |
| description | text optional | unlimited |
| parent | UUID nullable | combobox over the tree (reuse `CategoryPicker` from P2-T12); cannot pick self or any descendant — the form filters out invalid parents client-side and the server rejects too |
| sort_order | integer | default 0; manual; sibling order |
| image_url | text url | upload via P2-T15's `/api/admin/images/upload` route — needs a `?context=category-cover` query so server stores under `category-covers/` instead of `<productId>/` |
| meta_title | text | optional; ≤ 60 chars |
| meta_description | text | optional; ≤ 160 chars |

**Cannot pick self or descendant as parent.** Server uses `category_with_descendants` to validate:

```sql
WITH descendants AS (
  SELECT descendant_id FROM category_with_descendants WHERE ancestor_id = $1
)
SELECT EXISTS (SELECT 1 FROM descendants WHERE descendant_id = $newParent);
```

If true, reject with field-level error: "Cannot move a category under itself or its descendant".

**Slug uniqueness.** Globally unique (matches the DB constraint). On collision, surface as a slug-field error.

**Cover-image upload — reuses P2-T15 pipeline.** The `/api/admin/images/upload` route accepts a `?context=category-cover&categoryId=<id>` query param, stores in a separate Storage prefix, and returns the public URL. **If P2-T15 doesn't already support the `context` param, extend it in this task with a one-line if-branch.** Use the same MIME/size/dimension/EXIF rules.

**Audit log.** `category.create` or `category.update` with full before/after.

**Revalidation map (per [caching-and-revalidation.md](../../architecture/caching-and-revalidation.md)):**
- `revalidateTag('categories')` — covers Atlas + storefront category cards
- `revalidatePath('/c/' + oldSlug)` — if updating
- `revalidatePath('/c/' + newSlug)` — if slug changed (or new category)
- `revalidatePath('/')` — if top-level category (shown in Atlas)

**Storefront breakage check.** If category's slug changes and was previously linked from a homepage CMS module (Phase 4), the old slug 404s. For MVP, we don't have homepage CMS — defer this concern. Document for Phase 4.

# Acceptance criteria

- [ ] `/admin/categories/new` creates a category; redirects to `/admin/categories/<new-id>/edit`.
- [ ] Edit form saves all fields; slug auto-derives until manually edited.
- [ ] Picking a descendant or self as parent → rejected with field error.
- [ ] Slug collision → inline error.
- [ ] Cover image uploads via existing pipeline; URL stored in `categories.image_url`.
- [ ] Audit log entries written; revalidation called.
- [ ] `pnpm tsc --noEmit`, `pnpm lint`, `pnpm build`, `pnpm exec vitest run __tests__/db/admin/category-edit.test.ts` green.

# Verification

```bash
cd web
pnpm exec vitest run __tests__/db/admin/category-edit.test.ts
pnpm dev &
sleep 4
# /admin/categories/new → create "Test category" → redirected to /edit
# Edit it → set parent → save → tree view (P2-T18) reflects the move
# Try setting parent to self → field error
```

# Dependencies added

None.

# Notes for next agent

(empty)
