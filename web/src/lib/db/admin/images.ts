/**
 * Admin-side product_images writes.
 *
 * Read paths live in lib/db/products.ts (storefront PDP) — this file is
 * the editor + admin Trash side. DI Supabase per ADR-010.
 *
 * `license_status` defaults to 'unverified' for newly-uploaded images.
 * The owner verifies licensing in a separate flow before publish; the
 * `enforce_publish_state` trigger in 0004 blocks publishing a product
 * whose images don't have a verified status.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types.gen";

type SC = SupabaseClient<Database>;

export interface InsertProductImageInput {
  productId: string;
  storagePath: string;
  url: string;
  width: number;
  height: number;
  blurDataUrl: string | null;
  alt?: string | null;
  /** Original byte size pre-transcode; preserved for size-aware galleries later. */
  origSize?: number | null;
}

export interface ProductImageRow {
  id: string;
  product_id: string;
  url: string;
  storage_path: string | null;
  alt: string | null;
  width: number | null;
  height: number | null;
  sort_order: number;
  blur_data_url: string | null;
  source: Database["public"]["Enums"]["image_source"];
  license_status: Database["public"]["Enums"]["license_status"];
}

/**
 * Insert one product_images row.
 *
 *   - source = 'admin_upload' (single source for this entry point)
 *   - license_status = 'unverified' (gate publish until owner confirms)
 *   - sort_order = max(existing) + 1, so the new image appears last in
 *     the gallery. Reorder lands in P2-T16.
 */
export async function insertProductImage(
  supabase: SC,
  input: InsertProductImageInput,
): Promise<ProductImageRow> {
  const max = await supabase
    .from("product_images")
    .select("sort_order")
    .eq("product_id", input.productId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (max.error) {
    throw new Error(`insertProductImage (max sort): ${max.error.message}`);
  }
  const nextSort = (max.data?.sort_order ?? -1) + 1;

  const ins = await supabase
    .from("product_images")
    .insert({
      product_id: input.productId,
      url: input.url,
      storage_path: input.storagePath,
      width: input.width,
      height: input.height,
      sort_order: nextSort,
      blur_data_url: input.blurDataUrl,
      alt: input.alt ?? null,
      source: "admin_upload",
      license_status: "unverified",
    })
    .select(
      "id, product_id, url, storage_path, alt, width, height, sort_order, blur_data_url, source, license_status",
    )
    .single();
  if (ins.error) {
    throw new Error(`insertProductImage (insert): ${ins.error.message}`);
  }
  return ins.data;
}

export async function listProductImages(
  supabase: SC,
  productId: string,
): Promise<ProductImageRow[]> {
  const { data, error } = await supabase
    .from("product_images")
    .select(
      "id, product_id, url, storage_path, alt, width, height, sort_order, blur_data_url, source, license_status",
    )
    .eq("product_id", productId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(`listProductImages: ${error.message}`);
  return data ?? [];
}

/**
 * Soft-delete a product image. Storage object is NOT removed here —
 * Trash purge in P2-T28 handles the storage cleanup as part of the
 * hard-delete-after-30-days flow.
 */
export async function softDeleteProductImage(
  supabase: SC,
  imageId: string,
): Promise<{ ok: true } | { ok: false; error: { code: "not_found" } }> {
  const cur = await supabase
    .from("product_images")
    .select("id, product_id, deleted_at")
    .eq("id", imageId)
    .maybeSingle();
  if (cur.error) throw new Error(`softDeleteProductImage (lookup): ${cur.error.message}`);
  if (!cur.data || cur.data.deleted_at !== null) {
    return { ok: false, error: { code: "not_found" } };
  }
  const upd = await supabase
    .from("product_images")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", imageId);
  if (upd.error) throw new Error(`softDeleteProductImage (update): ${upd.error.message}`);
  return { ok: true };
}
