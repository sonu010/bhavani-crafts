"use server";

/**
 * Product editor — server actions.
 *
 * Each action:
 *   1. Goes through requireAdminContext (role + AAL gate + service-role
 *      client + redirect on auth failure).
 *   2. Performs its DB work via the typed data-layer helper.
 *   3. Writes an `audit_logs` row capturing before + after JSON.
 *   4. Calls revalidateTag/revalidatePath per architecture/caching-and-
 *      revalidation.md mutation map.
 *
 * Return shape is JSON-serializable (no Zod-issue cycles): clients
 * inspect `ok` and render inline form errors from the typed payload.
 */

import { revalidatePath, updateTag } from "next/cache";
import { headers } from "next/headers";
import { requireAdminContext } from "@/lib/db/admin-context";
import {
  getProductByIdBasic,
} from "@/lib/db/products";
import {
  setProductAttributes,
  setProductTags,
  updateProductCategory,
  updateProductGeneral,
  type AttributeValueInput,
} from "@/lib/db/admin/products";
import {
  generateAllVariants,
  getVariantsBundle,
  setDefaultVariant,
  setProductOptions,
  setProductVariants,
  softDeleteVariant,
  type OptionInput,
  type VariantInput,
  type VariantsError,
} from "@/lib/db/admin/variants";

export type SaveProductGeneralResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | {
            code: "validation";
            issues: Array<{ path: string[]; message: string }>;
          }
        | { code: "not_found" }
        | { code: "slug_in_use" }
        | { code: "sku_in_use" }
        | { code: "constraint"; message: string };
    };

export async function saveProductGeneral(
  id: string,
  patch: unknown,
): Promise<SaveProductGeneralResult> {
  const { admin, user } = await requireAdminContext();
  const h = await headers();
  const requestId =
    h.get("x-vercel-id") ?? h.get("x-request-id") ?? crypto.randomUUID();

  const result = await updateProductGeneral(admin, id, patch, user.id);

  if (!result.ok) {
    if (result.error.code === "validation") {
      // Strip Zod's non-serializable bits before the action result
      // crosses the RSC boundary.
      return {
        ok: false,
        error: {
          code: "validation",
          issues: result.error.issues.map((i) => ({
            path: i.path.map((p) => String(p)),
            message: i.message,
          })),
        },
      };
    }
    return { ok: false, error: result.error };
  }

  // Audit log: full before/after editable shape. Diffing belongs in
  // /admin/activity, not in the writer.
  const { error: auditErr } = await admin.from("audit_logs").insert({
    actor_id: user.id,
    action: "product.update",
    entity_type: "product",
    entity_id: id,
    before_json: result.before as never,
    after_json: result.after as never,
    request_id: requestId,
  });
  if (auditErr) {
    // Fail loud — audit gaps are a deploy-blocker, not silent loss.
    throw new Error(`saveProductGeneral audit insert: ${auditErr.message}`);
  }

  // Revalidation map (architecture/caching-and-revalidation.md):
  //
  // Next 16 split revalidateTag into two: `updateTag` for read-your-own-
  // writes from a server action (the admin sees their save reflected
  // immediately on the next render), and `revalidateTag` for delayed
  // invalidation tied to a CacheLife profile. We want the former.
  //   - updateTag('products')          → admin list refresh
  //   - revalidatePath('/p/<slug>')    → storefront PDP
  //   - revalidatePath('/c/<slug>')    → category page (if categorized)
  updateTag("products");
  if (result.before.slug !== result.after.slug) {
    revalidatePath(`/p/${result.before.slug}`);
  }
  revalidatePath(`/p/${result.after.slug}`);
  if (result.after.category_slug) {
    revalidatePath(`/c/${result.after.category_slug}`);
  }

  return { ok: true };
}

// ─── Category tab (P2-T12) ──────────────────────────────────────────

export type SaveProductCategoryResult =
  | { ok: true }
  | {
      ok: false;
      error: { code: "not_found" | "category_not_found" };
    };

export async function saveProductCategory(
  id: string,
  categoryId: string | null,
): Promise<SaveProductCategoryResult> {
  const { admin, user } = await requireAdminContext();
  const h = await headers();
  const requestId =
    h.get("x-vercel-id") ?? h.get("x-request-id") ?? crypto.randomUUID();

  const result = await updateProductCategory(admin, id, categoryId, user.id);
  if (!result.ok) return result;

  const { error: auditErr } = await admin.from("audit_logs").insert({
    actor_id: user.id,
    action: "product.update_category",
    entity_type: "product",
    entity_id: id,
    before_json: result.before as never,
    after_json: result.after as never,
    request_id: requestId,
  });
  if (auditErr) {
    throw new Error(`saveProductCategory audit insert: ${auditErr.message}`);
  }

  // Revalidate the product's PDP + both old + new category pages.
  // PDP slug comes from a tiny lookup; category slugs are in the result.
  const prod = await getProductByIdBasic(admin, id);
  updateTag("products");
  updateTag("categories");
  if (prod) revalidatePath(`/p/${prod.slug}`);
  if (result.before.categorySlug) {
    revalidatePath(`/c/${result.before.categorySlug}`);
  }
  if (
    result.after.categorySlug &&
    result.after.categorySlug !== result.before.categorySlug
  ) {
    revalidatePath(`/c/${result.after.categorySlug}`);
  }

  return { ok: true };
}

export type SaveProductTagsResult =
  | { ok: true }
  | { ok: false; error: { code: "tag_not_found"; missingSlugs: string[] } };

export async function saveProductTags(
  id: string,
  tagSlugs: string[],
): Promise<SaveProductTagsResult> {
  const { admin, user } = await requireAdminContext();
  const h = await headers();
  const requestId =
    h.get("x-vercel-id") ?? h.get("x-request-id") ?? crypto.randomUUID();

  const result = await setProductTags(admin, id, tagSlugs);
  if (!result.ok) return result;

  const { error: auditErr } = await admin.from("audit_logs").insert({
    actor_id: user.id,
    action: "product.set_tags",
    entity_type: "product",
    entity_id: id,
    before_json: result.before as never,
    after_json: result.after as never,
    request_id: requestId,
  });
  if (auditErr) {
    throw new Error(`saveProductTags audit insert: ${auditErr.message}`);
  }

  const prod = await getProductByIdBasic(admin, id);
  updateTag("products");
  if (prod) revalidatePath(`/p/${prod.slug}`);

  return { ok: true };
}

// ─── Attributes tab (P2-T13) ────────────────────────────────────────

export type SaveProductAttributesResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | { code: "validation"; issues: Array<{ attribute_id: string; message: string }> }
        | { code: "definition_not_found"; missingIds: string[] }
        | { code: "select_value_invalid"; attributeId: string; allowed: string[]; got: string };
    };

export async function saveProductAttributes(
  id: string,
  attrs: AttributeValueInput[],
): Promise<SaveProductAttributesResult> {
  const { admin, user } = await requireAdminContext();
  const h = await headers();
  const requestId =
    h.get("x-vercel-id") ?? h.get("x-request-id") ?? crypto.randomUUID();

  const result = await setProductAttributes(admin, id, attrs);
  if (!result.ok) return result;

  const { error: auditErr } = await admin.from("audit_logs").insert({
    actor_id: user.id,
    action: "product.set_attributes",
    entity_type: "product",
    entity_id: id,
    before_json: result.before as never,
    after_json: result.after as never,
    request_id: requestId,
  });
  if (auditErr) {
    throw new Error(`saveProductAttributes audit insert: ${auditErr.message}`);
  }

  const prod = await getProductByIdBasic(admin, id);
  updateTag("products");
  if (prod) revalidatePath(`/p/${prod.slug}`);
  return { ok: true };
}

// ─── Variants tab (P2-T14) ──────────────────────────────────────────

export type SaveProductOptionsResult =
  | { ok: true }
  | { ok: false; error: VariantsError };

export async function saveProductOptions(
  id: string,
  options: OptionInput[],
): Promise<SaveProductOptionsResult> {
  const { admin, user } = await requireAdminContext();
  const h = await headers();
  const requestId =
    h.get("x-vercel-id") ?? h.get("x-request-id") ?? crypto.randomUUID();

  const before = await getVariantsBundle(admin, id);
  const result = await setProductOptions(admin, id, options);
  if (!result.ok) return result;

  const after = await getVariantsBundle(admin, id);
  const { error: auditErr } = await admin.from("audit_logs").insert({
    actor_id: user.id,
    action: "product.set_options",
    entity_type: "product",
    entity_id: id,
    before_json: { options: before.options } as never,
    after_json: { options: after.options } as never,
    request_id: requestId,
  });
  if (auditErr) {
    throw new Error(`saveProductOptions audit insert: ${auditErr.message}`);
  }

  const prod = await getProductByIdBasic(admin, id);
  updateTag("products");
  if (prod) revalidatePath(`/p/${prod.slug}`);
  return { ok: true };
}

export type SaveProductVariantsResult =
  | { ok: true }
  | { ok: false; error: VariantsError };

export async function saveProductVariants(
  id: string,
  variants: VariantInput[],
): Promise<SaveProductVariantsResult> {
  const { admin, user } = await requireAdminContext();
  const h = await headers();
  const requestId =
    h.get("x-vercel-id") ?? h.get("x-request-id") ?? crypto.randomUUID();

  const before = await getVariantsBundle(admin, id);
  const result = await setProductVariants(admin, id, variants);
  if (!result.ok) return result;

  const after = await getVariantsBundle(admin, id);
  const { error: auditErr } = await admin.from("audit_logs").insert({
    actor_id: user.id,
    action: "product.set_variants",
    entity_type: "product",
    entity_id: id,
    before_json: { variants: before.variants } as never,
    after_json: { variants: after.variants } as never,
    request_id: requestId,
  });
  if (auditErr) {
    throw new Error(`saveProductVariants audit insert: ${auditErr.message}`);
  }

  const prod = await getProductByIdBasic(admin, id);
  updateTag("products");
  if (prod) revalidatePath(`/p/${prod.slug}`);
  return { ok: true };
}

export type SoftDeleteVariantResult =
  | { ok: true }
  | { ok: false; error: VariantsError };

export async function softDeleteVariantAction(
  productId: string,
  variantId: string,
): Promise<SoftDeleteVariantResult> {
  const { admin, user } = await requireAdminContext();
  const h = await headers();
  const requestId =
    h.get("x-vercel-id") ?? h.get("x-request-id") ?? crypto.randomUUID();

  // Capture the row pre-delete so the audit log preserves it.
  const before = await admin
    .from("product_variants")
    .select(
      "id, sku, name, price_inr, stock_status, stock_quantity, is_default",
    )
    .eq("id", variantId)
    .maybeSingle();

  const result = await softDeleteVariant(admin, variantId, user.id);
  if (!result.ok) return result;

  const { error: auditErr } = await admin.from("audit_logs").insert({
    actor_id: user.id,
    action: "product.soft_delete_variant",
    entity_type: "product_variant",
    entity_id: variantId,
    before_json: (before.data ?? null) as never,
    after_json: { deleted_at: new Date().toISOString() } as never,
    request_id: requestId,
  });
  if (auditErr) {
    throw new Error(`softDeleteVariant audit insert: ${auditErr.message}`);
  }

  const prod = await getProductByIdBasic(admin, productId);
  updateTag("products");
  if (prod) revalidatePath(`/p/${prod.slug}`);
  return { ok: true };
}

export type SetDefaultVariantResult =
  | { ok: true }
  | { ok: false; error: VariantsError };

export async function setDefaultVariantAction(
  productId: string,
  variantId: string,
): Promise<SetDefaultVariantResult> {
  const { admin, user } = await requireAdminContext();
  const h = await headers();
  const requestId =
    h.get("x-vercel-id") ?? h.get("x-request-id") ?? crypto.randomUUID();

  const before = await admin
    .from("product_variants")
    .select("id, is_default")
    .eq("product_id", productId)
    .is("deleted_at", null);

  const result = await setDefaultVariant(admin, productId, variantId);
  if (!result.ok) return result;

  const { error: auditErr } = await admin.from("audit_logs").insert({
    actor_id: user.id,
    action: "product.set_default_variant",
    entity_type: "product",
    entity_id: productId,
    before_json: { variants: before.data ?? [] } as never,
    after_json: { default_variant_id: variantId } as never,
    request_id: requestId,
  });
  if (auditErr) {
    throw new Error(`setDefaultVariant audit insert: ${auditErr.message}`);
  }

  const prod = await getProductByIdBasic(admin, productId);
  updateTag("products");
  if (prod) revalidatePath(`/p/${prod.slug}`);
  return { ok: true };
}

export type GenerateVariantsActionResult =
  | { ok: true; created: number }
  | { ok: false; error: VariantsError };

export async function generateAllVariantsAction(
  productId: string,
): Promise<GenerateVariantsActionResult> {
  const { admin, user } = await requireAdminContext();
  const h = await headers();
  const requestId =
    h.get("x-vercel-id") ?? h.get("x-request-id") ?? crypto.randomUUID();

  const before = await getVariantsBundle(admin, productId);
  const result = await generateAllVariants(admin, productId);
  if (!result.ok) return result;

  // No-op generates (already in sync) still get a 0-row audit entry —
  // useful for "did the owner press the button" forensics.
  const { error: auditErr } = await admin.from("audit_logs").insert({
    actor_id: user.id,
    action: "product.generate_variants",
    entity_type: "product",
    entity_id: productId,
    before_json: { variant_count: before.variants.length } as never,
    after_json: { created: result.created } as never,
    request_id: requestId,
  });
  if (auditErr) {
    throw new Error(`generateAllVariants audit insert: ${auditErr.message}`);
  }

  const prod = await getProductByIdBasic(admin, productId);
  updateTag("products");
  if (prod) revalidatePath(`/p/${prod.slug}`);
  return { ok: true, created: result.created };
}
