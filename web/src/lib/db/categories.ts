/**
 * Typed query functions for categories.
 *
 * See lib/db/products.ts for the dependency-injection pattern.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types.gen";
import {
  CategorySchema,
  type Category,
  type CategoryTreeNode,
} from "@/lib/schemas/category";

type SC = SupabaseClient<Database>;

/**
 * Enumerate every non-deleted category's slug + updated_at. Used by the
 * sitemap. Catalog has ~360 categories so one page is enough — no
 * pagination loop needed, but we use a generous limit cap so a future
 * growth past 1000 won't silently truncate.
 */
export async function listAllCategorySlugs(
  supabase: SC,
): Promise<Array<{ slug: string; updated_at: string }>> {
  const PAGE = 1000;
  const all: Array<{ slug: string; updated_at: string }> = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("categories")
      .select("slug, updated_at")
      .is("deleted_at", null)
      .order("slug", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      throw new Error(`listAllCategorySlugs failed: ${error.message}`);
    }
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE) break;
  }
  return all;
}

/** Top-level (parent_id IS NULL) categories, sorted. */
export async function listTopLevelCategories(supabase: SC): Promise<Category[]> {
  const { data, error } = await supabase
    .from("categories")
    .select("id, slug, name, description, parent_id, sort_order, image_url")
    .is("parent_id", null)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`listTopLevelCategories failed: ${error.message}`);
  }
  return CategorySchema.array().parse(data ?? []);
}

/**
 * Direct children of a given category — used by the storefront's
 * sub-category refine row (chips below the category header). Returns
 * non-deleted children sorted by sort_order then name. Empty array
 * when the category is a leaf.
 */
export async function listChildCategories(
  supabase: SC,
  parentId: string,
): Promise<Category[]> {
  const { data, error } = await supabase
    .from("categories")
    .select("id, slug, name, description, parent_id, sort_order, image_url")
    .eq("parent_id", parentId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`listChildCategories failed: ${error.message}`);
  }
  return CategorySchema.array().parse(data ?? []);
}

/** Fetch a single category by slug. */
export async function getCategoryBySlug(
  supabase: SC,
  slug: string,
): Promise<Category | null> {
  const { data, error } = await supabase
    .from("categories")
    .select("id, slug, name, description, parent_id, sort_order, image_url")
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw new Error(`getCategoryBySlug(${slug}) failed: ${error.message}`);
  }
  if (!data) return null;
  return CategorySchema.parse(data);
}

/**
 * Return every descendant category id (including the ancestor itself)
 * via the `category_with_descendants` recursive view from 0007.
 *
 * Used by category pages to scope product lists to "everything under
 * this category" rather than just direct children.
 */
export async function getDescendantIds(
  supabase: SC,
  ancestorId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("category_with_descendants" as unknown as never)
    .select("descendant_id")
    .eq("ancestor_id", ancestorId);

  if (error) {
    throw new Error(`getDescendantIds(${ancestorId}) failed: ${error.message}`);
  }
  return ((data ?? []) as Array<{ descendant_id: string }>).map((r) => r.descendant_id);
}

/**
 * Build the full category tree as a recursive structure.
 *
 * Fetches all non-deleted categories in one query, then assembles
 * parent → children in memory. With ~362 seeded categories this is
 * cheap; if the catalog ever has > 5k categories, switch to lazy
 * loading per branch.
 */
export async function getCategoryTree(
  supabase: SC,
): Promise<CategoryTreeNode[]> {
  const { data, error } = await supabase
    .from("categories")
    .select("id, slug, name, parent_id, sort_order, image_url")
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`getCategoryTree failed: ${error.message}`);
  }

  type Row = {
    id: string;
    slug: string;
    name: string;
    parent_id: string | null;
    sort_order: number;
    image_url: string | null;
  };
  const rows = (data ?? []) as Row[];
  const byId = new Map<string, CategoryTreeNode>();
  for (const r of rows) {
    byId.set(r.id, {
      id: r.id,
      slug: r.slug,
      name: r.name,
      sort_order: r.sort_order,
      image_url: r.image_url,
      children: [],
    });
  }
  const roots: CategoryTreeNode[] = [];
  for (const r of rows) {
    const node = byId.get(r.id)!;
    if (r.parent_id) {
      const parent = byId.get(r.parent_id);
      if (parent) parent.children.push(node);
      else roots.push(node); // orphan (parent was soft-deleted) — surface at root
    } else {
      roots.push(node);
    }
  }
  return roots;
}
