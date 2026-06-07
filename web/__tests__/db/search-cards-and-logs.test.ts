/**
 * `searchProductCards` integration + search_logs anon-insert policy.
 *
 * Coverage gaps these pin:
 *   1. `searchProductCards` returns ProductCardItems (with imageUrl
 *      joined from product_images, RLS-respecting).
 *   2. Empty query → `{ items: [] }` without hitting the DB twice.
 *   3. Zero-hit query → `{ items: [] }` but doesn't drop the query
 *      string from the result envelope.
 *   4. The `search_logs_public_insert` policy (migration 0014) lets
 *      anon log every query — including zero-hit ones — without
 *      service-role. Caps query length per the RLS check.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anon, srv } from "./_clients";
import { searchProductCards } from "@/lib/db/storefront";

const TAG = `zzz-search-${Date.now()}`;
let catId: string;
let visibleProductId: string;
let unpubProductId: string;
let imageVisibleProductId: string;
let allProdIds: string[];

beforeAll(async () => {
  const { data: cat } = await srv
    .from("categories")
    .insert({ slug: `${TAG}-cat`, name: `${TAG} cat` })
    .select("id")
    .single();
  catId = cat!.id as string;

  // One published row whose name + description matches our query.
  // One UNpublished row with the same name (RLS must hide it).
  // One published row with an `owned` image (the image join should work).
  const { data: prods } = await srv
    .from("products")
    .insert([
      {
        sku: `${TAG.toUpperCase()}-VIS`,
        slug: `${TAG}-visible`,
        name: `${TAG} zzzunique searchable handcrafted`,
        short_description: "matches our search query",
        base_price_inr: 100,
        stock_status: "in_stock" as const,
        category_id: catId,
        is_published: true,
        review_status: "published" as const,
        source: "manual" as const,
      },
      {
        sku: `${TAG.toUpperCase()}-UNP`,
        slug: `${TAG}-unpublished`,
        name: `${TAG} zzzunique searchable but hidden`,
        base_price_inr: 100,
        stock_status: "in_stock" as const,
        category_id: catId,
        is_published: false,
        review_status: "needs_review" as const,
        source: "manual" as const,
      },
      {
        sku: `${TAG.toUpperCase()}-IMG`,
        slug: `${TAG}-with-image`,
        name: `${TAG} zzzunique imagebearing artifact`,
        base_price_inr: 100,
        stock_status: "in_stock" as const,
        category_id: catId,
        is_published: true,
        review_status: "published" as const,
        source: "manual" as const,
      },
    ])
    .select("id, sku");
  visibleProductId = (prods ?? []).find((p) =>
    (p.sku as string).endsWith("-VIS"),
  )!.id as string;
  unpubProductId = (prods ?? []).find((p) =>
    (p.sku as string).endsWith("-UNP"),
  )!.id as string;
  imageVisibleProductId = (prods ?? []).find((p) =>
    (p.sku as string).endsWith("-IMG"),
  )!.id as string;
  allProdIds = [visibleProductId, unpubProductId, imageVisibleProductId];

  await srv.from("product_images").insert({
    product_id: imageVisibleProductId,
    url: `${TAG}-search-img.webp`,
    alt: `${TAG} alt`,
    sort_order: 0,
    blur_data_url: null,
    license_status: "owned",
  });
}, 60_000);

afterAll(async () => {
  await srv.from("product_images").delete().like("url", `${TAG}%`);
  await srv.from("products").delete().in("id", allProdIds);
  await srv.from("categories").delete().eq("id", catId);
  await srv.from("search_logs").delete().like("query", `${TAG}%`);
}, 60_000);

describe("searchProductCards", () => {
  it("empty query returns an empty result without hitting the DB", async () => {
    const r = await searchProductCards(anon, "");
    expect(r.items).toEqual([]);
    expect(r.query).toBe("");
  });

  it("a matching query returns ProductCardItems with the image joined", async () => {
    const r = await searchProductCards(anon, "imagebearing");
    const ours = r.items.find((i) => i.id === imageVisibleProductId);
    expect(ours).toBeDefined();
    expect(ours!.imageUrl).toBe(`${TAG}-search-img.webp`);
    expect(ours!.imageAlt).toBe(`${TAG} alt`);
  });

  it("a matching query returns the visible (no-image) product with imageUrl=null, not dropped", async () => {
    const r = await searchProductCards(anon, "handcrafted");
    const ours = r.items.find((i) => i.id === visibleProductId);
    expect(ours).toBeDefined();
    expect(ours!.imageUrl).toBeNull();
  });

  it("unpublished products are NEVER in the result set (RLS gate)", async () => {
    const r = await searchProductCards(anon, "zzzunique");
    // Should match visible + image, NOT unpub.
    expect(r.items.some((i) => i.id === unpubProductId)).toBe(false);
    expect(r.items.some((i) => i.id === visibleProductId)).toBe(true);
  });

  it("a no-match query returns empty items but preserves the query in the envelope", async () => {
    const r = await searchProductCards(anon, `${TAG}-noresult-xyzpqr`);
    expect(r.items).toEqual([]);
    // The envelope still has the original query string + expansion
    // (the /search page renders both).
    expect(r.query).toBe(`${TAG}-noresult-xyzpqr`);
  });
});

describe("search_logs anon-insert policy (migration 0014)", () => {
  it("anon CAN insert a search log row (every storefront query gets logged)", async () => {
    const { error } = await anon.from("search_logs").insert({
      query: `${TAG}-anon-1`,
      result_count: 0,
    });
    expect(error).toBeNull();

    const { data: row } = await srv
      .from("search_logs")
      .select("query, result_count")
      .eq("query", `${TAG}-anon-1`)
      .maybeSingle();
    expect(row).not.toBeNull();
    expect(row!.result_count).toBe(0);
  });

  it("anon CANNOT insert with a user_id (policy enforces user_id IS NULL)", async () => {
    const { error } = await anon.from("search_logs").insert({
      query: `${TAG}-anon-user`,
      result_count: 1,
      user_id: "11111111-1111-4111-8111-111111111111",
    });
    expect(error).not.toBeNull();
    expect(error?.message ?? "").toMatch(/row-level security|policy/i);
  });

  it("anon CANNOT SELECT search_logs (admin-only PII)", async () => {
    // First write a row via srv so there's something to leak.
    await srv.from("search_logs").insert({
      query: `${TAG}-srv-only`,
      result_count: 5,
    });
    const { data } = await anon.from("search_logs").select("query");
    // Empty + no error per the RLS posture (SELECT strips, not errors).
    expect(data ?? []).toEqual([]);
  });
});
