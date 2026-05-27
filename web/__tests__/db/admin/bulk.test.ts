/**
 * Integration tests for the bulk-mutation helpers (P2-T09).
 */
import { afterAll, describe, expect, it } from "vitest";
import {
  applyBulkAddTag,
  applyBulkRemoveTag,
  applyBulkSoftDelete,
  applyBulkUpdate,
  readProductsForBulk,
} from "@/lib/db/admin/bulk";
import { srv } from "../_clients";

const prodIds: string[] = [];
const catIds: string[] = [];
const tagIds: string[] = [];

afterAll(async () => {
  if (prodIds.length > 0) {
    await srv.from("products").delete().in("id", prodIds);
  }
  if (catIds.length > 0) {
    await srv.from("categories").delete().in("id", catIds);
  }
  if (tagIds.length > 0) {
    await srv.from("tags").delete().in("id", tagIds);
  }
});

function rid() {
  return Math.random().toString(36).slice(2, 10);
}

async function makeCategory(name = "zzz bulk cat") {
  const { data, error } = await srv
    .from("categories")
    .insert({ slug: `zzz-bulk-cat-${rid()}`, name })
    .select("id")
    .single();
  if (error) throw error;
  catIds.push(data.id);
  return data.id;
}

async function makeTag(name = "zzz bulk tag") {
  const { data, error } = await srv
    .from("tags")
    .insert({ slug: `zzz-bulk-tag-${rid()}`, name })
    .select("id")
    .single();
  if (error) throw error;
  tagIds.push(data.id);
  return data.id;
}

async function makeProduct(categoryId: string) {
  const { data, error } = await srv
    .from("products")
    .insert({
      sku: `ZZZ-BULK-${rid().toUpperCase()}`,
      slug: `zzz-bulk-prod-${rid()}`,
      name: "bulk fixture",
      base_price_inr: 100,
      stock_status: "unknown",
      category_id: categoryId,
      review_status: "draft",
      is_published: false,
      source: "manual",
    })
    .select("id")
    .single();
  if (error) throw error;
  prodIds.push(data.id);
  return data.id;
}

describe("readProductsForBulk", () => {
  it("returns the live (non-deleted) rows for the requested ids", async () => {
    const cat = await makeCategory();
    const a = await makeProduct(cat);
    const b = await makeProduct(cat);
    const rows = await readProductsForBulk(srv, [a, b]);
    expect(rows.map((r) => r.id).sort()).toEqual([a, b].sort());
  });

  it("skips soft-deleted rows", async () => {
    const cat = await makeCategory();
    const a = await makeProduct(cat);
    await srv
      .from("products")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", a);
    const rows = await readProductsForBulk(srv, [a]);
    expect(rows).toHaveLength(0);
  });
});

describe("applyBulkUpdate", () => {
  it("publishes a batch", async () => {
    const cat = await makeCategory();
    const a = await makeProduct(cat);
    const b = await makeProduct(cat);
    const touched = await applyBulkUpdate(srv, [a, b], {
      is_published: true,
      review_status: "published",
    });
    expect(touched).toBe(2);

    const after = await srv
      .from("products")
      .select("id, is_published, review_status")
      .in("id", [a, b]);
    expect(after.data?.every((r) => r.is_published)).toBe(true);
    expect(after.data?.every((r) => r.review_status === "published")).toBe(true);
  });

  it("moves products to a new category", async () => {
    const cat = await makeCategory();
    const target = await makeCategory("zzz bulk tgt");
    const a = await makeProduct(cat);
    const b = await makeProduct(cat);
    const touched = await applyBulkUpdate(srv, [a, b], { category_id: target });
    expect(touched).toBe(2);
    const after = await srv
      .from("products")
      .select("category_id")
      .in("id", [a, b]);
    expect(after.data?.every((r) => r.category_id === target)).toBe(true);
  });

  it("noops on an empty id list", async () => {
    const touched = await applyBulkUpdate(srv, [], { is_published: true });
    expect(touched).toBe(0);
  });
});

describe("applyBulkSoftDelete", () => {
  it("sets deleted_at on every id and is idempotent", async () => {
    const cat = await makeCategory();
    const a = await makeProduct(cat);
    const b = await makeProduct(cat);
    const touched = await applyBulkSoftDelete(srv, [a, b], null);
    expect(touched).toBe(2);
    const after = await srv
      .from("products")
      .select("deleted_at")
      .in("id", [a, b]);
    expect(after.data?.every((r) => r.deleted_at !== null)).toBe(true);

    // Second call touches zero (the predicate filters out already-
    // deleted rows).
    const again = await applyBulkSoftDelete(srv, [a, b], null);
    expect(again).toBe(0);
  });
});

describe("applyBulkAddTag / applyBulkRemoveTag", () => {
  it("adds a tag to multiple products and removes it cleanly", async () => {
    const cat = await makeCategory();
    const tag = await makeTag();
    const a = await makeProduct(cat);
    const b = await makeProduct(cat);

    const added = await applyBulkAddTag(srv, [a, b], tag);
    expect(added).toBe(2);
    const linked = await srv
      .from("product_tags")
      .select("product_id")
      .eq("tag_id", tag);
    expect((linked.data ?? []).length).toBe(2);

    // Idempotent: re-adding produces no extra rows.
    const reAdded = await applyBulkAddTag(srv, [a, b], tag);
    expect(reAdded).toBe(0);

    const removed = await applyBulkRemoveTag(srv, [a, b], tag);
    expect(removed).toBe(2);
    const after = await srv
      .from("product_tags")
      .select("product_id")
      .eq("tag_id", tag);
    expect((after.data ?? []).length).toBe(0);
  });
});
