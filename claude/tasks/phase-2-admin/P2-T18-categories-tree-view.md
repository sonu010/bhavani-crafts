---
id: P2-T18
phase: 2
title: Categories tree view
status: done
depends_on: [P2-T05]
estimate_hours: 3
owner: ai
last_updated: 2026-05-18
---

# Goal

After this task, `/admin/categories` renders the full category tree (362 nodes) with expand/collapse, product counts per category (with-descendants), and per-row action buttons (Edit, Add child, Move, Soft delete). Tree state (expanded nodes) persists in URL search params so deep links survive reload. Editing + creating lands in P2-T19; bulk-move-products in P2-T20.

# Prerequisites (read first)

- [`web/src/lib/db/categories.ts`](../../../web/src/lib/db/categories.ts) — `getCategoryTree(supabase)` already exists
- [`web/supabase/migrations/0007_indexes_views.sql`](../../../web/supabase/migrations/0007_indexes_views.sql) — `category_with_descendants` recursive view for descendant counts
- [P2-T05](P2-T05-admin-shell-layout.md) — surrounding shell
- [P2-T19](P2-T19-categories-edit-and-create.md) / [P2-T20](P2-T20-categories-move-products.md) — downstream sibling tasks

# Files to touch

- `web/src/app/admin/categories/page.tsx` (new) — server component. Fetches tree + per-category product counts. Renders `<CategoriesTree>`.
- `web/src/app/admin/categories/categories-tree.tsx` (new) — client component. Recursive renderer; row per node with expand chevron, count badge, action menu.
- `web/src/lib/db/admin/categories.ts` (new) — `getCategoryTreeWithCounts(supabase)` — joins `category_with_descendants` to count products per ancestor.
- `web/__tests__/db/admin/categories.test.ts` (new)

# Implementation notes

**Tree rendering — recursive component.** Each row: chevron (rotates 90° when expanded), name (Manrope), product count (JetBrains Mono, stone-500), action menu. Indentation: 16px per depth. Render only visible nodes (collapsed branches don't mount their children) — at 362 nodes total, this isn't a perf problem, but the recursion bound is set by the deepest tree depth (likely ≤ 4).

**Product counts include descendants.** A top-level category like "Resin art" shows the count of all products under it directly + any sub-category. SQL uses `category_with_descendants`:

```sql
SELECT
  c.id, c.slug, c.name, c.parent_id, c.sort_order,
  count(p.id) AS product_count_with_descendants
FROM categories c
LEFT JOIN category_with_descendants cd ON cd.ancestor_id = c.id
LEFT JOIN products p
  ON p.category_id = cd.descendant_id
  AND p.deleted_at IS NULL
WHERE c.deleted_at IS NULL
GROUP BY c.id
ORDER BY c.parent_id NULLS FIRST, c.sort_order, c.name;
```

Direct-only counts (excluding descendants) shown on hover via tooltip.

**Expanded state in URL.** `?expanded=catId1,catId2,...`. Clicking a chevron updates the URL via `router.replace`. Reload preserves the expansion.

**Default expansion.** Top-level categories expanded; everything else collapsed.

**Action menu.**

| Action | Behavior |
|---|---|
| Edit | Navigate to `/admin/categories/<id>/edit` (P2-T19) |
| Add child | Navigate to `/admin/categories/new?parent=<id>` (P2-T19) |
| Move products | Navigate to `/admin/categories/<id>/move` (P2-T20) — bulk re-categorize all products in this category |
| Soft delete | Server action with confirm; soft-deletes the category; blocks if products still attached (since `ON DELETE RESTRICT`); also blocks if children exist |

**Soft delete confirm.** "Delete category 'X'? This will hide it from the storefront but you can restore from Trash. Products in this category will need to be re-categorized first."

**RLS posture.** Admin-only read of soft-deleted categories. The query filters `deleted_at IS NULL` because we render the live tree; trashed categories live in `/admin/trash`.

**Empty state.** If zero categories (impossible given the seed, but graceful), show "No categories. [Create the first →](/admin/categories/new)".

# Acceptance criteria

- [ ] `/admin/categories` renders the full tree.
- [ ] Product counts include descendants; hover shows direct-only count.
- [ ] Expand state persists in URL; reload preserves it.
- [ ] Top-level categories expanded by default.
- [ ] Action menu present on every row; navigation links work.
- [ ] Soft-delete action blocks if children or products exist; surfaces a clear error.
- [ ] Successful soft delete moves the category to Trash; storefront `/c/<slug>` returns 404 after revalidation.
- [ ] Tree renders < 200 ms p50 with 362 categories.
- [ ] `pnpm tsc --noEmit`, `pnpm lint`, `pnpm build`, `pnpm exec vitest run __tests__/db/admin/categories.test.ts` green.

# Verification

```bash
cd web
pnpm exec vitest run __tests__/db/admin/categories.test.ts
pnpm dev &
sleep 4
# /admin/categories → tree renders with counts
# Expand "Resin art" → see children with their own counts
# Soft-delete an empty leaf category → moves to Trash
# Soft-delete a category with products → blocked
```

# Dependencies added

None.

# Notes for next agent

  - **Action menu links are wired but their pages don't exist.**
    Edit (`/admin/categories/<id>/edit`), new (`/admin/categories/new`),
    move (`/admin/categories/<id>/move`) all return 404 until T19/T20
    land. The icon-link styling pre-stages the muscle memory.

  - **Soft-delete refuses on children or products.** The error
    surfaces as a toast (`has_children` shows N subcategories,
    `has_products` shows N products). No bulk recategorize affordance
    yet — that's T20.

  - **Per-node count uses descendants.** The badge shows the
    descendants-inclusive count; the badge `title` attribute
    surfaces both direct and descendants for clarity. Implemented
    via the `category_with_descendants` recursive view from 0007.

  - **Expand state in URL.** `?expanded=id1,id2,...`. Top-level
    nodes expand by default if no param is given. The router
    `replace` call is wrapped in `useTransition` so rapid toggles
    don't spam history.

  - **No `Button asChild` in the shadcn baseline.** This template
    uses @base-ui Button which doesn't accept `asChild`. The icon
    links use a hand-rolled `ICON_LINK_CLASS` that matches the
    `size=icon variant=outline` Button visually.

  - **`role=treeitem` requires `aria-selected`.** Set to `false`
    everywhere because the current UX doesn't have a selection model.
    Revisit if/when we add a "current category" highlight.
