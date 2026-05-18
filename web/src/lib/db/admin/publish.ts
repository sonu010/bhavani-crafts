/**
 * Publish lifecycle for products.
 *
 * `products_publish_state_consistency` (in 0004_ops_tables.sql)
 * enforces the (is_published, review_status) invariants at the DB
 * level. The application layer picks the right pair for each verb:
 *
 *   publish     →  is_published=true,  review_status='published'
 *   unpublish   →  is_published=false, review_status='ready_to_publish'
 *   archive     →  is_published=false, review_status='archived' (future)
 *
 * Pre-flight checks mirror the global launch-blockers SQL but
 * scoped to a single product. Blocking failures gate publish;
 * warnings are surfaced but don't gate.
 *
 * DI Supabase per ADR-010.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types.gen";

type SC = SupabaseClient<Database>;

export type PreflightCheckLevel = "blocking" | "warning";

export interface PreflightCheck {
  id: string;
  label: string;
  level: PreflightCheckLevel;
  passed: boolean;
  detail?: string | null;
}

export interface PreflightResult {
  checks: PreflightCheck[];
  blockingFailures: string[];
  canPublish: boolean;
}

/**
 * Run all per-product preflight checks. Reads the product, its
 * images, and its variants in parallel — one round-trip total.
 */
export async function runProductPreflight(
  supabase: SC,
  productId: string,
): Promise<PreflightResult> {
  const [prodRes, imgsRes, varsRes] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id, slug, description, base_price_inr, category_id, is_published, review_status",
      )
      .eq("id", productId)
      .maybeSingle(),
    supabase
      .from("product_images")
      .select("id, alt, license_status")
      .eq("product_id", productId)
      .is("deleted_at", null),
    supabase
      .from("product_variants")
      .select("id, is_default")
      .eq("product_id", productId)
      .is("deleted_at", null),
  ]);
  if (prodRes.error) throw new Error(`preflight (product): ${prodRes.error.message}`);
  if (imgsRes.error) throw new Error(`preflight (images): ${imgsRes.error.message}`);
  if (varsRes.error) throw new Error(`preflight (variants): ${varsRes.error.message}`);
  const product = prodRes.data;
  const images = imgsRes.data ?? [];
  const variants = varsRes.data ?? [];

  const checks: PreflightCheck[] = [];

  // BLOCKING — at least one image with a verified license.
  const verifiedImages = images.filter(
    (i) =>
      i.license_status === "owned" ||
      i.license_status === "licensed" ||
      i.license_status === "public_domain",
  );
  checks.push({
    id: "image_licensed",
    label: "At least one image with verified license",
    level: "blocking",
    passed: verifiedImages.length > 0,
    detail:
      verifiedImages.length > 0
        ? `${verifiedImages.length} verified`
        : "Verify a license on at least one image",
  });

  // BLOCKING — no image is disputed/removed.
  const tainted = images.filter(
    (i) => i.license_status === "disputed" || i.license_status === "removed",
  );
  checks.push({
    id: "no_tainted_image",
    label: "No image is disputed or removed",
    level: "blocking",
    passed: tainted.length === 0,
    detail:
      tainted.length === 0
        ? "Clean"
        : `${tainted.length} image(s) flagged; remove or replace before publishing`,
  });

  // BLOCKING — base price set.
  checks.push({
    id: "base_price",
    label: "Base price set",
    level: "blocking",
    passed: product?.base_price_inr != null,
    detail: product?.base_price_inr != null ? `₹${product.base_price_inr}` : "No price",
  });

  // BLOCKING — if variants exist, exactly one is default.
  if (variants.length > 0) {
    const defaults = variants.filter((v) => v.is_default).length;
    checks.push({
      id: "default_variant",
      label: "Exactly one default variant",
      level: "blocking",
      passed: defaults === 1,
      detail:
        defaults === 1
          ? "OK"
          : `${defaults} variants marked default; expected exactly 1`,
    });
  }

  // WARNING — category set.
  checks.push({
    id: "category_set",
    label: "Category assigned",
    level: "warning",
    passed: product?.category_id != null,
    detail: product?.category_id != null ? null : "Storefront uses category in URLs",
  });

  // WARNING — description present.
  const desc = product?.description?.trim() ?? "";
  checks.push({
    id: "description_present",
    label: "Description present",
    level: "warning",
    passed: desc.length > 0,
    detail: desc.length > 0 ? `${desc.length} chars` : "Empty — affects SEO + AI matching",
  });

  // WARNING — alt text on every image.
  const missingAlt = images.filter((i) => !i.alt || i.alt.trim() === "").length;
  checks.push({
    id: "alt_text",
    label: "Alt text on every image",
    level: "warning",
    passed: images.length > 0 && missingAlt === 0,
    detail:
      images.length === 0
        ? "No images"
        : missingAlt === 0
          ? "All images have alt text"
          : `${missingAlt} image(s) missing alt`,
  });

  const blockingFailures = checks
    .filter((c) => c.level === "blocking" && !c.passed)
    .map((c) => c.id);

  return {
    checks,
    blockingFailures,
    canPublish: blockingFailures.length === 0,
  };
}

export type PublishError =
  | { code: "preflight_failed"; failures: string[] }
  | { code: "not_found" };

export interface PublishResult {
  before: { is_published: boolean; review_status: string };
  after: { is_published: boolean; review_status: string };
}

export async function publishProduct(
  supabase: SC,
  productId: string,
): Promise<{ ok: true; result: PublishResult } | { ok: false; error: PublishError }> {
  const preflight = await runProductPreflight(supabase, productId);
  if (!preflight.canPublish) {
    return { ok: false, error: { code: "preflight_failed", failures: preflight.blockingFailures } };
  }

  const before = await supabase
    .from("products")
    .select("is_published, review_status")
    .eq("id", productId)
    .maybeSingle();
  if (before.error) throw new Error(`publishProduct (read): ${before.error.message}`);
  if (!before.data) return { ok: false, error: { code: "not_found" } };

  const upd = await supabase
    .from("products")
    .update({ is_published: true, review_status: "published" })
    .eq("id", productId)
    .select("is_published, review_status")
    .single();
  if (upd.error) throw new Error(`publishProduct (update): ${upd.error.message}`);

  return {
    ok: true,
    result: {
      before: before.data,
      after: upd.data,
    },
  };
}

export async function unpublishProduct(
  supabase: SC,
  productId: string,
): Promise<{ ok: true; result: PublishResult } | { ok: false; error: PublishError }> {
  const before = await supabase
    .from("products")
    .select("is_published, review_status")
    .eq("id", productId)
    .maybeSingle();
  if (before.error) throw new Error(`unpublishProduct (read): ${before.error.message}`);
  if (!before.data) return { ok: false, error: { code: "not_found" } };

  // If already not-published, only update review_status to match.
  const upd = await supabase
    .from("products")
    .update({ is_published: false, review_status: "ready_to_publish" })
    .eq("id", productId)
    .select("is_published, review_status")
    .single();
  if (upd.error) throw new Error(`unpublishProduct (update): ${upd.error.message}`);

  return {
    ok: true,
    result: {
      before: before.data,
      after: upd.data,
    },
  };
}
