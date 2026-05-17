/**
 * Attribute helpers — used by the Attributes tab in the product editor
 * and (later) the storefront facet sidebar.
 *
 * DI Supabase per ADR-010. Soft-deleted definitions don't exist (the
 * table has no deleted_at column; definitions are managed in P2-T22's
 * own admin, hard-deletes go through a guard there).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types.gen";

type SC = SupabaseClient<Database>;

export type AttributeType = Database["public"]["Enums"]["attribute_type"];

export interface AttributeDefinition {
  id: string;
  slug: string;
  name: string;
  type: AttributeType;
  unit: string | null;
  options_json: string[] | null;
  sort_order: number;
  applies_to_category_id: string | null;
  is_filterable: boolean;
}

/**
 * Definitions applicable to a product: globals (applies_to_category_id
 * IS NULL) ∪ category-specific (applies_to_category_id = categoryId).
 *
 * When categoryId is null, only globals are returned. Sorted by
 * sort_order, then slug for stability.
 */
export async function listApplicableAttributes(
  supabase: SC,
  categoryId: string | null,
): Promise<AttributeDefinition[]> {
  let q = supabase
    .from("attribute_definitions")
    .select(
      "id, slug, name, type, unit, options_json, sort_order, applies_to_category_id, is_filterable",
    )
    .order("sort_order", { ascending: true })
    .order("slug", { ascending: true });

  if (categoryId) {
    q = q.or(`applies_to_category_id.is.null,applies_to_category_id.eq.${categoryId}`);
  } else {
    q = q.is("applies_to_category_id", null);
  }

  const { data, error } = await q;
  if (error) throw new Error(`listApplicableAttributes: ${error.message}`);

  // options_json is `Json | null` from PostgREST. The select type's
  // shape is per-row JSON — narrow to string[] here.
  return (data ?? []).map((d) => ({
    ...d,
    options_json: Array.isArray(d.options_json)
      ? (d.options_json as string[])
      : null,
  }));
}

export interface ProductAttributeRow {
  attribute_id: string;
  value_text: string | null;
  value_number: number | null;
  value_boolean: boolean | null;
}

/**
 * A product's current attribute rows. The join with definitions is left
 * to the caller (the editor needs both — list + values — and fetching
 * them in parallel from `Promise.all` is cleaner than embedding here).
 */
export async function getProductAttributes(
  supabase: SC,
  productId: string,
): Promise<ProductAttributeRow[]> {
  const { data, error } = await supabase
    .from("product_attributes")
    .select("attribute_id, value_text, value_number, value_boolean")
    .eq("product_id", productId);
  if (error) throw new Error(`getProductAttributes: ${error.message}`);
  return data ?? [];
}
