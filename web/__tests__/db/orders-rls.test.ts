/**
 * RLS posture + snapshot guarantees for the orders + order_items tables
 * (P3-T25, ADR-011).
 *
 * The migration's smoke block validates the schema (constraints, triggers,
 * cascade) under the superuser pglite runs as. This file pins the parts
 * that ONLY show up under real RLS:
 *
 *   1. anon CAN insert a `pending_payment` order with `user_id IS NULL`.
 *      This is the storefront's create-order path. The exact policy
 *      `orders_anon_insert` from 0015.
 *   2. anon CANNOT insert with status='paid' (status check inside the
 *      WITH CHECK clause).
 *   3. anon CANNOT insert with razorpay_payment_id pre-set (only the
 *      verify handler, via service-role, may write it).
 *   4. anon CANNOT SELECT any order — own row or anyone else's. The
 *      orders table contains PII; anon-SELECT is a flat denial.
 *   5. anon CAN insert an order_item for an anon-owned pending order
 *      (EXISTS subquery in `order_items_anon_insert`).
 *   6. anon CANNOT insert an order_item for a `paid` order (status
 *      gate would let "decorate-after-checkout" attacks through).
 *   7. anon CANNOT SELECT order_items either.
 *   8. The `BC-YYYY-NNNN` order_number trigger fires (server-side
 *      observed via srv).
 *   9. Snapshot immutability — updating products.base_price_inr does
 *      NOT propagate to existing order_items.unit_price_inr. This is
 *      the load-bearing audit guarantee: a price change can't rewrite
 *      historical revenue.
 *
 * The admin-SELECT side (is_admin() policy) needs a real admin JWT
 * which is too heavy for a unit test — that path is exercised in the
 * launch-blockers script and in the admin orders viewer E2E (T26-side
 * task, separate).
 */
import { afterAll, describe, expect, it } from "vitest";
import { anon, srv } from "./_clients";

const SUITE_TAG = `zzz-orders-rls-${Date.now()}`;

/**
 * Insert an anon order. We can NOT chain `.select()` here — that asks
 * PostgREST for RETURNING, which requires SELECT-using to pass, which
 * the orders RLS policy denies to anon by design. So: blind INSERT
 * via anon, then read back via srv for assertions.
 */
async function makeAnonOrder(opts?: { suffix?: string }) {
  const suffix = opts?.suffix ?? "";
  const email = `${SUITE_TAG}-${suffix || "a"}@example.invalid`;
  const { error } = await anon.from("orders").insert({
    customer_name: `zzz Buyer ${suffix}`,
    customer_email: email,
    customer_phone: "0000000000",
    shipping_address: {
      line1: "Smoke",
      city: "Hyderabad",
      state: "TG",
      pin: "500000",
      country: "IN",
    },
    subtotal_inr: 250,
    shipping_inr: 0,
    total_inr: 250,
  });
  if (error) return { data: null, error };
  const { data } = await srv
    .from("orders")
    .select("id, order_number, status")
    .eq("customer_email", email)
    .single();
  return { data, error: null };
}

describe("orders + order_items RLS (anon)", () => {
  afterAll(async () => {
    // Cleanup via service role — bypass RLS to wipe everything this
    // suite created. order_items cascade off orders.
    await srv.from("orders").delete().like("customer_email", `${SUITE_TAG}-%`);
  });

  // ─── 1. anon INSERT happy path ────────────────────────────────────
  it("anon can INSERT a pending_payment order with user_id NULL", async () => {
    const { data, error } = await makeAnonOrder({ suffix: "ok" });
    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data?.status).toBe("pending_payment");
    expect(data?.order_number).toMatch(/^BC-\d{4}-\d{4,}$/); // trigger fired
  });

  // ─── 2. anon cannot INSERT a non-pending order ────────────────────
  it("anon CANNOT INSERT an order with status='paid'", async () => {
    const { error } = await anon.from("orders").insert({
      status: "paid",
      customer_name: "zzz cheat",
      customer_email: `${SUITE_TAG}-paid@example.invalid`,
      customer_phone: "0000000000",
      shipping_address: { line1: "X" },
      subtotal_inr: 1,
      shipping_inr: 0,
      total_inr: 1,
    });
    expect(error).not.toBeNull();
    // PostgREST surfaces an RLS violation as either a 42501 or a
    // generic "new row violates row-level security policy" message.
    expect(error?.message ?? "").toMatch(/row-level security|policy/i);
  });

  // ─── 3. anon cannot pre-populate Razorpay payment fields ──────────
  it("anon CANNOT INSERT with razorpay_payment_id pre-set", async () => {
    const { error } = await anon.from("orders").insert({
      customer_name: "zzz cheat2",
      customer_email: `${SUITE_TAG}-prepop@example.invalid`,
      customer_phone: "0000000000",
      shipping_address: { line1: "X" },
      subtotal_inr: 1,
      shipping_inr: 0,
      total_inr: 1,
      razorpay_payment_id: "pay_FAKE",
    });
    expect(error).not.toBeNull();
    expect(error?.message ?? "").toMatch(/row-level security|policy/i);
  });

  // ─── 4. anon cannot SELECT any orders ─────────────────────────────
  it("anon CANNOT SELECT orders (PII gate)", async () => {
    // Seed a row via srv so there IS something to leak.
    const { data: seeded } = await srv
      .from("orders")
      .insert({
        customer_name: "zzz seed",
        customer_email: `${SUITE_TAG}-seedsel@example.invalid`,
        customer_phone: "0000000000",
        shipping_address: { line1: "X" },
        subtotal_inr: 10,
        shipping_inr: 0,
        total_inr: 10,
      })
      .select("id")
      .single();
    expect(seeded?.id).toBeDefined();

    // Anon SELECT must return zero rows (RLS strips, not errors).
    const { data, error } = await anon.from("orders").select("id");
    expect(error).toBeNull();
    expect(data ?? []).toEqual([]);
  });

  // ─── 5. anon CAN insert order_items for an anon-owned pending ─────
  it("anon CAN INSERT order_items for an anon-owned pending order", async () => {
    const { data: order, error: orderErr } = await makeAnonOrder({
      suffix: "items-ok",
    });
    expect(orderErr).toBeNull();
    expect(order?.id).toBeDefined();

    const { error: itemErr } = await anon.from("order_items").insert({
      order_id: order!.id,
      sku: "ZZZ-RLS-1",
      name: "zzz item",
      unit_price_inr: 250,
      quantity: 1,
      line_total_inr: 250,
    });
    expect(itemErr).toBeNull();
  });

  // ─── 6. anon CANNOT add items to a paid order ─────────────────────
  it("anon CANNOT INSERT order_items for a 'paid' order", async () => {
    // Seed a paid order via srv.
    const { data: paidOrder } = await srv
      .from("orders")
      .insert({
        status: "paid",
        customer_name: "zzz paid",
        customer_email: `${SUITE_TAG}-paid-add@example.invalid`,
        customer_phone: "0000000000",
        shipping_address: { line1: "X" },
        subtotal_inr: 10,
        shipping_inr: 0,
        total_inr: 10,
        paid_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    expect(paidOrder?.id).toBeDefined();

    const { error } = await anon.from("order_items").insert({
      order_id: paidOrder!.id,
      sku: "ZZZ-CHEAT",
      name: "zzz freebie",
      unit_price_inr: 0,
      quantity: 1,
      line_total_inr: 0,
    });
    expect(error).not.toBeNull();
    expect(error?.message ?? "").toMatch(/row-level security|policy/i);
  });

  // ─── 7. anon cannot SELECT order_items ────────────────────────────
  it("anon CANNOT SELECT order_items", async () => {
    const { data, error } = await anon.from("order_items").select("id");
    expect(error).toBeNull();
    expect(data ?? []).toEqual([]);
  });

  // ─── 8. Snapshot immutability ─────────────────────────────────────
  it("editing products.base_price_inr does NOT change recorded order_items.unit_price_inr", async () => {
    // Seed a product + an order line referencing it, both via srv.
    const { data: cat } = await srv
      .from("categories")
      .insert({ slug: `${SUITE_TAG}-snap-cat`, name: "snap cat" })
      .select("id")
      .single();
    const { data: prod } = await srv
      .from("products")
      .insert({
        sku: `ZZZ-${SUITE_TAG}-SNAP`,
        slug: `${SUITE_TAG}-snap`,
        name: "zzz Snap Product",
        base_price_inr: 500,
        stock_status: "in_stock",
        category_id: cat!.id,
        is_published: true,
        review_status: "published",
        source: "manual",
      })
      .select("id")
      .single();

    const { data: order } = await srv
      .from("orders")
      .insert({
        customer_name: "zzz snap",
        customer_email: `${SUITE_TAG}-snap@example.invalid`,
        customer_phone: "0000000000",
        shipping_address: { line1: "X" },
        subtotal_inr: 500,
        shipping_inr: 0,
        total_inr: 500,
      })
      .select("id")
      .single();

    await srv.from("order_items").insert({
      order_id: order!.id,
      product_id: prod!.id,
      sku: "ZZZ-SNAP-ORIG",
      name: "zzz Snap Product",
      unit_price_inr: 500,
      quantity: 1,
      line_total_inr: 500,
    });

    // Now mutate the catalog: bump the product price + rename it.
    await srv
      .from("products")
      .update({ base_price_inr: 9999, name: "zzz Snap Product RENAMED" })
      .eq("id", prod!.id);

    // The order line MUST still reflect the snapshot.
    const { data: items } = await srv
      .from("order_items")
      .select("unit_price_inr, name, sku")
      .eq("order_id", order!.id);

    expect(items).toHaveLength(1);
    expect(items![0].unit_price_inr).toBe(500); // original, NOT 9999
    expect(items![0].name).toBe("zzz Snap Product"); // original
    expect(items![0].sku).toBe("ZZZ-SNAP-ORIG");

    // Cleanup product + category (orders cascade in afterAll).
    await srv.from("products").delete().eq("id", prod!.id);
    await srv.from("categories").delete().eq("id", cat!.id);
  });
});
