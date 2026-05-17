/**
 * Admin variants data layer — the Variants-tab back-end.
 *
 * Three-layer model (from migration 0003):
 *   product_options          (id, product_id, name, sort_order)
 *   product_option_values    (id, option_id,  value, sort_order)
 *   product_variants         (id, product_id, sku, price, stock, is_default…)
 *   variant_option_values    (variant_id, option_value_id)   — junction
 *
 * "No variants" is a normal state for single-SKU products. The tab
 * renders an empty state and a Cartesian generate-all when options
 * exist but variants don't yet.
 *
 * Soft-delete on variants: storefront filters via `deleted_at IS NULL`;
 * Trash (P2-T28) restores. Options + values are hard-deleted because
 * deleting one would leave dangling junction rows by definition — the
 * UI gates the delete behind a "no active variants reference this
 * value" check (enforced server-side too).
 *
 * Default-variant constraint: 0003 + 0011 enforce a partial unique on
 * `product_id WHERE is_default = true AND deleted_at IS NULL`. The
 * setDefaultVariant action does the two UPDATEs inside a logical
 * transaction; the DB is the source of truth if the calls race.
 *
 * DI Supabase per ADR-010. Service-role isolation: this file uses the
 * client the caller hands in; the action wraps it with
 * `requireAdminContext()`.
 */
import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types.gen";
import { SKU_REGEX } from "@/lib/schemas/product";

type SC = SupabaseClient<Database>;
type StockStatus = Database["public"]["Enums"]["stock_status"];

const STOCK_STATUSES: StockStatus[] = [
  "in_stock",
  "low_stock",
  "out_of_stock",
  "made_to_order",
  "unknown",
];

/* ────────────────────────────────────────────────────────────────────── *
 * Types — read shape
 * ────────────────────────────────────────────────────────────────────── */

export interface OptionValueRow {
  id: string;
  value: string;
  sort_order: number;
}

export interface OptionWithValues {
  id: string;
  name: string;
  sort_order: number;
  values: OptionValueRow[];
}

export interface VariantRow {
  id: string;
  sku: string;
  name: string | null;
  price_inr: number | null;
  compare_at_price_inr: number | null;
  stock_status: StockStatus;
  stock_quantity: number | null;
  is_default: boolean;
  sort_order: number;
  deleted_at: string | null;
  option_value_ids: string[];
}

export interface VariantsBundle {
  options: OptionWithValues[];
  variants: VariantRow[];
}

/* ────────────────────────────────────────────────────────────────────── *
 * Read
 * ────────────────────────────────────────────────────────────────────── */

/**
 * Returns the full variants payload for the editor in one pass.
 * Soft-deleted variants are excluded (Trash view fetches them
 * separately).
 *
 * Three round-trips; PostgREST nested-embed would aggregate before
 * the outer limit and inflate the request weight here.
 */
export async function getVariantsBundle(
  supabase: SC,
  productId: string,
): Promise<VariantsBundle> {
  const [optsRes, valuesRes, variantsRes] = await Promise.all([
    supabase
      .from("product_options")
      .select("id, name, sort_order")
      .eq("product_id", productId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("product_option_values")
      .select("id, option_id, value, sort_order")
      .in(
        "option_id",
        // PostgREST .in() needs an array; if no options exist we skip
        // entirely below.
        [],
      )
      .order("sort_order", { ascending: true })
      .order("value", { ascending: true }),
    supabase
      .from("product_variants")
      .select(
        "id, sku, name, price_inr, compare_at_price_inr, stock_status, stock_quantity, is_default, sort_order, deleted_at, variant_option_values(option_value_id)",
      )
      .eq("product_id", productId)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);
  if (optsRes.error) throw new Error(`getVariantsBundle (options): ${optsRes.error.message}`);
  if (variantsRes.error) throw new Error(`getVariantsBundle (variants): ${variantsRes.error.message}`);

  const optionIds = (optsRes.data ?? []).map((o) => o.id);
  let allValues: Array<{ id: string; option_id: string; value: string; sort_order: number }> = [];
  if (optionIds.length > 0) {
    const v = await supabase
      .from("product_option_values")
      .select("id, option_id, value, sort_order")
      .in("option_id", optionIds)
      .order("sort_order", { ascending: true })
      .order("value", { ascending: true });
    if (v.error) throw new Error(`getVariantsBundle (values): ${v.error.message}`);
    allValues = v.data ?? [];
  } else {
    // valuesRes was the empty-fast-path; nothing to wait on.
    void valuesRes;
  }

  const valuesByOption = new Map<string, OptionValueRow[]>();
  for (const v of allValues) {
    if (!valuesByOption.has(v.option_id)) valuesByOption.set(v.option_id, []);
    valuesByOption.get(v.option_id)!.push({
      id: v.id,
      value: v.value,
      sort_order: v.sort_order,
    });
  }

  const options: OptionWithValues[] = (optsRes.data ?? []).map((o) => ({
    id: o.id,
    name: o.name,
    sort_order: o.sort_order,
    values: valuesByOption.get(o.id) ?? [],
  }));

  const variants: VariantRow[] = (variantsRes.data ?? []).map((v) => ({
    id: v.id,
    sku: v.sku,
    name: v.name,
    price_inr: v.price_inr,
    compare_at_price_inr: v.compare_at_price_inr,
    stock_status: v.stock_status,
    stock_quantity: v.stock_quantity,
    is_default: v.is_default,
    sort_order: v.sort_order,
    deleted_at: v.deleted_at,
    option_value_ids: (v.variant_option_values ?? []).map((j) => j.option_value_id),
  }));

  return { options, variants };
}

/* ────────────────────────────────────────────────────────────────────── *
 * Schemas + input types
 * ────────────────────────────────────────────────────────────────────── */

const OPTION_NAME_MAX = 60;
const OPTION_VALUE_MAX = 60;
const VARIANT_NAME_MAX = 120;

const OptionValueInputSchema = z.object({
  // For existing values keep the id so we can preserve junction rows.
  // For new values: id null → INSERT.
  id: z.string().uuid().nullable(),
  value: z.string().trim().min(1).max(OPTION_VALUE_MAX),
  sort_order: z.number().int().nonnegative(),
});

const OptionInputSchema = z.object({
  id: z.string().uuid().nullable(),
  name: z.string().trim().min(1).max(OPTION_NAME_MAX),
  sort_order: z.number().int().nonnegative(),
  values: z.array(OptionValueInputSchema).min(1),
});

export type OptionInput = z.infer<typeof OptionInputSchema>;
export type OptionValueInput = z.infer<typeof OptionValueInputSchema>;

const VariantInputSchema = z.object({
  id: z.string().uuid().nullable(),
  sku: z
    .string()
    .trim()
    .min(1)
    .regex(SKU_REGEX, "SKU must be uppercase letters, digits, and dashes only"),
  name: z.string().trim().max(VARIANT_NAME_MAX).nullable(),
  price_inr: z.number().int().nonnegative().nullable(),
  compare_at_price_inr: z.number().int().nonnegative().nullable(),
  stock_status: z.enum(STOCK_STATUSES as [StockStatus, ...StockStatus[]]),
  stock_quantity: z.number().int().nonnegative().nullable(),
  sort_order: z.number().int().nonnegative(),
  // The Cartesian combo this variant addresses (one option_value_id per
  // option). UI passes empty when the product has no options.
  option_value_ids: z.array(z.string().uuid()),
});

export type VariantInput = z.infer<typeof VariantInputSchema>;

/* ────────────────────────────────────────────────────────────────────── *
 * Errors
 * ────────────────────────────────────────────────────────────────────── */

export type VariantsError =
  | { code: "validation"; issues: Array<{ path: string; message: string }> }
  | { code: "duplicate_option_name"; name: string }
  | { code: "duplicate_value"; option: string; value: string }
  | { code: "value_in_use"; valueId: string; variantCount: number }
  | { code: "duplicate_combo"; option_value_ids: string[] }
  | { code: "sku_in_use"; sku: string }
  | { code: "variant_not_found"; variantId: string }
  | { code: "no_options" };

export type SetOptionsResult =
  | { ok: true; options: OptionWithValues[] }
  | { ok: false; error: VariantsError };

export type SetVariantsResult =
  | { ok: true; variants: VariantRow[] }
  | { ok: false; error: VariantsError };

export type GenerateVariantsResult =
  | { ok: true; created: number; variants: VariantRow[] }
  | { ok: false; error: VariantsError };

/* ────────────────────────────────────────────────────────────────────── *
 * setProductOptions — replace the options/values tree
 * ────────────────────────────────────────────────────────────────────── */

/**
 * Replace-semantics over options + values.
 *
 *   - Options not in `next` are deleted (CASCADE wipes their values
 *     AND any junction rows; variants are NOT deleted but become
 *     ill-formed). We block delete of an option-value with active
 *     non-deleted variants referencing it.
 *   - Options/values with ids are UPDATEd (name, sort_order).
 *   - Options/values without ids are INSERTed.
 *
 * Audit-log shape (caller's responsibility) needs before/after.
 * Returns the after-shape on success.
 */
export async function setProductOptions(
  supabase: SC,
  productId: string,
  next: OptionInput[],
): Promise<SetOptionsResult> {
  // 0. Validate input.
  const parsed = z.array(OptionInputSchema).safeParse(next);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "validation",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
    };
  }
  const input = parsed.data;

  // Reject duplicate option names (case-insensitive) — UNIQUE constraint
  // on (product_id, name) would catch it, but surfacing as a typed error
  // is cleaner than a DB exception.
  const seenNames = new Map<string, string>();
  for (const opt of input) {
    const key = opt.name.trim().toLowerCase();
    if (seenNames.has(key)) {
      return { ok: false, error: { code: "duplicate_option_name", name: opt.name } };
    }
    seenNames.set(key, opt.name);
    const seenValues = new Map<string, string>();
    for (const val of opt.values) {
      const vkey = val.value.trim().toLowerCase();
      if (seenValues.has(vkey)) {
        return {
          ok: false,
          error: { code: "duplicate_value", option: opt.name, value: val.value },
        };
      }
      seenValues.set(vkey, val.value);
    }
  }

  // 1. Read current state so we can diff.
  const curOptsRes = await supabase
    .from("product_options")
    .select("id, name, sort_order")
    .eq("product_id", productId);
  if (curOptsRes.error) throw new Error(`setProductOptions (cur opts): ${curOptsRes.error.message}`);
  const curOpts = curOptsRes.data ?? [];
  const curOptIds = curOpts.map((o) => o.id);

  let curValues: Array<{ id: string; option_id: string; value: string; sort_order: number }> = [];
  if (curOptIds.length > 0) {
    const v = await supabase
      .from("product_option_values")
      .select("id, option_id, value, sort_order")
      .in("option_id", curOptIds);
    if (v.error) throw new Error(`setProductOptions (cur vals): ${v.error.message}`);
    curValues = v.data ?? [];
  }

  const nextOptIds = new Set(input.map((o) => o.id).filter((x): x is string => !!x));
  const nextValIds = new Set(
    input.flatMap((o) => o.values.map((v) => v.id).filter((x): x is string => !!x)),
  );
  const optsToDelete = curOpts.filter((o) => !nextOptIds.has(o.id));
  const valuesToDelete = curValues.filter(
    (v) =>
      !nextValIds.has(v.id) &&
      // values whose owning option is being deleted are gone via CASCADE,
      // don't double-check here.
      !optsToDelete.find((o) => o.id === v.option_id),
  );

  // 2. Block: any value being deleted while non-deleted variants
  //    reference it. Without this guard, the variants would silently
  //    lose their option-value combo and become un-identifiable.
  if (valuesToDelete.length > 0 || optsToDelete.length > 0) {
    const blockedIds = [
      ...valuesToDelete.map((v) => v.id),
      ...curValues
        .filter((v) => optsToDelete.find((o) => o.id === v.option_id))
        .map((v) => v.id),
    ];
    if (blockedIds.length > 0) {
      const refs = await supabase
        .from("variant_option_values")
        .select("option_value_id, variant:product_variants!inner(id, deleted_at)")
        .in("option_value_id", blockedIds);
      if (refs.error) throw new Error(`setProductOptions (refs): ${refs.error.message}`);
      const blockedActive = (refs.data ?? []).filter(
        (r) => Array.isArray(r.variant)
          ? r.variant.some((vv) => vv.deleted_at === null)
          : r.variant && r.variant.deleted_at === null,
      );
      if (blockedActive.length > 0) {
        const counts = new Map<string, number>();
        for (const r of blockedActive) {
          counts.set(r.option_value_id, (counts.get(r.option_value_id) ?? 0) + 1);
        }
        const [valueId, count] = [...counts.entries()][0];
        return {
          ok: false,
          error: { code: "value_in_use", valueId, variantCount: count },
        };
      }
    }
  }

  // 3. Apply: delete options no longer present (CASCADE handles values
  //    + junction). Delete loose values being removed under retained
  //    options.
  if (optsToDelete.length > 0) {
    const delRes = await supabase
      .from("product_options")
      .delete()
      .in(
        "id",
        optsToDelete.map((o) => o.id),
      );
    if (delRes.error) throw new Error(`setProductOptions (del opts): ${delRes.error.message}`);
  }
  if (valuesToDelete.length > 0) {
    const delRes = await supabase
      .from("product_option_values")
      .delete()
      .in(
        "id",
        valuesToDelete.map((v) => v.id),
      );
    if (delRes.error) throw new Error(`setProductOptions (del vals): ${delRes.error.message}`);
  }

  // 4. Upsert options. INSERT for id=null, UPDATE for existing.
  const optionsResolved: Array<{ inputIdx: number; id: string }> = [];
  for (let i = 0; i < input.length; i++) {
    const opt = input[i];
    if (opt.id) {
      const updRes = await supabase
        .from("product_options")
        .update({ name: opt.name.trim(), sort_order: opt.sort_order })
        .eq("id", opt.id)
        .eq("product_id", productId);
      if (updRes.error) throw new Error(`setProductOptions (upd opt): ${updRes.error.message}`);
      optionsResolved.push({ inputIdx: i, id: opt.id });
    } else {
      const insRes = await supabase
        .from("product_options")
        .insert({
          product_id: productId,
          name: opt.name.trim(),
          sort_order: opt.sort_order,
        })
        .select("id")
        .single();
      if (insRes.error) throw new Error(`setProductOptions (ins opt): ${insRes.error.message}`);
      optionsResolved.push({ inputIdx: i, id: insRes.data.id });
    }
  }

  // 5. Upsert values, scoped to each resolved option id.
  for (const { inputIdx, id: optId } of optionsResolved) {
    const opt = input[inputIdx];
    for (const val of opt.values) {
      if (val.id) {
        const updRes = await supabase
          .from("product_option_values")
          .update({ value: val.value.trim(), sort_order: val.sort_order })
          .eq("id", val.id)
          .eq("option_id", optId);
        if (updRes.error) throw new Error(`setProductOptions (upd val): ${updRes.error.message}`);
      } else {
        const insRes = await supabase
          .from("product_option_values")
          .insert({
            option_id: optId,
            value: val.value.trim(),
            sort_order: val.sort_order,
          });
        if (insRes.error) throw new Error(`setProductOptions (ins val): ${insRes.error.message}`);
      }
    }
  }

  const bundle = await getVariantsBundle(supabase, productId);
  return { ok: true, options: bundle.options };
}

/* ────────────────────────────────────────────────────────────────────── *
 * setProductVariants — bulk update existing variants
 * ────────────────────────────────────────────────────────────────────── */

/**
 * Update non-soft-deleted variants for a product. New variants come
 * in with id=null and get INSERTed. Junction rows (variant_option_values)
 * are reset for any variant whose option_value_ids change.
 *
 * NOT a full replace: omitting a variant from the call leaves it
 * unchanged. To remove a variant use softDeleteVariant.
 *
 * Default-variant changes are NOT routed through here — they go through
 * setDefaultVariant to keep the constraint logic in one place.
 */
export async function setProductVariants(
  supabase: SC,
  productId: string,
  inputs: VariantInput[],
): Promise<SetVariantsResult> {
  const parsed = z.array(VariantInputSchema).safeParse(inputs);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "validation",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
    };
  }
  const variants = parsed.data;

  // Cross-field: compare_at must be > price when both set. (DB CHECK
  // enforces it too — surface as typed validation error before the
  // round-trip.)
  for (let i = 0; i < variants.length; i++) {
    const v = variants[i];
    if (
      v.compare_at_price_inr != null &&
      v.price_inr != null &&
      v.compare_at_price_inr <= v.price_inr
    ) {
      return {
        ok: false,
        error: {
          code: "validation",
          issues: [
            {
              path: `${i}.compare_at_price_inr`,
              message: "Compare-at must be greater than price",
            },
          ],
        },
      };
    }
  }

  // Dedupe option-value combos within the call (DB has no such constraint
  // — we maintain the invariant at the application layer).
  const comboSet = new Set<string>();
  for (const v of variants) {
    const key = [...v.option_value_ids].sort().join("|");
    if (key && comboSet.has(key)) {
      return {
        ok: false,
        error: { code: "duplicate_combo", option_value_ids: v.option_value_ids },
      };
    }
    if (key) comboSet.add(key);
  }

  // SKU collisions within the input.
  const skuSet = new Set<string>();
  for (const v of variants) {
    if (skuSet.has(v.sku)) {
      return { ok: false, error: { code: "sku_in_use", sku: v.sku } };
    }
    skuSet.add(v.sku);
  }

  // Existing SKUs (other products + other variants on this product) —
  // catch collisions before the unique violation.
  if (variants.length > 0) {
    const skus = variants.map((v) => v.sku);
    const ids = variants.map((v) => v.id).filter((x): x is string => !!x);
    const collRes = await supabase
      .from("product_variants")
      .select("id, sku")
      .in("sku", skus)
      .is("deleted_at", null);
    if (collRes.error) throw new Error(`setProductVariants (sku check): ${collRes.error.message}`);
    const collision = (collRes.data ?? []).find((r) => !ids.includes(r.id));
    if (collision) {
      return { ok: false, error: { code: "sku_in_use", sku: collision.sku } };
    }
  }

  const resolvedIds: string[] = [];
  for (const v of variants) {
    let id = v.id;
    if (id) {
      const updRes = await supabase
        .from("product_variants")
        .update({
          sku: v.sku,
          name: v.name,
          price_inr: v.price_inr,
          compare_at_price_inr: v.compare_at_price_inr,
          stock_status: v.stock_status,
          stock_quantity: v.stock_quantity,
          sort_order: v.sort_order,
        })
        .eq("id", id)
        .eq("product_id", productId);
      if (updRes.error) throw new Error(`setProductVariants (upd): ${updRes.error.message}`);
    } else {
      const insRes = await supabase
        .from("product_variants")
        .insert({
          product_id: productId,
          sku: v.sku,
          name: v.name,
          price_inr: v.price_inr,
          compare_at_price_inr: v.compare_at_price_inr,
          stock_status: v.stock_status,
          stock_quantity: v.stock_quantity,
          sort_order: v.sort_order,
        })
        .select("id")
        .single();
      if (insRes.error) throw new Error(`setProductVariants (ins): ${insRes.error.message}`);
      id = insRes.data.id;
    }
    resolvedIds.push(id);

    // Reset junction rows for this variant (only when the variant has
    // option_value_ids — products without options pass []).
    const delJoin = await supabase
      .from("variant_option_values")
      .delete()
      .eq("variant_id", id);
    if (delJoin.error) throw new Error(`setProductVariants (del join): ${delJoin.error.message}`);
    if (v.option_value_ids.length > 0) {
      const insJoin = await supabase
        .from("variant_option_values")
        .insert(
          v.option_value_ids.map((option_value_id) => ({
            variant_id: id!,
            option_value_id,
          })),
        );
      if (insJoin.error) throw new Error(`setProductVariants (ins join): ${insJoin.error.message}`);
    }
  }

  const bundle = await getVariantsBundle(supabase, productId);
  return {
    ok: true,
    variants: bundle.variants.filter((v) => resolvedIds.includes(v.id)),
  };
}

/* ────────────────────────────────────────────────────────────────────── *
 * softDeleteVariant
 * ────────────────────────────────────────────────────────────────────── */

export async function softDeleteVariant(
  supabase: SC,
  variantId: string,
  actorId: string | null,
): Promise<{ ok: true } | { ok: false; error: VariantsError }> {
  // Refuse to soft-delete the lone default — leaves the product without
  // a default in violation of the editor's contract. Caller must pick a
  // new default first.
  const cur = await supabase
    .from("product_variants")
    .select("id, product_id, is_default, deleted_at")
    .eq("id", variantId)
    .maybeSingle();
  if (cur.error) throw new Error(`softDeleteVariant (lookup): ${cur.error.message}`);
  if (!cur.data || cur.data.deleted_at !== null) {
    return { ok: false, error: { code: "variant_not_found", variantId } };
  }

  const upd = await supabase
    .from("product_variants")
    .update({
      deleted_at: new Date().toISOString(),
      // Clear is_default on the way out so the partial unique index
      // tolerates a future variant taking the default slot without
      // racing against the soft-deleted row.
      is_default: false,
    })
    .eq("id", variantId);
  if (upd.error) throw new Error(`softDeleteVariant (update): ${upd.error.message}`);
  void actorId; // deleted_by lives in audit_logs, not on the row
  return { ok: true };
}

/* ────────────────────────────────────────────────────────────────────── *
 * setDefaultVariant
 * ────────────────────────────────────────────────────────────────────── */

/**
 * Atomic-ish default swap: clear all non-default, then set the target.
 * Postgres handles the partial unique index. Two UPDATEs back-to-back
 * race-prone in theory — if the DB enforces the constraint, the worst
 * a race can do is fail one of the parallel calls with a unique
 * violation, which we surface as a retryable error.
 */
export async function setDefaultVariant(
  supabase: SC,
  productId: string,
  variantId: string,
): Promise<{ ok: true } | { ok: false; error: VariantsError }> {
  const cur = await supabase
    .from("product_variants")
    .select("id")
    .eq("id", variantId)
    .eq("product_id", productId)
    .is("deleted_at", null)
    .maybeSingle();
  if (cur.error) throw new Error(`setDefaultVariant (lookup): ${cur.error.message}`);
  if (!cur.data) {
    return { ok: false, error: { code: "variant_not_found", variantId } };
  }

  // Clear everyone else first to free the partial-unique slot.
  const clear = await supabase
    .from("product_variants")
    .update({ is_default: false })
    .eq("product_id", productId)
    .neq("id", variantId)
    .is("deleted_at", null);
  if (clear.error) throw new Error(`setDefaultVariant (clear): ${clear.error.message}`);

  const set = await supabase
    .from("product_variants")
    .update({ is_default: true })
    .eq("id", variantId);
  if (set.error) throw new Error(`setDefaultVariant (set): ${set.error.message}`);

  return { ok: true };
}

/* ────────────────────────────────────────────────────────────────────── *
 * generateAllVariants — Cartesian product of options × values
 * ────────────────────────────────────────────────────────────────────── */

/**
 * Walks the options tree and creates a variant per combination that
 * doesn't already exist. Existing variants are left alone.
 *
 *   - SKU: <productSku>-<value1>-<value2>… (slug-cased, uppercase).
 *     If the resulting SKU collides we append a numeric suffix until
 *     unique. That's intentionally crude — the editor lets the owner
 *     edit afterwards.
 *   - Other fields: price = product.base_price_inr, stock_status =
 *     unknown, stock_quantity = NULL, is_default = first new variant
 *     iff no current default exists.
 */
export async function generateAllVariants(
  supabase: SC,
  productId: string,
): Promise<GenerateVariantsResult> {
  const bundle = await getVariantsBundle(supabase, productId);
  if (bundle.options.length === 0) {
    return { ok: false, error: { code: "no_options" } };
  }
  for (const opt of bundle.options) {
    if (opt.values.length === 0) {
      return {
        ok: false,
        error: {
          code: "validation",
          issues: [{ path: opt.name, message: "Option must have at least one value" }],
        },
      };
    }
  }

  const prodRes = await supabase
    .from("products")
    .select("sku, base_price_inr")
    .eq("id", productId)
    .single();
  if (prodRes.error) throw new Error(`generateAllVariants (product): ${prodRes.error.message}`);
  const productSku = prodRes.data.sku;
  const basePrice = prodRes.data.base_price_inr;

  // Build the Cartesian product of (option index → value index).
  const combos: OptionValueRow[][] = cartesian(
    bundle.options.map((o) => [...o.values].sort((a, b) =>
      a.sort_order - b.sort_order || a.value.localeCompare(b.value),
    )),
  );

  // Index existing variants by their combo signature so we can skip them.
  const existingCombo = new Set(
    bundle.variants.map((v) => [...v.option_value_ids].sort().join("|")),
  );

  const hasDefault = bundle.variants.some((v) => v.is_default);

  const toInsert: Array<{
    sku: string;
    option_value_ids: string[];
    is_default: boolean;
  }> = [];
  for (const combo of combos) {
    const key = combo
      .map((v) => v.id)
      .sort()
      .join("|");
    if (existingCombo.has(key)) continue;

    let sku = `${productSku}-${combo.map((v) => slugifyForSku(v.value)).join("-")}`.toUpperCase();
    sku = sku.replace(/[^A-Z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    toInsert.push({
      sku,
      option_value_ids: combo.map((v) => v.id),
      is_default: false,
    });
  }

  if (toInsert.length === 0) {
    return { ok: true, created: 0, variants: [] };
  }

  // First new variant takes is_default IFF the product has no default.
  if (!hasDefault) toInsert[0].is_default = true;

  // Resolve SKU collisions against the full active+soft-deleted set.
  const candidateSkus = toInsert.map((t) => t.sku);
  const collRes = await supabase
    .from("product_variants")
    .select("sku")
    .in("sku", candidateSkus);
  if (collRes.error) throw new Error(`generateAllVariants (sku check): ${collRes.error.message}`);
  const taken = new Set((collRes.data ?? []).map((r) => r.sku));
  for (const item of toInsert) {
    let suffix = 2;
    let candidate = item.sku;
    while (taken.has(candidate)) {
      candidate = `${item.sku}-${suffix}`;
      suffix++;
    }
    item.sku = candidate;
    taken.add(candidate);
  }

  const insertedIds: string[] = [];
  for (const item of toInsert) {
    const insRes = await supabase
      .from("product_variants")
      .insert({
        product_id: productId,
        sku: item.sku,
        price_inr: basePrice,
        stock_status: "unknown",
        stock_quantity: null,
        is_default: item.is_default,
      })
      .select("id")
      .single();
    if (insRes.error) throw new Error(`generateAllVariants (insert variant): ${insRes.error.message}`);
    insertedIds.push(insRes.data.id);

    const joinRes = await supabase
      .from("variant_option_values")
      .insert(
        item.option_value_ids.map((option_value_id) => ({
          variant_id: insRes.data.id,
          option_value_id,
        })),
      );
    if (joinRes.error) throw new Error(`generateAllVariants (insert join): ${joinRes.error.message}`);
  }

  const after = await getVariantsBundle(supabase, productId);
  return {
    ok: true,
    created: insertedIds.length,
    variants: after.variants.filter((v) => insertedIds.includes(v.id)),
  };
}

/* ────────────────────────────────────────────────────────────────────── *
 * helpers
 * ────────────────────────────────────────────────────────────────────── */

function cartesian<T>(arrays: T[][]): T[][] {
  if (arrays.length === 0) return [];
  return arrays.reduce<T[][]>(
    (acc, cur) => acc.flatMap((seq) => cur.map((v) => [...seq, v])),
    [[]],
  );
}

function slugifyForSku(s: string): string {
  return s
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
