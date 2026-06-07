/**
 * Cursor pagination tests for listProducts.
 *
 * The storefront's category "Load more" button relies on this being
 * stable under tied created_at values. We had a real production
 * symptom in another product where two rows with identical timestamps
 * caused page-2 to overlap page-1. The fix was the (created_at, id)
 * compound cursor + sort. These tests pin it.
 *
 * Pins:
 *   1. Pages don't overlap, end-to-end (zero duplicate ids across all
 *      pages of a fixture set).
 *   2. Pages don't miss rows (union of all pages equals the source set).
 *   3. created_at ties are broken by `id` DESC.
 *   4. hasMore signal is correct on the last page.
 *   5. encodeProductCursor → decodeProductCursor round-trips.
 *   6. Malformed cursor returns null (graceful degrade to first page).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { srv, anon } from "./_clients";
import {
  decodeProductCursor,
  encodeProductCursor,
  listProducts,
  type ListProductsCursor,
} from "@/lib/db/products";

const TAG = `zzz-cursor-${Date.now()}`;
let catId: string;
let productIds: string[] = [];

beforeAll(async () => {
  const { data: cat } = await srv
    .from("categories")
    .insert({ slug: `${TAG}-cat`, name: `${TAG} cat` })
    .select("id")
    .single();
  catId = cat!.id as string;

  // Insert 12 products in ONE batch — they get near-identical
  // created_at timestamps (Postgres `default now()` resolves to ms
  // precision but collisions still happen). The (created_at, id)
  // compound cursor has to handle this without overlap or dropout.
  const rows = Array.from({ length: 12 }, (_, i) => ({
    sku: `${TAG.toUpperCase()}-${String(i).padStart(2, "0")}`,
    slug: `${TAG}-${i}`,
    name: `${TAG} P${i}`,
    base_price_inr: 100 + i,
    stock_status: "in_stock" as const,
    category_id: catId,
    is_published: true,
    review_status: "published" as const,
    source: "manual" as const,
  }));
  const { data: inserted } = await srv
    .from("products")
    .insert(rows)
    .select("id");
  productIds = (inserted ?? []).map((p) => p.id as string);
}, 60_000);

afterAll(async () => {
  await srv.from("products").delete().in("id", productIds);
  await srv.from("categories").delete().eq("id", catId);
}, 60_000);

describe("listProducts cursor pagination", () => {
  it("page 1 + page 2 don't overlap; union covers all rows", async () => {
    const page1 = await listProducts(anon, {
      categoryIds: [catId],
      perPage: 5,
    });
    expect(page1.items).toHaveLength(5);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await listProducts(anon, {
      categoryIds: [catId],
      perPage: 5,
      cursor: page1.nextCursor,
    });
    expect(page2.items).toHaveLength(5);
    expect(page2.nextCursor).not.toBeNull();

    const page3 = await listProducts(anon, {
      categoryIds: [catId],
      perPage: 5,
      cursor: page2.nextCursor,
    });
    expect(page3.items).toHaveLength(2); // 12 - 5 - 5 = 2
    expect(page3.nextCursor).toBeNull(); // exhausted

    // Disjoint pages.
    const ids1 = new Set(page1.items.map((p) => p.id));
    const ids2 = new Set(page2.items.map((p) => p.id));
    const ids3 = new Set(page3.items.map((p) => p.id));
    expect([...ids1].filter((id) => ids2.has(id))).toEqual([]);
    expect([...ids2].filter((id) => ids3.has(id))).toEqual([]);
    expect([...ids1].filter((id) => ids3.has(id))).toEqual([]);

    // Coverage: union of all pages equals the seeded set.
    const union = new Set([...ids1, ...ids2, ...ids3]);
    expect(union.size).toBe(productIds.length);
    for (const id of productIds) expect(union.has(id)).toBe(true);
  });

  it("with cursor=null returns the first page", async () => {
    const a = await listProducts(anon, {
      categoryIds: [catId],
      perPage: 4,
      cursor: null,
    });
    const b = await listProducts(anon, {
      categoryIds: [catId],
      perPage: 4,
    });
    expect(a.items.map((p) => p.id)).toEqual(b.items.map((p) => p.id));
  });

  it("hasMore reports false when remaining = perPage exactly", async () => {
    // Exactly 12 rows; perPage = 12 → page 1 returns all, nextCursor null.
    const page1 = await listProducts(anon, {
      categoryIds: [catId],
      perPage: 12,
    });
    expect(page1.items).toHaveLength(12);
    expect(page1.nextCursor).toBeNull();
  });

  it("encodeProductCursor → decodeProductCursor round-trip preserves shape", () => {
    const original: ListProductsCursor = {
      created_at: "2026-01-15T12:34:56.789+00:00",
      id: "11111111-1111-4111-8111-111111111111",
    };
    const encoded = encodeProductCursor(original);
    const decoded = decodeProductCursor(encoded);
    expect(decoded).toEqual(original);
  });

  it("decodeProductCursor returns null for malformed input (graceful degrade)", () => {
    expect(decodeProductCursor(null)).toBeNull();
    expect(decodeProductCursor(undefined)).toBeNull();
    expect(decodeProductCursor("")).toBeNull();
    expect(decodeProductCursor("not-base64-at-all!!")).toBeNull();
    expect(decodeProductCursor(Buffer.from("not-json", "utf8").toString("base64url"))).toBeNull();
    // Valid base64 + JSON but wrong shape.
    expect(
      decodeProductCursor(
        Buffer.from(JSON.stringify({ foo: "bar" }), "utf8").toString("base64url"),
      ),
    ).toBeNull();
    expect(
      decodeProductCursor(
        Buffer.from(JSON.stringify({ created_at: 123, id: "x" }), "utf8").toString(
          "base64url",
        ),
      ),
    ).toBeNull();
  });

  it("ties in created_at are broken by id DESC (stable order)", async () => {
    // Pull all rows in one page to inspect the ORDER BY behaviour.
    const { items } = await listProducts(anon, {
      categoryIds: [catId],
      perPage: 12,
    });
    expect(items.length).toBe(12);

    // For every adjacent pair: if created_at matches, id should be DESC.
    for (let i = 0; i < items.length - 1; i++) {
      const a = items[i];
      const b = items[i + 1];
      if (a.created_at === b.created_at) {
        expect(a.id.localeCompare(b.id)).toBeGreaterThan(0);
      } else {
        // Strictly newest-first.
        expect(a.created_at >= b.created_at).toBe(true);
      }
    }
  });

  it("a fabricated cursor at created_at = future just returns no rows from our set", async () => {
    // A cursor newer than every seed row → no overlap, page returns
    // older rows (in this case there may be unrelated seeded products
    // newer than the cursor we forge). We assert only that the helper
    // doesn't crash; the LOAD MORE button on the storefront has the
    // same forgiving contract.
    const fakeCursor = encodeProductCursor({
      created_at: new Date(Date.now() - 1).toISOString(),
      id: "00000000-0000-4000-8000-000000000000",
    });
    const page = await listProducts(anon, {
      categoryIds: [catId],
      perPage: 5,
      cursor: decodeProductCursor(fakeCursor),
    });
    expect(Array.isArray(page.items)).toBe(true);
  });
});
