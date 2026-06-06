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

/**
 * Enumerate every PUBLISHED, non-deleted product's slug + updated_at,
 * paginated through the 1000-row PostgREST cap. Used by the sitemap;
 * intentionally lightweight (no joins, no images). Pages are 1000 rows.
 */
export async function listAllPublishedSlugs(
  supabase: SC,
): Promise<Array<{ slug: string; updated_at: string }>> {
  const PAGE = 1000;
  const all: Array<{ slug: string; updated_at: string }> = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("products")
      .select("slug, updated_at")
      .is("deleted_at", null)
      .eq("is_published", true)
      .order("slug", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      throw new Error(`listAllPublishedSlugs failed: ${error.message}`);
    }
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE) break;
  }
  return all;
}

/**
 * Encode/decode a `ListProductsCursor` as a base64url string for the
 * `?cursor=` URL param (storefront "Load more"). `decodeProductCursor`
 * returns null for any malformed input — a bad cursor degrades to "first
 * page", never throws.
 */
export function encodeProductCursor(cursor: ListProductsCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeProductCursor(raw: string | null | undefined): ListProductsCursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (
      parsed &&
      typeof parsed.created_at === "string" &&
      typeof parsed.id === "string"
    ) {
      return { created_at: parsed.created_at, id: parsed.id };
    }
    return null;
  } catch {
    return null;
  }
}

export interface ListProductsOpts {
  categoryIds?: string[]; // empty/undefined = all categories
  minPriceInr?: number;
  maxPriceInr?: number;
  stockStatus?: "in_stock" | "low_stock" | "out_of_stock" | "made_to_order" | "unknown";
  onlyFeatured?: boolean; // true = is_featured only (homepage hero + weekly collection)
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
  if (opts.onlyFeatured) {
    q = q.eq("is_featured", true);
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

/**
 * Storefront variant bundle for the PDP (P3-T15). Public-read variant of
 * `lib/db/admin/variants.ts:getVariantsBundle` — same shape, works with
 * any DI client (no admin gate). Used by the variant selector to resolve
 * a selected combo of option values to a concrete variant.
 *
 * One query for options, one for values, one for variants — three
 * round-trips. Skipping the values query when there are no options is the
 * fast path for variant-less products.
 */
export interface PdpOptionValue {
  id: string;
  value: string;
  sort_order: number;
}
export interface PdpOption {
  id: string;
  name: string;
  sort_order: number;
  values: PdpOptionValue[];
}
export interface PdpVariant {
  id: string;
  sku: string;
  name: string | null;
  price_inr: number | null;
  compare_at_price_inr: number | null;
  stock_status: ProductListItem["stock_status"];
  is_default: boolean;
  sort_order: number;
  option_value_ids: string[];
}
export interface PdpVariantBundle {
  options: PdpOption[];
  variants: PdpVariant[];
}

export async function getPdpVariantBundle(
  supabase: SC,
  productId: string,
): Promise<PdpVariantBundle> {
  const optsRes = await supabase
    .from("product_options")
    .select("id, name, sort_order")
    .eq("product_id", productId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (optsRes.error) {
    throw new Error(`getPdpVariantBundle (options): ${optsRes.error.message}`);
  }
  const optionRows = optsRes.data ?? [];
  const optionIds = optionRows.map((o) => o.id);
  if (optionIds.length === 0) return { options: [], variants: [] };

  const [valuesRes, variantsRes] = await Promise.all([
    supabase
      .from("product_option_values")
      .select("id, option_id, value, sort_order")
      .in("option_id", optionIds)
      .order("sort_order", { ascending: true })
      .order("value", { ascending: true }),
    supabase
      .from("product_variants")
      .select(
        "id, sku, name, price_inr, compare_at_price_inr, stock_status, is_default, sort_order, variant_option_values(option_value_id)",
      )
      .eq("product_id", productId)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);
  if (valuesRes.error) {
    throw new Error(`getPdpVariantBundle (values): ${valuesRes.error.message}`);
  }
  if (variantsRes.error) {
    throw new Error(`getPdpVariantBundle (variants): ${variantsRes.error.message}`);
  }

  const valuesByOption = new Map<string, PdpOptionValue[]>();
  for (const row of (valuesRes.data ?? []) as Array<{
    id: string;
    option_id: string;
    value: string;
    sort_order: number;
  }>) {
    const arr = valuesByOption.get(row.option_id) ?? [];
    arr.push({ id: row.id, value: row.value, sort_order: row.sort_order });
    valuesByOption.set(row.option_id, arr);
  }

  const options: PdpOption[] = optionRows.map((o) => ({
    id: o.id,
    name: o.name,
    sort_order: o.sort_order,
    values: valuesByOption.get(o.id) ?? [],
  }));

  type RawVariant = {
    id: string;
    sku: string;
    name: string | null;
    price_inr: number | null;
    compare_at_price_inr: number | null;
    stock_status: ProductListItem["stock_status"];
    is_default: boolean;
    sort_order: number;
    variant_option_values: Array<{ option_value_id: string }> | null;
  };
  const variants: PdpVariant[] = ((variantsRes.data ?? []) as RawVariant[]).map((v) => ({
    id: v.id,
    sku: v.sku,
    name: v.name,
    price_inr: v.price_inr,
    compare_at_price_inr: v.compare_at_price_inr,
    stock_status: v.stock_status,
    is_default: v.is_default,
    sort_order: v.sort_order,
    option_value_ids: (v.variant_option_values ?? []).map((j) => j.option_value_id),
  }));

  return { options, variants };
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
