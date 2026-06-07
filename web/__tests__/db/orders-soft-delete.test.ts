/**
 * Orders soft-delete behaviour.
 *
 * 0015 ships orders + order_items with `deleted_at` / `deleted_by`
 * columns but no admin UI hook yet (admin Trash integration is the
 * follow-up after Razorpay lands). Tests pin the schema-level
 * guarantees these columns offer so a future Trash hookup has a
 * green starting line:
 *
 *   1. Setting deleted_at on an order hides it from
 *      listAdminOrders + getPendingOrdersSummary.
 *   2. Setting deleted_at does NOT cascade-remove order_items.
 *   3. Clearing deleted_at restores visibility.
 *   4. order_items.line_total + sku snapshot survive the soft-delete
 *      roundtrip (no data loss from a temporary trash sit).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { srv } from "./_clients";
import { listAdminOrders } from "@/lib/db/admin/orders";
import { getPendingOrdersSummary } from "@/lib/db/admin/dashboard";

const TAG = `zzz-soft-${Date.now()}`;
const orderIds: string[] = [];

async function seedOrder(suffix: string): Promise<string> {
  const { data, error } = await srv
    .from("orders")
    .insert({
      customer_name: `${TAG} ${suffix}`,
      customer_email: `${TAG}-${suffix}@example.invalid`,
      customer_phone: "0000000000",
      shipping_address: { country: "IN" },
      subtotal_inr: 100,
      shipping_inr: 50,
      total_inr: 150,
      status: "pending_payment" as const,
    })
    .select("id")
    .single();
  if (error) throw error;
  const id = data!.id as string;
  // Add a line so the cascade vs preserve assertion is meaningful.
  await srv.from("order_items").insert({
    order_id: id,
    sku: `${TAG.toUpperCase()}-SK`,
    name: `${TAG} item`,
    unit_price_inr: 100,
    quantity: 1,
    line_total_inr: 100,
  });
  orderIds.push(id);
  return id;
}

beforeAll(async () => {
  await seedOrder("alive");
  await seedOrder("dead");
}, 60_000);

afterAll(async () => {
  await srv.from("orders").delete().like("customer_email", `${TAG}-%`);
}, 60_000);

describe("orders soft-delete", () => {
  it("setting deleted_at hides the row from listAdminOrders", async () => {
    const [, deadId] = orderIds;
    const before = await listAdminOrders(srv, { q: TAG });
    expect(before.items.some((i) => i.id === deadId)).toBe(true);

    await srv
      .from("orders")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", deadId);

    const after = await listAdminOrders(srv, { q: TAG });
    expect(after.items.some((i) => i.id === deadId)).toBe(false);
  });

  it("setting deleted_at hides the row from getPendingOrdersSummary", async () => {
    const baseline = await getPendingOrdersSummary(srv);
    const [aliveId] = orderIds;
    await srv
      .from("orders")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", aliveId);

    const after = await getPendingOrdersSummary(srv);
    // Both seeded rows are now soft-deleted; the summary count must
    // have DROPPED by 2 compared to a hypothetical "before both
    // deletes." But we only have one baseline (after at least one
    // delete), so easier: assert neither id appears in `recent`.
    expect(after.recent.some((r) => r.id === aliveId)).toBe(false);
    expect(after.recent.some((r) => r.id === orderIds[1])).toBe(false);
    expect(after.total).toBeLessThanOrEqual(baseline.total);

    // Restore both for cleanup symmetry.
    for (const id of orderIds) {
      await srv.from("orders").update({ deleted_at: null }).eq("id", id);
    }
  });

  it("soft-delete does NOT remove the order_items rows (data preserved for restore)", async () => {
    const [aliveId] = orderIds;
    await srv
      .from("orders")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", aliveId);

    const { data: items } = await srv
      .from("order_items")
      .select("sku, line_total_inr")
      .eq("order_id", aliveId);
    expect(items).toHaveLength(1);
    expect(items![0].sku).toBe(`${TAG.toUpperCase()}-SK`);
    expect(items![0].line_total_inr).toBe(100);

    await srv.from("orders").update({ deleted_at: null }).eq("id", aliveId);
  });

  it("clearing deleted_at restores the row to listAdminOrders", async () => {
    const [aliveId] = orderIds;
    await srv
      .from("orders")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", aliveId);

    let listing = await listAdminOrders(srv, { q: TAG });
    expect(listing.items.some((i) => i.id === aliveId)).toBe(false);

    await srv.from("orders").update({ deleted_at: null }).eq("id", aliveId);

    listing = await listAdminOrders(srv, { q: TAG });
    expect(listing.items.some((i) => i.id === aliveId)).toBe(true);
  });
});
