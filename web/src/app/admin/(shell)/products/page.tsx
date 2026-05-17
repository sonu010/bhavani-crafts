import { createAdminClient } from "@/lib/db/admin";
import {
  countProductsByStatus,
  decodeCursor,
  listProductsAdmin,
  type AdminProductSort,
  type AdminProductStatus,
} from "@/lib/db/admin/products";
import { LoadMore } from "./load-more";
import { ProductsTable } from "./products-table";
import { StatusChips } from "./status-chips";

export const dynamic = "force-dynamic";

/**
 * /admin/products
 *
 * Default filter: `?status=needs_review&sort=newest` — the seeded
 * 5,804 products are the owner's import queue. Locked in
 * SESSION-RESUME §"Admin products-list default filter"; flip the
 * constants below when `needs_review` count drops < 50 (steady state).
 *
 * 25 rows per page (matches ADMIN_LIST_DEFAULT_PER_PAGE). "Load more"
 * appends ?cursor= and re-renders.
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

function pickStatus(raw: string | string[] | undefined): AdminProductStatus {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return VALID_STATUSES.includes(v as AdminProductStatus)
    ? (v as AdminProductStatus)
    : DEFAULT_STATUS;
}

function pickSort(raw: string | string[] | undefined): AdminProductSort {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return VALID_SORTS.includes(v as AdminProductSort)
    ? (v as AdminProductSort)
    : DEFAULT_SORT;
}

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string | string[];
    sort?: string | string[];
    cursor?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const status = pickStatus(params.status);
  const sort = pickSort(params.sort);
  const cursorRaw = Array.isArray(params.cursor) ? params.cursor[0] : params.cursor;
  const cursor = decodeCursor(cursorRaw);

  const supabase = createAdminClient();
  const [counts, page] = await Promise.all([
    countProductsByStatus(supabase),
    listProductsAdmin(supabase, { status, sort, cursor }),
  ]);

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="font-display text-3xl text-bark-900">Products</h1>
        <p className="text-sm text-stone-500">
          The 5,804 imported rows live under{" "}
          <span className="font-mono text-bark-900">Needs review</span>. Work
          the queue down; the default filter flips to{" "}
          <span className="font-mono text-bark-900">Published</span> once the
          queue drops below 50.
        </p>
      </header>

      <StatusChips counts={counts} active={status} sort={sort} />

      <ProductsTable rows={page.items} />

      <LoadMore cursor={page.nextCursor} status={status} sort={sort} />
    </div>
  );
}
