/**
 * Storefront read helpers that compose the lower-level data layer into
 * the `ProductCardItem` shape every catalog surface renders.
 *
 * The `<ProductCard>` (P3-T01) needs a product + its primary image
 * (url / alt / blur). `listProducts` returns the product fields only;
 * fetching images per-product would be N+1, so we batch: one
 * `listProducts` call, then ONE `product_images` query keyed on the
 * returned ids (same pattern the admin list uses, for the same reason).
 *
 * DI as always — first arg is the Supabase client. Callers in storefront
 * server components wrap these in `unstable_cache(..., { tags })`; the
 * functions themselves are uncached (the tag map is the caller's job).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types.gen";
import {
  listProducts,
  type ListProductsOpts,
  type ListProductsCursor,
} from "./products";
import { searchProducts, type SearchResult } from "./search";
import type { ProductCardItem } from "@/components/storefront/product-card";

type SC = SupabaseClient<Database>;

export interface PrimaryImage {
  url: string;
  alt: string | null;
  blurDataUrl: string | null;
}

/**
 * Batch-fetch the primary (lowest sort_order, non-deleted) image for
 * each of the given product ids. Returns a Map keyed on product id;
 * products with no image are absent from the map.
 */
/**
 * PostgREST renders `.in("col", values)` as a URL query parameter:
 *   ?col=in.(uuid1,uuid2,…)
 * Each UUID is 36 bytes. Supabase's edge proxy rejects URLs over ~8 KB
 * with an opaque `fetch failed` (TypeError, not a 4xx response body) —
 * so we cap the IN list well below that limit. 100 UUIDs is ~3.7 KB of
 * value list plus headroom for other params; safe in every environment.
 *
 * Originally surfaced when getCategoryCovers fanned out 500 product ids
 * after the storefront went from ~10 published products to 5800.
 */
const PRIMARY_IMAGES_CHUNK = 100;

export async function getPrimaryImages(
  supabase: SC,
  productIds: string[],
): Promise<Map<string, PrimaryImage>> {
  const byProduct = new Map<string, PrimaryImage>();
  if (productIds.length === 0) return byProduct;

  // De-dupe in case callers double up.
  const unique = Array.from(new Set(productIds));

  for (let i = 0; i < unique.length; i += PRIMARY_IMAGES_CHUNK) {
    const slice = unique.slice(i, i + PRIMARY_IMAGES_CHUNK);

    const { data, error } = await supabase
      .from("product_images")
      .select("product_id, url, alt, blur_data_url, sort_order")
      .in("product_id", slice)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true });

    if (error) {
      throw new Error(`getPrimaryImages failed: ${error.message}`);
    }

    // Rows arrive sorted by sort_order asc; the FIRST row seen per
    // product is its primary image. Skip later rows for the same id.
    // Chunk boundaries can't split a product's rows because we sliced
    // by distinct product ids — all of a product's images stay in the
    // same chunk.
    for (const row of (data ?? []) as Array<{
      product_id: string;
      url: string;
      alt: string | null;
      blur_data_url: string | null;
    }>) {
      if (!byProduct.has(row.product_id)) {
        byProduct.set(row.product_id, {
          url: row.url,
          alt: row.alt,
          blurDataUrl: row.blur_data_url,
        });
      }
    }
  }
  return byProduct;
}

/**
 * List published products and attach each one's primary image, ready to
 * hand straight to `<ProductCard>`. This is the storefront's one-stop
 * "give me cards" read used by the hero, weekly collection, kits row,
 * category grid, search results, and related products.
 */
export async function getProductCardsPage(
  supabase: SC,
  opts: ListProductsOpts = {},
): Promise<{ items: ProductCardItem[]; nextCursor: ListProductsCursor | null }> {
  const { items, nextCursor } = await listProducts(supabase, opts);
  if (items.length === 0) return { items: [], nextCursor: null };

  const images = await getPrimaryImages(
    supabase,
    items.map((p) => p.id),
  );

  const cards = items.map((p) => {
    const img = images.get(p.id);
    return {
      ...p,
      imageUrl: img?.url ?? null,
      blurDataUrl: img?.blurDataUrl ?? null,
      imageAlt: img?.alt ?? null,
    };
  });
  return { items: cards, nextCursor };
}

/** Convenience wrapper for callers that don't paginate (hero, weekly,
 *  kits, atlas-adjacent rows). Returns just the cards. */
export async function getProductCards(
  supabase: SC,
  opts: ListProductsOpts = {},
): Promise<ProductCardItem[]> {
  return (await getProductCardsPage(supabase, opts)).items;
}

export interface SearchCardsResult {
  query: string;
  expanded: string;
  items: ProductCardItem[];
}

/**
 * Storefront search: run the FTS pipeline (synonyms + tsquery) then
 * attach primary images so consumers can render `<ProductCard>` straight
 * away. Mirrors `getProductCards` but for the search path.
 */
export async function searchProductCards(
  supabase: SC,
  query: string,
  opts: { limit?: number } = {},
): Promise<SearchCardsResult> {
  const result: SearchResult = await searchProducts(supabase, query, opts);
  if (result.items.length === 0) {
    return { query: result.query, expanded: result.expanded, items: [] };
  }
  const images = await getPrimaryImages(
    supabase,
    result.items.map((p) => p.id),
  );
  const items: ProductCardItem[] = result.items.map((p) => {
    const img = images.get(p.id);
    return {
      ...p,
      imageUrl: img?.url ?? null,
      blurDataUrl: img?.blurDataUrl ?? null,
      imageAlt: img?.alt ?? null,
    };
  });
  return { query: result.query, expanded: result.expanded, items };
}

export interface CategoryCover {
  id: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  blurDataUrl: string | null;
}

/**
 * Resolve a cover image for each category (for the homepage Atlas grid):
 * prefer the category's own `image_url`; otherwise fall back to the
 * newest published product image anywhere in that category's subtree.
 *
 * Batched to 3 queries total regardless of category count:
 *   1. category_with_descendants — map each ancestor to its descendants
 *   2. newest published products across all those descendant categories
 *   3. primary images for those products (reuses getPrimaryImages)
 *
 * The top-level categories passed in are disjoint subtrees, so each
 * descendant maps to exactly one ancestor.
 */
export async function getCategoryCovers(
  supabase: SC,
  categories: Array<{ id: string; slug: string; name: string; image_url: string | null }>,
): Promise<CategoryCover[]> {
  const needFallback = categories.filter((c) => !c.image_url);
  const coverByCat = new Map<string, { imageUrl: string; blurDataUrl: string | null }>();

  if (needFallback.length > 0) {
    const { data: rels, error: relErr } = await supabase
      .from("category_with_descendants" as unknown as never)
      .select("ancestor_id, descendant_id")
      .in(
        "ancestor_id",
        needFallback.map((c) => c.id),
      );
    if (relErr) {
      throw new Error(`getCategoryCovers descendants failed: ${relErr.message}`);
    }
    const ancestorOf = new Map<string, string>();
    const allDescendants = new Set<string>();
    for (const r of (rels ?? []) as Array<{ ancestor_id: string; descendant_id: string }>) {
      ancestorOf.set(r.descendant_id, r.ancestor_id);
      allDescendants.add(r.descendant_id);
    }

    if (allDescendants.size > 0) {
      // Same URL-length hazard as getPrimaryImages — chunk the
      // descendants list. With 5800 published products and a deep
      // category tree, a top-level ancestor can resolve to 200+
      // descendant ids, pushing the URL past Supabase's proxy limit.
      const descendantIds = [...allDescendants];
      const rows: Array<{ id: string; category_id: string }> = [];
      const CHUNK = 100;
      for (let i = 0; i < descendantIds.length; i += CHUNK) {
        const slice = descendantIds.slice(i, i + CHUNK);
        const { data: prods, error: prodErr } = await supabase
          .from("products")
          .select("id, category_id, created_at")
          .in("category_id", slice)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(500);
        if (prodErr) {
          throw new Error(`getCategoryCovers products failed: ${prodErr.message}`);
        }
        rows.push(...((prods ?? []) as typeof rows));
      }
      // Re-sort by created_at desc since chunks are independently sorted.
      rows.sort((a, b) =>
        ((b as unknown as { created_at: string }).created_at ?? "").localeCompare(
          (a as unknown as { created_at: string }).created_at ?? "",
        ),
      );
      const images = await getPrimaryImages(
        supabase,
        rows.map((p) => p.id),
      );
      // Rows are newest-first; the first product WITH an image per
      // ancestor wins.
      for (const p of rows) {
        const anc = ancestorOf.get(p.category_id);
        if (!anc || coverByCat.has(anc)) continue;
        const img = images.get(p.id);
        if (img) coverByCat.set(anc, { imageUrl: img.url, blurDataUrl: img.blurDataUrl });
      }
    }
  }

  return categories.map((c) => {
    if (c.image_url) {
      return { id: c.id, slug: c.slug, name: c.name, imageUrl: c.image_url, blurDataUrl: null };
    }
    const fb = coverByCat.get(c.id);
    return {
      id: c.id,
      slug: c.slug,
      name: c.name,
      imageUrl: fb?.imageUrl ?? null,
      blurDataUrl: fb?.blurDataUrl ?? null,
    };
  });
}
