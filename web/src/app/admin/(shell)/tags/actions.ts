"use server";

/**
 * Tag-admin server actions. Wraps lib/db/admin/tags with audit-log
 * + revalidation.
 */
import { revalidatePath, updateTag } from "next/cache";
import { headers } from "next/headers";
import { requireAdminContext } from "@/lib/db/admin-context";
import {
  createTag,
  mergeTags,
  renameTag,
  softDeleteTag,
  type TagWriteError,
} from "@/lib/db/admin/tags";

export type CreateTagResult =
  | { ok: true; id: string }
  | { ok: false; error: TagWriteError };

export async function createTagAction(input: {
  name: string;
  slug?: string;
}): Promise<CreateTagResult> {
  const { admin, user } = await requireAdminContext();
  const h = await headers();
  const requestId =
    h.get("x-vercel-id") ?? h.get("x-request-id") ?? crypto.randomUUID();

  const result = await createTag(admin, input);
  if (!result.ok) return result;

  const after = await admin
    .from("tags")
    .select("id, slug, name")
    .eq("id", result.id)
    .single();
  const { error: auditErr } = await admin.from("audit_logs").insert({
    actor_id: user.id,
    action: "tag.create",
    entity_type: "tag",
    entity_id: result.id,
    before_json: null,
    after_json: (after.data ?? null) as never,
    request_id: requestId,
  });
  if (auditErr) {
    throw new Error(`createTag audit insert: ${auditErr.message}`);
  }

  updateTag("products");
  revalidatePath("/admin/tags");
  return { ok: true, id: result.id };
}

export type RenameTagResult =
  | { ok: true }
  | { ok: false; error: TagWriteError };

export async function renameTagAction(
  id: string,
  input: { name: string; slug: string },
): Promise<RenameTagResult> {
  const { admin, user } = await requireAdminContext();
  const h = await headers();
  const requestId =
    h.get("x-vercel-id") ?? h.get("x-request-id") ?? crypto.randomUUID();

  const result = await renameTag(admin, id, input);
  if (!result.ok) return result;

  const { error: auditErr } = await admin.from("audit_logs").insert({
    actor_id: user.id,
    action: "tag.rename",
    entity_type: "tag",
    entity_id: id,
    before_json: result.before as never,
    after_json: result.after as never,
    request_id: requestId,
  });
  if (auditErr) {
    throw new Error(`renameTag audit insert: ${auditErr.message}`);
  }

  updateTag("products");
  revalidatePath("/admin/tags");
  return { ok: true };
}

export type SoftDeleteTagResult =
  | { ok: true }
  | { ok: false; error: TagWriteError };

export async function softDeleteTagAction(
  id: string,
): Promise<SoftDeleteTagResult> {
  const { admin, user } = await requireAdminContext();
  const h = await headers();
  const requestId =
    h.get("x-vercel-id") ?? h.get("x-request-id") ?? crypto.randomUUID();

  const before = await admin
    .from("tags")
    .select("id, slug, name")
    .eq("id", id)
    .maybeSingle();

  const result = await softDeleteTag(admin, id);
  if (!result.ok) return result;

  const { error: auditErr } = await admin.from("audit_logs").insert({
    actor_id: user.id,
    action: "tag.soft_delete",
    entity_type: "tag",
    entity_id: id,
    before_json: (before.data ?? null) as never,
    after_json: { deleted_at: new Date().toISOString() } as never,
    request_id: requestId,
  });
  if (auditErr) {
    throw new Error(`softDeleteTag audit insert: ${auditErr.message}`);
  }

  updateTag("products");
  revalidatePath("/admin/tags");
  return { ok: true };
}

export type MergeTagsActionResult =
  | { ok: true; moved: number; duplicates: number }
  | { ok: false; error: TagWriteError };

/**
 * Merges source tag into target. Writes:
 *   - one `tag.merge` summary audit row
 *   - one `product.set_tags` audit row per affected product (chunked)
 */
export async function mergeTagsAction(
  sourceId: string,
  targetId: string,
): Promise<MergeTagsActionResult> {
  const { admin, user } = await requireAdminContext();
  const h = await headers();
  const requestId =
    h.get("x-vercel-id") ?? h.get("x-request-id") ?? crypto.randomUUID();

  const result = await mergeTags(admin, sourceId, targetId);
  if (!result.ok) return result;

  const { productIds, sourceSlug, targetSlug, movedProductCount, duplicateProductCount } =
    result.result;

  const summary = await admin.from("audit_logs").insert({
    actor_id: user.id,
    action: "tag.merge",
    entity_type: "tag",
    entity_id: sourceId,
    before_json: {
      source: { id: sourceId, slug: sourceSlug },
      target: { id: targetId, slug: targetSlug },
    } as never,
    after_json: {
      moved: movedProductCount,
      duplicates: duplicateProductCount,
      product_ids: productIds.length,
    } as never,
    request_id: requestId,
  });
  if (summary.error) {
    throw new Error(`mergeTags summary audit: ${summary.error.message}`);
  }

  // Per-product audit (chunked).
  if (productIds.length > 0) {
    const CHUNK = 500;
    for (let i = 0; i < productIds.length; i += CHUNK) {
      const slice = productIds.slice(i, i + CHUNK);
      const rows = slice.map((pid) => ({
        actor_id: user.id,
        action: "product.set_tags" as const,
        entity_type: "product" as const,
        entity_id: pid,
        before_json: { tag_id: sourceId, tag_slug: sourceSlug } as never,
        after_json: { tag_id: targetId, tag_slug: targetSlug } as never,
        request_id: requestId,
      }));
      const ins = await admin.from("audit_logs").insert(rows);
      if (ins.error) {
        throw new Error(`mergeTags per-product audit: ${ins.error.message}`);
      }
    }
  }

  updateTag("products");
  revalidatePath("/admin/tags");
  return {
    ok: true,
    moved: movedProductCount,
    duplicates: duplicateProductCount,
  };
}
