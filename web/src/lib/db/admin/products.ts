/**
 * Admin-side product queries.
 *
 * Diverges from lib/db/products.ts in three ways:
 *   1. Includes unpublished + non-archived rows by default (storefront
 *      sees only is_published=true).
 *   2. Selects review_status / is_published / updated_at / first image
 *      so the admin table can render them.
 *   3. Filter axis is review_status (the lifecycle), not stock_status.
 *
 * Soft-deleted rows are still hidden everywhere — the Trash view
 * (P2-T28) is the only consumer that surfaces them.
 *
 * DI Supabase client per ADR-010. Service-role is what the admin layout
 * passes in; RLS is admin-only-write for catalog tables but admin-read
 * works for either role.
 */
import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types.gen";
import { getDescendantIds } from "@/lib/db/categories";
import { buildTsquery, tokenize } from "@/lib/db/search";

type SC = SupabaseClient<Database>;
type StockStatus = Database["public"]["Enums"]["stock_status"];
type ProductSource = Database["public"]["Enums"]["product_source"];

/** Hard cap on candidate IDs returned by the search clause. Admin search is
 *  for "find me one row to edit", not for paging through thousands. */
const SEARCH_CANDIDATE_LIMIT = 500;

export const ADMIN_LIST_DEFAULT_PER_PAGE = 25;
export const ADMIN_LIST_MAX_PER_PAGE = 100;

export type AdminProductStatus =
  | "draft"
  | "needs_review"
  | "ready_to_publish"
  | "published"
  | "archived";

export type AdminProductSort = "newest" | "updated_at_desc" | "name_asc";

export interface AdminCursor {
  // (created_at | updated_at | name) of the boundary row + id tie-breaker.
  primary: string;
  id: string;
}

export const AdminProductRowSchema = z.object({
  id: z.string().uuid(),
  sku: z.string().nullable(),
  slug: z.string(),
  name: z.string(),
  base_price_inr: z.number().nullable(),
  review_status: z.enum([
    "draft",
    "needs_review",
    "ready_to_publish",
    "published",
    "archived",
  ]),
  is_published: z.boolean(),
  stock_status: z.enum([
    "in_stock",
    "low_stock",
    "out_of_stock",
    "made_to_order",
    "unknown",
  ]),
  created_at: z.string(),
  updated_at: z.string(),
  category: z
    .object({ id: z.string().uuid(), slug: z.string(), name: z.string() })
    .nullable(),
  thumbnail_url: z.string().url().nullable(),
});

export type AdminProductRow = z.infer<typeof AdminProductRowSchema>;

export interface ListProductsAdminOpts {
  status?: AdminProductStatus;
  sort?: AdminProductSort;
  cursor?: AdminCursor | null;
  perPage?: number;
  /** Free-text search; matches FTS + slug ILIKE + sku ILIKE (OR'd). */
  q?: string;
  /** Narrow to a category AND all its descendants (uses 0007's view). */
  categoryId?: string;
  /** OR-semantics: products matching ANY of these tag slugs. */
  tagSlugs?: string[];
  /** Single-value enum filters. */
  stock?: StockStatus;
  source?: ProductSource;
}

export interface ListProductsAdminResult {
  items: AdminProductRow[];
  nextCursor: AdminCursor | null;
}

function clampPerPage(v: number | undefined): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return ADMIN_LIST_DEFAULT_PER_PAGE;
  return Math.min(ADMIN_LIST_MAX_PER_PAGE, Math.max(1, Math.floor(v)));
}

/**
 * Cursor → URL token. Base64url JSON. Forward-only pagination; "previous"
 * is the browser back button or a fresh URL.
 */
export function encodeCursor(c: AdminCursor): string {
  return Buffer.from(JSON.stringify(c), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function decodeCursor(token: string | null | undefined): AdminCursor | null {
  if (!token) return null;
  try {
    const padded = token.replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(padded, "base64").toString("utf8");
    const parsed = JSON.parse(json);
    if (
      typeof parsed?.primary === "string" &&
      typeof parsed?.id === "string"
    ) {
      return { primary: parsed.primary, id: parsed.id };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Compute the candidate product IDs that match the free-text query.
 * Combines three sources: FTS on `products.fts`, slug ILIKE, sku ILIKE.
 * Each source caps at SEARCH_CANDIDATE_LIMIT; the union is capped at
 * the same limit. Returns an empty array when the query matches nothing.
 */
async function candidateIdsForQuery(supabase: SC, q: string): Promise<string[]> {
  const tokens = tokenize(q);
  const tsquery = tokens.length > 0 ? buildTsquery(tokens, new Map()) : "";

  const slugRes = await supabase
    .from("products")
    .select("id")
    .is("deleted_at", null)
    .ilike("slug", `%${q}%`)
    .limit(SEARCH_CANDIDATE_LIMIT);
  if (slugRes.error) throw new Error(`candidateIdsForQuery (slug): ${slugRes.error.message}`);

  const skuRes = await supabase
    .from("products")
    .select("id")
    .is("deleted_at", null)
    .ilike("sku", `%${q}%`)
    .limit(SEARCH_CANDIDATE_LIMIT);
  if (skuRes.error) throw new Error(`candidateIdsForQuery (sku): ${skuRes.error.message}`);

  const ftsRes = tsquery
    ? await supabase
        .from("products")
        .select("id")
        .is("deleted_at", null)
        .textSearch("fts", tsquery, { config: "english" })
        .limit(SEARCH_CANDIDATE_LIMIT)
    : { data: [] as Array<{ id: string }>, error: null as null | { message: string } };
  if (ftsRes.error) throw new Error(`candidateIdsForQuery (fts): ${ftsRes.error.message}`);

  const set = new Set<string>();
  for (const r of [slugRes, skuRes, ftsRes]) {
    for (const row of r.data ?? []) {
      if (set.size >= SEARCH_CANDIDATE_LIMIT) break;
      set.add(row.id);
    }
  }
  return [...set];
}

/**
 * Compute the candidate product IDs that have at least one of the given
 * tag slugs. OR-semantics. Capped at SEARCH_CANDIDATE_LIMIT.
 */
async function candidateIdsForTags(
  supabase: SC,
  tagSlugs: string[],
): Promise<string[]> {
  if (tagSlugs.length === 0) return [];
  const { data, error } = await supabase
    .from("product_tags")
    .select("product_id, tag:tags!inner(slug)")
    .in("tag.slug" as never, tagSlugs)
    .limit(SEARCH_CANDIDATE_LIMIT);
  if (error) throw new Error(`candidateIdsForTags: ${error.message}`);
  const set = new Set<string>();
  for (const row of (data as Array<{ product_id: string }>) ?? []) {
    if (set.size >= SEARCH_CANDIDATE_LIMIT) break;
    set.add(row.product_id);
  }
  return [...set];
}

export async function listProductsAdmin(
  supabase: SC,
  opts: ListProductsAdminOpts = {},
): Promise<ListProductsAdminResult> {
  const perPage = clampPerPage(opts.perPage);
  const sort = opts.sort ?? "newest";

  // Compute id-set narrowing from q + tagSlugs in parallel. Intersect when
  // both are set; falls through to no-filter when neither is.
  const [searchIds, tagIds, categoryDescendantIds] = await Promise.all([
    opts.q && opts.q.trim() ? candidateIdsForQuery(supabase, opts.q.trim()) : Promise.resolve(null),
    opts.tagSlugs && opts.tagSlugs.length > 0
      ? candidateIdsForTags(supabase, opts.tagSlugs)
      : Promise.resolve(null),
    opts.categoryId ? getDescendantIds(supabase, opts.categoryId) : Promise.resolve(null),
  ]);

  // Search and tag results intersect (both AND-combined into the page).
  let idFilter: string[] | null = null;
  if (searchIds && tagIds) {
    const tagSet = new Set(tagIds);
    idFilter = searchIds.filter((id) => tagSet.has(id));
  } else if (searchIds) {
    idFilter = searchIds;
  } else if (tagIds) {
    idFilter = tagIds;
  }
  // If a filter narrowed to an empty set, short-circuit.
  if (idFilter && idFilter.length === 0) {
    return { items: [], nextCursor: null };
  }

  let q = supabase
    .from("products")
    .select(
      `
        id, sku, slug, name, base_price_inr, review_status, is_published,
        stock_status, created_at, updated_at,
        category:categories(id, slug, name),
        thumbnail:product_images(url, sort_order)
      `,
    )
    .is("deleted_at", null);

  if (opts.status) {
    q = q.eq("review_status", opts.status);
  }
  if (opts.stock) {
    q = q.eq("stock_status", opts.stock);
  }
  if (opts.source) {
    q = q.eq("source", opts.source);
  }
  if (categoryDescendantIds && categoryDescendantIds.length > 0) {
    q = q.in("category_id", categoryDescendantIds);
  } else if (categoryDescendantIds && categoryDescendantIds.length === 0) {
    // Category id didn't resolve to any descendants (shouldn't happen for
    // valid input, but guard anyway).
    return { items: [], nextCursor: null };
  }
  if (idFilter) {
    q = q.in("id", idFilter);
  }

  // Apply sort + cursor (forward-only).
  if (sort === "newest") {
    q = q.order("created_at", { ascending: false }).order("id", { ascending: false });
    if (opts.cursor) {
      q = q.or(
        `created_at.lt.${opts.cursor.primary},and(created_at.eq.${opts.cursor.primary},id.lt.${opts.cursor.id})`,
      );
    }
  } else if (sort === "updated_at_desc") {
    q = q.order("updated_at", { ascending: false }).order("id", { ascending: false });
    if (opts.cursor) {
      q = q.or(
        `updated_at.lt.${opts.cursor.primary},and(updated_at.eq.${opts.cursor.primary},id.lt.${opts.cursor.id})`,
      );
    }
  } else if (sort === "name_asc") {
    q = q.order("name", { ascending: true }).order("id", { ascending: true });
    if (opts.cursor) {
      q = q.or(
        `name.gt.${opts.cursor.primary},and(name.eq.${opts.cursor.primary},id.gt.${opts.cursor.id})`,
      );
    }
  }

  q = q.limit(perPage + 1); // +1 to detect "has more"

  const { data, error } = await q;
  if (error) throw new Error(`listProductsAdmin: ${error.message}`);

  // Supabase joins return arrays; pick the first thumbnail by sort_order.
  type RawRow = (typeof data extends Array<infer R> ? R : never) & {
    category: { id: string; slug: string; name: string } | null;
    thumbnail: { url: string; sort_order: number }[] | null;
  };

  const rows = (data ?? []).map((raw) => {
    const r = raw as unknown as RawRow;
    const firstImage =
      (r.thumbnail ?? [])
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order)[0]?.url ?? null;
    return {
      id: r.id,
      sku: r.sku,
      slug: r.slug,
      name: r.name,
      base_price_inr: r.base_price_inr,
      review_status: r.review_status,
      is_published: r.is_published,
      stock_status: r.stock_status,
      created_at: r.created_at,
      updated_at: r.updated_at,
      category: r.category,
      thumbnail_url: firstImage,
    };
  });

  const parsed = AdminProductRowSchema.array().parse(rows);
  const hasMore = parsed.length > perPage;
  const items = hasMore ? parsed.slice(0, perPage) : parsed;

  let nextCursor: AdminCursor | null = null;
  if (hasMore) {
    const last = items[items.length - 1];
    const primary =
      sort === "newest"
        ? last.created_at
        : sort === "updated_at_desc"
          ? last.updated_at
          : last.name;
    nextCursor = { primary, id: last.id };
  }
  return { items, nextCursor };
}

export interface AdminFilterOptions {
  categories: Array<{ id: string; slug: string; name: string }>;
  tags: Array<{ slug: string; name: string }>;
}

/**
 * Data for the filter bar: top-level categories + every tag. Cheap; both
 * tables are small (353 + ~458 rows).
 */
export async function getAdminFilterOptions(supabase: SC): Promise<AdminFilterOptions> {
  const [catsRes, tagsRes] = await Promise.all([
    supabase
      .from("categories")
      .select("id, slug, name")
      .is("parent_id", null)
      .is("deleted_at", null)
      .order("name", { ascending: true }),
    supabase
      .from("tags")
      .select("slug, name")
      .is("deleted_at", null)
      .order("name", { ascending: true }),
  ]);
  if (catsRes.error) throw new Error(`getAdminFilterOptions(categories): ${catsRes.error.message}`);
  if (tagsRes.error) throw new Error(`getAdminFilterOptions(tags): ${tagsRes.error.message}`);
  return {
    categories: catsRes.data ?? [],
    tags: tagsRes.data ?? [],
  };
}

export type ProductStatusCounts = Record<AdminProductStatus, number>;

export async function countProductsByStatus(
  supabase: SC,
): Promise<ProductStatusCounts> {
  // Five parallel head-count queries — PostgREST doesn't support
  // count(*) FILTER (WHERE …) directly. Acceptable: each is indexed by
  // (review_status, deleted_at) and runs ~ms.
  const statuses: AdminProductStatus[] = [
    "draft",
    "needs_review",
    "ready_to_publish",
    "published",
    "archived",
  ];
  const counts = await Promise.all(
    statuses.map((s) =>
      supabase
        .from("products")
        .select("*", { count: "exact", head: true })
        .is("deleted_at", null)
        .eq("review_status", s),
    ),
  );
  const out = {} as ProductStatusCounts;
  for (let i = 0; i < statuses.length; i++) {
    const { count, error } = counts[i];
    if (error) throw new Error(`countProductsByStatus(${statuses[i]}): ${error.message}`);
    out[statuses[i]] = count ?? 0;
  }
  return out;
}
