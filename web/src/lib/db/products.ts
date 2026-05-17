/**
 * Typed query functions for products.
 *
 * Every function takes a Supabase client as its first argument — clean DI
 * so the same function works from server components (cookie-authed client),
 * server actions (cookie-authed), scripts (service-role), and tests
 * (plain anon or service-role). No magic global client.
 *
 * Output is Zod-parsed. If Supabase ever returns a shape that doesn't
 * match, the parse throws — fail fast, surface the drift.
 *
 * See claude/architecture/caching-and-revalidation.md for how callers
 * should wrap these in `unstable_cache(...)` when used in storefront
 * server components. The functions themselves are uncached — the cache
 * tags map is the caller's responsibility.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types.gen";
import {
  ProductListItemSchema,
  ProductDetailSchema,
  type ProductListItem,
  type ProductDetail,
} from "@/lib/schemas/product";

type SC = SupabaseClient<Database>;

const LIST_DEFAULT_PER_PAGE = 24;
const LIST_MAX_PER_PAGE = 100;

export type ListProductsSort = "newest" | "price_asc" | "price_desc";

/**
 * Cursor pagination — encodes the last seen (created_at, id) of the previous
 * page. We sort on (created_at desc, id desc) by default to keep cursor logic
 * one-dimensional even when timestamps collide.
 */
export interface ListProductsCursor {
  created_at: string;
  id: string;
}

export interface ListProductsOpts {
  categoryIds?: string[]; // empty/undefined = all categories
  minPriceInr?: number;
  maxPriceInr?: number;
  stockStatus?: "in_stock" | "low_stock" | "out_of_stock" | "made_to_order" | "unknown";
  sort?: ListProductsSort;
  perPage?: number;
  cursor?: ListProductsCursor | null;
}

export interface ListProductsResult {
  items: ProductListItem[];
  nextCursor: ListProductsCursor | null;
}

/**
 * List published products, optionally scoped to categories + filters.
 *
 * RLS handles the public-vs-admin distinction:
 *   - Anon / non-admin clients see only is_published=true rows.
 *   - Admin clients see everything; callers wanting "all incl. unpublished"
 *     must pass a service-role client AND include the relevant filter.
 *
 * This function ALWAYS includes deleted_at IS NULL because soft-deleted
 * rows are never user-facing.
 */
export async function listProducts(
  supabase: SC,
  opts: ListProductsOpts = {},
): Promise<ListProductsResult> {
  const perPage = clampPerPage(opts.perPage);
  const sort = opts.sort ?? "newest";

  let q = supabase
    .from("products")
    .select(
      "id, sku, slug, name, short_description, base_price_inr, compare_at_price_inr, stock_status, is_featured, created_at",
    )
    .is("deleted_at", null);

  if (opts.categoryIds && opts.categoryIds.length > 0) {
    q = q.in("category_id", opts.categoryIds);
  }
  if (typeof opts.minPriceInr === "number") {
    q = q.gte("base_price_inr", opts.minPriceInr);
  }
  if (typeof opts.maxPriceInr === "number") {
    q = q.lte("base_price_inr", opts.maxPriceInr);
  }
  if (opts.stockStatus) {
    q = q.eq("stock_status", opts.stockStatus);
  }

  // Cursor: only applied for the default "newest" sort. Other sorts use
  // offset-less pagination on a different axis and are not safe to mix
  // with the (created_at, id) cursor without more design work.
  if (sort === "newest") {
    q = q.order("created_at", { ascending: false }).order("id", { ascending: false });
    if (opts.cursor) {
      // (created_at, id) < (cursor.created_at, cursor.id), expressed as
      // (created_at < cursor) OR (created_at = cursor AND id < cursor.id).
      q = q.or(
        `created_at.lt.${opts.cursor.created_at},and(created_at.eq.${opts.cursor.created_at},id.lt.${opts.cursor.id})`,
      );
    }
  } else if (sort === "price_asc") {
    q = q
      .order("base_price_inr", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true });
  } else if (sort === "price_desc") {
    q = q
      .order("base_price_inr", { ascending: false, nullsFirst: false })
      .order("id", { ascending: true });
  }

  q = q.limit(perPage + 1); // +1 to detect "has more"

  const { data, error } = await q;
  if (error) {
    throw new Error(`listProducts query failed: ${error.message}`);
  }

  const parsed = ProductListItemSchema.array().parse(data ?? []);
  const hasMore = parsed.length > perPage;
  const items = hasMore ? parsed.slice(0, perPage) : parsed;

  let nextCursor: ListProductsCursor | null = null;
  if (hasMore && sort === "newest") {
    const last = items[items.length - 1];
    nextCursor = { created_at: last.created_at, id: last.id };
  }

  return { items, nextCursor };
}

/** Fetch one published product by slug, joined with images, variants, tags. */
export async function getProductBySlug(
  supabase: SC,
  slug: string,
): Promise<ProductDetail | null> {
  const { data, error } = await supabase
    .from("products")
    .select(
      `
        id, sku, slug, name, description, short_description,
        base_price_inr, compare_at_price_inr, stock_status,
        min_order_qty, max_order_qty, is_featured,
        category:categories(id, slug, name),
        images:product_images(id, url, alt, width, height, sort_order, blur_data_url),
        variants:product_variants(id, sku, name, price_inr, compare_at_price_inr, stock_status, is_default, sort_order),
        tags:product_tags(tag:tags(slug, name))
      `,
    )
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw new Error(`getProductBySlug(${slug}) failed: ${error.message}`);
  }
  if (!data) return null;

  // Supabase nests joined columns; flatten `tags` (which is shaped as
  // [{ tag: { slug, name } }]) before validation.
  const tagsFlat = ((data.tags as Array<{ tag: { slug: string; name: string } | null }> | null) ?? [])
    .map((row) => row.tag)
    .filter((t): t is { slug: string; name: string } => t !== null);

  return ProductDetailSchema.parse({
    ...data,
    images: (data.images ?? []).slice().sort(
      (a: { sort_order: number }, b: { sort_order: number }) =>
        a.sort_order - b.sort_order,
    ),
    variants: (data.variants ?? []).slice().sort(
      (a: { sort_order: number }, b: { sort_order: number }) =>
        a.sort_order - b.sort_order,
    ),
    tags: tagsFlat,
  });
}

/**
 * Fetch one product by primary key for the admin editor shell.
 *
 * Lean shape on purpose — just the row's own columns, no joins. The
 * editor's tab pages fetch their own joined data (images, variants,
 * attributes, etc.) lazily, so the shell render isn't blocked on data
 * the user may never look at.
 *
 * RLS posture: the admin pages pass a service-role client (via
 * requireAdminContext), so unpublished + non-deleted rows are visible.
 * Soft-deleted rows are always excluded; the Trash view (P2-T28) is the
 * only consumer of those.
 *
 * Returns null when no row matches — callers render a 404 boundary.
 */
export interface AdminProductBasic {
  id: string;
  sku: string | null;
  slug: string;
  name: string;
  short_description: string | null;
  review_status: "draft" | "needs_review" | "ready_to_publish" | "published" | "archived";
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export async function getProductByIdBasic(
  supabase: SC,
  id: string,
): Promise<AdminProductBasic | null> {
  const { data, error } = await supabase
    .from("products")
    .select(
      "id, sku, slug, name, short_description, review_status, is_published, created_at, updated_at",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw new Error(`getProductByIdBasic(${id}) failed: ${error.message}`);
  }
  return data;
}

function clampPerPage(input?: number): number {
  if (typeof input !== "number" || !Number.isFinite(input) || input <= 0) {
    return LIST_DEFAULT_PER_PAGE;
  }
  return Math.min(Math.floor(input), LIST_MAX_PER_PAGE);
}
