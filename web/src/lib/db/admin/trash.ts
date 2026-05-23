/**
 * Trash data layer — read soft-deleted rows across the catalog,
 * restore them, or hard-delete with audit preservation.
 *
 * Five entity types carry `deleted_at`:
 *   products, categories, tags, product_images, product_variants.
 *
 * `attribute_definitions` is intentionally excluded — that table has
 * no `deleted_at` column (delete is hard-only, gated by reference
 * count; see T22).
 *
 * Hard-delete writes the row's snapshot to `audit_logs.before_json`
 * BEFORE the DELETE so the trail survives the cascade. FK
 * `audit_logs.entity_id` is a plain uuid (no FK constraint), so the
 * dangling reference is intentional — see ADR-006.
 *
 * DI Supabase per ADR-010.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types.gen";
import {
  TRASH_ENTITY_TYPES,
  type TrashEntityType,
  type TrashedRow,
} from "@/lib/db/admin/trash-public";

type SC = SupabaseClient<Database>;

// Re-export so server-side imports keep working.
export { TRASH_ENTITY_TYPES, TRASH_ENTITY_LABELS } from "@/lib/db/admin/trash-public";
export type { TrashEntityType, TrashedRow };

/**
 * Audit-action verb mapping: e.g. `product.restore`, `category.hard_delete`.
 * The plural table name → singular audit prefix.
 */
const AUDIT_ENTITY: Record<TrashEntityType, string> = {
  products: "product",
  categories: "category",
  tags: "tag",
  product_images: "product_image",
  product_variants: "product_variant",
};

export const TRASH_PER_PAGE = 50;

/**
 * Type-erased read: each table has a different display shape, so the
 * function dispatches per type and normalizes to `TrashedRow`.
 */
export async function listTrashed(
  supabase: SC,
  entityType: TrashEntityType,
  page = 0,
): Promise<{ rows: TrashedRow[]; total: number }> {
  const offset = page * TRASH_PER_PAGE;
  const range = { from: offset, to: offset + TRASH_PER_PAGE - 1 };

  switch (entityType) {
    case "products": {
      const { data, count, error } = await supabase
        .from("products")
        .select("id, name, slug, deleted_at", { count: "exact" })
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false })
        .range(range.from, range.to);
      if (error) throw new Error(`listTrashed (products): ${error.message}`);
      return {
        total: count ?? 0,
        rows: (data ?? []).map((r) => ({
          id: r.id,
          label: r.name,
          sublabel: r.slug,
          deleted_at: r.deleted_at as string,
        })),
      };
    }
    case "categories": {
      const { data, count, error } = await supabase
        .from("categories")
        .select("id, name, slug, deleted_at", { count: "exact" })
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false })
        .range(range.from, range.to);
      if (error) throw new Error(`listTrashed (categories): ${error.message}`);
      return {
        total: count ?? 0,
        rows: (data ?? []).map((r) => ({
          id: r.id,
          label: r.name,
          sublabel: r.slug,
          deleted_at: r.deleted_at as string,
        })),
      };
    }
    case "tags": {
      const { data, count, error } = await supabase
        .from("tags")
        .select("id, name, slug, deleted_at", { count: "exact" })
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false })
        .range(range.from, range.to);
      if (error) throw new Error(`listTrashed (tags): ${error.message}`);
      return {
        total: count ?? 0,
        rows: (data ?? []).map((r) => ({
          id: r.id,
          label: r.name,
          sublabel: r.slug,
          deleted_at: r.deleted_at as string,
        })),
      };
    }
    case "product_images": {
      const { data, count, error } = await supabase
        .from("product_images")
        .select("id, url, alt, product_id, deleted_at", { count: "exact" })
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false })
        .range(range.from, range.to);
      if (error) throw new Error(`listTrashed (images): ${error.message}`);
      return {
        total: count ?? 0,
        rows: (data ?? []).map((r) => ({
          id: r.id,
          label: r.alt ?? r.url ?? r.id,
          sublabel: r.product_id ? `product ${r.product_id.slice(0, 8)}` : null,
          deleted_at: r.deleted_at as string,
        })),
      };
    }
    case "product_variants": {
      const { data, count, error } = await supabase
        .from("product_variants")
        .select("id, sku, name, product_id, deleted_at", { count: "exact" })
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false })
        .range(range.from, range.to);
      if (error) throw new Error(`listTrashed (variants): ${error.message}`);
      return {
        total: count ?? 0,
        rows: (data ?? []).map((r) => ({
          id: r.id,
          label: r.name ?? r.sku,
          sublabel: r.product_id ? `product ${r.product_id.slice(0, 8)}` : null,
          deleted_at: r.deleted_at as string,
        })),
      };
    }
  }
}

/**
 * Per-entity-type Trash counts. Five parallel head-count requests —
 * cheap because the tables are small.
 */
export async function getTrashCounts(
  supabase: SC,
): Promise<Record<TrashEntityType, number>> {
  const results = await Promise.all(
    TRASH_ENTITY_TYPES.map(async (t) => {
      const tableName = t;
      const { count, error } = await supabase
        .from(tableName)
        .select("id", { head: true, count: "exact" })
        .not("deleted_at", "is", null);
      if (error) throw new Error(`getTrashCounts (${t}): ${error.message}`);
      return [t, count ?? 0] as const;
    }),
  );
  return Object.fromEntries(results) as Record<TrashEntityType, number>;
}

export interface TrashedDetail {
  id: string;
  before_json: unknown;
  /** Friendly label for confirmation copy ("Resin pour cup"). */
  label: string;
}

async function fetchTrashedDetail(
  supabase: SC,
  entityType: TrashEntityType,
  id: string,
): Promise<TrashedDetail | null> {
  const { data, error } = await supabase
    .from(entityType)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`fetchTrashedDetail: ${error.message}`);
  if (!data) return null;
  // `name` / `sku` / `slug` / `url` covers every table.
  const row = data as Record<string, unknown>;
  const label =
    (row.name as string | undefined) ??
    (row.sku as string | undefined) ??
    (row.alt as string | undefined) ??
    (row.url as string | undefined) ??
    id;
  return { id, before_json: data, label };
}

export type TrashActionError =
  | { code: "not_found" }
  | { code: "not_deleted" };

/**
 * Restore: clear `deleted_at`. The associated `deleted_by` column
 * (where it exists) is also cleared so a re-delete starts clean.
 */
export async function restoreEntity(
  supabase: SC,
  entityType: TrashEntityType,
  id: string,
): Promise<
  { ok: true; label: string } | { ok: false; error: TrashActionError }
> {
  const cur = await fetchTrashedDetail(supabase, entityType, id);
  if (!cur) return { ok: false, error: { code: "not_found" } };

  // `deleted_at` must currently be non-null.
  const row = cur.before_json as Record<string, unknown>;
  if (row.deleted_at === null) {
    return { ok: false, error: { code: "not_deleted" } };
  }

  // Each table has a different update shape; dispatch by entity to
  // keep the column list inside the strict typed query.
  let updErr: { message: string } | null = null;
  switch (entityType) {
    case "products": {
      const r = await supabase
        .from("products")
        .update({ deleted_at: null, deleted_by: null })
        .eq("id", id);
      updErr = r.error;
      break;
    }
    case "categories": {
      const r = await supabase
        .from("categories")
        .update({ deleted_at: null, deleted_by: null })
        .eq("id", id);
      updErr = r.error;
      break;
    }
    case "tags": {
      const r = await supabase
        .from("tags")
        .update({ deleted_at: null })
        .eq("id", id);
      updErr = r.error;
      break;
    }
    case "product_images": {
      const r = await supabase
        .from("product_images")
        .update({ deleted_at: null })
        .eq("id", id);
      updErr = r.error;
      break;
    }
    case "product_variants": {
      const r = await supabase
        .from("product_variants")
        .update({ deleted_at: null })
        .eq("id", id);
      updErr = r.error;
      break;
    }
  }
  if (updErr) throw new Error(`restoreEntity (update): ${updErr.message}`);
  return { ok: true, label: cur.label };
}

export interface HardDeleteResult {
  label: string;
  beforeRow: unknown;
}

/**
 * Hard delete: capture the row, then DELETE. The audit-log insert
 * lives in the action layer so this helper stays purely about the
 * DB write.
 */
export async function hardDeleteEntity(
  supabase: SC,
  entityType: TrashEntityType,
  id: string,
): Promise<
  { ok: true; result: HardDeleteResult } | { ok: false; error: TrashActionError }
> {
  const cur = await fetchTrashedDetail(supabase, entityType, id);
  if (!cur) return { ok: false, error: { code: "not_found" } };

  // Only hard-delete soft-deleted rows. Owner deletes via the regular
  // editor surfaces; Trash is exclusively for already-soft-deleted
  // items.
  const row = cur.before_json as Record<string, unknown>;
  if (row.deleted_at === null) {
    return { ok: false, error: { code: "not_deleted" } };
  }

  const del = await supabase.from(entityType).delete().eq("id", id);
  if (del.error) throw new Error(`hardDeleteEntity (delete): ${del.error.message}`);

  return {
    ok: true,
    result: { label: cur.label, beforeRow: cur.before_json },
  };
}

export function auditActionFor(
  entityType: TrashEntityType,
  verb: "restore" | "hard_delete",
): string {
  return `${AUDIT_ENTITY[entityType]}.${verb}`;
}

export function auditEntityFor(entityType: TrashEntityType): string {
  return AUDIT_ENTITY[entityType];
}
