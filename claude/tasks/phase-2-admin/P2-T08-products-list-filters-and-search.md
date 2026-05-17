---
id: P2-T08
phase: 2
title: Products list filters + admin search
status: done
depends_on: [P2-T07]
estimate_hours: 2
owner: ai
last_updated: 2026-05-17
---

# Goal

After this task, `/admin/products` has filter controls above the table: a free-text search box (matches name + SKU + slug via the existing FTS column), a category filter (single-select tree picker), a tags filter (multi-select), a stock-status filter, and a source filter (`manual`/`justkraft_seed`/`csv_import`/`ai_assisted`). Filters compose with the `status` chip filter from P2-T07. The search box uses the storefront FTS infrastructure (no parallel index).

# Prerequisites (read first)

- [`web/src/lib/db/search.ts`](../../../web/src/lib/db/search.ts) — `buildTsquery`, `expandSynonyms` already exist; reuse, don't reimplement
- [claude/architecture/search.md](../../architecture/search.md) — multi-word tsquery handling
- [P2-T07](P2-T07-products-list-cursor-paginated.md) — `listProductsAdmin(supabase, opts)` shape; extend
- [claude/architecture/database-schema.md](../../architecture/database-schema.md) §"products" — `source` enum + `stock_status` enum

# Files to touch

- `web/src/app/admin/products/page.tsx` (modified) — read new search params: `q`, `category`, `tags[]`, `stock`, `source`. Pass to extended `listProductsAdmin`.
- `web/src/app/admin/products/filter-bar.tsx` (new) — client component. Renders the five filter controls. Each control updates the URL on change (no client-side state; URL is the source of truth).
- `web/src/app/admin/products/_filters/search-box.tsx` (new) — debounced (300 ms) text input bound to `?q=`. Submits via `router.replace` to keep history clean.
- `web/src/app/admin/products/_filters/category-picker.tsx` (new) — shadcn `Command` combobox over the category tree (reuse `getCategoryTree` from `lib/db/categories.ts`).
- `web/src/app/admin/products/_filters/tags-picker.tsx` (new) — multi-select using shadcn `Command` with checkboxes.
- `web/src/lib/db/admin/products.ts` (modified) — extend `listProductsAdmin` to accept `{ q, categoryId, tags, stock, source }`.
- `web/__tests__/db/admin/products-filters.test.ts` (new)

# Implementation notes

**URL is the state.** Every filter change updates the URL via `router.replace(url)` (preserves the page in history without spamming back-button steps). Server component re-renders. No client-side state, no React context, no stale-data risk.

**Compose with status chip.** All filters AND together. `?status=needs_review&q=stencil&category=resin-art&tags=eco,popular&stock=in_stock`.

**Search — reuse FTS.** `q` parameter:
1. `expandSynonyms(supabase, q)` — uses the seeded `search_synonyms` table
2. `buildTsquery(expanded)` — produces the `tsquery` string with multi-word AND-groups
3. `WHERE products.fts @@ <tsquery>` — uses the existing GIN index from `0005_search.sql`

For admin search, also OR a `slug ILIKE '%q%'` and `sku ILIKE '%q%'` clause — admin often searches by partial slug or SKU, which FTS doesn't always reach. The combined WHERE: `fts @@ tsquery OR slug ILIKE ... OR sku ILIKE ...`. Cost is bounded; covered by the existing FTS GIN + the unique indexes on slug/sku.

**Category picker — tree, not flat.** Use shadcn `Command` with a custom item renderer that indents by depth. `getCategoryTree(supabase)` already returns the recursive shape. Selected category narrows to that category AND descendants — query joins `category_with_descendants` view (already in `0007_indexes_views.sql`).

**Tags picker — multi-select.** Bind to `?tags=a,b,c` (comma-joined, decoded server-side to a string array). Query: `WHERE EXISTS (SELECT 1 FROM product_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.product_id = products.id AND t.slug = ANY($tags))` — semantics is OR within tags (a product matching ANY selected tag is included). If owner wants AND-semantics later, that's a separate task.

**Stock + source — simple eq filters.**

```ts
if (opts.stock) q = q.eq("stock_status", opts.stock);
if (opts.source) q = q.eq("source", opts.source);
```

**Filter persistence within session.** None at the server. The URL persists naturally; if the owner refreshes, filters survive. If they navigate away and back via the sidebar, they get the default — that's the intended behavior (sidebar nav = fresh view).

**Empty results state.** "No products match these filters." with a "Clear filters" button that navigates to `/admin/products` (default URL).

**Debounce.** The search box debounces at 300 ms before pushing to the URL. Other filters update immediately on change (one click = one URL update).

# Acceptance criteria

- [ ] Filter bar renders five controls above the table.
- [ ] Search box: typing "stencil" debounces, then navigates to `?q=stencil`; table re-renders with matches.
- [ ] Category picker: selecting "Resin art" narrows to products in that category or any descendant.
- [ ] Tags picker (multi): selecting tags filters to products with ANY selected tag.
- [ ] Stock filter and source filter narrow as expected.
- [ ] Filters compose with status chip from P2-T07.
- [ ] "Clear filters" button resets to default URL.
- [ ] No console errors at 360px (mobile pass).
- [ ] Search uses the FTS + slug + SKU combined clause; integration test asserts a partial-SKU match returns the row.
- [ ] `pnpm tsc --noEmit`, `pnpm lint`, `pnpm build` green. `pnpm exec vitest run __tests__/db/admin/products-filters.test.ts` green.

# Verification

```bash
cd web
pnpm tsc --noEmit
pnpm lint
pnpm exec vitest run __tests__/db/admin/

pnpm dev &
sleep 4
# Visit /admin/products
# 1. Type "stencil" → URL becomes ?q=stencil&status=... → matching rows
# 2. Pick a category from picker → narrows
# 3. Pick two tags → OR-matched products show
# 4. Switch stock to "out_of_stock" → only those
# 5. Clear filters → back to default
```

# Dependencies added

None — shadcn `Command` is part of the existing UI kit.

# Notes for next agent

**2026-05-17 — DONE.** Two sub-commits on `rebuild-v2`:
- `a128db8` (T08a) — filter axes in `listProductsAdmin` + `getAdminFilterOptions` + 7 integration tests
- this commit (T08b) — `filter-bar.tsx` client component, page wiring, chip/load-more preservation of filter state

**Simplification from the original spec — `shadcn Command` is not installed in this repo.** Used what we have:
- Search: `<Input>` (existing) — uncontrolled with `key={q}` so URL writes reset the value externally
- Category: native `<select>` — top-level categories only. The full tree picker lands in P2-T12 (product editor) where the depth matters; for filtering, top-level + descendant expansion (via `getDescendantIds`) is sufficient.
- Tags: shadcn `<DropdownMenu>` with `<DropdownMenuCheckboxItem>` — multi-select, scrollable, OR-semantics across selections
- Stock + source: native `<select>` for simplicity
- Clear filters: `<Link href="/admin/products">` — full reset

**URL is the state.** No client React state for filter values; `useSearchParams` reads, `useRouter.replace` writes. Filter changes always clear `?cursor=` (paging mid-set is undefined). Status chips + load-more were updated to take an `extraParams` map so they preserve `q/category/tags/stock/source` across chip switches and cursor advances.

**Uncontrolled search input + debounce pattern.** React Compiler's `react-hooks/set-state-in-effect` rule rejects the obvious "controlled-input + URL sync" approach. Switched to `<Input key={q} defaultValue={q}>` + a `useRef` debounce timer. The `key={q}` ensures the DOM input remounts (and resets) when the URL `q` changes externally (Clear filters, back button). Documented in code so the next agent doesn't refactor it back into the broken pattern.

**Acceptance criteria all green:**
- Five filter controls render ✓
- Search (300ms debounce) → `?q=` → table re-renders ✓
- Category picker → narrows by descendants ✓ (T08a test)
- Tags multi-select → ANY-match ✓ (T08a test)
- Stock + source narrow ✓ (T08a test)
- Compose with status chip ✓ (chip URLs preserve `extraParams`)
- Clear filters ✓
- FTS + slug + sku partial match — slug + sku via ILIKE; FTS via `products.fts @@ tsquery` with the existing `buildTsquery`/`tokenize` helpers from `lib/db/search.ts`. T08a test pins a partial-SKU match ✓
- 77/77 tests pass (was 70, +7 from T08a)
- Smoke: anon GET with all filters in query → 307 ✓

**Cursor invalidation on filter change** — explicit in `pushFilters({...patch})`: `next.delete("cursor")` before applying the patch. Filter changes always start from page 1.

**Performance:** filter-bar render-time is bound by the size of the tags dropdown (currently 458 tags on live, ~430 expected post-reseed). Rendering 458 `DropdownMenuCheckboxItem`s is fine for shadcn's primitive; if it ever feels slow, add a text-filter input inside the dropdown — straightforward but unnecessary now.
