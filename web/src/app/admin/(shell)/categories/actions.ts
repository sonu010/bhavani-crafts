"use server";

/**
 * Categories — server actions.
 *
 * Wraps lib/db/admin/categories with audit-log + revalidation.
 */
import { revalidatePath, updateTag } from "next/cache";
import { headers } from "next/headers";
import { requireAdminContext } from "@/lib/db/admin-context";
import {
  createCategory,
  softDeleteCategory,
  updateCategory,
  type CategoryDeleteError,
  type CategoryWriteError,
} from "@/lib/db/admin/categories";

export type SoftDeleteCategoryResult =
  | { ok: true }
  | { ok: false; error: CategoryDeleteError };

export async function softDeleteCategoryAction(
  categoryId: string,
): Promise<SoftDeleteCategoryResult> {
  const { admin, user } = await requireAdminContext();
  const h = await headers();
  const requestId =
    h.get("x-vercel-id") ?? h.get("x-request-id") ?? crypto.randomUUID();

  const before = await admin
    .from("categories")
    .select("id, slug, name, parent_id")
    .eq("id", categoryId)
    .maybeSingle();

  const result = await softDeleteCategory(admin, categoryId);
  if (!result.ok) return result;

  const { error: auditErr } = await admin.from("audit_logs").insert({
    actor_id: user.id,
    action: "category.soft_delete",
    entity_type: "category",
    entity_id: categoryId,
    before_json: (before.data ?? null) as never,
    after_json: { deleted_at: new Date().toISOString() } as never,
    request_id: requestId,
  });
  if (auditErr) {
    throw new Error(`softDeleteCategory audit insert: ${auditErr.message}`);
  }

  updateTag("categories");
  updateTag("products");
  if (before.data?.slug) revalidatePath(`/c/${before.data.slug}`);
  revalidatePath("/admin/categories");
  return { ok: true };
}

export type CreateCategoryActionResult =
  | { ok: true; id: string }
  | { ok: false; error: CategoryWriteError };

export async function createCategoryAction(
  patch: unknown,
): Promise<CreateCategoryActionResult> {
  const { admin, user } = await requireAdminContext();
  const h = await headers();
  const requestId =
    h.get("x-vercel-id") ?? h.get("x-request-id") ?? crypto.randomUUID();

  const result = await createCategory(admin, patch);
  if (!result.ok) return result;

  // Refetch the row for the audit-log after-shape (the data-layer
  // insert returns only the id).
  const after = await admin
    .from("categories")
    .select("id, name, slug, parent_id")
    .eq("id", result.id)
    .single();
  const { error: auditErr } = await admin.from("audit_logs").insert({
    actor_id: user.id,
    action: "category.create",
    entity_type: "category",
    entity_id: result.id,
    before_json: null,
    after_json: (after.data ?? null) as never,
    request_id: requestId,
  });
  if (auditErr) {
    throw new Error(`createCategory audit insert: ${auditErr.message}`);
  }

  updateTag("categories");
  revalidatePath("/admin/categories");
  if (after.data?.slug) revalidatePath(`/c/${after.data.slug}`);
  if (after.data?.parent_id === null) revalidatePath("/");
  return { ok: true, id: result.id };
}

export type UpdateCategoryActionResult =
  | { ok: true }
  | { ok: false; error: CategoryWriteError };

export async function updateCategoryAction(
  id: string,
  patch: unknown,
): Promise<UpdateCategoryActionResult> {
  const { admin, user } = await requireAdminContext();
  const h = await headers();
  const requestId =
    h.get("x-vercel-id") ?? h.get("x-request-id") ?? crypto.randomUUID();

  const result = await updateCategory(admin, id, patch);
  if (!result.ok) return result;

  const { error: auditErr } = await admin.from("audit_logs").insert({
    actor_id: user.id,
    action: "category.update",
    entity_type: "category",
    entity_id: id,
    before_json: result.before as never,
    after_json: result.after as never,
    request_id: requestId,
  });
  if (auditErr) {
    throw new Error(`updateCategory audit insert: ${auditErr.message}`);
  }

  updateTag("categories");
  updateTag("products");
  revalidatePath("/admin/categories");
  if (result.before.slug !== result.after.slug) {
    revalidatePath(`/c/${result.before.slug}`);
  }
  revalidatePath(`/c/${result.after.slug}`);
  if (
    result.before.parent_id === null ||
    result.after.parent_id === null
  ) {
    revalidatePath("/");
  }
  return { ok: true };
}
