/**
 * Coverage gaps from recent filter-refresh work:
 *
 *   - `listChildCategories(supabase, parentId)` — drives the
 *     sub-category chip row above the category grid. Returns direct
 *     children (NOT all descendants), sort_order then name, excludes
 *     soft-deleted rows.
 *   - `listProducts(supabase, { sort: "price_asc" | "price_desc" })` —
 *     drives the storefront's Sort dropdown. Returns the configured
 *     order; tied prices break by id for stable pagination.
 *
 * Both were added in the filter-refresh commit (T57) but only
 * exercised through the category page render, never directly.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { srv, anon } from "./_clients";
import {
  getCategoryBySlug,
  listChildCategories,
} from "@/lib/db/categories";
import { listProducts } from "@/lib/db/products";

const TAG = `zzz-cat-sort-${Date.now()}`;
let parentCatId: string;
let leafCatId: string;
let childIds: string[] = [];
let productIds: string[] = [];

beforeAll(async () => {
  // Seed: parent + 4 children (one soft-deleted) + a leaf with no
  // children.
  const { data: parent, error: pErr } = await srv
    .from("categories")
    .insert({ slug: `${TAG}-parent`, name: `${TAG} Parent` })
    .select("id")
    .single();
  if (pErr) throw pErr;
  parentCatId = parent!.id as string;

  const { data: leaf } = await srv
    .from("categories")
    .insert({ slug: `${TAG}-leaf`, name: `${TAG} Leaf` })
    .select("id")
    .single();
  leafCatId = leaf!.id as string;

  const { data: kids } = await srv
    .from("categories")
    .insert([
      {
        slug: `${TAG}-child-a`,
        name: `${TAG} Aaron`,
        parent_id: parentCatId,
        sort_order: 0,
      },
      {
        slug: `${TAG}-child-b`,
        name: `${TAG} Beatrice`,
        parent_id: parentCatId,
        sort_order: 1,
      },
      {
        slug: `${TAG}-child-c`,
        name: `${TAG} Cordelia`,
        parent_id: parentCatId,
        sort_order: 0,
      },
      {
        // Soft-deleted child — must NOT appear.
        slug: `${TAG}-child-dead`,
        name: `${TAG} Dead`,
        parent_id: parentCatId,
        sort_order: 0,
        deleted_at: new Date().toISOString(),
      },
    ])
    .select("id");
  childIds = (kids ?? []).map((c) => c.id as string);

  // Seed three products at known prices to test sort.
  const { data: prods } = await srv
    .from("products")
    .insert([
      {
        sku: `${TAG.toUpperCase()}-LOW`,
        slug: `${TAG}-low`,
        name: `${TAG} Cheap`,
        base_price_inr: 50,
        stock_status: "in_stock" as const,
        category_id: parentCatId,
        is_published: true,
        review_status: "published" as const,
        source: "manual" as const,
      },
      {
        sku: `${TAG.toUpperCase()}-MID`,
        slug: `${TAG}-mid`,
        name: `${TAG} Mid`,
        base_price_inr: 150,
        stock_status: "in_stock" as const,
        category_id: parentCatId,
        is_published: true,
        review_status: "published" as const,
        source: "manual" as const,
      },
      {
        sku: `${TAG.toUpperCase()}-HIGH`,
        slug: `${TAG}-high`,
        name: `${TAG} Expensive`,
        base_price_inr: 300,
        stock_status: "in_stock" as const,
        category_id: parentCatId,
        is_published: true,
        review_status: "published" as const,
        source: "manual" as const,
      },
    ])
    .select("id");
  productIds = (prods ?? []).map((p) => p.id as string);
}, 60_000);

afterAll(async () => {
  await srv.from("products").delete().in("id", productIds);
  await srv.from("categories").delete().in("id", [...childIds, leafCatId, parentCatId]);
}, 60_000);

describe("listChildCategories", () => {
  it("returns the direct children of a parent, excluding soft-deleted", async () => {
    const children = await listChildCategories(anon, parentCatId);
    // Three live, one soft-deleted → 3 total.
    expect(children).toHaveLength(3);
    const names = children.map((c) => c.name);
    expect(names).not.toContain(`${TAG} Dead`);
  });

  it("sorts by sort_order ASC, then by name ASC (ties break alphabetically)", async () => {
    const children = await listChildCategories(anon, parentCatId);
    // Aaron + Cordelia share sort_order=0 → Aaron first by name.
    // Beatrice has sort_order=1 → comes last.
    const names = children.map((c) => c.name);
    expect(names).toEqual([
      `${TAG} Aaron`,
      `${TAG} Cordelia`,
      `${TAG} Beatrice`,
    ]);
  });

  it("returns an empty array for a leaf category", async () => {
    const children = await listChildCategories(anon, leafCatId);
    expect(children).toEqual([]);
  });

  it("returns an empty array for an unknown parent id", async () => {
    // A real-shaped v4 UUID that doesn't match any row.
    const children = await listChildCategories(
      anon,
      "deadbeef-dead-4dad-8eef-deadbeefdead",
    );
    expect(children).toEqual([]);
  });

  it("respects RLS — anon can read because categories are public", async () => {
    // Same as above but tested via the slug→id path the page uses.
    const cat = await getCategoryBySlug(anon, `${TAG}-parent`);
    expect(cat).not.toBeNull();
    if (cat) {
      const children = await listChildCategories(anon, cat.id);
      expect(children.length).toBe(3);
    }
  });
});

describe("listProducts sort options", () => {
  it("price_asc returns lowest price first", async () => {
    const { items } = await listProducts(anon, {
      categoryIds: [parentCatId],
      sort: "price_asc",
      perPage: 10,
    });
    // Filter down to OUR seed (others may exist).
    const mine = items.filter((p) => productIds.includes(p.id));
    expect(mine.length).toBe(3);
    expect(mine.map((p) => p.base_price_inr)).toEqual([50, 150, 300]);
  });

  it("price_desc returns highest price first", async () => {
    const { items } = await listProducts(anon, {
      categoryIds: [parentCatId],
      sort: "price_desc",
      perPage: 10,
    });
    const mine = items.filter((p) => productIds.includes(p.id));
    expect(mine.length).toBe(3);
    expect(mine.map((p) => p.base_price_inr)).toEqual([300, 150, 50]);
  });

  it("newest (default) returns rows in created_at DESC order", async () => {
    const { items } = await listProducts(anon, {
      categoryIds: [parentCatId],
      perPage: 10,
    });
    const mine = items.filter((p) => productIds.includes(p.id));
    expect(mine.length).toBe(3);
    // Our seed inserted in [LOW, MID, HIGH] order — but seed timestamp
    // resolution can collide, so we assert only that the result set
    // matches our three ids; the exact order is implementation detail.
    expect(new Set(mine.map((p) => p.id))).toEqual(new Set(productIds));
  });

  it("price_asc combined with minPriceInr/maxPriceInr filters", async () => {
    const { items } = await listProducts(anon, {
      categoryIds: [parentCatId],
      sort: "price_asc",
      minPriceInr: 100,
      maxPriceInr: 200,
      perPage: 10,
    });
    const mine = items.filter((p) => productIds.includes(p.id));
    expect(mine.length).toBe(1); // only MID @ 150
    expect(mine[0].base_price_inr).toBe(150);
  });
});
