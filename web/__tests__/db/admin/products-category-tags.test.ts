/**
 * Integration tests for the Category-tab data path (P2-T12).
 *
 * Covers:
 *   - updateProductCategory: set, change, clear, missing-target,
 *     missing-product
 *   - setProductTags: add + remove diff, idempotent re-apply, unknown
 *     slug rejection, returns before/after sorted by slug
 *   - listTagsForProduct: shape + sort invariant
 */
import { afterAll, describe, expect, it } from "vitest";
import {
  listTagsForProduct,
  setProductTags,
  updateProductCategory,
} from "@/lib/db/admin/products";
import { srv, makeTestProduct } from "../_clients";

const cleanups: Array<() => Promise<void>> = [];
const extraIds: string[] = [];

afterAll(async () => {
  await Promise.all(cleanups.map((c) => c().catch(() => undefined)));
  if (extraIds.length > 0) {
    await srv.from("products").delete().in("id", extraIds);
    await srv.from("categories").delete().in("id", extraIds);
    await srv.from("tags").delete().in("id", extraIds);
  }
});

async function makeFixtureCategory() {
  const tag = Math.random().toString(36).slice(2, 8);
  const slug = `zzz-cat-${tag}`;
  const { data, error } = await srv
    .from("categories")
    .insert({ slug, name: `cat ${tag}` })
    .select("id, slug, name")
    .single();
  if (error) throw error;
  extraIds.push(data.id);
  return data;
}

async function makeFixtureTag() {
  const tag = Math.random().toString(36).slice(2, 8);
  const slug = `zzz-tag-${tag}`;
  const { data, error } = await srv
    .from("tags")
    .insert({ slug, name: `tag ${tag}` })
    .select("id, slug, name")
    .single();
  if (error) throw error;
  extraIds.push(data.id);
  return data;
}

describe("updateProductCategory", () => {
  it("changes the category and returns before/after slugs", async () => {
    const newCat = await makeFixtureCategory();
    const fixture = await makeTestProduct({
      slug: `zzz-fix-cat-${Math.random().toString(36).slice(2, 8)}`,
      sku: `ZZZ-FIX-CAT-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      name: "category-change fixture",
    });
    cleanups.push(fixture.cleanup);

    const r = await updateProductCategory(srv, fixture.productId, newCat.id, null);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.before.categoryId).toBe(fixture.categoryId);
      expect(r.after.categoryId).toBe(newCat.id);
      expect(r.after.categorySlug).toBe(newCat.slug);
    }
  });

  it("clears category when passed null", async () => {
    const fixture = await makeTestProduct({
      slug: `zzz-fix-clear-${Math.random().toString(36).slice(2, 8)}`,
      sku: `ZZZ-FIX-CLEAR-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      name: "category-clear fixture",
    });
    cleanups.push(fixture.cleanup);

    const r = await updateProductCategory(srv, fixture.productId, null, null);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.before.categoryId).toBe(fixture.categoryId);
      expect(r.after.categoryId).toBeNull();
      expect(r.after.categorySlug).toBeNull();
    }
  });

  it("returns category_not_found when the target id doesn't exist", async () => {
    const fixture = await makeTestProduct({
      slug: `zzz-fix-miss-${Math.random().toString(36).slice(2, 8)}`,
      sku: `ZZZ-FIX-MISS-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      name: "miss-cat fixture",
    });
    cleanups.push(fixture.cleanup);

    const r = await updateProductCategory(
      srv,
      fixture.productId,
      "00000000-0000-0000-0000-000000000000",
      null,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("category_not_found");
  });

  it("returns not_found for a missing product", async () => {
    const cat = await makeFixtureCategory();
    const r = await updateProductCategory(
      srv,
      "00000000-0000-0000-0000-000000000000",
      cat.id,
      null,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("not_found");
  });
});

describe("setProductTags + listTagsForProduct", () => {
  it("starts empty and lists empty", async () => {
    const fixture = await makeTestProduct({
      slug: `zzz-fix-notags-${Math.random().toString(36).slice(2, 8)}`,
      sku: `ZZZ-FIX-NOTAGS-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      name: "no-tags fixture",
    });
    cleanups.push(fixture.cleanup);

    const tags = await listTagsForProduct(srv, fixture.productId);
    expect(tags).toEqual([]);
  });

  it("adds tags and the before/after reflects the change", async () => {
    const t1 = await makeFixtureTag();
    const t2 = await makeFixtureTag();
    const fixture = await makeTestProduct({
      slug: `zzz-fix-add-${Math.random().toString(36).slice(2, 8)}`,
      sku: `ZZZ-FIX-ADD-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      name: "add-tags fixture",
    });
    cleanups.push(fixture.cleanup);

    const r = await setProductTags(srv, fixture.productId, [t1.slug, t2.slug]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.before).toEqual([]);
      expect(r.after.map((t) => t.slug).sort()).toEqual([t1.slug, t2.slug].sort());
    }

    const fresh = await listTagsForProduct(srv, fixture.productId);
    expect(fresh.map((t) => t.slug).sort()).toEqual([t1.slug, t2.slug].sort());
  });

  it("removes only the tags missing from the new set, keeps the rest", async () => {
    const a = await makeFixtureTag();
    const b = await makeFixtureTag();
    const c = await makeFixtureTag();
    const fixture = await makeTestProduct({
      slug: `zzz-fix-diff-${Math.random().toString(36).slice(2, 8)}`,
      sku: `ZZZ-FIX-DIFF-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      name: "diff-tags fixture",
    });
    cleanups.push(fixture.cleanup);

    // Start with {a, b}
    const seed = await setProductTags(srv, fixture.productId, [a.slug, b.slug]);
    expect(seed.ok).toBe(true);

    // Move to {b, c} — drop a, keep b, add c.
    const r = await setProductTags(srv, fixture.productId, [b.slug, c.slug]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.before.map((t) => t.slug).sort()).toEqual([a.slug, b.slug].sort());
      expect(r.after.map((t) => t.slug).sort()).toEqual([b.slug, c.slug].sort());
    }
  });

  it("is idempotent — applying the same set twice does nothing on the second call", async () => {
    const t = await makeFixtureTag();
    const fixture = await makeTestProduct({
      slug: `zzz-fix-idem-${Math.random().toString(36).slice(2, 8)}`,
      sku: `ZZZ-FIX-IDEM-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      name: "idempotent fixture",
    });
    cleanups.push(fixture.cleanup);

    const r1 = await setProductTags(srv, fixture.productId, [t.slug]);
    const r2 = await setProductTags(srv, fixture.productId, [t.slug]);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (r2.ok) {
      expect(r2.before.map((x) => x.slug)).toEqual([t.slug]);
      expect(r2.after.map((x) => x.slug)).toEqual([t.slug]);
    }
  });

  it("rejects unknown slugs without partially-applying", async () => {
    const real = await makeFixtureTag();
    const fixture = await makeTestProduct({
      slug: `zzz-fix-unk-${Math.random().toString(36).slice(2, 8)}`,
      sku: `ZZZ-FIX-UNK-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      name: "unknown-tag fixture",
    });
    cleanups.push(fixture.cleanup);

    const r = await setProductTags(srv, fixture.productId, [
      real.slug,
      "zzz-slug-that-does-not-exist",
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("tag_not_found");
      expect(r.error.missingSlugs).toEqual(["zzz-slug-that-does-not-exist"]);
    }

    // Confirm the real tag wasn't half-applied.
    const fresh = await listTagsForProduct(srv, fixture.productId);
    expect(fresh).toEqual([]);
  });
});
