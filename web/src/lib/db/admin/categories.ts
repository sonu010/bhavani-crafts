/**
 * Admin-side category queries — read tree with counts, soft-delete.
 *
 * Two count flavors:
 *   - direct: products where category_id = this category
 *   - descendants: products where category_id ∈ all descendants of this
 *     category (inclusive)
 *
 * The tree view shows the descendants count by default; the row's
 * tooltip surfaces the direct count for clarity.
 *
 * DI Supabase per ADR-010. The service-role admin client is what the
 * editor passes in.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types.gen";
import {
  CategoryEditInputSchema,
  type CategoryEditInput,
} from "@/lib/schemas/category";

type SC = SupabaseClient<Database>;

export interface AdminCategoryNode {
  id: string;
  slug: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
  direct_count: number;
  descendant_count: number;
  children: AdminCategoryNode[];
}

/**
 * Build the admin tree + per-node product counts in one round-trip
 * per data source (4 queries total: categories, descendants view,
 * products grouped by category, identity helper).
 */
export async function getCategoryTreeWithCounts(
  supabase: SC,
): Promise<AdminCategoryNode[]> {
  const [catsRes, descRes, prodRes] = await Promise.all([
    supabase
      .from("categories")
      .select("id, slug, name, parent_id, sort_order")
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("category_with_descendants" as unknown as never)
      .select("ancestor_id, descendant_id"),
    // Direct counts via a head:count query per category would be
    // O(N) round-trips; instead pull every (category_id) once and
    // tally in JS. 5.8K products → trivial.
    supabase
      .from("products")
      .select("category_id")
      .is("deleted_at", null)
      .not("category_id", "is", null),
  ]);
  if (catsRes.error) throw new Error(`getCategoryTreeWithCounts (cats): ${catsRes.error.message}`);
  if (descRes.error) throw new Error(`getCategoryTreeWithCounts (desc): ${descRes.error.message}`);
  if (prodRes.error) throw new Error(`getCategoryTreeWithCounts (prods): ${prodRes.error.message}`);

  const cats = (catsRes.data ?? []) as Array<{
    id: string;
    slug: string;
    name: string;
    parent_id: string | null;
    sort_order: number;
  }>;
  const desc = (descRes.data ?? []) as Array<{
    ancestor_id: string;
    descendant_id: string;
  }>;
  const prodCats = (prodRes.data ?? []) as Array<{ category_id: string | null }>;

  // direct_count[cat_id] = products where category_id = cat_id
  const directCount = new Map<string, number>();
  for (const p of prodCats) {
    if (!p.category_id) continue;
    directCount.set(p.category_id, (directCount.get(p.category_id) ?? 0) + 1);
  }

  // descendant_count[cat_id] = sum of direct_count over descendants of cat_id
  const descendantsByAncestor = new Map<string, string[]>();
  for (const d of desc) {
    if (!descendantsByAncestor.has(d.ancestor_id)) {
      descendantsByAncestor.set(d.ancestor_id, []);
    }
    descendantsByAncestor.get(d.ancestor_id)!.push(d.descendant_id);
  }

  // Assemble the tree. Use Map for O(1) parent lookup.
  const nodeById = new Map<string, AdminCategoryNode>();
  for (const c of cats) {
    const directs = descendantsByAncestor.get(c.id) ?? [c.id];
    const descendantTally = directs.reduce(
      (acc, id) => acc + (directCount.get(id) ?? 0),
      0,
    );
    nodeById.set(c.id, {
      id: c.id,
      slug: c.slug,
      name: c.name,
      parent_id: c.parent_id,
      sort_order: c.sort_order,
      direct_count: directCount.get(c.id) ?? 0,
      descendant_count: descendantTally,
      children: [],
    });
  }

  const roots: AdminCategoryNode[] = [];
  for (const c of cats) {
    const node = nodeById.get(c.id)!;
    if (c.parent_id && nodeById.has(c.parent_id)) {
      nodeById.get(c.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

export type CategoryDeleteError =
  | { code: "not_found" }
  | { code: "has_children"; childCount: number }
  | { code: "has_products"; productCount: number };

/**
 * Soft-delete a category. Refuses when:
 *   - the row doesn't exist or is already deleted
 *   - any non-deleted child category points to it
 *   - any non-deleted product has it as category_id
 *
 * The first two are application-layer guards; the third is also
 * enforced by `ON DELETE RESTRICT` on `products.category_id`, but
 * soft-delete bypasses that FK rule so we duplicate the check here.
 */
export async function softDeleteCategory(
  supabase: SC,
  categoryId: string,
): Promise<{ ok: true } | { ok: false; error: CategoryDeleteError }> {
  const cur = await supabase
    .from("categories")
    .select("id, deleted_at")
    .eq("id", categoryId)
    .maybeSingle();
  if (cur.error) throw new Error(`softDeleteCategory (lookup): ${cur.error.message}`);
  if (!cur.data || cur.data.deleted_at !== null) {
    return { ok: false, error: { code: "not_found" } };
  }

  const [kids, prods] = await Promise.all([
    supabase
      .from("categories")
      .select("id", { count: "exact", head: true })
      .eq("parent_id", categoryId)
      .is("deleted_at", null),
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("category_id", categoryId)
      .is("deleted_at", null),
  ]);
  if (kids.error) throw new Error(`softDeleteCategory (kids): ${kids.error.message}`);
  if (prods.error) throw new Error(`softDeleteCategory (prods): ${prods.error.message}`);
  if ((kids.count ?? 0) > 0) {
    return { ok: false, error: { code: "has_children", childCount: kids.count ?? 0 } };
  }
  if ((prods.count ?? 0) > 0) {
    return { ok: false, error: { code: "has_products", productCount: prods.count ?? 0 } };
  }

  const upd = await supabase
    .from("categories")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", categoryId);
  if (upd.error) throw new Error(`softDeleteCategory (update): ${upd.error.message}`);
  return { ok: true };
}

export type CategoryEditableRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parent_id: string | null;
  sort_order: number;
  image_url: string | null;
  meta_title: string | null;
  meta_description: string | null;
};

export async function getCategoryForEditing(
  supabase: SC,
  id: string,
): Promise<CategoryEditableRow | null> {
  const { data, error } = await supabase
    .from("categories")
    .select(
      "id, name, slug, description, parent_id, sort_order, image_url, meta_title, meta_description",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(`getCategoryForEditing: ${error.message}`);
  return data ?? null;
}

export type CategoryWriteError =
  | { code: "validation"; issues: Array<{ path: string[]; message: string }> }
  | { code: "slug_in_use" }
  | { code: "invalid_parent"; reason: "self" | "descendant" | "missing" }
  | { code: "not_found" };

export type CreateCategoryResult =
  | { ok: true; id: string }
  | { ok: false; error: CategoryWriteError };

export type UpdateCategoryResult =
  | { ok: true; before: CategoryEditableRow; after: CategoryEditableRow }
  | { ok: false; error: CategoryWriteError };

async function validateParent(
  supabase: SC,
  parentId: string | null,
  forCategoryId: string | null,
): Promise<CategoryWriteError | null> {
  if (parentId === null) return null;
  if (parentId === forCategoryId) {
    return { code: "invalid_parent", reason: "self" };
  }
  // Parent must exist + not be soft-deleted.
  const parent = await supabase
    .from("categories")
    .select("id")
    .eq("id", parentId)
    .is("deleted_at", null)
    .maybeSingle();
  if (parent.error) {
    throw new Error(`validateParent (lookup): ${parent.error.message}`);
  }
  if (!parent.data) {
    return { code: "invalid_parent", reason: "missing" };
  }
  // Descendant cycle check — only meaningful when editing an existing row.
  if (forCategoryId) {
    const cycle = await supabase
      .from("category_with_descendants" as unknown as never)
      .select("descendant_id")
      .eq("ancestor_id", forCategoryId)
      .eq("descendant_id", parentId)
      .maybeSingle();
    if (cycle.error && cycle.error.code !== "PGRST116") {
      throw new Error(`validateParent (cycle): ${cycle.error.message}`);
    }
    if (cycle.data) {
      return { code: "invalid_parent", reason: "descendant" };
    }
  }
  return null;
}

async function isSlugInUse(
  supabase: SC,
  slug: string,
  exceptId: string | null,
): Promise<boolean> {
  let q = supabase
    .from("categories")
    .select("id", { head: true, count: "exact" })
    .eq("slug", slug)
    .is("deleted_at", null);
  if (exceptId) q = q.neq("id", exceptId);
  const r = await q;
  if (r.error) throw new Error(`isSlugInUse: ${r.error.message}`);
  return (r.count ?? 0) > 0;
}

export async function createCategory(
  supabase: SC,
  input: unknown,
): Promise<CreateCategoryResult> {
  const parsed = CategoryEditInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "validation",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.map((p) => String(p)),
          message: i.message,
        })),
      },
    };
  }
  const data = parsed.data;
  if (await isSlugInUse(supabase, data.slug, null)) {
    return { ok: false, error: { code: "slug_in_use" } };
  }
  const parentErr = await validateParent(supabase, data.parent_id, null);
  if (parentErr) return { ok: false, error: parentErr };

  const ins = await supabase
    .from("categories")
    .insert({
      name: data.name,
      slug: data.slug,
      description: data.description,
      parent_id: data.parent_id,
      sort_order: data.sort_order,
      image_url: data.image_url,
      meta_title: data.meta_title,
      meta_description: data.meta_description,
    })
    .select("id")
    .single();
  if (ins.error) {
    if (ins.error.code === "23505") {
      return { ok: false, error: { code: "slug_in_use" } };
    }
    throw new Error(`createCategory (insert): ${ins.error.message}`);
  }
  return { ok: true, id: ins.data.id };
}

export async function updateCategory(
  supabase: SC,
  id: string,
  patch: unknown,
): Promise<UpdateCategoryResult> {
  const parsed = CategoryEditInputSchema.safeParse(patch);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "validation",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.map((p) => String(p)),
          message: i.message,
        })),
      },
    };
  }
  const data: CategoryEditInput = parsed.data;
  const before = await getCategoryForEditing(supabase, id);
  if (!before) return { ok: false, error: { code: "not_found" } };

  if (
    data.slug !== before.slug &&
    (await isSlugInUse(supabase, data.slug, id))
  ) {
    return { ok: false, error: { code: "slug_in_use" } };
  }
  if (data.parent_id !== before.parent_id) {
    const parentErr = await validateParent(supabase, data.parent_id, id);
    if (parentErr) return { ok: false, error: parentErr };
  }

  const upd = await supabase
    .from("categories")
    .update({
      name: data.name,
      slug: data.slug,
      description: data.description,
      parent_id: data.parent_id,
      sort_order: data.sort_order,
      image_url: data.image_url,
      meta_title: data.meta_title,
      meta_description: data.meta_description,
    })
    .eq("id", id)
    .select(
      "id, name, slug, description, parent_id, sort_order, image_url, meta_title, meta_description",
    )
    .single();
  if (upd.error) {
    if (upd.error.code === "23505") {
      return { ok: false, error: { code: "slug_in_use" } };
    }
    throw new Error(`updateCategory (update): ${upd.error.message}`);
  }
  return { ok: true, before, after: upd.data };
}
