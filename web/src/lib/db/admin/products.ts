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
import { buildTsquery, fetchSynonyms, tokenize } from "@/lib/db/search";
import {
  ProductEditInputSchema,
  type ProductEditInput,
} from "@/lib/schemas/product";

type SC = SupabaseClient<Database>;
type StockStatus = Database["public"]["Enums"]["stock_status"];
type ProductSource = Database["public"]["Enums"]["product_source"];

/**
 * Tag filter still goes through a candidate-id intersection (PostgREST
 * can't filter a query on an unembedded EXISTS sub-clause in one hop).
 * Cap is set high enough to cover any single tag's product set in
 * the cleaned fixture (~5.8K products total, ~458 tags); revisit only
 * if a single tag ever exceeds this.
 */
const TAG_CANDIDATE_LIMIT = 10_000;

/**
 * Escape a value for inclusion inside a PostgREST `.or()` clause.
 * Values containing the URL-grammar separators (comma, colon, parens,
 * quotes) get wrapped in double quotes; embedded quotes get backslash-
 * escaped.
 */
function quoteForOr(value: string): string {
  if (/[,():"\s]/.test(value)) {
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  return value;
}

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
 * Build the PostgREST `.or()` clause for free-text search:
 *
 *     fts @@ tsquery OR slug ILIKE %q% OR sku ILIKE %q%
 *
 * Returns null when the query is empty. The clause is applied directly
 * on the main listProductsAdmin query so other filters (status, stock,
 * source, category) compose server-side — no candidate-id cap, full
 * paging through the result set.
 *
 * Inside `.or()`, PostgREST uses `*` (not `%`) as the ILIKE wildcard
 * and uses `,` as a clause separator + `:`/`(`/`)`/`"` as grammar
 * tokens. quoteForOr() wraps tsquery + ilike values in double-quotes
 * when they contain any of those.
 */
async function buildSearchOrClause(
  supabase: SC,
  q: string,
): Promise<string | null> {
  const trimmed = q.trim();
  if (!trimmed) return null;

  const tokens = tokenize(trimmed);
  // Synonyms — fetched bidirectionally so variant-spellings ("mold"
  // vs "mould") expand both ways. Same path the storefront uses.
  const synonymMap = await fetchSynonyms(supabase, tokens);
  const tsquery = tokens.length > 0 ? buildTsquery(tokens, synonymMap) : "";

  const ilikePattern = `*${trimmed}*`;
  const parts: string[] = [];
  if (tsquery) {
    parts.push(`fts.fts(english).${quoteForOr(tsquery)}`);
  }
  parts.push(`slug.ilike.${quoteForOr(ilikePattern)}`);
  parts.push(`sku.ilike.${quoteForOr(ilikePattern)}`);
  return parts.join(",");
}

/**
 * Tag-filter candidate IDs (OR-semantics across selected tag slugs).
 * Kept as a separate query because PostgREST can't express the
 * EXISTS-on-join filter we want in one hop. Cap is set high enough to
 * cover the largest plausible single-tag set in the catalog.
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
    .limit(TAG_CANDIDATE_LIMIT);
  if (error) throw new Error(`candidateIdsForTags: ${error.message}`);
  const set = new Set<string>();
  for (const row of (data as Array<{ product_id: string }>) ?? []) {
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

  // Resolve filter sources in parallel:
  //   - searchOrClause: server-side or() string (no candidate-id cap)
  //   - tagIds: candidate-id set from product_tags
  //   - categoryDescendantIds: id set from the 0007 recursive view
  const [searchOrClause, tagIds, categoryDescendantIds] = await Promise.all([
    opts.q ? buildSearchOrClause(supabase, opts.q) : Promise.resolve(null),
    opts.tagSlugs && opts.tagSlugs.length > 0
      ? candidateIdsForTags(supabase, opts.tagSlugs)
      : Promise.resolve(null),
    opts.categoryId ? getDescendantIds(supabase, opts.categoryId) : Promise.resolve(null),
  ]);

  // Tag filter narrowed to an empty set → no rows possible.
  if (tagIds && tagIds.length === 0) {
    return { items: [], nextCursor: null };
  }

  // Thumbnails are fetched in a SECOND query. PostgREST embeds aggregate
  // EVERY matching row for the embedded resource before the parent
  // LIMIT applies, so embedding product_images here turned a 200ms list
  // query into a 6700ms list query. Two bounded queries (products
  // limit 26 + a follow-up product_images IN those 26) is ~30× faster.
  let q = supabase
    .from("products")
    .select(
      `
        id, sku, slug, name, base_price_inr, review_status, is_published,
        stock_status, created_at, updated_at,
        category:categories(id, slug, name)
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
  if (tagIds) {
    q = q.in("id", tagIds);
  }
  if (searchOrClause) {
    q = q.or(searchOrClause);
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

  type RawRow = (typeof data extends Array<infer R> ? R : never) & {
    category: { id: string; slug: string; name: string } | null;
  };
  const baseRows = (data ?? []).map((raw) => raw as unknown as RawRow);

  const hasMore = baseRows.length > perPage;
  const trimmed = hasMore ? baseRows.slice(0, perPage) : baseRows;

  // Second query: thumbnails for the trimmed page only. One round-trip
  // returning ~50-80 rows (visible products × ~2-3 images each).
  // Building a Map keeps the merge O(visible).
  const thumbnailByProduct = new Map<string, string>();
  if (trimmed.length > 0) {
    const ids = trimmed.map((r) => r.id);
    const { data: imgs, error: imgsErr } = await supabase
      .from("product_images")
      .select("product_id, url, sort_order")
      .in("product_id", ids)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true });
    if (imgsErr) throw new Error(`listProductsAdmin (thumbnails): ${imgsErr.message}`);
    for (const img of imgs ?? []) {
      if (!thumbnailByProduct.has(img.product_id)) {
        thumbnailByProduct.set(img.product_id, img.url);
      }
    }
  }

  const rows = trimmed.map((r) => ({
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
    thumbnail_url: thumbnailByProduct.get(r.id) ?? null,
  }));

  const parsed = AdminProductRowSchema.array().parse(rows);
  const items = parsed;

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
  // Single round-trip via the products_status_counts() RPC (0009). The
  // previous implementation issued five parallel head-count queries,
  // each paying the ~250ms Supabase network floor; one RPC trims the
  // chip header off the page's critical path.
  const { data, error } = await supabase.rpc("products_status_counts");
  if (error) throw new Error(`countProductsByStatus: ${error.message}`);

  const out: ProductStatusCounts = {
    draft: 0,
    needs_review: 0,
    ready_to_publish: 0,
    published: 0,
    archived: 0,
  };
  for (const row of data ?? []) {
    out[row.review_status as AdminProductStatus] = Number(row.count);
  }
  return out;
}

// ─── Product editor — General tab (P2-T11) ──────────────────────────

/**
 * Editable shape returned to the General tab. Mirrors
 * ProductEditInputSchema's keys + adds id/category_slug for the
 * revalidation path lookup.
 */
export type AdminProductForEditing = ProductEditInput & {
  id: string;
  category_slug: string | null;
};

const PRODUCT_EDIT_SELECT =
  "id, name, slug, sku, short_description, description, base_price_inr, " +
  "compare_at_price_inr, stock_status, stock_quantity, low_stock_threshold, " +
  "allow_backorder, min_order_qty, max_order_qty, meta_title, meta_description, " +
  "category:categories(slug)";

type RawEditingRow = {
  id: string;
  name: string;
  slug: string;
  sku: string;
  short_description: string | null;
  description: string | null;
  base_price_inr: number | null;
  compare_at_price_inr: number | null;
  stock_status: Database["public"]["Enums"]["stock_status"];
  stock_quantity: number | null;
  low_stock_threshold: number;
  allow_backorder: boolean;
  min_order_qty: number;
  max_order_qty: number | null;
  meta_title: string | null;
  meta_description: string | null;
  category: { slug: string } | null;
};

function rowToEditing(raw: RawEditingRow): AdminProductForEditing {
  return {
    id: raw.id,
    name: raw.name,
    slug: raw.slug,
    sku: raw.sku,
    short_description: raw.short_description,
    description: raw.description,
    base_price_inr: raw.base_price_inr,
    compare_at_price_inr: raw.compare_at_price_inr,
    stock_status: raw.stock_status,
    stock_quantity: raw.stock_quantity,
    low_stock_threshold: raw.low_stock_threshold,
    allow_backorder: raw.allow_backorder,
    min_order_qty: raw.min_order_qty,
    max_order_qty: raw.max_order_qty,
    meta_title: raw.meta_title,
    meta_description: raw.meta_description,
    category_slug: raw.category?.slug ?? null,
  };
}

/**
 * Fetch a product's editable fields. Used by the General tab on render
 * and again inside the save action to capture the `before_json` for
 * audit logging.
 */
export async function getProductForEditing(
  supabase: SC,
  id: string,
): Promise<AdminProductForEditing | null> {
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_EDIT_SELECT)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(`getProductForEditing(${id}): ${error.message}`);
  if (!data) return null;
  return rowToEditing(data as unknown as RawEditingRow);
}

export type UpdateProductError =
  | { code: "validation"; issues: import("zod").ZodIssue[] }
  | { code: "not_found" }
  | { code: "slug_in_use" }
  | { code: "sku_in_use" }
  | { code: "constraint"; message: string };

export type UpdateProductResult =
  | { ok: true; before: AdminProductForEditing; after: AdminProductForEditing }
  | { ok: false; error: UpdateProductError };

/**
 * Update a product's General-tab fields.
 *
 * - Validates `patch` through ProductEditInputSchema (server-side; never
 *   trust the client). Cross-field rules (compare > base, max >= min)
 *   are part of the schema.
 * - SELECTs the row first to capture the audit-log `before_json`.
 * - UPDATEs with the patch + actor stamp.
 * - Maps Postgres errors (23505 unique, 23514 check) to typed result
 *   shapes the caller can render as inline field errors.
 *
 * Caller is responsible for the audit_logs INSERT and revalidation.
 * Splitting this keeps the function pure-ish: one table, one update.
 */
export async function updateProductGeneral(
  supabase: SC,
  id: string,
  patch: unknown,
  /** Profile id of the actor. Null is allowed (FK is ON DELETE SET NULL),
   *  but production callers always have an id from requireAdminContext. */
  actorId: string | null,
): Promise<UpdateProductResult> {
  const parsed = ProductEditInputSchema.safeParse(patch);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation", issues: parsed.error.issues } };
  }
  const input = parsed.data;

  const before = await getProductForEditing(supabase, id);
  if (!before) {
    return { ok: false, error: { code: "not_found" } };
  }

  const { data, error } = await supabase
    .from("products")
    .update({ ...input, updated_by: actorId })
    .eq("id", id)
    .select(PRODUCT_EDIT_SELECT)
    .single();

  if (error) {
    // Postgres SQLSTATE on Supabase responses comes through as `code`.
    if (error.code === "23505") {
      const m = (error.message || "").toLowerCase();
      if (m.includes("slug")) return { ok: false, error: { code: "slug_in_use" } };
      if (m.includes("sku")) return { ok: false, error: { code: "sku_in_use" } };
    }
    if (error.code === "23514") {
      return { ok: false, error: { code: "constraint", message: error.message } };
    }
    throw new Error(`updateProductGeneral: ${error.message}`);
  }

  return {
    ok: true,
    before,
    after: rowToEditing(data as unknown as RawEditingRow),
  };
}
