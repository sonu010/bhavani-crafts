import "server-only";
import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/db/public-client";
import {
  getCategoryBySlug,
  getDescendantIds,
  listChildCategories,
} from "@/lib/db/categories";
import { getProductCardsPage } from "@/lib/db/storefront";
import type { ListProductsCursor } from "@/lib/db/products";
import type { Category } from "@/lib/schemas/category";
import type { ProductCardItem } from "@/components/storefront/product-card";
// Filter types + sort labels live in filter-options.ts so the client-
// side filters-sidebar can import them without dragging server-only
// modules into the client bundle.
export type { CategoryFilters, CategorySort } from "./filter-options";
export {
  CATEGORY_SORTS,
  CATEGORY_SORT_LABEL,
} from "./filter-options";
import type { CategoryFilters } from "./filter-options";

export const CATEGORY_PAGE_SIZE = 12;

export interface CategoryView {
  category: Category | null;
  descendantIds: string[];
  /**
   * Direct children of the current category — drives the "refine in
   * this category" chip row. Empty for leaf categories.
   */
  children: Category[];
}

export interface ProductsPage {
  items: ProductCardItem[];
  nextCursor: ListProductsCursor | null;
}

/**
 * Category + its descendant ids + its direct children. Filter-
 * independent, so it's cached on the slug alone and flushed by admin
 * category edits (`categories` tag) or this category specifically
 * (`category:<slug>`).
 */
export function getCategoryView(slug: string): Promise<CategoryView> {
  return unstable_cache(
    async (): Promise<CategoryView> => {
      const sb = createPublicClient();
      const category = await getCategoryBySlug(sb, slug);
      if (!category) return { category: null, descendantIds: [], children: [] };
      const [descendantIds, children] = await Promise.all([
        getDescendantIds(sb, category.id),
        listChildCategories(sb, category.id),
      ]);
      return { category, descendantIds, children };
    },
    ["category-view", slug],
    { tags: ["categories", `category:${slug}`], revalidate: 300 },
  )();
}

/**
 * The canonical (unfiltered, default-sort, first-page) product grid for
 * a category. Cached + tagged so it's fast and so admin product/category
 * edits flush it. Filtered, sorted, or paginated reads use
 * `getCategoryProducts` (direct).
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
 * Filtered / sorted / paginated product read — direct (uncached), since
 * filter + sort + cursor combinations are user-driven and shouldn't
 * pollute the cache. Still fast: one indexed product query + one
 * batched image query.
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
    sort: opts.filters.sort ?? "newest",
    perPage: CATEGORY_PAGE_SIZE,
    cursor: opts.cursor,
  });
}

/**
 * True when any filter that NARROWS the product set is active. Sort
 * does not count — it only re-orders. Drives the cached-vs-direct
 * read choice in page.tsx.
 */
export function hasActiveFilters(f: CategoryFilters): boolean {
  return (
    f.minPriceInr !== undefined ||
    f.maxPriceInr !== undefined ||
    // A non-default sort also forces the uncached path because the
    // cached page is `sort: "newest"`.
    (f.sort !== undefined && f.sort !== "newest")
  );
}
