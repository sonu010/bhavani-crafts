/**
 * Integration tests for the q / categoryId / tagSlugs / stock / source
 * filter axes added to listProductsAdmin in P2-T08.
 *
 * Each test creates dedicated fixtures so we can assert presence /
 * absence against a known set.
 */
import { afterAll, describe, expect, it } from "vitest";
import {
  getAdminFilterOptions,
  listProductsAdmin,
} from "@/lib/db/admin/products";
import { srv } from "../_clients";

const FIXTURE_PREFIX = "zzz-fixture-filt-";

const productIds: string[] = [];
const categoryIds: string[] = [];
const tagIds: string[] = [];

afterAll(async () => {
  if (productIds.length > 0) await srv.from("products").delete().in("id", productIds);
  if (tagIds.length > 0) await srv.from("tags").delete().in("id", tagIds);
  if (categoryIds.length > 0) await srv.from("categories").delete().in("id", categoryIds);
});

async function makeCategory(parentId: string | null = null) {
  const slug = `${FIXTURE_PREFIX}cat-${Math.random().toString(36).slice(2, 8)}`;
  const { data, error } = await srv
    .from("categories")
    .insert({ slug, name: slug, parent_id: parentId })
    .select("id")
    .single();
  if (error) throw error;
  categoryIds.push(data.id);
  return data.id;
}

async function makeTag(name: string) {
  const slug = `${FIXTURE_PREFIX}tag-${name}-${Math.random().toString(36).slice(2, 6)}`;
  const { data, error } = await srv
    .from("tags")
    .insert({ slug, name })
    .select("id, slug")
    .single();
  if (error) throw error;
  tagIds.push(data.id);
  return data;
}

async function makeProduct(opts: {
  name?: string;
  slug?: string;
  sku?: string;
  categoryId?: string;
  stock?: "in_stock" | "out_of_stock" | "low_stock" | "made_to_order" | "unknown";
  source?: "manual" | "justkraft_seed" | "csv_import" | "ai_assisted";
  tagIds?: string[];
}) {
  const tag = Math.random().toString(36).slice(2, 8);
  const categoryId = opts.categoryId ?? (await makeCategory());
  const { data, error } = await srv
    .from("products")
    .insert({
      sku: opts.sku ?? `${FIXTURE_PREFIX}sku-${tag}`,
      slug: opts.slug ?? `${FIXTURE_PREFIX}prod-${tag}`,
      name: opts.name ?? `${FIXTURE_PREFIX}name ${tag}`,
      base_price_inr: 100,
      stock_status: opts.stock ?? "in_stock",
      category_id: categoryId,
      review_status: "needs_review",
      is_published: false,
      source: opts.source ?? "manual",
    })
    .select("id")
    .single();
  if (error) throw error;
  productIds.push(data.id);

  if (opts.tagIds && opts.tagIds.length > 0) {
    const rows = opts.tagIds.map((tagId) => ({ product_id: data.id, tag_id: tagId }));
    const { error: linkErr } = await srv.from("product_tags").insert(rows);
    if (linkErr) throw linkErr;
  }
  return data.id;
}

describe("listProductsAdmin filters", () => {
  it("q matches slug ILIKE", async () => {
    const tag = Math.random().toString(36).slice(2, 8);
    const slug = `${FIXTURE_PREFIX}slug-search-${tag}`;
    const id = await makeProduct({ slug });
    const otherId = await makeProduct({}); // no match

    const r = await listProductsAdmin(srv, { q: `slug-search-${tag}`, perPage: 100 });
    expect(r.items.find((p) => p.id === id)).toBeDefined();
    expect(r.items.find((p) => p.id === otherId)).toBeUndefined();
  });

  it("q matches sku ILIKE (partial)", async () => {
    const tag = Math.random().toString(36).slice(2, 8);
    const sku = `${FIXTURE_PREFIX}SKU-PARTIAL-${tag}`;
    const id = await makeProduct({ sku });

    const r = await listProductsAdmin(srv, { q: `PARTIAL-${tag}`, perPage: 100 });
    expect(r.items.find((p) => p.id === id)).toBeDefined();
  });

  it("categoryId narrows to category + descendants (uses 0007 view)", async () => {
    const parentId = await makeCategory();
    const childId = await makeCategory(parentId);
    const inParent = await makeProduct({ categoryId: parentId });
    const inChild = await makeProduct({ categoryId: childId });
    const outside = await makeProduct({}); // fresh, unrelated category

    const r = await listProductsAdmin(srv, { categoryId: parentId, perPage: 100 });
    expect(r.items.find((p) => p.id === inParent)).toBeDefined();
    expect(r.items.find((p) => p.id === inChild)).toBeDefined();
    expect(r.items.find((p) => p.id === outside)).toBeUndefined();
  });

  it("tagSlugs filter: OR-semantics across selected tags", async () => {
    const tagEco = await makeTag("eco");
    const tagPop = await makeTag("popular");
    const hasEco = await makeProduct({ tagIds: [tagEco.id] });
    const hasPop = await makeProduct({ tagIds: [tagPop.id] });
    const hasNeither = await makeProduct({});

    const r = await listProductsAdmin(srv, {
      tagSlugs: [tagEco.slug, tagPop.slug],
      perPage: 100,
    });
    expect(r.items.find((p) => p.id === hasEco)).toBeDefined();
    expect(r.items.find((p) => p.id === hasPop)).toBeDefined();
    expect(r.items.find((p) => p.id === hasNeither)).toBeUndefined();
  });

  it("stock + source filters narrow as expected", async () => {
    const inStock = await makeProduct({ stock: "in_stock", source: "manual" });
    const outStock = await makeProduct({ stock: "out_of_stock", source: "manual" });
    const inStockCsv = await makeProduct({ stock: "in_stock", source: "csv_import" });

    const r1 = await listProductsAdmin(srv, { stock: "out_of_stock", perPage: 100 });
    expect(r1.items.find((p) => p.id === outStock)).toBeDefined();
    expect(r1.items.find((p) => p.id === inStock)).toBeUndefined();

    const r2 = await listProductsAdmin(srv, { source: "csv_import", perPage: 100 });
    expect(r2.items.find((p) => p.id === inStockCsv)).toBeDefined();
    expect(r2.items.find((p) => p.id === inStock)).toBeUndefined();
  });

  it("filters compose: q + tagSlugs intersect (AND across axes, OR within tag axis)", async () => {
    const tag = Math.random().toString(36).slice(2, 8);
    const tagOnly = await makeTag(`needle-${tag}`);

    const matching = await makeProduct({
      slug: `${FIXTURE_PREFIX}haystack-${tag}-a`,
      tagIds: [tagOnly.id],
    });
    const slugOnly = await makeProduct({
      slug: `${FIXTURE_PREFIX}haystack-${tag}-b`,
    });
    const tagOnlyProd = await makeProduct({ tagIds: [tagOnly.id] });

    const r = await listProductsAdmin(srv, {
      q: `haystack-${tag}`,
      tagSlugs: [tagOnly.slug],
      perPage: 100,
    });
    expect(r.items.find((p) => p.id === matching)).toBeDefined();
    expect(r.items.find((p) => p.id === slugOnly)).toBeUndefined();
    expect(r.items.find((p) => p.id === tagOnlyProd)).toBeUndefined();
  });
});

describe("getAdminFilterOptions", () => {
  it("returns top-level categories + every tag", async () => {
    const { categories, tags } = await getAdminFilterOptions(srv);
    expect(Array.isArray(categories)).toBe(true);
    expect(Array.isArray(tags)).toBe(true);
    expect(categories.length).toBeGreaterThan(0);
    expect(categories[0]).toMatchObject({
      id: expect.any(String),
      slug: expect.any(String),
      name: expect.any(String),
    });
  });
});
