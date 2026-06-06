"use server";

import { encodeProductCursor, decodeProductCursor } from "@/lib/db/products";
import { getCategoryView, getCategoryProducts, type CategoryFilters } from "./data";
import type { ProductCardItem } from "@/components/storefront/product-card";

/**
 * "Load more" data source for the category grid (P3-T12). Returns the
 * next page of cards for a category + the current filters, plus the
 * encoded cursor for the page after that (null when exhausted).
 *
 * Public read only (createPublicClient → RLS public-select). A tampered
 * cursor decodes to null → first page; a tampered filter just narrows to
 * nothing. No mutation, no privileged data.
 */
export async function loadMoreCategoryProducts(input: {
  slug: string;
  filters: CategoryFilters;
  cursor: string | null;
}): Promise<{ items: ProductCardItem[]; nextCursor: string | null }> {
  const { category, descendantIds } = await getCategoryView(input.slug);
  if (!category) return { items: [], nextCursor: null };

  const page = await getCategoryProducts({
    descendantIds,
    filters: input.filters,
    cursor: decodeProductCursor(input.cursor),
  });

  return {
    items: page.items,
    nextCursor: page.nextCursor ? encodeProductCursor(page.nextCursor) : null,
  };
}
