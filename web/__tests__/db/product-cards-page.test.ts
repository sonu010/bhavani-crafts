/**
 * Integration tests for `getProductCardsPage` — the storefront's
 * one-stop "give me cards with their primary image" read used by
 * every product-row surface (hero, weekly, kits, category grid,
 * search results, related products).
 *
 * Existing storefront-large-catalog.test.ts seeds 250 products at
 * a single license_status + sort_order to verify the URL-length
 * chunking. This file pins the per-row CORRECTNESS rules:
 *   1. Image with sort_order = 0 wins over higher sort_orders.
 *   2. license_status NOT in (owned, licensed, public_domain) is
 *      filtered out via product_images_public_select RLS — the
 *      card renders with imageUrl null.
 *   3. Soft-deleted images are skipped.
 *   4. Products with no images at all render with imageUrl null
 *      (don't throw, don't drop the product).
 *   5. alt + blurDataUrl are carried through from the chosen image.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { srv, anon } from "./_clients";
import { getProductCardsPage } from "@/lib/db/storefront";

const TAG = `zzz-cards-${Date.now()}`;
let catId: string;
let prodMultiImage: string;
let prodNoPublicImage: string;
let prodSoftDeletedImage: string;
let prodNoImage: string;
let prodWithBlur: string;
let allProdIds: string[];

beforeAll(async () => {
  const { data: cat } = await srv
    .from("categories")
    .insert({ slug: `${TAG}-cat`, name: `${TAG} cat` })
    .select("id")
    .single();
  catId = cat!.id as string;

  // Five products — each pins a different rule.
  const { data: prods } = await srv
    .from("products")
    .insert([
      {
        sku: `${TAG.toUpperCase()}-MULTI`,
        slug: `${TAG}-multi`,
        name: `${TAG} multi-image`,
        base_price_inr: 100,
        stock_status: "in_stock" as const,
        category_id: catId,
        is_published: true,
        review_status: "published" as const,
        source: "manual" as const,
      },
      {
        sku: `${TAG.toUpperCase()}-NOPUB`,
        slug: `${TAG}-nopub`,
        name: `${TAG} only-unverified-image`,
        base_price_inr: 100,
        stock_status: "in_stock" as const,
        category_id: catId,
        is_published: true,
        review_status: "published" as const,
        source: "manual" as const,
      },
      {
        sku: `${TAG.toUpperCase()}-SOFT`,
        slug: `${TAG}-soft`,
        name: `${TAG} only-soft-deleted`,
        base_price_inr: 100,
        stock_status: "in_stock" as const,
        category_id: catId,
        is_published: true,
        review_status: "published" as const,
        source: "manual" as const,
      },
      {
        sku: `${TAG.toUpperCase()}-NONE`,
        slug: `${TAG}-none`,
        name: `${TAG} no-images`,
        base_price_inr: 100,
        stock_status: "in_stock" as const,
        category_id: catId,
        is_published: true,
        review_status: "published" as const,
        source: "manual" as const,
      },
      {
        sku: `${TAG.toUpperCase()}-BLUR`,
        slug: `${TAG}-blur`,
        name: `${TAG} blur-and-alt`,
        base_price_inr: 100,
        stock_status: "in_stock" as const,
        category_id: catId,
        is_published: true,
        review_status: "published" as const,
        source: "manual" as const,
      },
    ])
    .select("id, sku");
  const map = new Map((prods ?? []).map((p) => [p.sku as string, p.id as string]));
  prodMultiImage = map.get(`${TAG.toUpperCase()}-MULTI`)!;
  prodNoPublicImage = map.get(`${TAG.toUpperCase()}-NOPUB`)!;
  prodSoftDeletedImage = map.get(`${TAG.toUpperCase()}-SOFT`)!;
  prodNoImage = map.get(`${TAG.toUpperCase()}-NONE`)!;
  prodWithBlur = map.get(`${TAG.toUpperCase()}-BLUR`)!;
  allProdIds = [
    prodMultiImage,
    prodNoPublicImage,
    prodSoftDeletedImage,
    prodNoImage,
    prodWithBlur,
  ];

  // Images:
  //   MULTI gets two images at sort_order 0 + 1; the sort_order=0
  //   image's URL is the one we expect on the card.
  //   NOPUB gets an `unverified` license (RLS hides for anon).
  //   SOFT gets an `owned` license but deleted_at set.
  //   NONE gets nothing.
  //   BLUR gets one `owned` image with alt + blur_data_url set.
  await srv.from("product_images").insert([
    {
      product_id: prodMultiImage,
      url: `${TAG}-multi-primary.webp`,
      alt: "primary alt",
      sort_order: 0,
      blur_data_url: null,
      license_status: "owned",
    },
    {
      product_id: prodMultiImage,
      url: `${TAG}-multi-secondary.webp`,
      alt: "secondary alt",
      sort_order: 5,
      blur_data_url: null,
      license_status: "owned",
    },
    {
      product_id: prodNoPublicImage,
      url: `${TAG}-nopub.webp`,
      alt: null,
      sort_order: 0,
      blur_data_url: null,
      license_status: "unverified",
    },
    {
      product_id: prodSoftDeletedImage,
      url: `${TAG}-soft.webp`,
      alt: null,
      sort_order: 0,
      blur_data_url: null,
      license_status: "owned",
      deleted_at: new Date().toISOString(),
    },
    {
      product_id: prodWithBlur,
      url: `${TAG}-blur.webp`,
      alt: "blur alt",
      sort_order: 0,
      blur_data_url: "data:image/jpeg;base64,fake-blur",
      license_status: "owned",
    },
  ]);
}, 60_000);

afterAll(async () => {
  await srv.from("product_images").delete().like("alt", `${TAG}%`);
  await srv.from("product_images").delete().like("url", `${TAG}%`);
  await srv.from("products").delete().in("id", allProdIds);
  await srv.from("categories").delete().eq("id", catId);
}, 60_000);

describe("getProductCardsPage — primary image selection rules", () => {
  it("multi-image: sort_order=0 image wins (NOT the higher sort_order one)", async () => {
    const { items } = await getProductCardsPage(anon, {
      categoryIds: [catId],
      perPage: 10,
    });
    const card = items.find((c) => c.id === prodMultiImage);
    expect(card).toBeDefined();
    expect(card!.imageUrl).toBe(`${TAG}-multi-primary.webp`);
    expect(card!.imageAlt).toBe("primary alt");
  });

  it("RLS hides images whose license_status is not in the public set (unverified)", async () => {
    const { items } = await getProductCardsPage(anon, {
      categoryIds: [catId],
      perPage: 10,
    });
    const card = items.find((c) => c.id === prodNoPublicImage);
    expect(card).toBeDefined();
    // The product itself still renders; just no image.
    expect(card!.imageUrl).toBeNull();
  });

  it("soft-deleted images are skipped, card has null image", async () => {
    const { items } = await getProductCardsPage(anon, {
      categoryIds: [catId],
      perPage: 10,
    });
    const card = items.find((c) => c.id === prodSoftDeletedImage);
    expect(card).toBeDefined();
    expect(card!.imageUrl).toBeNull();
  });

  it("a product with no images at all renders, just with null imageUrl", async () => {
    const { items } = await getProductCardsPage(anon, {
      categoryIds: [catId],
      perPage: 10,
    });
    const card = items.find((c) => c.id === prodNoImage);
    expect(card).toBeDefined();
    expect(card!.imageUrl).toBeNull();
    expect(card!.imageAlt).toBeNull();
    expect(card!.blurDataUrl).toBeNull();
  });

  it("blur_data_url + alt carry through from the chosen image", async () => {
    const { items } = await getProductCardsPage(anon, {
      categoryIds: [catId],
      perPage: 10,
    });
    const card = items.find((c) => c.id === prodWithBlur);
    expect(card).toBeDefined();
    expect(card!.imageUrl).toBe(`${TAG}-blur.webp`);
    expect(card!.imageAlt).toBe("blur alt");
    expect(card!.blurDataUrl).toBe("data:image/jpeg;base64,fake-blur");
  });

  it("getProductCardsPage returns the product set for the category in one read", async () => {
    const { items } = await getProductCardsPage(anon, {
      categoryIds: [catId],
      perPage: 10,
    });
    const ourIds = items.map((c) => c.id).filter((id) => allProdIds.includes(id));
    expect(new Set(ourIds)).toEqual(new Set(allProdIds));
  });
});
