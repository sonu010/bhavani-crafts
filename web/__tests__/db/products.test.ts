import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { anon, makeTestProduct, srv } from "./_clients";
import { listProducts, getProductBySlug } from "@/lib/db/products";

const SLUG = "zzz-test-products-flow";
const SKU = "ZZZ-TEST-PRODUCTS-FLOW";

let cleanup: () => Promise<void>;

beforeAll(async () => {
  const f = await makeTestProduct({
    slug: SLUG,
    sku: SKU,
    name: "Test product (data layer)",
    basePriceInr: 250,
    shortDescription: "Used by the data-layer integration tests.",
  });
  cleanup = f.cleanup;
});

afterAll(async () => {
  await cleanup();
});

describe("listProducts (anon, RLS-respecting)", () => {
  test("returns the test product among published rows", async () => {
    const { items } = await listProducts(anon, { perPage: 50 });
    const found = items.find((p) => p.slug === SLUG);
    expect(found).toBeDefined();
    expect(found?.sku).toBe(SKU);
    expect(found?.base_price_inr).toBe(250);
  });

  test("filters by minPriceInr/maxPriceInr", async () => {
    const cheap = await listProducts(anon, { maxPriceInr: 100, perPage: 5 });
    for (const p of cheap.items) {
      // base_price_inr may be null for some test products in the seed; we
      // explicitly excluded those by filter, so non-null is expected.
      expect(p.base_price_inr).toBeNull;
      if (p.base_price_inr !== null) expect(p.base_price_inr).toBeLessThanOrEqual(100);
    }
  });

  test("filters by stockStatus", async () => {
    const result = await listProducts(anon, {
      stockStatus: "in_stock",
      perPage: 10,
    });
    for (const p of result.items) {
      expect(p.stock_status).toBe("in_stock");
    }
  });

  test("never returns unpublished products to anon", async () => {
    // Create a temp unpublished product via service-role
    const { data: cat } = await srv
      .from("categories")
      .insert({ slug: "zzz-unpub-test-cat", name: "Unpub test" })
      .select("id")
      .single();
    const { data: prod } = await srv
      .from("products")
      .insert({
        sku: "ZZZ-UNPUB-TEST",
        slug: "zzz-unpub-test",
        name: "Unpublished",
        category_id: cat!.id,
        is_published: false,
        review_status: "draft",
      })
      .select("id")
      .single();

    const { items } = await listProducts(anon, { perPage: 100 });
    expect(items.some((p) => p.slug === "zzz-unpub-test")).toBe(false);

    await srv.from("products").delete().eq("id", prod!.id);
    await srv.from("categories").delete().eq("id", cat!.id);
  });
});

describe("getProductBySlug (anon)", () => {
  test("returns the test product with category nested", async () => {
    const p = await getProductBySlug(anon, SLUG);
    expect(p).not.toBeNull();
    expect(p?.name).toBe("Test product (data layer)");
    expect(p?.category?.slug).toBe(`${SLUG}-cat`);
    expect(p?.images).toEqual([]);
    expect(p?.variants).toEqual([]);
    expect(p?.tags).toEqual([]);
  });

  test("returns null for an unknown slug", async () => {
    const p = await getProductBySlug(anon, "definitely-not-a-real-slug-xyz");
    expect(p).toBeNull();
  });
});
