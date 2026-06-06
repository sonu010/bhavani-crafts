/**
 * Filter + sort options for the category page. Split out of data.ts
 * because data.ts is `server-only` (pulls in the Supabase client) and
 * filters-sidebar.tsx is `"use client"`. Anything BOTH sides of the
 * boundary need — type defs, label maps, validator lists — lives here.
 *
 * Pure data — no I/O, no imports beyond local types.
 */
import type { ListProductsSort } from "@/lib/db/products";

export type CategorySort = ListProductsSort; // "newest" | "price_asc" | "price_desc"

export const CATEGORY_SORTS: CategorySort[] = ["newest", "price_asc", "price_desc"];

export const CATEGORY_SORT_LABEL: Record<CategorySort, string> = {
  newest: "Newest",
  price_asc: "Price: low to high",
  price_desc: "Price: high to low",
};

export interface CategoryFilters {
  minPriceInr?: number;
  maxPriceInr?: number;
  /**
   * Default is "newest". Stored optional so the filter-active check
   * stays cheap (`sort` doesn't count as "filter present" since it
   * never narrows the result set, only re-orders).
   */
  sort?: CategorySort;
}
