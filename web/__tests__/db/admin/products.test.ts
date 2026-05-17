/**
 * Integration tests for listProductsAdmin + countProductsByStatus.
 *
 * Pins three contracts that the storefront `listProducts` doesn't cover:
 *   - status filter narrows correctly (review_status, not is_published)
 *   - cursor advances forward stably across (created_at, id) ties
 *   - soft-deleted rows never surface
 */
import { afterAll, describe, expect, it } from "vitest";
import {
  countProductsByStatus,
  decodeCursor,
  encodeCursor,
  listProductsAdmin,
  type AdminCursor,
} from "@/lib/db/admin/products";
import { srv } from "../_clients";

const FIXTURE_PREFIX = "zzz-fixture-admlist-";
const fixtureCategoryIds: string[] = [];
const fixtureProductIds: string[] = [];

afterAll(async () => {
  if (fixtureProductIds.length > 0) {
    await srv.from("products").delete().in("id", fixtureProductIds);
  }
  if (fixtureCategoryIds.length > 0) {
    await srv.from("categories").delete().in("id", fixtureCategoryIds);
  }
});

async function makeCategory() {
  const slug = `${FIXTURE_PREFIX}cat-${Math.random().toString(36).slice(2, 8)}`;
  const { data, error } = await srv
    .from("categories")
    .insert({ slug, name: slug })
    .select("id")
    .single();
  if (error) throw error;
  fixtureCategoryIds.push(data.id);
  return data.id;
}

async function makeProduct(opts: {
  status: "draft" | "needs_review" | "ready_to_publish" | "published" | "archived";
  isPublished?: boolean;
  deleted?: boolean;
  name?: string;
}) {
  const tag = Math.random().toString(36).slice(2, 8);
  const categoryId = await makeCategory();
  const isPublished = opts.isPublished ?? opts.status === "published";
  const { data, error } = await srv
    .from("products")
    .insert({
      sku: `${FIXTURE_PREFIX}sku-${tag}`,
      slug: `${FIXTURE_PREFIX}prod-${tag}`,
      name: opts.name ?? `${FIXTURE_PREFIX}name ${tag}`,
      base_price_inr: 100,
      stock_status: "in_stock",
      category_id: categoryId,
      review_status: opts.status,
      is_published: isPublished,
      source: "manual",
      deleted_at: opts.deleted ? new Date().toISOString() : null,
    })
    .select("id")
    .single();
  if (error) throw error;
  fixtureProductIds.push(data.id);
  return data.id;
}

describe("listProductsAdmin", () => {
  it("status filter narrows results to that review_status", async () => {
    const draftId = await makeProduct({ status: "draft" });
    const needsReviewId = await makeProduct({ status: "needs_review" });

    const drafts = await listProductsAdmin(srv, { status: "draft", perPage: 100 });
    const reviews = await listProductsAdmin(srv, { status: "needs_review", perPage: 100 });

    expect(drafts.items.find((p) => p.id === draftId)).toBeDefined();
    expect(drafts.items.find((p) => p.id === needsReviewId)).toBeUndefined();
    expect(reviews.items.find((p) => p.id === needsReviewId)).toBeDefined();
    expect(reviews.items.find((p) => p.id === draftId)).toBeUndefined();
  });

  it("includes unpublished rows (admin sees the lifecycle, not the public view)", async () => {
    const unpublishedId = await makeProduct({
      status: "needs_review",
      isPublished: false,
    });
    const result = await listProductsAdmin(srv, { status: "needs_review", perPage: 100 });
    const row = result.items.find((p) => p.id === unpublishedId);
    expect(row).toBeDefined();
    expect(row!.is_published).toBe(false);
  });

  it("excludes soft-deleted rows", async () => {
    const deletedId = await makeProduct({ status: "draft", deleted: true });
    const result = await listProductsAdmin(srv, { status: "draft", perPage: 100 });
    expect(result.items.find((p) => p.id === deletedId)).toBeUndefined();
  });

  it("advances the cursor forward across pages", async () => {
    // Make 3 fresh rows we know land at the top of the newest-sorted list.
    await Promise.all([
      makeProduct({ status: "draft" }),
      makeProduct({ status: "draft" }),
      makeProduct({ status: "draft" }),
    ]);

    const page1 = await listProductsAdmin(srv, {
      status: "draft",
      perPage: 1,
      sort: "newest",
    });
    expect(page1.items).toHaveLength(1);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await listProductsAdmin(srv, {
      status: "draft",
      perPage: 1,
      sort: "newest",
      cursor: page1.nextCursor,
    });
    expect(page2.items).toHaveLength(1);
    // Cursor moved forward — page2's row is older than page1's row OR has a
    // smaller id at the same timestamp.
    expect(page2.items[0].id).not.toBe(page1.items[0].id);
    expect(
      page2.items[0].created_at <= page1.items[0].created_at,
    ).toBe(true);
  });
});

describe("countProductsByStatus", () => {
  it("returns counts for all five statuses; numbers track our inserts", async () => {
    const before = await countProductsByStatus(srv);
    await makeProduct({ status: "needs_review" });
    await makeProduct({ status: "needs_review" });
    await makeProduct({ status: "draft" });

    const after = await countProductsByStatus(srv);
    expect(after.needs_review).toBe(before.needs_review + 2);
    expect(after.draft).toBe(before.draft + 1);
    expect(after.published).toBe(before.published);
    expect(after.ready_to_publish).toBe(before.ready_to_publish);
    expect(after.archived).toBe(before.archived);
  });
});

describe("cursor encoding", () => {
  it("encode → decode round-trips", () => {
    const c: AdminCursor = { primary: "2026-05-17T00:00:00Z", id: "uuid-xyz" };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
  });

  it("returns null on undefined / malformed input", () => {
    expect(decodeCursor(undefined)).toBeNull();
    expect(decodeCursor("")).toBeNull();
    expect(decodeCursor("not-base64")).toBeNull();
    expect(decodeCursor(Buffer.from("{}", "utf8").toString("base64"))).toBeNull();
  });
});
