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
