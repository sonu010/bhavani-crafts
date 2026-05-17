/**
 * Admin-side product queries.
 *
 * Diverges from lib/db/products.ts in three ways:
 *   1. Includes unpublished + non-archived rows by default (storefront
 *      sees only is_published=true).
 *   2. Selects review_status / is_published / updated_at / first image
 *      so the admin table can render them.
 *   3. Filter axis is review_status (the lifecycle), not stock_status.
 *
 * Soft-deleted rows are still hidden everywhere — the Trash view
 * (P2-T28) is the only consumer that surfaces them.
 *
 * DI Supabase client per ADR-010. Service-role is what the admin layout
 * passes in; RLS is admin-only-write for catalog tables but admin-read
 * works for either role.
 */
import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types.gen";

type SC = SupabaseClient<Database>;

export const ADMIN_LIST_DEFAULT_PER_PAGE = 25;
export const ADMIN_LIST_MAX_PER_PAGE = 100;

export type AdminProductStatus =
  | "draft"
  | "needs_review"
  | "ready_to_publish"
  | "published"
  | "archived";

export type AdminProductSort = "newest" | "updated_at_desc" | "name_asc";

export interface AdminCursor {
  // (created_at | updated_at | name) of the boundary row + id tie-breaker.
  primary: string;
  id: string;
}

export const AdminProductRowSchema = z.object({
  id: z.string().uuid(),
  sku: z.string().nullable(),
  slug: z.string(),
  name: z.string(),
  base_price_inr: z.number().nullable(),
  review_status: z.enum([
    "draft",
    "needs_review",
    "ready_to_publish",
    "published",
    "archived",
  ]),
  is_published: z.boolean(),
  stock_status: z.enum([
    "in_stock",
    "low_stock",
    "out_of_stock",
    "made_to_order",
    "unknown",
  ]),
  created_at: z.string(),
  updated_at: z.string(),
  category: z
    .object({ id: z.string().uuid(), slug: z.string(), name: z.string() })
    .nullable(),
  thumbnail_url: z.string().url().nullable(),
});

export type AdminProductRow = z.infer<typeof AdminProductRowSchema>;

export interface ListProductsAdminOpts {
  status?: AdminProductStatus;
  sort?: AdminProductSort;
  cursor?: AdminCursor | null;
  perPage?: number;
}

export interface ListProductsAdminResult {
  items: AdminProductRow[];
  nextCursor: AdminCursor | null;
}

function clampPerPage(v: number | undefined): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return ADMIN_LIST_DEFAULT_PER_PAGE;
  return Math.min(ADMIN_LIST_MAX_PER_PAGE, Math.max(1, Math.floor(v)));
}

/**
 * Cursor → URL token. Base64url JSON. Forward-only pagination; "previous"
 * is the browser back button or a fresh URL.
 */
export function encodeCursor(c: AdminCursor): string {
  return Buffer.from(JSON.stringify(c), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function decodeCursor(token: string | null | undefined): AdminCursor | null {
  if (!token) return null;
  try {
    const padded = token.replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(padded, "base64").toString("utf8");
    const parsed = JSON.parse(json);
    if (
      typeof parsed?.primary === "string" &&
      typeof parsed?.id === "string"
    ) {
      return { primary: parsed.primary, id: parsed.id };
    }
    return null;
  } catch {
    return null;
  }
}

export async function listProductsAdmin(
  supabase: SC,
  opts: ListProductsAdminOpts = {},
): Promise<ListProductsAdminResult> {
  const perPage = clampPerPage(opts.perPage);
  const sort = opts.sort ?? "newest";

  let q = supabase
    .from("products")
    .select(
      `
        id, sku, slug, name, base_price_inr, review_status, is_published,
        stock_status, created_at, updated_at,
        category:categories(id, slug, name),
        thumbnail:product_images(url, sort_order)
      `,
    )
    .is("deleted_at", null);

  if (opts.status) {
    q = q.eq("review_status", opts.status);
  }

  // Apply sort + cursor (forward-only).
  if (sort === "newest") {
    q = q.order("created_at", { ascending: false }).order("id", { ascending: false });
    if (opts.cursor) {
      q = q.or(
        `created_at.lt.${opts.cursor.primary},and(created_at.eq.${opts.cursor.primary},id.lt.${opts.cursor.id})`,
      );
    }
  } else if (sort === "updated_at_desc") {
    q = q.order("updated_at", { ascending: false }).order("id", { ascending: false });
    if (opts.cursor) {
      q = q.or(
        `updated_at.lt.${opts.cursor.primary},and(updated_at.eq.${opts.cursor.primary},id.lt.${opts.cursor.id})`,
      );
    }
  } else if (sort === "name_asc") {
    q = q.order("name", { ascending: true }).order("id", { ascending: true });
    if (opts.cursor) {
      q = q.or(
        `name.gt.${opts.cursor.primary},and(name.eq.${opts.cursor.primary},id.gt.${opts.cursor.id})`,
      );
    }
  }

  q = q.limit(perPage + 1); // +1 to detect "has more"

  const { data, error } = await q;
  if (error) throw new Error(`listProductsAdmin: ${error.message}`);

  // Supabase joins return arrays; pick the first thumbnail by sort_order.
  type RawRow = (typeof data extends Array<infer R> ? R : never) & {
    category: { id: string; slug: string; name: string } | null;
    thumbnail: { url: string; sort_order: number }[] | null;
  };

  const rows = (data ?? []).map((raw) => {
    const r = raw as unknown as RawRow;
    const firstImage =
      (r.thumbnail ?? [])
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order)[0]?.url ?? null;
    return {
      id: r.id,
      sku: r.sku,
      slug: r.slug,
      name: r.name,
      base_price_inr: r.base_price_inr,
      review_status: r.review_status,
      is_published: r.is_published,
      stock_status: r.stock_status,
      created_at: r.created_at,
      updated_at: r.updated_at,
      category: r.category,
      thumbnail_url: firstImage,
    };
  });

  const parsed = AdminProductRowSchema.array().parse(rows);
  const hasMore = parsed.length > perPage;
  const items = hasMore ? parsed.slice(0, perPage) : parsed;

  let nextCursor: AdminCursor | null = null;
  if (hasMore) {
    const last = items[items.length - 1];
    const primary =
      sort === "newest"
        ? last.created_at
        : sort === "updated_at_desc"
          ? last.updated_at
          : last.name;
    nextCursor = { primary, id: last.id };
  }
  return { items, nextCursor };
}

export type ProductStatusCounts = Record<AdminProductStatus, number>;

export async function countProductsByStatus(
  supabase: SC,
): Promise<ProductStatusCounts> {
  // Five parallel head-count queries — PostgREST doesn't support
  // count(*) FILTER (WHERE …) directly. Acceptable: each is indexed by
  // (review_status, deleted_at) and runs ~ms.
  const statuses: AdminProductStatus[] = [
    "draft",
    "needs_review",
    "ready_to_publish",
    "published",
    "archived",
  ];
  const counts = await Promise.all(
    statuses.map((s) =>
      supabase
        .from("products")
        .select("*", { count: "exact", head: true })
        .is("deleted_at", null)
        .eq("review_status", s),
    ),
  );
  const out = {} as ProductStatusCounts;
  for (let i = 0; i < statuses.length; i++) {
    const { count, error } = counts[i];
    if (error) throw new Error(`countProductsByStatus(${statuses[i]}): ${error.message}`);
    out[statuses[i]] = count ?? 0;
  }
  return out;
}
