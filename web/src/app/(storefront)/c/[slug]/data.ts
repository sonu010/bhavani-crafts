import "server-only";
import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/db/public-client";
import { getCategoryBySlug, getDescendantIds } from "@/lib/db/categories";
import { getProductCardsPage } from "@/lib/db/storefront";
import type { ListProductsCursor } from "@/lib/db/products";
import type { Category } from "@/lib/schemas/category";
import type { ProductCardItem } from "@/components/storefront/product-card";

export const CATEGORY_PAGE_SIZE = 12;

export type CategoryStock = "in_stock" | "low_stock" | "out_of_stock";

export interface CategoryFilters {
  minPriceInr?: number;
  maxPriceInr?: number;
  stockStatus?: CategoryStock;
}

export interface CategoryView {
  category: Category | null;
  descendantIds: string[];
}

export interface ProductsPage {
  items: ProductCardItem[];
  nextCursor: ListProductsCursor | null;
}

/**
 * Category + its descendant ids. Filter-independent, so it's cached on
 * the slug alone and flushed by admin category edits (`categories` tag)
 * or this category specifically (`category:<slug>`).
 */
export function getCategoryView(slug: string): Promise<CategoryView> {
  return unstable_cache(
    async (): Promise<CategoryView> => {
      const sb = createPublicClient();
      const category = await getCategoryBySlug(sb, slug);
      if (!category) return { category: null, descendantIds: [] };
      const descendantIds = await getDescendantIds(sb, category.id);
      return { category, descendantIds };
    },
    ["category-view", slug],
    { tags: ["categories", `category:${slug}`], revalidate: 300 },
  )();
}

/**
 * The canonical (unfiltered, first-page) product grid for a category.
 * Cached + tagged so it's fast and so admin product/category edits flush
 * it. Filtered or paginated reads use `getCategoryProducts` (direct).
 */
export function getCategoryFirstPage(
  slug: string,
  descendantIds: string[],
): Promise<ProductsPage> {
  return unstable_cache(
    async (): Promise<ProductsPage> => {
      const sb = createPublicClient();
      return getProductCardsPage(sb, {
        categoryIds: descendantIds,
        sort: "newest",
        perPage: CATEGORY_PAGE_SIZE,
      });
    },
    ["category-products", slug],
    { tags: ["products", "categories", `category:${slug}`], revalidate: 300 },
  )();
}

/**
 * Filtered / paginated product read — direct (uncached), since filter +
 * cursor combinations are user-driven and shouldn't pollute the cache.
 * Still fast: one indexed product query + one batched image query.
 */
export async function getCategoryProducts(opts: {
  descendantIds: string[];
  filters: CategoryFilters;
  cursor: ListProductsCursor | null;
}): Promise<ProductsPage> {
  const sb = createPublicClient();
  return getProductCardsPage(sb, {
    categoryIds: opts.descendantIds,
    minPriceInr: opts.filters.minPriceInr,
    maxPriceInr: opts.filters.maxPriceInr,
    stockStatus: opts.filters.stockStatus,
    sort: "newest",
    perPage: CATEGORY_PAGE_SIZE,
    cursor: opts.cursor,
  });
}

/** True when any product filter is active (→ use the direct read). */
export function hasActiveFilters(f: CategoryFilters): boolean {
  return (
    f.minPriceInr !== undefined ||
    f.maxPriceInr !== undefined ||
    f.stockStatus !== undefined
  );
}
