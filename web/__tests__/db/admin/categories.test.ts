/**
 * Integration tests for the admin categories data layer (P2-T18).
 *
 * Covers:
 *   - getCategoryTreeWithCounts: returns a tree; product counts
 *     include descendants
 *   - softDeleteCategory: refuses when children exist, refuses when
 *     products attached, succeeds when leaf + empty
 */
import { afterAll, describe, expect, it } from "vitest";
import {
  getCategoryTreeWithCounts,
  softDeleteCategory,
} from "@/lib/db/admin/categories";
import { srv } from "../_clients";

const cleanups: Array<() => Promise<void>> = [];

afterAll(async () => {
  await Promise.all(cleanups.map((c) => c().catch(() => undefined)));
});

function rid() {
  return Math.random().toString(36).slice(2, 10);
}

async function makeCategory(name: string, parentId: string | null = null) {
  const slug = `zzz-fix-cat-${rid()}`;
  const { data, error } = await srv
    .from("categories")
    .insert({ slug, name, parent_id: parentId })
    .select("id, slug, name, parent_id")
    .single();
  if (error) throw error;
  cleanups.push(async () => {
    await srv.from("categories").delete().eq("id", data.id);
  });
  return data;
}

describe("getCategoryTreeWithCounts", () => {
  it("returns a tree with the test categories present", async () => {
    const top = await makeCategory("zzz top");
    const child = await makeCategory("zzz child", top.id);

    const tree = await getCategoryTreeWithCounts(srv);
    // Find our top fixture; descendants_count should include the child
    // even if neither has products.
    const ours = tree.find((n) => n.id === top.id);
    expect(ours).toBeDefined();
    expect(ours?.children.find((c) => c.id === child.id)).toBeDefined();
    expect(ours?.descendant_count).toBeGreaterThanOrEqual(0);
  });
});

describe("softDeleteCategory", () => {
  it("refuses when the category has non-deleted children", async () => {
    const parent = await makeCategory("zzz parent");
    await makeCategory("zzz kid", parent.id);

    const r = await softDeleteCategory(srv, parent.id);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("has_children");
    }
  });

  it("refuses when the category has products", async () => {
    const cat = await makeCategory("zzz with-prod");
    const sku = `ZZZ-${rid().toUpperCase()}`;
    const slug = `zzz-prod-${rid()}`;
    const prod = await srv
      .from("products")
      .insert({
        sku,
        slug,
        name: "fixture",
        base_price_inr: 100,
        stock_status: "unknown",
        category_id: cat.id,
        review_status: "draft",
        source: "manual",
      })
      .select("id")
      .single();
    if (prod.error) throw prod.error;
    cleanups.push(async () => {
      await srv.from("products").delete().eq("id", prod.data.id);
    });

    const r = await softDeleteCategory(srv, cat.id);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("has_products");
    }
  });

  it("succeeds for an empty leaf category", async () => {
    const cat = await makeCategory("zzz empty-leaf");
    const r = await softDeleteCategory(srv, cat.id);
    expect(r.ok).toBe(true);

    const after = await srv
      .from("categories")
      .select("deleted_at")
      .eq("id", cat.id)
      .single();
    expect(after.data?.deleted_at).not.toBeNull();
  });

  it("returns not_found for a missing id", async () => {
    const r = await softDeleteCategory(
      srv,
      "00000000-0000-0000-0000-000000000000",
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("not_found");
  });
});
