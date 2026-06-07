/**
 * Pins for two filter extensions added by the dashboard-catalog-widget
 * polish: the `uncategorized: true` flag on `listProductsAdmin`, and
 * the contract that omitting `status` doesn't impose one (it lets the
 * widget links land on a status-agnostic view).
 *
 * The `?status=all` URL → `pickStatus` returns `undefined` →
 * `listProductsAdmin({ status: undefined })` reads across statuses.
 * This test exercises the data-layer side of that.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { srv } from "./_clients";
import { listProductsAdmin } from "@/lib/db/admin/products";

const TAG = `zzz-filter-extra-${Date.now()}`;
let categoryId: string;
let categorizedId: string;
let uncategorizedId: string;
let draftId: string;

beforeAll(async () => {
  const { data: cat } = await srv
    .from("categories")
    .insert({ slug: `${TAG}-cat`, name: `${TAG} cat` })
    .select("id")
    .single();
  categoryId = cat!.id as string;

  // Three fixtures:
  //   - categorizedId: status=needs_review, has a category
  //   - uncategorizedId: status=needs_review, no category
  //   - draftId: status=draft, has a category
  const { data: prods } = await srv
    .from("products")
    .insert([
      {
        sku: `${TAG.toUpperCase()}-CAT`,
        slug: `${TAG}-cat-prod`,
        name: `${TAG} categorized`,
        base_price_inr: 100,
        stock_status: "in_stock" as const,
        category_id: categoryId,
        is_published: false,
        review_status: "needs_review" as const,
        source: "manual" as const,
      },
      {
        sku: `${TAG.toUpperCase()}-UNCAT`,
        slug: `${TAG}-uncat-prod`,
        name: `${TAG} uncategorized`,
        base_price_inr: 100,
        stock_status: "in_stock" as const,
        category_id: null,
        is_published: false,
        review_status: "needs_review" as const,
        source: "manual" as const,
      },
      {
        sku: `${TAG.toUpperCase()}-DRFT`,
        slug: `${TAG}-draft-prod`,
        name: `${TAG} draft`,
        base_price_inr: 100,
        stock_status: "in_stock" as const,
        category_id: categoryId,
        is_published: false,
        review_status: "draft" as const,
        source: "manual" as const,
      },
    ])
    .select("id, sku");
  categorizedId = (prods ?? []).find((p) =>
    (p.sku as string).endsWith("-CAT"),
  )!.id as string;
  uncategorizedId = (prods ?? []).find((p) =>
    (p.sku as string).endsWith("-UNCAT"),
  )!.id as string;
  draftId = (prods ?? []).find((p) =>
    (p.sku as string).endsWith("-DRFT"),
  )!.id as string;
}, 60_000);

afterAll(async () => {
  await srv
    .from("products")
    .delete()
    .in("id", [categorizedId, uncategorizedId, draftId]);
  await srv.from("categories").delete().eq("id", categoryId);
}, 60_000);

describe("listProductsAdmin — uncategorized + status omitted", () => {
  it("uncategorized=true narrows to category_id IS NULL", async () => {
    const { items } = await listProductsAdmin(srv, {
      status: "needs_review",
      uncategorized: true,
      perPage: 50,
    });
    const ours = items.filter((p) => p.id === uncategorizedId);
    expect(ours).toHaveLength(1);
    // Categorized one with same status must NOT appear.
    expect(items.some((p) => p.id === categorizedId)).toBe(false);
  });

  it("uncategorized=true + status=draft excludes our uncategorised needs_review row", async () => {
    const { items } = await listProductsAdmin(srv, {
      status: "draft",
      uncategorized: true,
      perPage: 50,
    });
    // No draft+uncategorized fixtures in this suite → our uncat needs_review one isn't here.
    expect(items.some((p) => p.id === uncategorizedId)).toBe(false);
  });

  it("status omitted (status=undefined) reads across all statuses for the category", async () => {
    // Both needs_review (categorized) and draft for this category should be returned.
    const { items } = await listProductsAdmin(srv, {
      categoryId,
      perPage: 50,
    });
    const ids = items.map((p) => p.id);
    expect(ids).toContain(categorizedId);
    expect(ids).toContain(draftId);
  });

  it("categoryId beats uncategorized when both are set (specific filter wins)", async () => {
    const { items } = await listProductsAdmin(srv, {
      categoryId,
      uncategorized: true,
      status: "needs_review",
      perPage: 50,
    });
    const ids = items.map((p) => p.id);
    // Categorized one inside the category should appear.
    expect(ids).toContain(categorizedId);
    // Uncategorised one should NOT (the category filter narrowed to descendants).
    expect(ids).not.toContain(uncategorizedId);
  });
});
