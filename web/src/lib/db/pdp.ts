import "server-only";
import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createPublicClient } from "./public-client";
import { createAdminClient } from "./admin";
import {
  getProductBySlug,
  getPdpVariantBundle,
  type PdpVariantBundle,
} from "./products";
import {
  getProductAttributes,
  listApplicableAttributes,
  type AttributeDefinition,
  type ProductAttributeRow,
} from "./attributes";
import type { Database } from "./types.gen";
import type { ProductDetail } from "@/lib/schemas/product";

type SC = SupabaseClient<Database>;

export interface PdpView {
  product: ProductDetail;
  variants: PdpVariantBundle;
  /** Definitions in `applies_to_category` ∪ globals, sorted. */
  attributeDefs: AttributeDefinition[];
  /** Rows the admin set for this product (the "current values"). */
  attributeRows: ProductAttributeRow[];
}

/**
 * Compose the full PDP read from any DI client. Used by BOTH the cached
 * public path and the uncached preview path — keeping one read function
 * means the two paths can't drift in shape.
 */
async function readPdp(supabase: SC, slug: string): Promise<PdpView | null> {
  const product = await getProductBySlug(supabase, slug);
  if (!product) return null;

  const [variants, attributeRows, attributeDefs] = await Promise.all([
    getPdpVariantBundle(supabase, product.id),
    getProductAttributes(supabase, product.id),
    listApplicableAttributes(supabase, product.category?.id ?? null),
  ]);

  return { product, variants, attributeDefs, attributeRows };
}

/**
 * Public-facing PDP read. Anon client + RLS gates visibility: unpublished
 * products simply return null. Wrapped in `unstable_cache` so admin
 * mutations that emit `products` or `product:<slug>` revalidate.
 */
export function getPdpView(slug: string): Promise<PdpView | null> {
  return unstable_cache(
    async () => readPdp(createPublicClient(), slug),
    ["pdp", slug],
    { tags: ["products", `product:${slug}`], revalidate: 300 },
  )();
}

/**
 * Preview-mode PDP read for the admin "Preview as anonymous" flow.
 * Service-role bypasses RLS so the unpublished product is visible. NEVER
 * cached and NEVER reached without a verified preview token (the page
 * caller checks the token first).
 */
export async function getPdpPreview(slug: string): Promise<PdpView | null> {
  return readPdp(createAdminClient(), slug);
}
