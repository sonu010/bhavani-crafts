/**
 * Per-row CSV validator + classifier.
 *
 * Takes one parsed row + reference lookups (category by slug, tag by
 * slug) and returns:
 *   - the action enum (`create` / `update` / `skip` / `error`)
 *   - an `error_message` if action='error'
 *   - the normalised payload to embed under `raw_json._normalized`
 *     for the executor to consume
 *
 * Sku-based existence check: caller passes a Map<sku, existingProduct>
 * pre-fetched in one round-trip so we don't issue N queries.
 */
import "server-only";
import { CsvRowInputSchema } from "@/lib/schemas/import-csv";
import { slugifyForProduct } from "@/lib/schemas/product";

export type RowAction = "create" | "update" | "skip" | "error";

export interface ExistingProduct {
  id: string;
  slug: string;
  name: string;
  short_description: string | null;
  description: string | null;
  base_price_inr: number | null;
  compare_at_price_inr: number | null;
  stock_status: string;
  stock_quantity: number | null;
  category_id: string | null;
}

export interface ValidatorRefs {
  categoryBySlug: Map<string, string>; // slug → id
  tagBySlug: Map<string, string>; // slug → id
  productBySku: Map<string, ExistingProduct>; // sku → row
}

export interface ClassifiedRow {
  action: RowAction;
  error_message: string | null;
  raw_json: Record<string, unknown>;
}

export function classifyRow(
  raw: Record<string, string>,
  refs: ValidatorRefs,
): ClassifiedRow {
  const parsed = CsvRowInputSchema.safeParse({
    sku: raw.sku ?? "",
    slug: raw.slug ?? "",
    name: raw.name ?? "",
    short_description: raw.short_description ?? "",
    description: raw.description ?? "",
    base_price_inr: raw.base_price_inr ?? "",
    compare_at_price_inr: raw.compare_at_price_inr ?? "",
    stock_status: raw.stock_status ?? "",
    stock_quantity: raw.stock_quantity ?? "",
    category_slug: raw.category_slug ?? "",
    tags: raw.tags ?? "",
  });

  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const path = first.path.join(".");
    return {
      action: "error",
      error_message: `validation: ${path || "row"} — ${first.message}`,
      raw_json: { ...raw },
    };
  }
  const data = parsed.data;

  // Resolve category
  let categoryId: string | null = null;
  if (data.category_slug) {
    const id = refs.categoryBySlug.get(data.category_slug);
    if (!id) {
      return {
        action: "error",
        error_message: `unknown_category: ${data.category_slug}`,
        raw_json: { ...raw },
      };
    }
    categoryId = id;
  }

  // Resolve tags
  const tagIds: string[] = [];
  const unknownTags: string[] = [];
  for (const tag of data.tags) {
    const id = refs.tagBySlug.get(tag);
    if (id) tagIds.push(id);
    else unknownTags.push(tag);
  }
  if (unknownTags.length > 0) {
    return {
      action: "error",
      error_message: `unknown_tags: ${unknownTags.join(", ")}`,
      raw_json: { ...raw },
    };
  }

  const finalSlug = data.slug ?? slugifyForProduct(data.name);

  const normalised = {
    sku: data.sku,
    slug: finalSlug,
    name: data.name,
    short_description: data.short_description,
    description: data.description,
    base_price_inr: data.base_price_inr,
    compare_at_price_inr: data.compare_at_price_inr,
    stock_status: data.stock_status,
    stock_quantity: data.stock_quantity,
    category_id: categoryId,
  };

  const existing = refs.productBySku.get(data.sku);
  let action: RowAction;
  if (!existing) {
    action = "create";
  } else {
    // Compare each shared field. If everything matches → skip;
    // otherwise update.
    const same =
      existing.slug === normalised.slug &&
      existing.name === normalised.name &&
      existing.short_description === normalised.short_description &&
      existing.description === normalised.description &&
      existing.base_price_inr === normalised.base_price_inr &&
      existing.compare_at_price_inr === normalised.compare_at_price_inr &&
      existing.stock_status === normalised.stock_status &&
      existing.stock_quantity === normalised.stock_quantity &&
      existing.category_id === normalised.category_id;
    action = same ? "skip" : "update";
  }

  return {
    action,
    error_message: null,
    raw_json: {
      ...raw,
      _normalized: normalised,
      _tag_ids: tagIds,
    },
  };
}

/**
 * Pre-fetch every reference the upcoming rows need so per-row
 * validation is a Map lookup. Three SELECTs:
 *   - categories (id, slug) where deleted_at IS NULL
 *   - tags (id, slug) where deleted_at IS NULL
 *   - products (id, slug, name, ...) where sku IN (rows.sku)
 *
 * @param rows  array of raw CSV rows (lowercased headers)
 * @param supabase  service-role client
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types.gen";

export async function fetchValidatorRefs(
  supabase: SupabaseClient<Database>,
  rows: Array<Record<string, string>>,
): Promise<ValidatorRefs> {
  const skus = Array.from(
    new Set(rows.map((r) => (r.sku ?? "").trim()).filter(Boolean)),
  );
  const categorySlugs = Array.from(
    new Set(rows.map((r) => (r.category_slug ?? "").trim()).filter(Boolean)),
  );
  const tagSlugs = Array.from(
    new Set(
      rows.flatMap((r) =>
        (r.tags ?? "")
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      ),
    ),
  );

  const [catsRes, tagsRes, prodsRes] = await Promise.all([
    categorySlugs.length > 0
      ? supabase
          .from("categories")
          .select("id, slug")
          .is("deleted_at", null)
          .in("slug", categorySlugs)
      : Promise.resolve({ data: [], error: null as { message: string } | null }),
    tagSlugs.length > 0
      ? supabase
          .from("tags")
          .select("id, slug")
          .is("deleted_at", null)
          .in("slug", tagSlugs)
      : Promise.resolve({ data: [], error: null as { message: string } | null }),
    skus.length > 0
      ? supabase
          .from("products")
          .select(
            "id, sku, slug, name, short_description, description, base_price_inr, compare_at_price_inr, stock_status, stock_quantity, category_id",
          )
          .is("deleted_at", null)
          .in("sku", skus)
      : Promise.resolve({ data: [], error: null as { message: string } | null }),
  ]);
  if (catsRes.error) throw new Error(`fetchValidatorRefs (cats): ${catsRes.error.message}`);
  if (tagsRes.error) throw new Error(`fetchValidatorRefs (tags): ${tagsRes.error.message}`);
  if (prodsRes.error) throw new Error(`fetchValidatorRefs (prods): ${prodsRes.error.message}`);

  const categoryBySlug = new Map<string, string>();
  for (const c of catsRes.data ?? []) categoryBySlug.set(c.slug, c.id);
  const tagBySlug = new Map<string, string>();
  for (const t of tagsRes.data ?? []) tagBySlug.set(t.slug, t.id);
  const productBySku = new Map<string, ExistingProduct>();
  for (const p of prodsRes.data ?? []) {
    productBySku.set(p.sku, {
      id: p.id,
      slug: p.slug,
      name: p.name,
      short_description: p.short_description,
      description: p.description,
      base_price_inr: p.base_price_inr,
      compare_at_price_inr: p.compare_at_price_inr,
      stock_status: p.stock_status,
      stock_quantity: p.stock_quantity,
      category_id: p.category_id,
    });
  }
  return { categoryBySlug, tagBySlug, productBySku };
}
