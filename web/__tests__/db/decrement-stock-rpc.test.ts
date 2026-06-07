/**
 * Tests for the `decrement_product_stock(uuid, integer)` RPC
 * (migration 0019). The RPC is called once per item from
 * markOrderPaid; this suite pins its contract in isolation so a
 * future caller (Razorpay verify endpoint, bulk admin "Mark this
 * batch shipped" flow, etc.) gets a known-green floor.
 *
 * Contract:
 *   - Returns the new stock_quantity for tracked products.
 *   - Returns NULL for opt-out products (stock_quantity IS NULL).
 *   - Clamps to 0 (never goes negative).
 *   - Rejects quantity ≤ 0 with a 22023 invalid_parameter.
 *   - Skips soft-deleted products silently (matches the schema gate).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { srv } from "./_clients";

const TAG = `zzz-stock-rpc-${Date.now()}`;
let catId: string;
let prodTrackedId: string;
let prodUntrackedId: string;
let prodDeletedId: string;

beforeAll(async () => {
  const { data: cat } = await srv
    .from("categories")
    .insert({ slug: `${TAG}-cat`, name: `${TAG} cat` })
    .select("id")
    .single();
  catId = cat!.id as string;

  const { data: tracked } = await srv
    .from("products")
    .insert({
      sku: `${TAG.toUpperCase()}-TRK`,
      slug: `${TAG}-tracked`,
      name: `${TAG} tracked`,
      base_price_inr: 100,
      stock_status: "in_stock" as const,
      stock_quantity: 5,
      category_id: catId,
      is_published: true,
      review_status: "published" as const,
      source: "manual" as const,
    })
    .select("id")
    .single();
  prodTrackedId = tracked!.id as string;

  const { data: untracked } = await srv
    .from("products")
    .insert({
      sku: `${TAG.toUpperCase()}-UNT`,
      slug: `${TAG}-untracked`,
      name: `${TAG} untracked`,
      base_price_inr: 100,
      stock_status: "in_stock" as const,
      stock_quantity: null,
      category_id: catId,
      is_published: true,
      review_status: "published" as const,
      source: "manual" as const,
    })
    .select("id")
    .single();
  prodUntrackedId = untracked!.id as string;

  const { data: deleted } = await srv
    .from("products")
    .insert({
      sku: `${TAG.toUpperCase()}-DEL`,
      slug: `${TAG}-deleted`,
      name: `${TAG} deleted`,
      base_price_inr: 100,
      stock_status: "in_stock" as const,
      stock_quantity: 5,
      category_id: catId,
      is_published: false,
      review_status: "needs_review" as const,
      source: "manual" as const,
      deleted_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  prodDeletedId = deleted!.id as string;
}, 60_000);

afterAll(async () => {
  await srv
    .from("products")
    .delete()
    .in("id", [prodTrackedId, prodUntrackedId, prodDeletedId]);
  await srv.from("categories").delete().eq("id", catId);
}, 60_000);

describe("decrement_product_stock RPC", () => {
  it("decrements a tracked product + returns the new quantity", async () => {
    // Reset first so a re-run of the suite is deterministic.
    await srv
      .from("products")
      .update({ stock_quantity: 5 })
      .eq("id", prodTrackedId);

    const { data, error } = await srv.rpc("decrement_product_stock", {
      p_product_id: prodTrackedId,
      p_quantity: 2,
    });
    expect(error).toBeNull();
    expect(data).toBe(3); // 5 - 2

    const { data: after } = await srv
      .from("products")
      .select("stock_quantity")
      .eq("id", prodTrackedId)
      .single();
    expect(after!.stock_quantity).toBe(3);
  });

  it("clamps to 0 instead of going negative", async () => {
    await srv
      .from("products")
      .update({ stock_quantity: 2 })
      .eq("id", prodTrackedId);

    const { data } = await srv.rpc("decrement_product_stock", {
      p_product_id: prodTrackedId,
      p_quantity: 99,
    });
    expect(data).toBe(0);

    const { data: after } = await srv
      .from("products")
      .select("stock_quantity")
      .eq("id", prodTrackedId)
      .single();
    expect(after!.stock_quantity).toBe(0);
  });

  it("returns NULL for opt-out products (stock_quantity IS NULL)", async () => {
    const { data, error } = await srv.rpc("decrement_product_stock", {
      p_product_id: prodUntrackedId,
      p_quantity: 1,
    });
    expect(error).toBeNull();
    expect(data).toBeNull();

    // Untracked stays NULL.
    const { data: after } = await srv
      .from("products")
      .select("stock_quantity")
      .eq("id", prodUntrackedId)
      .single();
    expect(after!.stock_quantity).toBeNull();
  });

  it("silently skips soft-deleted products", async () => {
    const { data, error } = await srv.rpc("decrement_product_stock", {
      p_product_id: prodDeletedId,
      p_quantity: 1,
    });
    expect(error).toBeNull();
    expect(data).toBeNull();

    // Soft-deleted stock is unchanged.
    const { data: after } = await srv
      .from("products")
      .select("stock_quantity")
      .eq("id", prodDeletedId)
      .single();
    expect(after!.stock_quantity).toBe(5);
  });

  it("rejects quantity = 0 with an error", async () => {
    const { error } = await srv.rpc("decrement_product_stock", {
      p_product_id: prodTrackedId,
      p_quantity: 0,
    });
    expect(error).not.toBeNull();
    expect(error?.message ?? "").toMatch(/positive|quantity/i);
  });

  it("rejects negative quantity with an error", async () => {
    const { error } = await srv.rpc("decrement_product_stock", {
      p_product_id: prodTrackedId,
      p_quantity: -3,
    });
    expect(error).not.toBeNull();
    expect(error?.message ?? "").toMatch(/positive|quantity/i);
  });

  it("returns NULL for an unknown product id (no row matches)", async () => {
    // RFC v4 uuid that won't exist.
    const { data, error } = await srv.rpc("decrement_product_stock", {
      p_product_id: "deadbeef-dead-4beef-8eef-deadbeefdead",
      p_quantity: 1,
    });
    // Either error (malformed uuid) OR data null (unknown row). Both
    // are graceful — the caller's loop swallows either way.
    expect(data === null || error !== null).toBe(true);
  });
});
