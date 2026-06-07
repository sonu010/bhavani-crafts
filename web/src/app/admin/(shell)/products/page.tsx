import Link from "next/link";
import { Plus } from "lucide-react";
import { requireAdminContext } from "@/lib/db/admin-context";
import {
  countProductsByStatus,
  decodeCursor,
  getAdminFilterOptions,
  listProductsAdmin,
  type AdminProductSort,
  type AdminProductStatus,
} from "@/lib/db/admin/products";
import { getCategoryTree } from "@/lib/db/categories";
import type { CategoryTreeNode } from "@/lib/schemas/category";
import { perfStart } from "@/lib/perf";
import { FilterBar } from "./filter-bar";
import { LoadMore } from "./load-more";
import { ProductsTable } from "./products-table";
import { StatusChips } from "./status-chips";
import type { Database } from "@/lib/db/types.gen";

export const dynamic = "force-dynamic";

/**
 * /admin/products
 *
 * Default filter: `?status=needs_review&sort=newest` — the cleaned
 * fixture's 5,804 products are the owner's import queue. Locked in
 * SESSION-RESUME §"Admin products-list default filter"; flip the
 * constants below when `needs_review` count drops < 50 (steady state).
 *
 * 25 rows per page. "Load more" appends ?cursor= and re-renders.
 * Filters (q, category, tags, stock, source) compose AND with the
 * status chip via the URL — no client-side filter state.
 */
const DEFAULT_STATUS: AdminProductStatus = "needs_review";
const DEFAULT_SORT: AdminProductSort = "newest";

const VALID_STATUSES: readonly AdminProductStatus[] = [
  "draft",
  "needs_review",
  "ready_to_publish",
  "published",
  "archived",
];
const VALID_SORTS: readonly AdminProductSort[] = [
  "newest",
  "updated_at_desc",
  "name_asc",
];
const VALID_STOCK: readonly Database["public"]["Enums"]["stock_status"][] = [
  "in_stock",
  "low_stock",
  "out_of_stock",
  "made_to_order",
  "unknown",
];
const VALID_SOURCE: readonly Database["public"]["Enums"]["product_source"][] = [
  "manual",
  "justkraft_seed",
  "csv_import",
  "ai_assisted",
];

function pickOne<T extends string>(
  raw: string | string[] | undefined,
  allowed: readonly T[],
): T | undefined {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v && allowed.includes(v as T) ? (v as T) : undefined;
}

/**
 * `?status=all` is the explicit opt-out — clears the default
 * needs_review filter so the owner can see every product (or apply
 * stock / uncategorised / source filters across the whole catalog).
 * The dashboard widget rows use this. Any unknown value falls through
 * to the default.
 */
function pickStatus(
  raw: string | string[] | undefined,
): AdminProductStatus | undefined {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v === "all") return undefined;
  return pickOne(raw, VALID_STATUSES) ?? DEFAULT_STATUS;
}

function pickSort(raw: string | string[] | undefined): AdminProductSort {
  return pickOne(raw, VALID_SORTS) ?? DEFAULT_SORT;
}

function pickString(raw: string | string[] | undefined): string | undefined {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v && v.length > 0 ? v : undefined;
}

function pickTagList(raw: string | string[] | undefined): string[] | undefined {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (!v) return undefined;
  const parts = v.split(",").map((s) => s.trim()).filter(Boolean);
  return parts.length > 0 ? parts : undefined;
}

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string | string[];
    sort?: string | string[];
    cursor?: string | string[];
    q?: string | string[];
    category?: string | string[];
    tags?: string | string[];
    stock?: string | string[];
    source?: string | string[];
    uncategorized?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const status = pickStatus(params.status);
  const sort = pickSort(params.sort);
  const cursor = decodeCursor(
    Array.isArray(params.cursor) ? params.cursor[0] : params.cursor,
  );
  const q = pickString(params.q);
  const categoryId = pickString(params.category);
  const tagSlugs = pickTagList(params.tags);
  const stock = pickOne(params.stock, VALID_STOCK);
  const source = pickOne(params.source, VALID_SOURCE);
  // Truthy "1", "true", or even empty-string (`?uncategorized`) — be
  // forgiving on the boolean param.
  const uncategorizedRaw = Array.isArray(params.uncategorized)
    ? params.uncategorized[0]
    : params.uncategorized;
  const uncategorized = uncategorizedRaw !== undefined && uncategorizedRaw !== "0";

  const t = perfStart("/admin/products");
  // Gate before any service-role read. See lib/db/admin-context.ts —
  // Next 16's parallel layout/page fetching means a check in the parent
  // layout doesn't block the page's DB calls. Authorization belongs at
  // the data-access boundary.
  const { admin } = await requireAdminContext();
  t.mark("auth");
  const [counts, page, filterOptions, categoryTree] = await Promise.all([
    countProductsByStatus(admin),
    listProductsAdmin(admin, {
      status,
      sort,
      cursor,
      q,
      categoryId,
      uncategorized,
      tagSlugs,
      stock,
      source,
    }),
    getAdminFilterOptions(admin),
    getCategoryTree(admin),
  ]);
  t.mark("queries");
  t.end();

  // Preserve filter params on chip + load-more URL construction.
  const baseParams: Record<string, string> = {};
  if (q) baseParams.q = q;
  if (categoryId) baseParams.category = categoryId;
  if (tagSlugs && tagSlugs.length > 0) baseParams.tags = tagSlugs.join(",");
  if (stock) baseParams.stock = stock;
  if (source) baseParams.source = source;
  if (uncategorized) baseParams.uncategorized = "1";

  // backHref captures the current filter state so the editor breadcrumb
  // returns the user to the same view. Status + sort stay in the URL
  // even at defaults so the editor never bounces back to ?status=
  // needs_review when the user filtered to something else.
  const listParams = new URLSearchParams();
  // When the owner opted out of the default status filter via
  // ?status=all, preserve that on the back-href too.
  listParams.set("status", status ?? "all");
  listParams.set("sort", sort);
  for (const [k, v] of Object.entries(baseParams)) listParams.set(k, v);
  const backHref = `/admin/products?${listParams.toString()}`;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-2xl text-bark-900 sm:text-3xl">Products</h1>
          {/* Helper copy is desk-only — mobile starts with the controls. */}
          <p className="hidden text-sm text-stone-500 sm:block">
            Imported rows live under{" "}
            <span className="font-mono text-bark-900">Needs review</span>. Work
            the queue down; the default filter flips to{" "}
            <span className="font-mono text-bark-900">Published</span> once the
            queue drops below 50.
          </p>
        </div>
        {/* "New product" — primary action, top-right. Inserts a draft
           row via the new-product route and redirects into the editor. */}
        <Link
          href="/admin/products/new"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-bark-900 px-4 py-2 text-sm font-medium text-paper-0 transition-colors hover:bg-bark-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bark-900"
        >
          <Plus className="size-3.5" />
          New product
        </Link>
      </header>

      <FilterBar options={filterOptions} />

      <StatusChips counts={counts} active={status} sort={sort} extraParams={baseParams} />

      <ProductsTable
        rows={page.items}
        backHref={backHref}
        allTags={filterOptions.tags}
        categoryOptions={flattenCategoriesForPicker(categoryTree)}
      />

      <LoadMore
        cursor={page.nextCursor}
        status={status ?? "all"}
        sort={sort}
        extraParams={baseParams}
      />
    </div>
  );
}

/**
 * Flatten the recursive category tree into a depth-aware list the
 * bulk-toolbar move dropdown can render with indentation.
 */
function flattenCategoriesForPicker(
  tree: CategoryTreeNode[],
  depth = 0,
  out: Array<{ id: string; name: string; depth: number }> = [],
): Array<{ id: string; name: string; depth: number }> {
  for (const n of tree) {
    out.push({ id: n.id, name: n.name, depth });
    if (n.children.length > 0) flattenCategoriesForPicker(n.children, depth + 1, out);
  }
  return out;
}
