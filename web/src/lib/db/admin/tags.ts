/**
 * Admin tags data layer — list with counts, create, rename,
 * soft-delete, and merge.
 *
 * Merge ("combine tag A into tag B") is the load-bearing operation:
 * every product tagged with A gets re-tagged to B (skipping rows
 * already tagged with both), then A is soft-deleted. Done client-side
 * via the Supabase JS client instead of a Postgres RPC because the
 * scale is small (≤ a few hundred products per tag) and we already
 * have the audit-log writer here.
 *
 * Soft-delete sets `tags.deleted_at`; `product_tags` rows stay (the
 * row would orphan if we hard-deleted, since FK is ON DELETE CASCADE).
 * The storefront filters via `tags.deleted_at IS NULL` in its tag
 * join.
 *
 * DI Supabase per ADR-010.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types.gen";

type SC = SupabaseClient<Database>;

export interface AdminTagRow {
  id: string;
  slug: string;
  name: string;
  product_count: number;
}

/**
 * Every non-deleted tag with its product_tags count. Two parallel
 * queries: tags + product_tags. ~458 tags × N products is small enough
 * to aggregate in JS rather than via a view.
 */
export async function listTagsWithCounts(supabase: SC): Promise<AdminTagRow[]> {
  const tagsRes = await supabase
    .from("tags")
    .select("id, slug, name")
    .is("deleted_at", null)
    .order("name", { ascending: true });
  if (tagsRes.error) throw new Error(`listTagsWithCounts (tags): ${tagsRes.error.message}`);

  // PostgREST defaults to a 1000-row response cap; product_tags is in the
  // 8K range so we have to paginate explicitly. Range steps of 1000 keep
  // each response small and predictable.
  const counts = new Map<string, number>();
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const page = await supabase
      .from("product_tags")
      .select("tag_id")
      .range(offset, offset + PAGE - 1);
    if (page.error) throw new Error(`listTagsWithCounts (pt): ${page.error.message}`);
    const rows = page.data ?? [];
    for (const r of rows) {
      counts.set(r.tag_id, (counts.get(r.tag_id) ?? 0) + 1);
    }
    if (rows.length < PAGE) break;
  }

  return (tagsRes.data ?? []).map((t) => ({
    id: t.id,
    slug: t.slug,
    name: t.name,
    product_count: counts.get(t.id) ?? 0,
  }));
}

export type TagWriteError =
  | { code: "validation"; message: string }
  | { code: "slug_in_use" }
  | { code: "not_found" }
  | { code: "same_tag" };

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function validateNameAndSlug(
  name: string,
  slug: string,
): TagWriteError | null {
  const n = name.trim();
  if (n.length < 1 || n.length > 100) {
    return { code: "validation", message: "Name must be 1–100 chars" };
  }
  if (!SLUG_RE.test(slug)) {
    return {
      code: "validation",
      message: "Slug must be lowercase letters, digits, and dashes only",
    };
  }
  return null;
}

export async function createTag(
  supabase: SC,
  input: { name: string; slug?: string },
): Promise<{ ok: true; id: string } | { ok: false; error: TagWriteError }> {
  const name = input.name.trim();
  const slug = (input.slug?.trim() || slugify(name)).toLowerCase();
  const v = validateNameAndSlug(name, slug);
  if (v) return { ok: false, error: v };

  const ins = await supabase
    .from("tags")
    .insert({ name, slug })
    .select("id")
    .single();
  if (ins.error) {
    if (ins.error.code === "23505") {
      return { ok: false, error: { code: "slug_in_use" } };
    }
    throw new Error(`createTag (insert): ${ins.error.message}`);
  }
  return { ok: true, id: ins.data.id };
}

export interface RenameTagBefore {
  id: string;
  name: string;
  slug: string;
}

export async function renameTag(
  supabase: SC,
  id: string,
  input: { name: string; slug: string },
): Promise<
  | { ok: true; before: RenameTagBefore; after: RenameTagBefore }
  | { ok: false; error: TagWriteError }
> {
  const name = input.name.trim();
  const slug = input.slug.trim().toLowerCase();
  const v = validateNameAndSlug(name, slug);
  if (v) return { ok: false, error: v };

  const before = await supabase
    .from("tags")
    .select("id, name, slug")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (before.error) throw new Error(`renameTag (lookup): ${before.error.message}`);
  if (!before.data) return { ok: false, error: { code: "not_found" } };

  const upd = await supabase
    .from("tags")
    .update({ name, slug })
    .eq("id", id)
    .select("id, name, slug")
    .single();
  if (upd.error) {
    if (upd.error.code === "23505") {
      return { ok: false, error: { code: "slug_in_use" } };
    }
    throw new Error(`renameTag (update): ${upd.error.message}`);
  }
  return { ok: true, before: before.data, after: upd.data };
}

export async function softDeleteTag(
  supabase: SC,
  id: string,
): Promise<{ ok: true } | { ok: false; error: TagWriteError }> {
  const cur = await supabase
    .from("tags")
    .select("id, deleted_at")
    .eq("id", id)
    .maybeSingle();
  if (cur.error) throw new Error(`softDeleteTag (lookup): ${cur.error.message}`);
  if (!cur.data || cur.data.deleted_at !== null) {
    return { ok: false, error: { code: "not_found" } };
  }
  const upd = await supabase
    .from("tags")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (upd.error) throw new Error(`softDeleteTag (update): ${upd.error.message}`);
  return { ok: true };
}

export interface MergeTagsResult {
  movedProductCount: number;
  duplicateProductCount: number;
  sourceSlug: string;
  targetSlug: string;
  productIds: string[];
}

/**
 * Combine source tag into target. Steps:
 *
 *   1. Read every product_id tagged with source.
 *   2. Read every product_id already tagged with target (to compute
 *      duplicates that need no INSERT).
 *   3. Insert (product_id, target) for each source-only product
 *      using upsert(ignoreDuplicates=true). This handles a race
 *      where another writer adds the target tag between steps 2 and 3.
 *   4. Delete every (product_id, source) row from product_tags.
 *   5. Soft-delete the source tag.
 *
 * `productIds` is the full set of products affected (had source) —
 * the action layer writes one audit row per product so the activity
 * log keeps per-row granularity.
 */
export async function mergeTags(
  supabase: SC,
  sourceId: string,
  targetId: string,
): Promise<
  { ok: true; result: MergeTagsResult } | { ok: false; error: TagWriteError }
> {
  if (sourceId === targetId) {
    return { ok: false, error: { code: "same_tag" } };
  }

  const [src, tgt] = await Promise.all([
    supabase
      .from("tags")
      .select("id, slug")
      .eq("id", sourceId)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("tags")
      .select("id, slug")
      .eq("id", targetId)
      .is("deleted_at", null)
      .maybeSingle(),
  ]);
  if (src.error) throw new Error(`mergeTags (src lookup): ${src.error.message}`);
  if (tgt.error) throw new Error(`mergeTags (tgt lookup): ${tgt.error.message}`);
  if (!src.data || !tgt.data) {
    return { ok: false, error: { code: "not_found" } };
  }

  const srcRows = await supabase
    .from("product_tags")
    .select("product_id")
    .eq("tag_id", sourceId);
  if (srcRows.error) throw new Error(`mergeTags (src rows): ${srcRows.error.message}`);
  const sourceProducts = (srcRows.data ?? []).map((r) => r.product_id);

  if (sourceProducts.length === 0) {
    // Nothing to migrate; just soft-delete the source.
    const del = await supabase
      .from("tags")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", sourceId);
    if (del.error) throw new Error(`mergeTags (soft-del empty): ${del.error.message}`);
    return {
      ok: true,
      result: {
        movedProductCount: 0,
        duplicateProductCount: 0,
        sourceSlug: src.data.slug,
        targetSlug: tgt.data.slug,
        productIds: [],
      },
    };
  }

  const tgtRows = await supabase
    .from("product_tags")
    .select("product_id")
    .eq("tag_id", targetId)
    .in("product_id", sourceProducts);
  if (tgtRows.error) throw new Error(`mergeTags (tgt rows): ${tgtRows.error.message}`);
  const alreadyTagged = new Set((tgtRows.data ?? []).map((r) => r.product_id));
  const duplicateProductCount = alreadyTagged.size;
  const toInsert = sourceProducts.filter((p) => !alreadyTagged.has(p));

  if (toInsert.length > 0) {
    // Chunk to keep request payload bounded.
    const CHUNK = 500;
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      const slice = toInsert.slice(i, i + CHUNK);
      const ins = await supabase
        .from("product_tags")
        .upsert(
          slice.map((product_id) => ({ product_id, tag_id: targetId })),
          { onConflict: "product_id,tag_id", ignoreDuplicates: true },
        );
      if (ins.error) {
        throw new Error(`mergeTags (insert): ${ins.error.message}`);
      }
    }
  }

  // Drop every (product, source) link.
  const delSrc = await supabase
    .from("product_tags")
    .delete()
    .eq("tag_id", sourceId);
  if (delSrc.error) throw new Error(`mergeTags (del src links): ${delSrc.error.message}`);

  // Soft-delete the source tag.
  const delTag = await supabase
    .from("tags")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", sourceId);
  if (delTag.error) throw new Error(`mergeTags (soft-del): ${delTag.error.message}`);

  return {
    ok: true,
    result: {
      movedProductCount: toInsert.length,
      duplicateProductCount,
      sourceSlug: src.data.slug,
      targetSlug: tgt.data.slug,
      productIds: sourceProducts,
    },
  };
}
