"use server";

/**
 * Attribute-definitions server actions. Each wraps the data-layer
 * helper, writes an audit_logs row, and revalidates the page +
 * `attributes` tag (a new tag — extend the cache-revalidation map
 * accordingly when wiring storefront facets in Phase 3).
 */
import { revalidatePath, updateTag } from "next/cache";
import { headers } from "next/headers";
import { requireAdminContext } from "@/lib/db/admin-context";
import {
  createAttributeDefinition,
  deleteAttributeDefinition,
  updateAttributeDefinition,
  type AttributeDeleteError,
  type AttributeWriteError,
} from "@/lib/db/admin/attribute-defs";

export type CreateAttributeResult =
  | { ok: true; id: string }
  | { ok: false; error: AttributeWriteError };

export async function createAttributeAction(
  input: unknown,
): Promise<CreateAttributeResult> {
  const { admin, user } = await requireAdminContext();
  const h = await headers();
  const requestId =
    h.get("x-vercel-id") ?? h.get("x-request-id") ?? crypto.randomUUID();

  const result = await createAttributeDefinition(admin, input);
  if (!result.ok) return result;

  const after = await admin
    .from("attribute_definitions")
    .select(
      "id, slug, name, type, unit, applies_to_category_id, options_json, is_filterable, sort_order",
    )
    .eq("id", result.id)
    .single();
  const { error: auditErr } = await admin.from("audit_logs").insert({
    actor_id: user.id,
    action: "attribute.create",
    entity_type: "attribute_definition",
    entity_id: result.id,
    before_json: null,
    after_json: (after.data ?? null) as never,
    request_id: requestId,
  });
  if (auditErr) {
    throw new Error(`createAttribute audit insert: ${auditErr.message}`);
  }

  updateTag("attributes");
  updateTag("products");
  revalidatePath("/admin/attributes");
  return { ok: true, id: result.id };
}

export type UpdateAttributeResult =
  | { ok: true }
  | { ok: false; error: AttributeWriteError };

export async function updateAttributeAction(
  id: string,
  input: unknown,
): Promise<UpdateAttributeResult> {
  const { admin, user } = await requireAdminContext();
  const h = await headers();
  const requestId =
    h.get("x-vercel-id") ?? h.get("x-request-id") ?? crypto.randomUUID();

  const result = await updateAttributeDefinition(admin, id, input);
  if (!result.ok) return result;

  const { error: auditErr } = await admin.from("audit_logs").insert({
    actor_id: user.id,
    action: "attribute.update",
    entity_type: "attribute_definition",
    entity_id: id,
    before_json: result.before as never,
    after_json: result.after as never,
    request_id: requestId,
  });
  if (auditErr) {
    throw new Error(`updateAttribute audit insert: ${auditErr.message}`);
  }

  updateTag("attributes");
  updateTag("products");
  revalidatePath("/admin/attributes");
  return { ok: true };
}

export type DeleteAttributeResult =
  | { ok: true }
  | { ok: false; error: AttributeDeleteError };

export async function deleteAttributeAction(
  id: string,
): Promise<DeleteAttributeResult> {
  const { admin, user } = await requireAdminContext();
  const h = await headers();
  const requestId =
    h.get("x-vercel-id") ?? h.get("x-request-id") ?? crypto.randomUUID();

  const before = await admin
    .from("attribute_definitions")
    .select(
      "id, slug, name, type, applies_to_category_id, options_json, is_filterable",
    )
    .eq("id", id)
    .maybeSingle();

  const result = await deleteAttributeDefinition(admin, id);
  if (!result.ok) return result;

  const { error: auditErr } = await admin.from("audit_logs").insert({
    actor_id: user.id,
    action: "attribute.delete",
    entity_type: "attribute_definition",
    entity_id: id,
    before_json: (before.data ?? null) as never,
    after_json: null,
    request_id: requestId,
  });
  if (auditErr) {
    throw new Error(`deleteAttribute audit insert: ${auditErr.message}`);
  }

  updateTag("attributes");
  updateTag("products");
  revalidatePath("/admin/attributes");
  return { ok: true };
}
