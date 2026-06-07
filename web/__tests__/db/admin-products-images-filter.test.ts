/**
 * Pin for the `imagesProblem: true` flag on `listProductsAdmin` —
 * narrows to products with at least one product_images row whose
 * license_status is in ('disputed', 'removed').
 *
 * Powers the dashboard's Broken-images widget Review link.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { srv } from "./_clients";
import { listProductsAdmin } from "@/lib/db/admin/products";

const TAG = `zzz-img-prob-${Date.now()}`;
let categoryId: string;
let cleanProductId: string;
let disputedProductId: string;
let removedProductId: string;
let bothProductId: string;

beforeAll(async () => {
  const { data: cat } = await srv
    .from("categories")
    .insert({ slug: `${TAG}-cat`, name: `${TAG} cat` })
    .select("id")
    .single();
  categoryId = cat!.id as string;

  // Four products — one clean, three with various problem images.
  const { data: prods } = await srv
    .from("products")
    .insert([
      {
        sku: `${TAG.toUpperCase()}-CLN`,
        slug: `${TAG}-clean`,
        name: `${TAG} clean`,
        base_price_inr: 100,
        stock_status: "in_stock" as const,
        category_id: categoryId,
        is_published: true,
        review_status: "published" as const,
        source: "manual" as const,
      },
      {
        sku: `${TAG.toUpperCase()}-DSP`,
        slug: `${TAG}-disputed`,
        name: `${TAG} has disputed`,
        base_price_inr: 100,
        stock_status: "in_stock" as const,
        category_id: categoryId,
        is_published: true,
        review_status: "published" as const,
        source: "manual" as const,
      },
      {
        sku: `${TAG.toUpperCase()}-RMV`,
        slug: `${TAG}-removed`,
        name: `${TAG} has removed`,
        base_price_inr: 100,
        stock_status: "in_stock" as const,
        category_id: categoryId,
        is_published: true,
        review_status: "published" as const,
        source: "manual" as const,
      },
      {
        sku: `${TAG.toUpperCase()}-BOTH`,
        slug: `${TAG}-both`,
        name: `${TAG} has clean + disputed`,
        base_price_inr: 100,
        stock_status: "in_stock" as const,
        category_id: categoryId,
        is_published: true,
        review_status: "published" as const,
        source: "manual" as const,
      },
    ])
    .select("id, sku");
  cleanProductId = (prods ?? []).find((p) => (p.sku as string).endsWith("-CLN"))!.id as string;
  disputedProductId = (prods ?? []).find((p) => (p.sku as string).endsWith("-DSP"))!.id as string;
  removedProductId = (prods ?? []).find((p) => (p.sku as string).endsWith("-RMV"))!.id as string;
  bothProductId = (prods ?? []).find((p) => (p.sku as string).endsWith("-BOTH"))!.id as string;

  // Images:
  //   clean        → 1 owned image
  //   disputed     → 1 disputed image
  //   removed      → 1 removed image
  //   both         → 1 owned + 1 disputed (mixed)
  await srv.from("product_images").insert([
    {
      product_id: cleanProductId,
      url: `https://example.invalid/${TAG}-clean.webp`,
      alt: `${TAG} alt`,
      sort_order: 0,
      blur_data_url: null,
      license_status: "owned",
    },
    {
      product_id: disputedProductId,
      url: `https://example.invalid/${TAG}-disputed.webp`,
      alt: `${TAG} alt`,
      sort_order: 0,
      blur_data_url: null,
      license_status: "disputed",
    },
    {
      product_id: removedProductId,
      url: `https://example.invalid/${TAG}-removed.webp`,
      alt: `${TAG} alt`,
      sort_order: 0,
      blur_data_url: null,
      license_status: "removed",
    },
    {
      product_id: bothProductId,
      url: `https://example.invalid/${TAG}-both-clean.webp`,
      alt: `${TAG} alt`,
      sort_order: 0,
      blur_data_url: null,
      license_status: "owned",
    },
    {
      product_id: bothProductId,
      url: `https://example.invalid/${TAG}-both-disputed.webp`,
      alt: `${TAG} alt`,
      sort_order: 1,
      blur_data_url: null,
      license_status: "disputed",
    },
  ]);
}, 60_000);

afterAll(async () => {
  await srv.from("product_images").delete().like("url", `${TAG}%`);
  await srv
    .from("products")
    .delete()
    .in("id", [cleanProductId, disputedProductId, removedProductId, bothProductId]);
  await srv.from("categories").delete().eq("id", categoryId);
}, 60_000);

describe("listProductsAdmin — imagesProblem filter", () => {
  it("narrows to products with disputed OR removed images", async () => {
    const { items } = await listProductsAdmin(srv, {
      categoryId,
      imagesProblem: true,
      perPage: 50,
    });
    const ids = items.map((p) => p.id);
    expect(ids).toContain(disputedProductId);
    expect(ids).toContain(removedProductId);
    expect(ids).toContain(bothProductId);
    expect(ids).not.toContain(cleanProductId);
  });

  it("imagesProblem=false (default) returns all products in the category", async () => {
    const { items } = await listProductsAdmin(srv, {
      categoryId,
      perPage: 50,
    });
    const ids = items.map((p) => p.id);
    expect(ids).toContain(cleanProductId);
    expect(ids).toContain(disputedProductId);
    expect(ids).toContain(removedProductId);
    expect(ids).toContain(bothProductId);
  });

  it("composes with status AND status filter", async () => {
    // All four are status='published' except bothProduct; let's
    // narrow to disputed status='published' AND imagesProblem.
    const { items } = await listProductsAdmin(srv, {
      categoryId,
      status: "published",
      imagesProblem: true,
      perPage: 50,
    });
    // disputed + removed + both are all status=published.
    expect(items.some((p) => p.id === disputedProductId)).toBe(true);
    expect(items.some((p) => p.id === cleanProductId)).toBe(false);
  });
});
