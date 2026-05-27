/**
 * Bulk-mutation helpers for the products list.
 *
 * Each function takes a list of product IDs + the per-action payload
 * and applies the change in chunks. Chunked WHERE id IN (…) keeps
 * each round-trip's payload bounded; 50 rows per chunk is well below
 * the PostgREST URL-length ceiling and keeps the per-request audit
 * payload (one insert per affected row, written by the caller)
 * around 10–15KB.
 *
 * The caller is responsible for:
 *   - capturing before/after snapshots when needed
 *   - writing per-product audit_logs rows
 *   - revalidating tags + paths
 *
 * DI Supabase per ADR-010. Server actions hand in the cookie-bound
 * client so RLS is the safety net under `requireRole`.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types.gen";

type SC = SupabaseClient<Database>;

export const BULK_CHUNK_SIZE = 50;

/** Filter products to the live (non-soft-deleted) subset whose ids
 *  were provided. Returns the rows pre-mutation so the action can
 *  pair each id with a before-snapshot. */
export async function readProductsForBulk(
  supabase: SC,
  ids: string[],
): Promise<Array<{
  id: string;
  slug: string;
  is_published: boolean;
  review_status: Database["public"]["Enums"]["review_status"];
  category_id: string | null;
}>> {
  if (ids.length === 0) return [];
  const out: Array<{
    id: string;
    slug: string;
    is_published: boolean;
    review_status: Database["public"]["Enums"]["review_status"];
    category_id: string | null;
  }> = [];
  for (let i = 0; i < ids.length; i += BULK_CHUNK_SIZE) {
    const slice = ids.slice(i, i + BULK_CHUNK_SIZE);
    const { data, error } = await supabase
      .from("products")
      .select("id, slug, is_published, review_status, category_id")
      .in("id", slice)
      .is("deleted_at", null);
    if (error) throw new Error(`readProductsForBulk: ${error.message}`);
    out.push(...(data ?? []));
  }
  return out;
}

/**
 * Apply a patch (e.g. `{ is_published: true, review_status: 'published' }`)
 * to every id in chunks. Skips soft-deleted rows (`deleted_at IS NULL`
 * in the WHERE clause) so a stale selection can't accidentally
 * re-publish a trashed row.
 */
export async function applyBulkUpdate(
  supabase: SC,
  ids: string[],
  patch: {
    is_published?: boolean;
    review_status?: Database["public"]["Enums"]["review_status"];
    category_id?: string | null;
  },
): Promise<number> {
  if (ids.length === 0) return 0;
  let touched = 0;
  for (let i = 0; i < ids.length; i += BULK_CHUNK_SIZE) {
    const slice = ids.slice(i, i + BULK_CHUNK_SIZE);
    const { error, count } = await supabase
      .from("products")
      .update(patch, { count: "exact" })
      .in("id", slice)
      .is("deleted_at", null);
    if (error) throw new Error(`applyBulkUpdate: ${error.message}`);
    touched += count ?? 0;
  }
  return touched;
}

/**
 * Soft-delete every id. Sets `deleted_at = now()` + `deleted_by =
 * actorId`. Idempotent on already-soft-deleted rows (the
 * `deleted_at IS NULL` predicate filters them out).
 */
export async function applyBulkSoftDelete(
  supabase: SC,
  ids: string[],
  actorId: string | null,
): Promise<number> {
  if (ids.length === 0) return 0;
  let touched = 0;
  const stamp = new Date().toISOString();
  for (let i = 0; i < ids.length; i += BULK_CHUNK_SIZE) {
    const slice = ids.slice(i, i + BULK_CHUNK_SIZE);
    const { error, count } = await supabase
      .from("products")
      .update({ deleted_at: stamp, deleted_by: actorId }, { count: "exact" })
      .in("id", slice)
      .is("deleted_at", null);
    if (error) throw new Error(`applyBulkSoftDelete: ${error.message}`);
    touched += count ?? 0;
  }
  return touched;
}

/**
 * Add a tag to every product. Uses upsert with ignoreDuplicates so
 * products already tagged are no-ops. Returns count of inserts.
 */
export async function applyBulkAddTag(
  supabase: SC,
  productIds: string[],
  tagId: string,
): Promise<number> {
  if (productIds.length === 0) return 0;
  let inserted = 0;
  for (let i = 0; i < productIds.length; i += BULK_CHUNK_SIZE) {
    const slice = productIds.slice(i, i + BULK_CHUNK_SIZE);
    const rows = slice.map((product_id) => ({ product_id, tag_id: tagId }));
    const { error, count } = await supabase
      .from("product_tags")
      .upsert(rows, {
        onConflict: "product_id,tag_id",
        ignoreDuplicates: true,
        count: "exact",
      });
    if (error) throw new Error(`applyBulkAddTag: ${error.message}`);
    inserted += count ?? 0;
  }
  return inserted;
}

/**
 * Remove a tag from every product. Idempotent — products without
 * the tag are no-ops.
 */
export async function applyBulkRemoveTag(
  supabase: SC,
  productIds: string[],
  tagId: string,
): Promise<number> {
  if (productIds.length === 0) return 0;
  let removed = 0;
  for (let i = 0; i < productIds.length; i += BULK_CHUNK_SIZE) {
    const slice = productIds.slice(i, i + BULK_CHUNK_SIZE);
    const { error, count } = await supabase
      .from("product_tags")
      .delete({ count: "exact" })
      .eq("tag_id", tagId)
      .in("product_id", slice);
    if (error) throw new Error(`applyBulkRemoveTag: ${error.message}`);
    removed += count ?? 0;
  }
  return removed;
}
