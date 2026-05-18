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
  softDeleteCategory,
  type CategoryDeleteError,
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
