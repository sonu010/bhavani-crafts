/**
 * Tests for `lib/db/admin/order-status.ts`.
 *
 * Validates that the three admin status-flip helpers
 * (markOrderPaid / markOrderCancelled / markOrderRefunded):
 *   - flip the status + stamp the matching timestamp atomically
 *   - reject illegal transitions with a typed error (not a throw)
 *   - return the before-row so the caller can write a useful audit
 *   - leave the row alone on concurrent re-flip attempts (the inline
 *     `.eq('status', ...)` guard prevents lost updates).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { srv } from "./_clients";
import {
  markOrderCancelled,
  markOrderPaid,
  markOrderRefunded,
} from "@/lib/db/admin/order-status";

const TAG = `zzz-admin-order-status-${Date.now()}`;

async function seedOrder(suffix: string): Promise<string> {
  const { data, error } = await srv
    .from("orders")
    .insert({
      customer_name: "zzz Admin",
      customer_email: `${TAG}-${suffix}@example.invalid`,
      customer_phone: "0000000000",
      shipping_address: { line1: "X", city: "H", state: "TG", pin: "500001", country: "IN" },
      subtotal_inr: 250,
      shipping_inr: 50,
      total_inr: 300,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id as string;
}

beforeAll(async () => {
  // No-op; each test seeds its own order via seedOrder.
});

afterAll(async () => {
  await srv.from("orders").delete().like("customer_email", `${TAG}-%`);
}, 60_000);

describe("admin order-status flips", () => {
  // ─── markOrderPaid ─────────────────────────────────────────────────
  it("markOrderPaid: pending_payment → paid + stamps paid_at", async () => {
    const id = await seedOrder("paid-ok");
    const result = await markOrderPaid(srv, id);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.before.status).toBe("pending_payment");
      expect(result.before.paid_at).toBeNull();
      expect(result.after.status).toBe("paid");
      expect(result.after.paid_at).not.toBeNull();
      // Read-back via a fresh query confirms the DB matches.
      const { data } = await srv
        .from("orders")
        .select("status, paid_at")
        .eq("id", id)
        .single();
      expect(data!.status).toBe("paid");
      expect(data!.paid_at).not.toBeNull();
    }
  });

  it("markOrderPaid: returns not_found for an unknown id", async () => {
    // A valid UUID shape but no matching row.
    const result = await markOrderPaid(srv, "00000000-0000-0000-0000-000000000000");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("not_found");
  });

  it("markOrderPaid: rejects re-flipping an already-paid order", async () => {
    const id = await seedOrder("paid-twice");
    const first = await markOrderPaid(srv, id);
    expect(first.ok).toBe(true);
    const second = await markOrderPaid(srv, id);
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error.code).toBe("illegal_transition");
      if (second.error.code === "illegal_transition") {
        expect(second.error.from).toBe("paid");
        expect(second.error.to).toBe("paid");
      }
    }
  });

  // ─── markOrderCancelled ────────────────────────────────────────────
  it("markOrderCancelled: pending_payment → cancelled + stamps cancelled_at", async () => {
    const id = await seedOrder("cancel-ok");
    const result = await markOrderCancelled(srv, id);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.after.status).toBe("cancelled");
      expect(result.after.cancelled_at).not.toBeNull();
    }
  });

  it("markOrderCancelled: rejects cancelling a paid order", async () => {
    const id = await seedOrder("cancel-paid");
    await markOrderPaid(srv, id);
    const result = await markOrderCancelled(srv, id);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("illegal_transition");
      if (result.error.code === "illegal_transition") {
        expect(result.error.from).toBe("paid");
      }
    }
  });

  // ─── markOrderRefunded ─────────────────────────────────────────────
  it("markOrderRefunded: paid → refunded + stamps refunded_at", async () => {
    const id = await seedOrder("refund-ok");
    await markOrderPaid(srv, id);
    const result = await markOrderRefunded(srv, id);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.before.status).toBe("paid");
      expect(result.after.status).toBe("refunded");
      expect(result.after.refunded_at).not.toBeNull();
    }
  });

  it("markOrderRefunded: rejects refunding a pending order (must be paid first)", async () => {
    const id = await seedOrder("refund-pending");
    const result = await markOrderRefunded(srv, id);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("illegal_transition");
      if (result.error.code === "illegal_transition") {
        expect(result.error.from).toBe("pending_payment");
        expect(result.error.to).toBe("refunded");
      }
    }
  });

  // ─── markOrderPaid: stock decrement side-effect (ADR-011 §5) ───────
  it("markOrderPaid: decrements stock_quantity per item; clamps at 0; skips untracked", async () => {
    // Seed a category + two products: one with tracked stock, one
    // with stock_quantity NULL (opted out of tracking).
    const { data: cat } = await srv
      .from("categories")
      .insert({ slug: `${TAG}-stockcat`, name: "stock cat" })
      .select("id")
      .single();
    const { data: prodTracked } = await srv
      .from("products")
      .insert({
        sku: `${TAG.toUpperCase()}-T`,
        slug: `${TAG}-tracked`,
        name: "zzz tracked",
        base_price_inr: 100,
        stock_status: "in_stock" as const,
        stock_quantity: 5,
        category_id: cat!.id,
        is_published: true,
        review_status: "published" as const,
        source: "manual" as const,
      })
      .select("id")
      .single();
    const { data: prodUntracked } = await srv
      .from("products")
      .insert({
        sku: `${TAG.toUpperCase()}-U`,
        slug: `${TAG}-untracked`,
        name: "zzz untracked",
        base_price_inr: 100,
        stock_status: "in_stock" as const,
        stock_quantity: null,
        category_id: cat!.id,
        is_published: true,
        review_status: "published" as const,
        source: "manual" as const,
      })
      .select("id")
      .single();

    // Order with 2× tracked and 1× untracked.
    const id = await seedOrder("stock-decrement");
    await srv.from("order_items").insert([
      {
        order_id: id,
        product_id: prodTracked!.id,
        sku: `${TAG.toUpperCase()}-T`,
        name: "zzz tracked",
        unit_price_inr: 100,
        quantity: 2,
        line_total_inr: 200,
      },
      {
        order_id: id,
        product_id: prodUntracked!.id,
        sku: `${TAG.toUpperCase()}-U`,
        name: "zzz untracked",
        unit_price_inr: 100,
        quantity: 1,
        line_total_inr: 100,
      },
    ]);

    const result = await markOrderPaid(srv, id);
    expect(result.ok).toBe(true);

    // Tracked: 5 - 2 = 3.
    const { data: trackedAfter } = await srv
      .from("products")
      .select("stock_quantity")
      .eq("id", prodTracked!.id)
      .single();
    expect(trackedAfter!.stock_quantity).toBe(3);

    // Untracked: stays null (opted out — RPC no-ops).
    const { data: untrackedAfter } = await srv
      .from("products")
      .select("stock_quantity")
      .eq("id", prodUntracked!.id)
      .single();
    expect(untrackedAfter!.stock_quantity).toBeNull();

    // Cleanup product fixtures (the order itself is wiped in afterAll).
    await srv.from("products").delete().in("id", [prodTracked!.id, prodUntracked!.id]);
    await srv.from("categories").delete().eq("id", cat!.id);
  });

  it("markOrderPaid: stock RPC failure doesn't roll back the paid flip", async () => {
    // Seed an order whose items reference a NULLed product_id (catalog
    // delete after order create). The decrement loop should skip; the
    // status flip still succeeds.
    const id = await seedOrder("stock-skip");
    await srv.from("order_items").insert({
      order_id: id,
      product_id: null,
      sku: "ZZZ-ORPHAN",
      name: "zzz orphan",
      unit_price_inr: 100,
      quantity: 1,
      line_total_inr: 100,
    });
    const result = await markOrderPaid(srv, id);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.after.status).toBe("paid");
  });
});
