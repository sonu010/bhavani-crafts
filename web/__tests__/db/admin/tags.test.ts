/**
 * Integration tests for admin tags (P2-T21).
 *
 * Covers:
 *   - listTagsWithCounts: includes product counts
 *   - createTag: happy path, slug collision, validation
 *   - renameTag: happy path, slug collision, not_found
 *   - softDeleteTag: marks deleted_at, idempotent
 *   - mergeTags: re-points product_tags, drops duplicates,
 *     soft-deletes source, rejects same-tag
 */
import { afterAll, describe, expect, it } from "vitest";
import {
  createTag,
  listTagsWithCounts,
  mergeTags,
  renameTag,
  softDeleteTag,
} from "@/lib/db/admin/tags";
import { srv } from "../_clients";

const tagIds: string[] = [];
const prodIds: string[] = [];
const catIds: string[] = [];

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

async function makeTag(name: string) {
  const slug = `zzz-fix-tag-${rid()}`;
  const r = await createTag(srv, { name, slug });
  if (!r.ok) throw new Error("setup tag failed");
  tagIds.push(r.id);
  return { id: r.id, name, slug };
}

async function makeCategory() {
  const { data, error } = await srv
    .from("categories")
    .insert({ slug: `zzz-tagcat-${rid()}`, name: "tagcat" })
    .select("id")
    .single();
  if (error) throw error;
  catIds.push(data.id);
  return data.id;
}

async function makeProduct(categoryId: string) {
  const { data, error } = await srv
    .from("products")
    .insert({
      sku: `ZZZ-TAG-${rid().toUpperCase()}`,
      slug: `zzz-tag-prod-${rid()}`,
      name: "tag fixture",
      base_price_inr: 100,
      stock_status: "unknown",
      category_id: categoryId,
      review_status: "draft",
      source: "manual",
    })
    .select("id")
    .single();
  if (error) throw error;
  prodIds.push(data.id);
  return data.id;
}

async function attachTag(productId: string, tagId: string) {
  const { error } = await srv
    .from("product_tags")
    .insert({ product_id: productId, tag_id: tagId });
  if (error) throw error;
}

describe("createTag", () => {
  it("creates a tag with auto-derived slug", async () => {
    const r = await createTag(srv, { name: `zzz new ${rid()}` });
    expect(r.ok).toBe(true);
    if (r.ok) tagIds.push(r.id);
  });

  it("rejects duplicate slug", async () => {
    const slug = `zzz-dup-${rid()}`;
    const a = await createTag(srv, { name: "zzz a", slug });
    expect(a.ok).toBe(true);
    if (a.ok) tagIds.push(a.id);
    const b = await createTag(srv, { name: "zzz b", slug });
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.error.code).toBe("slug_in_use");
  });

  it("rejects malformed slug", async () => {
    const r = await createTag(srv, { name: "zzz", slug: "Bad SLUG!" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("validation");
  });
});

describe("renameTag", () => {
  it("updates name + slug", async () => {
    const t = await makeTag("zzz orig");
    const r = await renameTag(srv, t.id, {
      name: "zzz renamed",
      slug: `zzz-renamed-${rid()}`,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.before.name).toBe("zzz orig");
      expect(r.after.name).toBe("zzz renamed");
    }
  });

  it("rejects collision with another tag's slug", async () => {
    const a = await makeTag("zzz a");
    const b = await makeTag("zzz b");
    const r = await renameTag(srv, b.id, { name: "zzz b2", slug: a.slug });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("slug_in_use");
  });
});

describe("softDeleteTag", () => {
  it("sets deleted_at; further calls return not_found", async () => {
    const t = await makeTag("zzz delete");
    const r1 = await softDeleteTag(srv, t.id);
    expect(r1.ok).toBe(true);
    const r2 = await softDeleteTag(srv, t.id);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error.code).toBe("not_found");
  });
});

describe("listTagsWithCounts", () => {
  it("returns product counts joined from product_tags", async () => {
    const t = await makeTag("zzz count");
    const cat = await makeCategory();
    const p1 = await makeProduct(cat);
    const p2 = await makeProduct(cat);
    await attachTag(p1, t.id);
    await attachTag(p2, t.id);

    const rows = await listTagsWithCounts(srv);
    const ours = rows.find((r) => r.id === t.id);
    expect(ours).toBeDefined();
    expect(ours?.product_count).toBe(2);
  });
});

describe("mergeTags", () => {
  it("re-points product_tags + soft-deletes source + counts duplicates", async () => {
    const cat = await makeCategory();
    const src = await makeTag("zzz merge-src");
    const tgt = await makeTag("zzz merge-tgt");

    const p1 = await makeProduct(cat); // only source-tagged
    const p2 = await makeProduct(cat); // only source-tagged
    const p3 = await makeProduct(cat); // tagged with BOTH (duplicate)

    await attachTag(p1, src.id);
    await attachTag(p2, src.id);
    await attachTag(p3, src.id);
    await attachTag(p3, tgt.id);

    const r = await mergeTags(srv, src.id, tgt.id);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.movedProductCount).toBe(2); // p1, p2
      expect(r.result.duplicateProductCount).toBe(1); // p3 already tagged
      expect(r.result.productIds.sort()).toEqual([p1, p2, p3].sort());
    }

    // Source links gone; target has all three products.
    const remaining = await srv
      .from("product_tags")
      .select("product_id, tag_id")
      .in("product_id", [p1, p2, p3]);
    const linksBySource = (remaining.data ?? []).filter(
      (r) => r.tag_id === src.id,
    );
    const linksByTarget = (remaining.data ?? []).filter(
      (r) => r.tag_id === tgt.id,
    );
    expect(linksBySource).toHaveLength(0);
    expect(linksByTarget).toHaveLength(3);

    // Source soft-deleted.
    const after = await srv
      .from("tags")
      .select("deleted_at")
      .eq("id", src.id)
      .single();
    expect(after.data?.deleted_at).not.toBeNull();
  });

  it("rejects merging a tag into itself", async () => {
    const t = await makeTag("zzz merge-self");
    const r = await mergeTags(srv, t.id, t.id);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("same_tag");
  });

  it("succeeds on a source with no products (soft-delete only)", async () => {
    const src = await makeTag("zzz merge-empty");
    const tgt = await makeTag("zzz merge-empty-tgt");
    const r = await mergeTags(srv, src.id, tgt.id);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.movedProductCount).toBe(0);
      expect(r.result.duplicateProductCount).toBe(0);
    }
    const after = await srv
      .from("tags")
      .select("deleted_at")
      .eq("id", src.id)
      .single();
    expect(after.data?.deleted_at).not.toBeNull();
  });
});
