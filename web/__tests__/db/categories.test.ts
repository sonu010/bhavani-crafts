import { describe, expect, test } from "vitest";
import { anon, srv } from "./_clients";
import {
  getCategoryBySlug,
  getCategoryTree,
  getDescendantIds,
  listTopLevelCategories,
} from "@/lib/db/categories";

describe("listTopLevelCategories (anon)", () => {
  test("returns at least one top-level category from the Just Kraft seed", async () => {
    const cats = await listTopLevelCategories(anon);
    expect(cats.length).toBeGreaterThan(0);
    for (const c of cats) {
      expect(c.parent_id).toBeNull();
      expect(c.slug.length).toBeGreaterThan(0);
    }
  });
});

describe("getCategoryBySlug (anon)", () => {
  test("returns null for an unknown slug", async () => {
    const c = await getCategoryBySlug(anon, "this-slug-does-not-exist-12345");
    expect(c).toBeNull();
  });

  test("returns the first top-level category by its slug", async () => {
    const all = await listTopLevelCategories(anon);
    if (all.length === 0) {
      // Skip — no seeded data; smoke-test path
      return;
    }
    const c = await getCategoryBySlug(anon, all[0].slug);
    expect(c?.id).toBe(all[0].id);
  });
});

describe("getDescendantIds via category_with_descendants view", () => {
  test("a category is its own descendant", async () => {
    const all = await listTopLevelCategories(anon);
    if (all.length === 0) return;
    const ids = await getDescendantIds(anon, all[0].id);
    expect(ids).toContain(all[0].id);
  });

  test("descendants of a deep tree we own roll up via the view", async () => {
    const { data: root } = await srv
      .from("categories")
      .insert({ slug: "zzz-desc-root", name: "Desc root" })
      .select("id")
      .single();
    const { data: mid } = await srv
      .from("categories")
      .insert({ slug: "zzz-desc-mid", name: "Desc mid", parent_id: root!.id })
      .select("id")
      .single();
    const { data: leaf } = await srv
      .from("categories")
      .insert({ slug: "zzz-desc-leaf", name: "Desc leaf", parent_id: mid!.id })
      .select("id")
      .single();

    const ids = await getDescendantIds(anon, root!.id);
    expect(new Set(ids)).toEqual(new Set([root!.id, mid!.id, leaf!.id]));

    await srv.from("categories").delete().in("id", [leaf!.id, mid!.id, root!.id]);
  });
});

describe("getCategoryTree (anon)", () => {
  test("returns a forest of root nodes with children populated", async () => {
    const tree = await getCategoryTree(anon);
    expect(tree.length).toBeGreaterThan(0);
    // At least one root should have children (from the Just Kraft seed).
    const totalDescendants = tree.reduce(
      (sum, node) => sum + countNodes(node),
      0,
    );
    expect(totalDescendants).toBeGreaterThan(tree.length);
  });
});

function countNodes(n: { children: typeof n[] }): number {
  return 1 + n.children.reduce((sum, c) => sum + countNodes(c), 0);
}
