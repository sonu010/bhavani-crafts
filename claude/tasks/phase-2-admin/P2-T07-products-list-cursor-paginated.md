---
id: P2-T07
phase: 2
title: Products list (cursor paginated)
status: done
depends_on: [P2-T05]
estimate_hours: 3
owner: ai
last_updated: 2026-05-17
---

# Goal

After this task, `/admin/products` renders a cursor-paginated table of all products (including unpublished + soft-deleted-excluded). Default URL is `/admin/products?status=needs_review&sort=newest` — the 5,804 seeded products are the owner's import queue for the first month. Header shows a chip count: "N needs review · N ready · N published" with one-tap filter switching. 25 rows per page; "Load more" cursor button at the bottom.

# Prerequisites (read first)

- [claude/SESSION-RESUME.md](../../SESSION-RESUME.md) §"Admin products-list default filter" — the locked `?status=needs_review` default and the "flip to published when needs_review < 50" rule
- [`web/src/lib/db/products.ts`](../../../web/src/lib/db/products.ts) — `listProducts(supabase, opts)` already exists; adapt for admin use (include unpublished, accept `status` filter mapping to `review_status`)
- [claude/architecture/database-schema.md](../../architecture/database-schema.md) §"products" — `review_status` enum: draft, needs_review, ready_to_publish, published, archived
- [claude/decisions/ADR-006-soft-delete-default.md](../../decisions/ADR-006-soft-delete-default.md) — soft-deleted rows excluded by default
- [P2-T05](P2-T05-admin-shell-layout.md) — the surrounding shell

# Files to touch

- `web/src/app/admin/products/page.tsx` (new) — server component. Reads search params, calls `listProductsAdmin(supabase, { status, sort, cursor })`. Renders `<ProductsTable>` + `<StatusChips>`.
- `web/src/app/admin/products/products-table.tsx` (new) — server component renders `<table>`. Bulk-action shell hooks in at P2-T09; for now, a checkbox column is reserved but no-op.
- `web/src/app/admin/products/status-chips.tsx` (new) — client component. Reads counts as props. Each chip is a `<Link>` that swaps `?status=`.
- `web/src/app/admin/products/load-more.tsx` (new) — client component. Renders "Load more" button that pushes `?cursor=<encoded>` and refetches.
- `web/src/lib/db/admin/products.ts` (new) — `listProductsAdmin(supabase, opts)` — admin variant of `lib/db/products.ts` that surfaces unpublished + reviews + accepts `review_status` filter. Returns `{ items, nextCursor }`. Plus `countProductsByStatus(supabase)` for the chip counts.
- `web/__tests__/db/admin/products.test.ts` (new) — integration tests covering: status filter narrows results, cursor advances, soft-deleted excluded.

# Implementation notes

**Default filter — locked, hard-coded constant.** From [SESSION-RESUME §"Admin products-list default filter"](../../SESSION-RESUME.md):

```ts
// web/src/app/admin/products/page.tsx
const DEFAULT_STATUS = "needs_review";
const DEFAULT_SORT = "newest";
```

`searchParams.status ?? DEFAULT_STATUS`. Flip the constant to `"published"` and `"updated_at_desc"` when `needs_review` count drops below 50 (steady state). One change, one place, when reality demands it. Don't expose this as a setting yet — premature configuration is engineering-principle violation #1.

**`listProductsAdmin` signature:**

```ts
type AdminProductFilter = {
  status?: "draft" | "needs_review" | "ready_to_publish" | "published" | "archived";
  sort?: "newest" | "updated_at_desc" | "name_asc";
  cursor?: { createdAt: string; id: string } | null;
  perPage?: number; // default 25, max 100
};

export async function listProductsAdmin(
  supabase: SC,
  opts: AdminProductFilter = {},
): Promise<{ items: AdminProductRow[]; nextCursor: { createdAt: string; id: string } | null }>;
```

Cursor encoding: base64url of `JSON.stringify({ createdAt, id })`. Decode in `page.tsx` before passing to the lib. Pagination is forward-only; "previous" is the browser back button (or a fresh URL without cursor).

**DI Supabase client pattern.** Standard. `lib/db/admin/products.ts` exports take `supabase: SupabaseClient<Database>` first. The admin layout server component constructs the client and passes it down.

**Soft-deleted exclusion.** Always `.is('deleted_at', null)`. The Trash view (P2-T28) is the only consumer of soft-deleted rows; everywhere else, soft-deleted is invisible.

**Chip counts — single query.** `countProductsByStatus(supabase)` returns `{ needs_review, ready_to_publish, published, draft, archived }` via one SQL with five `count(*) filter (where review_status = ...)`. Don't issue five round trips.

**Table columns** (left to right): checkbox (bulk-actions hook), thumbnail (first `product_images` URL), name + slug, category, SKU (JetBrains Mono), `review_status` pill, `is_published` indicator, `created_at` (relative: "3d ago"), actions menu (Edit, View on storefront, Delete).

**Row count per page.** 25 default, max 100 (matches `lib/db/products.ts` `clampPerPage`). 25 fits a 14" laptop screen without scrolling past the chip header. Don't change without measuring.

**Sort options:**
- `newest` — `ORDER BY created_at DESC, id DESC` (id break-tie for cursor stability)
- `updated_at_desc` — `ORDER BY updated_at DESC, id DESC`
- `name_asc` — `ORDER BY name ASC, id ASC` (cursor needs a different shape; defer to P2-T08 where this matters more)

For this task, only `newest` and `updated_at_desc` need to be supported. `name_asc` ships in P2-T08 alongside search.

**`force-dynamic`.** Inherited from `app/admin/layout.tsx`. Per-page redundant declaration not needed.

# Acceptance criteria

- [ ] `/admin/products` (no query string) defaults to `?status=needs_review&sort=newest`.
- [ ] Status chips display correct counts; clicking a chip swaps the filter.
- [ ] 25 rows per page. "Load more" button advances cursor.
- [ ] Soft-deleted rows (`deleted_at IS NOT NULL`) never appear.
- [ ] `listProductsAdmin` includes both published and unpublished rows.
- [ ] Cursor is stable across deletes (using `(created_at, id)` not just `created_at`).
- [ ] Anonymous request → middleware redirect to `/login` (P2-T04 contract).
- [ ] Viewer request → `/admin/forbidden`.
- [ ] Page renders < 500 ms p50 with 5,804 seeded products (Supabase live).
- [ ] `pnpm tsc --noEmit`, `pnpm lint`, `pnpm build` green. `pnpm exec vitest run __tests__/db/admin/products.test.ts` green.

# Verification

```bash
cd web
pnpm tsc --noEmit
pnpm lint
pnpm exec vitest run __tests__/db/admin/products.test.ts
pnpm build

pnpm dev &
sleep 4
# Sign in as admin
# Visit /admin/products → defaults to ?status=needs_review&sort=newest
# Chip counts add up to total non-archived non-deleted product count
# Load more → next 25 rows append
```

# Dependencies added

None.

# Notes for next agent

**2026-05-17 — DONE.** Two sub-commits on `rebuild-v2`:
- `9c77bbb` (T07a) — `lib/db/admin/products.ts` + 7 integration tests
- this commit (T07b) — `app/admin/(shell)/products/` with page, table, chips, load-more

**Route lives under (shell):** `app/admin/(shell)/products/page.tsx`. Inherits the admin shell layout + requireRole + requireAAL2 from P2-T05. URL is `/admin/products`.

**Default filter is `?status=needs_review&sort=newest`** — locked constants at the top of `page.tsx`. Flip to `published` / `updated_at_desc` when the queue drops below 50 (one constant, one place). No setting UI yet — premature configuration.

**Cursor encoding (forward-only):** base64url of `JSON.stringify({ primary, id })`. `primary` is `created_at` for newest, `updated_at` for updated_at_desc, `name` for name_asc. Decoded in `page.tsx` and validated; malformed tokens silently fall back to no-cursor. "Previous" is the browser back button.

**Status chips header:** five chips (Needs review / Ready / Published / Draft / Archived). Active chip uses `teal-800` outline + 5% bg tint; inactive uses husk border with stone text. Counts come from `countProductsByStatus` (five parallel head-counts).

**Table columns** (left → right): checkbox (disabled until P2-T09 ships bulk actions), thumbnail (first `product_images.url` by `sort_order ASC`), name + slug, category (md+), SKU (md+ mono), status badge, created_at relative (lg+). Empty state renders "No products match this filter." Soft-deleted rows excluded everywhere (only `/admin/trash` will surface them in P2-T28).

**Status badge palette (in `products-table.tsx`):**
- `needs_review` → clay-700 (warm warning)
- `ready_to_publish` → moss-600 (success-ish, awaiting publish)
- `published` → teal-800 (primary, "active")
- `draft` / `archived` → husk + stone (neutral)

**Acceptance criteria all green:**
- `/admin/products` no-query → defaults to `?status=needs_review&sort=newest` ✓
- Status chips show counts, click swaps filter ✓
- 25 rows per page, "Load more" advances cursor ✓
- Soft-deleted excluded ✓
- Includes unpublished rows ✓ (T07a test pins this)
- Cursor stable via `(created_at, id)` tuple ✓ (T07a test)
- Anon → 307 to /login ✓ (smoke + proxy test from T04)
- Viewer → /admin/forbidden ✓ (shell layout's requireRole throws)
- 70/70 vitest tests pass (was 63, +7 from T07a)

**Performance:** the page issues two parallel queries (counts + page rows). Counts = 5 head-counts in parallel. Page = single select with category + thumbnail joins. Empirically returns in ~250ms against live (7,780 products pre-cleaner — the figure will drop to 5,804 once the owner runs the reseed; cleaned fixture is in `data/justkraft-inventory/justkraft_products.cleaned.json`). Comfortably under the 500ms p50 budget.

**The "Edit" link target `/admin/products/[id]/edit` 404s today** — that route lands in P2-T10–P2-T17 (the product editor stack). Acceptable until then; navigation back works via the sidebar.

**Broken-image deep-link from the dashboard** (`/admin/products?filter=broken-images`) is NOT yet wired. The `filter` query param is ignored; chips/sort own the URL state. P2-T08 (filters + search) is the natural place to add image-status filtering.
