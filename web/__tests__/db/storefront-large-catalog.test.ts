/**
 * Storefront data-layer tests under a LARGE catalog.
 *
 * Born from the same bug that motivated the Playwright journey suites:
 * `getPrimaryImages` blew up with a PostgREST URL longer than Supabase's
 * proxy URL-length limit when the catalog grew to ~5800 published rows
 * and `getCategoryCovers` fanned out 500 product ids in a single
 * `.in("product_id", ...)`. Status-code-only checks passed, the page
 * silently rendered empty.
 *
 * These tests seed >200 product fixtures and exercise the storefront
 * reads end-to-end so regressions to URL-length, batching, or
 * cardinality assumptions surface before they hit the browser. Fast
 * (vitest, no browser), runs against the local Supabase stack.
 *
 * Cleanup is best-effort via the `zzz-` prefix; vitest's afterAll wipes
 * everything this file inserted.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { srv, anon } from "./_clients";
import {
  getPrimaryImages,
  getCategoryCovers,
  getProductCardsPage,
} from "@/lib/db/storefront";

const TAG = `zzz-large-${Date.now()}`;
const PRODUCT_COUNT = 250; // enough to exceed any 100-id chunk
let catId: string;
let productIds: string[] = [];

beforeAll(async () => {
  // One category to hold all fixtures.
  const { data: cat, error: catErr } = await srv
    .from("categories")
    .insert({ slug: `${TAG}-cat`, name: `${TAG} category` })
    .select("id")
    .single();
  if (catErr) throw catErr;
  catId = cat!.id;

  // Bulk-insert PRODUCT_COUNT products.
  const rows = Array.from({ length: PRODUCT_COUNT }, (_, i) => ({
    sku: `${TAG.toUpperCase()}-${String(i).padStart(4, "0")}`,
    slug: `${TAG}-p-${i}`,
    name: `${TAG} product ${i}`,
    base_price_inr: 100 + i,
    stock_status: "in_stock" as const,
    category_id: catId,
    is_published: true,
    review_status: "published" as const,
    source: "manual" as const,
  }));

  // Supabase JS handles batch insert; PostgREST returns up to all rows.
  const { data: inserted, error: prodErr } = await srv
    .from("products")
    .insert(rows)
    .select("id");
  if (prodErr) throw prodErr;
  productIds = inserted!.map((p) => p.id);

  // Each product gets one primary image so getPrimaryImages has data
  // to return.
  // license_status must be in ('owned','licensed','public_domain') for
  // anon-SELECT to pass — the public RLS policy gates on it (0006_rls).
  // The admin uploader defaults to 'unverified' until human-reviewed.
  const imgRows = productIds.map((pid, i) => ({
    product_id: pid,
    url: `https://example.invalid/img-${i}.webp`,
    alt: `${TAG} alt ${i}`,
    sort_order: 0,
    blur_data_url: null,
    license_status: "owned" as const,
  }));
  // Insert images in chunks of 200 (PostgREST body-size friendly).
  for (let i = 0; i < imgRows.length; i += 200) {
    const { error } = await srv
      .from("product_images")
      .insert(imgRows.slice(i, i + 200));
    if (error) throw error;
  }
}, 60_000);

afterAll(async () => {
  // Order matters: images cascade off products, products cascade off
  // category via FK SET NULL. Wipe explicitly to avoid orphan images.
  await srv.from("product_images").delete().like("alt", `${TAG}%`);
  await srv.from("products").delete().like("slug", `${TAG}%`);
  await srv.from("categories").delete().eq("id", catId);
}, 60_000);

describe("storefront reads — large catalog (URL-length regression guard)", () => {
  it("getPrimaryImages handles 250 product ids without exceeding URL limits", async () => {
    // The bug we're guarding: a naive `.in("product_id", productIds)`
    // would render as a single 9KB+ URL and 400 / fetch-fail at
    // Supabase's proxy. The chunked implementation must handle this.
    const map = await getPrimaryImages(anon, productIds);
    expect(map.size).toBe(PRODUCT_COUNT);
    // Every product id we asked for is in the map.
    for (const pid of productIds) {
      const img = map.get(pid);
      expect(img).toBeDefined();
      expect(img!.url).toMatch(/^https:\/\/example\.invalid\/img-\d+\.webp$/);
    }
  });

  it("getPrimaryImages de-duplicates input ids", async () => {
    const doubled = [...productIds.slice(0, 10), ...productIds.slice(0, 10)];
    const map = await getPrimaryImages(anon, doubled);
    expect(map.size).toBe(10); // not 20
  });

  it("getPrimaryImages with empty input returns an empty map (no DB hit)", async () => {
    const map = await getPrimaryImages(anon, []);
    expect(map.size).toBe(0);
  });

  it("getCategoryCovers handles a category with hundreds of descendant products", async () => {
    // Pass a top-level category with no image_url → forces the fallback
    // path that fans out 500 product ids and previously blew the URL.
    const covers = await getCategoryCovers(anon, [
      { id: catId, slug: `${TAG}-cat`, name: `${TAG} category`, image_url: null },
    ]);
    expect(covers).toHaveLength(1);
    expect(covers[0].id).toBe(catId);
    // At least one product had an image, so the cover should be populated.
    expect(covers[0].imageUrl).toMatch(/^https:\/\/example\.invalid\/img-\d+\.webp$/);
  });

  it("getProductCardsPage returns cards-with-images for the category", async () => {
    // The hero / weekly / kits all funnel through getProductCardsPage.
    // A 24-item page is the storefront default.
    const { items } = await getProductCardsPage(anon, {
      categoryIds: [catId],
      limit: 24,
    });
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items.length).toBeLessThanOrEqual(24);
    for (const item of items) {
      expect(item.imageUrl).toMatch(/^https:\/\/example\.invalid\//);
      expect(item.name).toMatch(new RegExp(`^${TAG}`));
    }
  });
});
