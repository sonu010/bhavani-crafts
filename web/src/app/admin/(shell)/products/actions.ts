"use server";

/**
 * Bulk-action server actions for /admin/products.
 *
 * Each action:
 *   1. Goes through requireAdminContext (role + AAL2 + service-role
 *      client; redirect on auth failure).
 *   2. Reads the affected products (snapshots for the audit log).
 *   3. Calls the data-layer helper (`applyBulkUpdate` etc.) in chunks.
 *   4. Writes ONE audit_logs row per affected product (per ADR-006
 *      granularity).
 *   5. Revalidates `products` + `categories` tags + the admin list.
 *
 * Per the spec: ≤ 100 rows run synchronously; > 100 enqueue a
 * background_jobs row. The worker that drains those jobs is T24's
 * scope; for now we accept any selection size synchronously since
 * Supabase + chunked UPDATEs handle a few thousand rows fine. The
 * threshold is a placeholder for when the worker ships.
 */
import { revalidatePath, updateTag } from "next/cache";
import { headers } from "next/headers";
import { requireAdminContext } from "@/lib/db/admin-context";
import {
  applyBulkAddTag,
  applyBulkRemoveTag,
  applyBulkSoftDelete,
  applyBulkUpdate,
  readProductsForBulk,
} from "@/lib/db/admin/bulk";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sanitizeIds(raw: string[]): string[] {
  const seen = new Set<string>();
  for (const id of raw) if (UUID_RE.test(id)) seen.add(id);
  return [...seen];
}

export type BulkActionError =
  | { code: "no_ids" }
  | { code: "tag_not_found" }
  | { code: "category_not_found" };

export type BulkActionResult =
  | { ok: true; touched: number }
  | { ok: false; error: BulkActionError };

async function writeProductAuditRows(
  admin: ReturnType<typeof requireAdminContext> extends Promise<infer T>
    ? T extends { admin: infer A }
      ? A
      : never
    : never,
  rows: Array<{
    actor_id: string;
    action: string;
    entity_id: string;
    before_json: unknown;
    after_json: unknown;
    request_id: string;
  }>,
) {
  if (rows.length === 0) return;
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK).map((r) => ({
      ...r,
      entity_type: "product" as const,
      before_json: r.before_json as never,
      after_json: r.after_json as never,
    }));
    const { error } = await (
      admin as unknown as {
        from: (t: string) => {
          insert: (rows: unknown[]) => Promise<{ error: { message: string } | null }>;
        };
      }
    )
      .from("audit_logs")
      .insert(slice);
    if (error) {
      throw new Error(`bulk audit insert: ${error.message}`);
    }
  }
}

function revalidateBulkCatalog() {
  updateTag("products");
  updateTag("categories");
  revalidatePath("/admin/products");
}

// ─── publish / unpublish ─────────────────────────────────────────────

export async function bulkPublishAction(rawIds: string[]): Promise<BulkActionResult> {
  const ids = sanitizeIds(rawIds);
  if (ids.length === 0) return { ok: false, error: { code: "no_ids" } };

  const { admin, user } = await requireAdminContext();
  const h = await headers();
  const requestId =
    h.get("x-vercel-id") ?? h.get("x-request-id") ?? crypto.randomUUID();

  const before = await readProductsForBulk(admin, ids);
  const touched = await applyBulkUpdate(admin, ids, {
    is_published: true,
    review_status: "published",
  });

  await writeProductAuditRows(
    admin,
    before.map((row) => ({
      actor_id: user.id,
      action: "product.publish",
      entity_id: row.id,
      before_json: {
        is_published: row.is_published,
        review_status: row.review_status,
      },
      after_json: { is_published: true, review_status: "published" },
      request_id: requestId,
    })),
  );

  revalidateBulkCatalog();
  return { ok: true, touched };
}

export async function bulkUnpublishAction(rawIds: string[]): Promise<BulkActionResult> {
  const ids = sanitizeIds(rawIds);
  if (ids.length === 0) return { ok: false, error: { code: "no_ids" } };

  const { admin, user } = await requireAdminContext();
  const h = await headers();
  const requestId =
    h.get("x-vercel-id") ?? h.get("x-request-id") ?? crypto.randomUUID();

  const before = await readProductsForBulk(admin, ids);
  const touched = await applyBulkUpdate(admin, ids, {
    is_published: false,
    review_status: "ready_to_publish",
  });

  await writeProductAuditRows(
    admin,
    before.map((row) => ({
      actor_id: user.id,
      action: "product.unpublish",
      entity_id: row.id,
      before_json: {
        is_published: row.is_published,
        review_status: row.review_status,
      },
      after_json: { is_published: false, review_status: "ready_to_publish" },
      request_id: requestId,
    })),
  );

  revalidateBulkCatalog();
  return { ok: true, touched };
}

// ─── move category ───────────────────────────────────────────────────

export async function bulkMoveCategoryAction(
  rawIds: string[],
  targetCategoryId: string,
): Promise<BulkActionResult> {
  const ids = sanitizeIds(rawIds);
  if (ids.length === 0) return { ok: false, error: { code: "no_ids" } };
  if (!UUID_RE.test(targetCategoryId)) {
    return { ok: false, error: { code: "category_not_found" } };
  }

  const { admin, user } = await requireAdminContext();
  const h = await headers();
  const requestId =
    h.get("x-vercel-id") ?? h.get("x-request-id") ?? crypto.randomUUID();

  const cat = await admin
    .from("categories")
    .select("id")
    .eq("id", targetCategoryId)
    .is("deleted_at", null)
    .maybeSingle();
  if (cat.error || !cat.data) {
    return { ok: false, error: { code: "category_not_found" } };
  }

  const before = await readProductsForBulk(admin, ids);
  const touched = await applyBulkUpdate(admin, ids, {
    category_id: targetCategoryId,
  });

  await writeProductAuditRows(
    admin,
    before.map((row) => ({
      actor_id: user.id,
      action: "product.update_category",
      entity_id: row.id,
      before_json: { category_id: row.category_id },
      after_json: { category_id: targetCategoryId },
      request_id: requestId,
    })),
  );

  revalidateBulkCatalog();
  return { ok: true, touched };
}

// ─── add / remove tag ────────────────────────────────────────────────

async function resolveTag(
  admin: Awaited<ReturnType<typeof requireAdminContext>>["admin"],
  slugOrId: string,
): Promise<{ id: string; slug: string; name: string } | null> {
  const isUuid = UUID_RE.test(slugOrId);
  const q = admin
    .from("tags")
    .select("id, slug, name")
    .is("deleted_at", null)
    .limit(1);
  const r = isUuid
    ? await q.eq("id", slugOrId).maybeSingle()
    : await q.eq("slug", slugOrId).maybeSingle();
  if (r.error || !r.data) return null;
  return r.data;
}

export async function bulkAddTagAction(
  rawIds: string[],
  tagSlugOrId: string,
): Promise<BulkActionResult> {
  const ids = sanitizeIds(rawIds);
  if (ids.length === 0) return { ok: false, error: { code: "no_ids" } };

  const { admin, user } = await requireAdminContext();
  const h = await headers();
  const requestId =
    h.get("x-vercel-id") ?? h.get("x-request-id") ?? crypto.randomUUID();

  const tag = await resolveTag(admin, tagSlugOrId);
  if (!tag) return { ok: false, error: { code: "tag_not_found" } };

  const inserted = await applyBulkAddTag(admin, ids, tag.id);

  await writeProductAuditRows(
    admin,
    ids.map((id) => ({
      actor_id: user.id,
      action: "product.add_tag",
      entity_id: id,
      before_json: null,
      after_json: { tag_id: tag.id, tag_slug: tag.slug },
      request_id: requestId,
    })),
  );

  revalidateBulkCatalog();
  return { ok: true, touched: inserted };
}

export async function bulkRemoveTagAction(
  rawIds: string[],
  tagSlugOrId: string,
): Promise<BulkActionResult> {
  const ids = sanitizeIds(rawIds);
  if (ids.length === 0) return { ok: false, error: { code: "no_ids" } };

  const { admin, user } = await requireAdminContext();
  const h = await headers();
  const requestId =
    h.get("x-vercel-id") ?? h.get("x-request-id") ?? crypto.randomUUID();

  const tag = await resolveTag(admin, tagSlugOrId);
  if (!tag) return { ok: false, error: { code: "tag_not_found" } };

  const removed = await applyBulkRemoveTag(admin, ids, tag.id);

  await writeProductAuditRows(
    admin,
    ids.map((id) => ({
      actor_id: user.id,
      action: "product.remove_tag",
      entity_id: id,
      before_json: { tag_id: tag.id, tag_slug: tag.slug },
      after_json: null,
      request_id: requestId,
    })),
  );

  revalidateBulkCatalog();
  return { ok: true, touched: removed };
}

// ─── soft delete ─────────────────────────────────────────────────────

export async function bulkSoftDeleteAction(
  rawIds: string[],
): Promise<BulkActionResult> {
  const ids = sanitizeIds(rawIds);
  if (ids.length === 0) return { ok: false, error: { code: "no_ids" } };

  const { admin, user } = await requireAdminContext();
  const h = await headers();
  const requestId =
    h.get("x-vercel-id") ?? h.get("x-request-id") ?? crypto.randomUUID();

  const before = await readProductsForBulk(admin, ids);
  const touched = await applyBulkSoftDelete(admin, ids, user.id);

  await writeProductAuditRows(
    admin,
    before.map((row) => ({
      actor_id: user.id,
      action: "product.soft_delete",
      entity_id: row.id,
      before_json: { slug: row.slug, deleted_at: null },
      after_json: { deleted_at: new Date().toISOString() },
      request_id: requestId,
    })),
  );

  revalidateBulkCatalog();
  return { ok: true, touched };
}
