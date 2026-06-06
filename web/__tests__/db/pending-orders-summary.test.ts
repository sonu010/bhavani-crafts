/**
 * Tests for `getPendingOrdersSummary` (powers the admin dashboard's
 * "N orders waiting" banner). The helper has three requirements:
 *
 *   1. Count + list only rows with status='pending_payment'.
 *   2. Sort newest-first (latest checkout shows up first in the strip).
 *   3. Hide soft-deleted rows (deleted_at IS NULL).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { srv } from "./_clients";
import { getPendingOrdersSummary } from "@/lib/db/admin/dashboard";

const TAG = `zzz-pending-summary-${Date.now()}`;
const seededIds: string[] = [];

async function seedOrder(opts: {
  suffix: string;
  status?: "pending_payment" | "paid" | "cancelled";
  deleted?: boolean;
  total?: number;
}): Promise<string> {
  const status = opts.status ?? "pending_payment";
  const { data, error } = await srv
    .from("orders")
    .insert({
      customer_name: `zzz ${opts.suffix}`,
      customer_email: `${TAG}-${opts.suffix}@example.invalid`,
      customer_phone: "0000000000",
      shipping_address: { line1: "X", city: "H", state: "TG", pin: "500001", country: "IN" },
      subtotal_inr: opts.total ?? 100,
      shipping_inr: 50,
      total_inr: (opts.total ?? 100) + 50,
      status,
      paid_at: status === "paid" ? new Date().toISOString() : null,
      deleted_at: opts.deleted ? new Date().toISOString() : null,
    })
    .select("id")
    .single();
  if (error) throw error;
  seededIds.push(data!.id as string);
  return data!.id as string;
}

beforeAll(async () => {
  // No-op; seedOrder is called inside each test.
});

afterAll(async () => {
  await srv.from("orders").delete().like("customer_email", `${TAG}-%`);
}, 60_000);

describe("getPendingOrdersSummary", () => {
  it("returns 0 + empty list when there are no pending rows", async () => {
    // Need a clean baseline: get the current count BEFORE we add any
    // pending fixtures so we can assert on the delta.
    const baseline = await getPendingOrdersSummary(srv);

    // Seed only non-pending rows.
    await seedOrder({ suffix: "paid-1", status: "paid", total: 100 });
    await seedOrder({ suffix: "cancelled-1", status: "cancelled", total: 200 });

    const after = await getPendingOrdersSummary(srv);
    expect(after.total).toBe(baseline.total);
  });

  it("counts + lists pending rows newest-first", async () => {
    const baseline = await getPendingOrdersSummary(srv);
    const before = baseline.total;

    await seedOrder({ suffix: "pend-1", total: 100 });
    await new Promise((r) => setTimeout(r, 20));
    await seedOrder({ suffix: "pend-2", total: 200 });
    await new Promise((r) => setTimeout(r, 20));
    await seedOrder({ suffix: "pend-3", total: 300 });

    const after = await getPendingOrdersSummary(srv);
    expect(after.total).toBe(before + 3);

    // The newest 3 we just inserted should be at the top of `recent`,
    // newest-first. Pend-3 first, then 2, then 1.
    const topThree = after.recent.slice(0, 3).map((r) => r.totalInr);
    expect(topThree).toEqual([350, 250, 150]);
  });

  it("excludes soft-deleted rows even if status='pending_payment'", async () => {
    const baseline = await getPendingOrdersSummary(srv);

    await seedOrder({ suffix: "softdel", deleted: true, total: 100 });

    const after = await getPendingOrdersSummary(srv);
    // Soft-deleted should NOT contribute to the count.
    expect(after.total).toBe(baseline.total);
  });

  it("respects the `limit` argument on `recent` (count is always exact)", async () => {
    const baseline = await getPendingOrdersSummary(srv);
    await seedOrder({ suffix: "lim-1" });
    await seedOrder({ suffix: "lim-2" });
    await seedOrder({ suffix: "lim-3" });
    await seedOrder({ suffix: "lim-4" });
    await seedOrder({ suffix: "lim-5" });

    // Default limit is 3.
    const def = await getPendingOrdersSummary(srv);
    expect(def.total).toBe(baseline.total + 5);
    expect(def.recent).toHaveLength(3);

    // Explicit limit can widen.
    const wide = await getPendingOrdersSummary(srv, 10);
    expect(wide.total).toBe(baseline.total + 5);
    expect(wide.recent.length).toBeGreaterThanOrEqual(5);
  });
});
