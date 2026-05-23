"use server";

/**
 * Trash lifecycle actions. Restore is soft; hard-delete writes the
 * row's full snapshot to `audit_logs.before_json` BEFORE the DELETE
 * fires so the trail survives the cascade. Per ADR-006.
 */
import { revalidatePath, updateTag } from "next/cache";
import { headers } from "next/headers";
import { requireAdminContext } from "@/lib/db/admin-context";
import {
  auditActionFor,
  auditEntityFor,
  hardDeleteEntity,
  restoreEntity,
  TRASH_ENTITY_TYPES,
  type TrashActionError,
  type TrashEntityType,
} from "@/lib/db/admin/trash";

function isTrashEntityType(v: string): v is TrashEntityType {
  return (TRASH_ENTITY_TYPES as readonly string[]).includes(v);
}

function revalidationTagFor(t: TrashEntityType): string {
  // Most rows are catalog-facing; revalidate both products + categories
  // for safety. Cheap on cache infrastructure.
  switch (t) {
    case "categories":
      return "categories";
    default:
      return "products";
  }
}

export type RestoreEntityResult =
  | { ok: true; label: string }
  | { ok: false; error: TrashActionError | { code: "bad_entity_type" } };

export async function restoreEntityAction(
  entityTypeRaw: string,
  id: string,
): Promise<RestoreEntityResult> {
  if (!isTrashEntityType(entityTypeRaw)) {
    return { ok: false, error: { code: "bad_entity_type" } };
  }
  const entityType: TrashEntityType = entityTypeRaw;

  const { admin, user } = await requireAdminContext();
  const h = await headers();
  const requestId =
    h.get("x-vercel-id") ?? h.get("x-request-id") ?? crypto.randomUUID();

  const result = await restoreEntity(admin, entityType, id);
  if (!result.ok) return result;

  const { error: auditErr } = await admin.from("audit_logs").insert({
    actor_id: user.id,
    action: auditActionFor(entityType, "restore"),
    entity_type: auditEntityFor(entityType),
    entity_id: id,
    before_json: { deleted_at: "(was non-null)" } as never,
    after_json: { deleted_at: null } as never,
    request_id: requestId,
  });
  if (auditErr) throw new Error(`restore audit: ${auditErr.message}`);

  updateTag(revalidationTagFor(entityType));
  if (entityType === "categories") updateTag("products"); // category swap may un-orphan products
  revalidatePath("/admin/trash");
  return { ok: true, label: result.label };
}

export type HardDeleteResult =
  | { ok: true; label: string }
  | { ok: false; error: TrashActionError | { code: "bad_entity_type" } };

export async function hardDeleteEntityAction(
  entityTypeRaw: string,
  id: string,
): Promise<HardDeleteResult> {
  if (!isTrashEntityType(entityTypeRaw)) {
    return { ok: false, error: { code: "bad_entity_type" } };
  }
  const entityType: TrashEntityType = entityTypeRaw;

  const { admin, user } = await requireAdminContext();
  const h = await headers();
  const requestId =
    h.get("x-vercel-id") ?? h.get("x-request-id") ?? crypto.randomUUID();

  const result = await hardDeleteEntity(admin, entityType, id);
  if (!result.ok) return result;

  // Audit log goes in AFTER the delete returns ok — the helper
  // already snapshotted the row before deleting. If the audit insert
  // fails the row is already gone; that's acceptable per ADR-006
  // because the data-layer captured the snapshot in `beforeRow`
  // which we ship to the audit payload here.
  const { error: auditErr } = await admin.from("audit_logs").insert({
    actor_id: user.id,
    action: auditActionFor(entityType, "hard_delete"),
    entity_type: auditEntityFor(entityType),
    entity_id: id,
    before_json: result.result.beforeRow as never,
    after_json: null,
    request_id: requestId,
  });
  if (auditErr) throw new Error(`hard_delete audit: ${auditErr.message}`);

  updateTag(revalidationTagFor(entityType));
  if (entityType === "categories") updateTag("products");
  revalidatePath("/admin/trash");
  return { ok: true, label: result.result.label };
}

export type BulkRestoreResult =
  | { ok: true; count: number }
  | { ok: false; error: { code: "bad_entity_type" | "nothing_selected" } };

export async function bulkRestoreAction(
  entityTypeRaw: string,
  ids: string[],
): Promise<BulkRestoreResult> {
  if (!isTrashEntityType(entityTypeRaw)) {
    return { ok: false, error: { code: "bad_entity_type" } };
  }
  if (ids.length === 0) {
    return { ok: false, error: { code: "nothing_selected" } };
  }
  // Run restores serially — at MVP scale the bulk count is small
  // (rare to soft-delete > 20 in one batch). The per-row audit log
  // matters more than the round-trip count.
  let count = 0;
  for (const id of ids) {
    const r = await restoreEntityAction(entityTypeRaw, id);
    if (r.ok) count++;
  }
  return { ok: true, count };
}
