/**
 * Integration tests for bulk-move products between categories (P2-T20).
 */
import { afterAll, describe, expect, it } from "vitest";
import {
  moveProductsBetweenCategories,
  previewMoveCount,
} from "@/lib/db/admin/categories";
import { srv } from "../_clients";

const catIds: string[] = [];
const prodIds: string[] = [];

afterAll(async () => {
  if (prodIds.length > 0) {
    await srv.from("products").delete().in("id", prodIds);
  }
  if (catIds.length > 0) {
    await srv.from("categories").delete().in("id", catIds);
  }
});

function rid() {
  return Math.random().toString(36).slice(2, 10);
}

async function makeCategory(name: string, parentId: string | null = null) {
  const slug = `zzz-fix-mov-${rid()}`;
  const { data, error } = await srv
    .from("categories")
    .insert({ slug, name, parent_id: parentId })
    .select("id, slug")
    .single();
  if (error) throw error;
  catIds.push(data.id);
  return data;
}

async function makeProduct(
  categoryId: string,
  reviewStatus: "draft" | "needs_review" | "published" = "draft",
) {
  const { data, error } = await srv
    .from("products")
    .insert({
      sku: `ZZZ-MOV-${rid().toUpperCase()}`,
      slug: `zzz-mov-${rid()}`,
      name: "move fixture",
      base_price_inr: 100,
      stock_status: "unknown",
      category_id: categoryId,
      review_status: reviewStatus,
      // Trigger requires (review_status=published) iff (is_published=true).
      // Keep the pair consistent for fixture rows.
      is_published: reviewStatus === "published",
      source: "manual",
    })
    .select("id")
    .single();
  if (error) throw error;
  prodIds.push(data.id);
  return data;
}

describe("previewMoveCount", () => {
  it("counts directly-attached products", async () => {
    const cat = await makeCategory("zzz prev");
    await makeProduct(cat.id);
    await makeProduct(cat.id);
    const n = await previewMoveCount(srv, cat.id, {});
    expect(n).toBe(2);
  });

  it("filters by review_status", async () => {
    const cat = await makeCategory("zzz prev-filt");
    await makeProduct(cat.id, "draft");
    await makeProduct(cat.id, "draft");
    await makeProduct(cat.id, "published");
    const allCount = await previewMoveCount(srv, cat.id, {});
    expect(allCount).toBe(3);
    const draftsOnly = await previewMoveCount(srv, cat.id, {
      statuses: ["draft"],
    });
    expect(draftsOnly).toBe(2);
  });
});

describe("moveProductsBetweenCategories", () => {
  it("moves matching products and returns the affected ids", async () => {
    const src = await makeCategory("zzz mov-src");
    const tgt = await makeCategory("zzz mov-tgt");
    const p1 = await makeProduct(src.id);
    const p2 = await makeProduct(src.id);

    const r = await moveProductsBetweenCategories(srv, src.id, tgt.id, {});
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.moved).toBe(2);
      expect(r.result.productIds.sort()).toEqual([p1.id, p2.id].sort());
    }

    const after = await srv
      .from("products")
      .select("category_id")
      .in("id", [p1.id, p2.id]);
    expect(after.data?.every((p) => p.category_id === tgt.id)).toBe(true);
  });

  it("respects status filter — only matching products move", async () => {
    const src = await makeCategory("zzz mov-filt-src");
    const tgt = await makeCategory("zzz mov-filt-tgt");
    const draft = await makeProduct(src.id, "draft");
    const pub = await makeProduct(src.id, "published");

    const r = await moveProductsBetweenCategories(srv, src.id, tgt.id, {
      statuses: ["draft"],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.moved).toBe(1);
      expect(r.result.productIds).toEqual([draft.id]);
    }

    const after = await srv
      .from("products")
      .select("id, category_id")
      .in("id", [draft.id, pub.id]);
    const byId = new Map(after.data?.map((p) => [p.id, p.category_id]));
    expect(byId.get(draft.id)).toBe(tgt.id);
    expect(byId.get(pub.id)).toBe(src.id);
  });

  it("rejects same source + target", async () => {
    const cat = await makeCategory("zzz mov-same");
    await makeProduct(cat.id);
    const r = await moveProductsBetweenCategories(srv, cat.id, cat.id, {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("same_category");
  });

  it("rejects target that is a descendant of source", async () => {
    const top = await makeCategory("zzz mov-top");
    const child = await makeCategory("zzz mov-child", top.id);
    await makeProduct(top.id);
    const r = await moveProductsBetweenCategories(srv, top.id, child.id, {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("target_is_descendant");
  });

  it("returns nothing_to_move when filters match no rows", async () => {
    const src = await makeCategory("zzz mov-empty");
    const tgt = await makeCategory("zzz mov-empty-tgt");
    await makeProduct(src.id, "draft");
    const r = await moveProductsBetweenCategories(srv, src.id, tgt.id, {
      statuses: ["archived"],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("nothing_to_move");
  });

  it("returns target_not_found for missing target", async () => {
    const src = await makeCategory("zzz mov-missing-tgt");
    await makeProduct(src.id);
    const r = await moveProductsBetweenCategories(
      srv,
      src.id,
      "00000000-0000-0000-0000-000000000000",
      {},
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("target_not_found");
  });
});
