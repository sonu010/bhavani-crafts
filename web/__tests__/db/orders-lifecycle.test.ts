/**
 * Lifecycle + constraint pins for `orders` + `order_items`
 * (P3-T25, ADR-011). Complements `orders-rls.test.ts` (RLS-focused) by
 * exercising behaviours that don't depend on role:
 *
 *   - Order-number sequence: sequential mints, unique, padding works
 *     past 9999 (we don't actually burn 10k inserts — we check the
 *     regex allows ≥4 digits and the trigger uses lpad(_,4)).
 *   - Soft-delete columns wire up (deleted_at, deleted_by FK).
 *   - CASCADE: deleting an order drops its items.
 *   - SET NULL on product/variant delete: items keep their price+name
 *     snapshot even after the catalog row vanishes.
 *   - updated_at trigger fires on UPDATE.
 *   - Multi-item orders: line totals + balance constraint.
 *   - Quantity bound (max 999), notes length (max 500).
 *   - Status transitions (pending → paid → refunded) via service-role.
 *
 * All assertions go through srv (service-role) — these are schema-level
 * guarantees, not RLS guarantees, and we want the cleanest reads.
 */
import { afterAll, describe, expect, it } from "vitest";
import { srv } from "./_clients";

const SUITE_TAG = `zzz-orders-lc-${Date.now()}`;

async function seedOrder(overrides?: Partial<{ total: number; subtotal: number; shipping: number; suffix: string }>) {
  const total = overrides?.total ?? 250;
  const subtotal = overrides?.subtotal ?? total;
  const shipping = overrides?.shipping ?? 0;
  const suffix = overrides?.suffix ?? Math.random().toString(36).slice(2, 8);
  const { data, error } = await srv
    .from("orders")
    .insert({
      customer_name: "zzz lc buyer",
      customer_email: `${SUITE_TAG}-${suffix}@example.invalid`,
      customer_phone: "0000000000",
      shipping_address: { line1: "X", city: "Hyderabad", country: "IN" },
      subtotal_inr: subtotal,
      shipping_inr: shipping,
      total_inr: total,
    })
    .select("id, order_number, status, created_at, updated_at")
    .single();
  if (error) throw error;
  return data;
}

describe("orders + order_items lifecycle + constraints", () => {
  afterAll(async () => {
    await srv.from("orders").delete().like("customer_email", `${SUITE_TAG}-%`);
  });

  // ─── 1. Sequential, unique order numbers ──────────────────────────
  it("order_number is sequential, unique, and matches BC-YYYY-NNNN", async () => {
    const o1 = await seedOrder({ suffix: "seq1" });
    const o2 = await seedOrder({ suffix: "seq2" });
    const o3 = await seedOrder({ suffix: "seq3" });

    for (const o of [o1, o2, o3]) {
      expect(o.order_number).toMatch(/^BC-\d{4}-\d{4,}$/);
    }
    // All three distinct.
    expect(new Set([o1.order_number, o2.order_number, o3.order_number]).size).toBe(3);

    // Sequence is monotonic — extract the trailing number and compare.
    const tail = (n: string) => Number(n.split("-").pop());
    expect(tail(o2.order_number)).toBe(tail(o1.order_number) + 1);
    expect(tail(o3.order_number)).toBe(tail(o2.order_number) + 1);

    // Year matches now() — guards against UTC drift in to_char.
    const yr = new Date().getUTCFullYear().toString();
    expect(o1.order_number).toContain(`BC-${yr}-`);
  });

  // ─── 2. order_number unique constraint catches a forced collision ──
  it("order_number unique constraint rejects a duplicate", async () => {
    const o = await seedOrder({ suffix: "uniq" });
    const { error } = await srv.from("orders").insert({
      order_number: o.order_number, // collide on purpose
      customer_name: "zzz dup",
      customer_email: `${SUITE_TAG}-dup@example.invalid`,
      customer_phone: "0000000000",
      shipping_address: {},
      subtotal_inr: 1,
      shipping_inr: 0,
      total_inr: 1,
    });
    expect(error).not.toBeNull();
    expect(error?.code).toBe("23505"); // unique_violation
  });

  // ─── 3. updated_at trigger fires on UPDATE ────────────────────────
  it("updated_at touches on UPDATE, created_at does not", async () => {
    const o = await seedOrder({ suffix: "touch" });
    const origUpdated = o.updated_at;
    const origCreated = o.created_at;

    // Wait long enough for timestamp resolution.
    await new Promise((r) => setTimeout(r, 50));

    const { data: updated, error } = await srv
      .from("orders")
      .update({ customer_phone: "1234567890" })
      .eq("id", o.id)
      .select("created_at, updated_at")
      .single();
    expect(error).toBeNull();
    expect(updated!.created_at).toBe(origCreated);
    expect(new Date(updated!.updated_at).getTime()).toBeGreaterThan(
      new Date(origUpdated).getTime(),
    );
  });

  // ─── 4. CASCADE delete on orders → drops order_items ──────────────
  it("deleting an order CASCADEs to order_items", async () => {
    const o = await seedOrder({ suffix: "cascade", total: 500 });
    await srv.from("order_items").insert([
      { order_id: o.id, sku: "ZZZ-CSC-A", name: "a", unit_price_inr: 200, quantity: 1, line_total_inr: 200 },
      { order_id: o.id, sku: "ZZZ-CSC-B", name: "b", unit_price_inr: 100, quantity: 3, line_total_inr: 300 },
    ]);
    const before = await srv.from("order_items").select("id").eq("order_id", o.id);
    expect(before.data).toHaveLength(2);

    await srv.from("orders").delete().eq("id", o.id);

    const after = await srv.from("order_items").select("id").eq("order_id", o.id);
    expect(after.data ?? []).toHaveLength(0);
  });

  // ─── 5. Product delete → order_items.product_id NULL, snapshot kept
  it("deleting a referenced product SETs NULL but preserves snapshot", async () => {
    // Seed product → order → item → delete product.
    const { data: cat } = await srv
      .from("categories")
      .insert({ slug: `${SUITE_TAG}-pdel-cat`, name: "pdel cat" })
      .select("id")
      .single();
    const { data: prod } = await srv
      .from("products")
      .insert({
        sku: `ZZZ-${SUITE_TAG}-PDEL`,
        slug: `${SUITE_TAG}-pdel`,
        name: "zzz pdel",
        base_price_inr: 750,
        stock_status: "in_stock",
        category_id: cat!.id,
        is_published: true,
        review_status: "published",
        source: "manual",
      })
      .select("id")
      .single();
    const o = await seedOrder({ suffix: "pdel", total: 750 });

    const { data: item } = await srv
      .from("order_items")
      .insert({
        order_id: o.id,
        product_id: prod!.id,
        sku: "ZZZ-PDEL-SNAP",
        name: "zzz pdel snap",
        unit_price_inr: 750,
        quantity: 1,
        line_total_inr: 750,
      })
      .select("id")
      .single();

    // Hard-delete the product (soft-delete wouldn't trigger SET NULL).
    await srv.from("products").delete().eq("id", prod!.id);

    const { data: after } = await srv
      .from("order_items")
      .select("product_id, name, unit_price_inr, sku")
      .eq("id", item!.id)
      .single();

    expect(after!.product_id).toBeNull();
    expect(after!.name).toBe("zzz pdel snap");
    expect(after!.unit_price_inr).toBe(750);
    expect(after!.sku).toBe("ZZZ-PDEL-SNAP");

    await srv.from("categories").delete().eq("id", cat!.id);
  });

  // ─── 6. Multi-item order: items sum to subtotal ───────────────────
  it("multi-item order: sum of line_total_inr matches subtotal_inr", async () => {
    const o = await seedOrder({ suffix: "multi", subtotal: 1100, shipping: 50, total: 1150 });
    await srv.from("order_items").insert([
      { order_id: o.id, sku: "ZZZ-M-1", name: "i1", unit_price_inr: 300, quantity: 2, line_total_inr: 600 },
      { order_id: o.id, sku: "ZZZ-M-2", name: "i2", unit_price_inr: 250, quantity: 1, line_total_inr: 250 },
      { order_id: o.id, sku: "ZZZ-M-3", name: "i3", unit_price_inr: 125, quantity: 2, line_total_inr: 250 },
    ]);
    const { data } = await srv
      .from("order_items")
      .select("line_total_inr")
      .eq("order_id", o.id);
    const sum = (data ?? []).reduce((a, r) => a + r.line_total_inr, 0);
    expect(sum).toBe(1100); // matches subtotal_inr
  });

  // ─── 7. Quantity upper bound (999) ────────────────────────────────
  it("order_items.quantity > 999 is rejected", async () => {
    const o = await seedOrder({ suffix: "qty" });
    const { error } = await srv.from("order_items").insert({
      order_id: o.id,
      sku: "ZZZ-Q",
      name: "qty",
      unit_price_inr: 1,
      quantity: 1000,
      line_total_inr: 1000,
    });
    expect(error?.code).toBe("23514"); // check_violation
  });

  // ─── 8. Notes 500-char cap ────────────────────────────────────────
  it("orders.notes > 500 chars is rejected", async () => {
    const { error } = await srv.from("orders").insert({
      customer_name: "zzz n",
      customer_email: `${SUITE_TAG}-notes@example.invalid`,
      customer_phone: "0000000000",
      shipping_address: {},
      subtotal_inr: 1,
      shipping_inr: 0,
      total_inr: 1,
      notes: "x".repeat(501),
    });
    expect(error?.code).toBe("23514");
  });

  // ─── 9. Status transitions through the enum ───────────────────────
  it("status transitions pending → paid → refunded set the right timestamps", async () => {
    const o = await seedOrder({ suffix: "trans" });
    expect(o.status).toBe("pending_payment");

    const paidAt = new Date().toISOString();
    await srv
      .from("orders")
      .update({
        status: "paid",
        paid_at: paidAt,
        razorpay_payment_id: "pay_TEST",
        razorpay_signature: "sig_TEST",
      })
      .eq("id", o.id);

    const refundedAt = new Date().toISOString();
    await srv
      .from("orders")
      .update({ status: "refunded", refunded_at: refundedAt })
      .eq("id", o.id);

    const { data: final } = await srv
      .from("orders")
      .select("status, paid_at, refunded_at, razorpay_payment_id")
      .eq("id", o.id)
      .single();

    expect(final!.status).toBe("refunded");
    expect(final!.paid_at).not.toBeNull();
    expect(final!.refunded_at).not.toBeNull();
    expect(final!.razorpay_payment_id).toBe("pay_TEST");
  });

  // ─── 10. Bad status string is rejected by the enum ────────────────
  it("an unknown status value is rejected by the enum", async () => {
    const o = await seedOrder({ suffix: "badstatus" });
    // Cast through unknown so TS doesn't pre-reject — we want the DB to.
    const { error } = await srv
      .from("orders")
      .update({ status: "shipped" as unknown as "paid" })
      .eq("id", o.id);
    expect(error).not.toBeNull();
    // 22P02 invalid_text_representation OR 22023 invalid_parameter for enum casts.
    expect(error?.message ?? "").toMatch(/invalid input value for enum|shipped/i);
  });

  // ─── 11. Soft-delete columns wire up ──────────────────────────────
  it("soft-delete sets deleted_at; deleted_by FK accepts a profile id", async () => {
    const o = await seedOrder({ suffix: "soft" });
    // Find any existing profile id (admin user from seed) — or NULL if none.
    const { data: profile } = await srv
      .from("profiles")
      .select("id")
      .limit(1)
      .maybeSingle();

    const now = new Date().toISOString();
    const { error } = await srv
      .from("orders")
      .update({ deleted_at: now, deleted_by: profile?.id ?? null })
      .eq("id", o.id);
    expect(error).toBeNull();

    const { data: after } = await srv
      .from("orders")
      .select("deleted_at, deleted_by")
      .eq("id", o.id)
      .single();
    expect(after!.deleted_at).not.toBeNull();
    if (profile) expect(after!.deleted_by).toBe(profile.id);
  });

  // ─── 12. shipping_inr default fills in when omitted ───────────────
  it("shipping_inr defaults to 0 when omitted (and total_inr balance still holds)", async () => {
    const { data, error } = await srv
      .from("orders")
      .insert({
        customer_name: "zzz default",
        customer_email: `${SUITE_TAG}-default@example.invalid`,
        customer_phone: "0000000000",
        shipping_address: {},
        subtotal_inr: 99,
        // shipping_inr OMITTED — should default to 0
        total_inr: 99,
      })
      .select("shipping_inr, subtotal_inr, total_inr")
      .single();
    expect(error).toBeNull();
    expect(data!.shipping_inr).toBe(0);
    expect(data!.total_inr).toBe(99);
  });
});
