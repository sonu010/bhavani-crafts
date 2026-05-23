/**
 * Admin attribute_definitions data layer.
 *
 * `attribute_definitions` does NOT have a `deleted_at` column — the
 * P2-T22 spec implied soft-delete but the migration didn't add one.
 * Delete is hard-delete with a reference guard: refuse when any
 * `product_attributes` row points at the definition. The Trash view
 * doesn't list attributes for that reason.
 *
 * DI Supabase per ADR-010.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types.gen";
import {
  AttributeDefinitionInputSchema,
  type AttributeDefinitionInput,
  type AttributeType,
} from "@/lib/schemas/attribute";

type SC = SupabaseClient<Database>;

export interface AdminAttributeDefinition {
  id: string;
  slug: string;
  name: string;
  type: AttributeType;
  unit: string | null;
  applies_to_category_id: string | null;
  applies_to_category_name: string | null;
  options_json: string[] | null;
  is_filterable: boolean;
  sort_order: number;
  product_value_count: number;
}

/**
 * Every attribute definition with:
 *   - the category name it scopes to (if any)
 *   - a count of `product_attributes` rows referencing it (so the UI
 *     can show "in use" badges + block delete)
 *
 * Three round-trips; client-side aggregation since both source tables
 * are small (≤ 7 attributes seeded today + 7 seeded products).
 */
export async function listAttributeDefinitionsAdmin(
  supabase: SC,
): Promise<AdminAttributeDefinition[]> {
  const [defsRes, catsRes] = await Promise.all([
    supabase
      .from("attribute_definitions")
      .select(
        "id, slug, name, type, unit, applies_to_category_id, options_json, is_filterable, sort_order",
      )
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("categories")
      .select("id, name")
      .is("deleted_at", null),
  ]);
  if (defsRes.error) throw new Error(`listAttributeDefinitionsAdmin (defs): ${defsRes.error.message}`);
  if (catsRes.error) throw new Error(`listAttributeDefinitionsAdmin (cats): ${catsRes.error.message}`);

  const catNameById = new Map(
    (catsRes.data ?? []).map((c) => [c.id, c.name]),
  );

  // Per-definition product_attributes count. Paginate in 1000-row
  // chunks (same reason as tags: ~8K rows likely soon).
  const counts = new Map<string, number>();
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const page = await supabase
      .from("product_attributes")
      .select("attribute_id")
      .range(offset, offset + PAGE - 1);
    if (page.error) {
      throw new Error(
        `listAttributeDefinitionsAdmin (pa-page): ${page.error.message}`,
      );
    }
    const rows = page.data ?? [];
    for (const r of rows) {
      counts.set(r.attribute_id, (counts.get(r.attribute_id) ?? 0) + 1);
    }
    if (rows.length < PAGE) break;
  }

  return (defsRes.data ?? []).map((d) => ({
    id: d.id,
    slug: d.slug,
    name: d.name,
    type: d.type as AttributeType,
    unit: d.unit,
    applies_to_category_id: d.applies_to_category_id,
    applies_to_category_name: d.applies_to_category_id
      ? (catNameById.get(d.applies_to_category_id) ?? null)
      : null,
    options_json: Array.isArray(d.options_json)
      ? (d.options_json as string[])
      : null,
    is_filterable: d.is_filterable,
    sort_order: d.sort_order,
    product_value_count: counts.get(d.id) ?? 0,
  }));
}

export interface AttributeEditableRow {
  id: string;
  slug: string;
  name: string;
  type: AttributeType;
  unit: string | null;
  applies_to_category_id: string | null;
  options_json: string[] | null;
  is_filterable: boolean;
  sort_order: number;
}

export async function getAttributeDefinitionForEditing(
  supabase: SC,
  id: string,
): Promise<AttributeEditableRow | null> {
  const { data, error } = await supabase
    .from("attribute_definitions")
    .select(
      "id, slug, name, type, unit, applies_to_category_id, options_json, is_filterable, sort_order",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getAttributeDefinitionForEditing: ${error.message}`);
  if (!data) return null;
  return {
    ...data,
    type: data.type as AttributeType,
    options_json: Array.isArray(data.options_json)
      ? (data.options_json as string[])
      : null,
  };
}

export type AttributeWriteError =
  | { code: "validation"; issues: Array<{ path: string[]; message: string }> }
  | { code: "slug_in_use" }
  | { code: "category_not_found" }
  | { code: "not_found" }
  | { code: "type_change_blocked"; productValueCount: number };

async function isSlugInUse(
  supabase: SC,
  slug: string,
  exceptId: string | null,
): Promise<boolean> {
  let q = supabase
    .from("attribute_definitions")
    .select("id", { head: true, count: "exact" })
    .eq("slug", slug);
  if (exceptId) q = q.neq("id", exceptId);
  const r = await q;
  if (r.error) throw new Error(`isSlugInUse: ${r.error.message}`);
  return (r.count ?? 0) > 0;
}

async function assertCategoryExists(
  supabase: SC,
  categoryId: string | null,
): Promise<boolean> {
  if (!categoryId) return true;
  const r = await supabase
    .from("categories")
    .select("id", { head: true, count: "exact" })
    .eq("id", categoryId)
    .is("deleted_at", null);
  if (r.error) throw new Error(`assertCategoryExists: ${r.error.message}`);
  return (r.count ?? 0) > 0;
}

export async function createAttributeDefinition(
  supabase: SC,
  input: unknown,
): Promise<{ ok: true; id: string } | { ok: false; error: AttributeWriteError }> {
  const parsed = AttributeDefinitionInputSchema.safeParse(input);
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
  const data: AttributeDefinitionInput = parsed.data;

  if (await isSlugInUse(supabase, data.slug, null)) {
    return { ok: false, error: { code: "slug_in_use" } };
  }
  if (!(await assertCategoryExists(supabase, data.applies_to_category_id))) {
    return { ok: false, error: { code: "category_not_found" } };
  }

  const ins = await supabase
    .from("attribute_definitions")
    .insert({
      slug: data.slug,
      name: data.name,
      type: data.type,
      unit: data.unit,
      applies_to_category_id: data.applies_to_category_id,
      options_json: data.options_json,
      is_filterable: data.is_filterable,
      sort_order: data.sort_order,
    })
    .select("id")
    .single();
  if (ins.error) {
    if (ins.error.code === "23505") {
      return { ok: false, error: { code: "slug_in_use" } };
    }
    throw new Error(`createAttributeDefinition (insert): ${ins.error.message}`);
  }
  return { ok: true, id: ins.data.id };
}

export async function updateAttributeDefinition(
  supabase: SC,
  id: string,
  input: unknown,
): Promise<
  | { ok: true; before: AttributeEditableRow; after: AttributeEditableRow }
  | { ok: false; error: AttributeWriteError }
> {
  const parsed = AttributeDefinitionInputSchema.safeParse(input);
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
  const data: AttributeDefinitionInput = parsed.data;
  const before = await getAttributeDefinitionForEditing(supabase, id);
  if (!before) return { ok: false, error: { code: "not_found" } };

  // Block type change when existing product_attributes values exist.
  if (data.type !== before.type) {
    const refs = await supabase
      .from("product_attributes")
      .select("attribute_id", { head: true, count: "exact" })
      .eq("attribute_id", id);
    if (refs.error) {
      throw new Error(`updateAttributeDefinition (refs): ${refs.error.message}`);
    }
    if ((refs.count ?? 0) > 0) {
      return {
        ok: false,
        error: {
          code: "type_change_blocked",
          productValueCount: refs.count ?? 0,
        },
      };
    }
  }

  if (
    data.slug !== before.slug &&
    (await isSlugInUse(supabase, data.slug, id))
  ) {
    return { ok: false, error: { code: "slug_in_use" } };
  }
  if (
    data.applies_to_category_id !== before.applies_to_category_id &&
    !(await assertCategoryExists(supabase, data.applies_to_category_id))
  ) {
    return { ok: false, error: { code: "category_not_found" } };
  }

  const upd = await supabase
    .from("attribute_definitions")
    .update({
      slug: data.slug,
      name: data.name,
      type: data.type,
      unit: data.unit,
      applies_to_category_id: data.applies_to_category_id,
      options_json: data.options_json,
      is_filterable: data.is_filterable,
      sort_order: data.sort_order,
    })
    .eq("id", id)
    .select(
      "id, slug, name, type, unit, applies_to_category_id, options_json, is_filterable, sort_order",
    )
    .single();
  if (upd.error) {
    if (upd.error.code === "23505") {
      return { ok: false, error: { code: "slug_in_use" } };
    }
    throw new Error(`updateAttributeDefinition (update): ${upd.error.message}`);
  }
  return {
    ok: true,
    before,
    after: {
      ...upd.data,
      type: upd.data.type as AttributeType,
      options_json: Array.isArray(upd.data.options_json)
        ? (upd.data.options_json as string[])
        : null,
    },
  };
}

export type AttributeDeleteError =
  | { code: "not_found" }
  | { code: "in_use"; productValueCount: number };

/**
 * Hard-delete an attribute. Refuses when any product_attributes row
 * references it; the owner must remove those values first via the
 * product editor's Attributes tab.
 */
export async function deleteAttributeDefinition(
  supabase: SC,
  id: string,
): Promise<{ ok: true } | { ok: false; error: AttributeDeleteError }> {
  const exists = await supabase
    .from("attribute_definitions")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (exists.error) {
    throw new Error(`deleteAttributeDefinition (lookup): ${exists.error.message}`);
  }
  if (!exists.data) return { ok: false, error: { code: "not_found" } };

  const refs = await supabase
    .from("product_attributes")
    .select("attribute_id", { head: true, count: "exact" })
    .eq("attribute_id", id);
  if (refs.error) {
    throw new Error(`deleteAttributeDefinition (refs): ${refs.error.message}`);
  }
  if ((refs.count ?? 0) > 0) {
    return {
      ok: false,
      error: { code: "in_use", productValueCount: refs.count ?? 0 },
    };
  }

  const del = await supabase
    .from("attribute_definitions")
    .delete()
    .eq("id", id);
  if (del.error) {
    throw new Error(`deleteAttributeDefinition (delete): ${del.error.message}`);
  }
  return { ok: true };
}
