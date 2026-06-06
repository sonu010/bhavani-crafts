/**
 * Tests for the free-text search filter on `listAdminOrders`.
 *
 * The filter has to:
 *   1. Match order_number ("BC-2026-…") substrings
 *   2. Match customer_email case-insensitively
 *   3. Match customer_name case-insensitively (substring)
 *   4. Combine with the `status` filter (AND)
 *   5. Escape `%` / `_` so users can't run wildcards against the table
 *      by typing them (the escape sits in lib/db/admin/orders.ts)
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { srv } from "./_clients";
import { listAdminOrders } from "@/lib/db/admin/orders";

const TAG = `zzz-search-${Date.now()}`;
let aliceId: string;
let aliceOrderNumber: string;

beforeAll(async () => {
  // Two pending orders + one paid, distinct names/emails, so we can
  // assert on each filter axis without false matches from neighbours.
  const inserts = await srv
    .from("orders")
    .insert([
      {
        customer_name: `${TAG} Alice Wonderland`,
        customer_email: `${TAG}-alice@example.invalid`,
        customer_phone: "0000000000",
        shipping_address: { country: "IN" },
        subtotal_inr: 100,
        shipping_inr: 50,
        total_inr: 150,
        status: "pending_payment" as const,
      },
      {
        customer_name: `${TAG} Bob Builder`,
        customer_email: `${TAG}-bob@example.invalid`,
        customer_phone: "0000000000",
        shipping_address: { country: "IN" },
        subtotal_inr: 200,
        shipping_inr: 50,
        total_inr: 250,
        status: "pending_payment" as const,
      },
      {
        customer_name: `${TAG} Charlie Brown`,
        customer_email: `${TAG}-charlie@example.invalid`,
        customer_phone: "0000000000",
        shipping_address: { country: "IN" },
        subtotal_inr: 300,
        shipping_inr: 50,
        total_inr: 350,
        status: "paid" as const,
        paid_at: new Date().toISOString(),
      },
    ])
    .select("id, order_number, customer_name");
  if (inserts.error) throw inserts.error;

  const alice = inserts.data!.find((r) => /Alice/.test(r.customer_name as string))!;
  aliceId = alice.id as string;
  aliceOrderNumber = alice.order_number as string;
}, 60_000);

afterAll(async () => {
  await srv.from("orders").delete().like("customer_email", `${TAG}-%`);
}, 60_000);

describe("listAdminOrders — search filter", () => {
  it("matches by exact order_number", async () => {
    const { items } = await listAdminOrders(srv, { q: aliceOrderNumber });
    expect(items.some((i) => i.id === aliceId)).toBe(true);
    expect(items.every((i) => i.orderNumber === aliceOrderNumber)).toBe(true);
  });

  it("matches by order_number prefix substring", async () => {
    // Pull the trailing 4 digits from Alice's order number and search
    // for a 3-digit slice — should still find her.
    const tail = aliceOrderNumber.split("-").pop()!.slice(0, 3);
    const { items } = await listAdminOrders(srv, { q: tail });
    expect(items.some((i) => i.id === aliceId)).toBe(true);
  });

  it("matches by customer_email case-insensitively", async () => {
    // Hit only this suite's namespace to keep the count manageable.
    const { items } = await listAdminOrders(srv, {
      q: `${TAG}-ALICE`,
    });
    expect(items.some((i) => i.id === aliceId)).toBe(true);
  });

  it("matches by customer_name substring", async () => {
    const { items } = await listAdminOrders(srv, { q: "wonderland" });
    const aliceMatches = items.filter((i) => i.id === aliceId);
    expect(aliceMatches.length).toBe(1);
  });

  it("combines q + status as AND (paid-only Charlie shows; pending Alice doesn't)", async () => {
    const { items } = await listAdminOrders(srv, {
      q: TAG,
      status: "paid",
    });
    expect(items.some((i) => /Charlie/.test(i.customerName))).toBe(true);
    expect(items.some((i) => /Alice/.test(i.customerName))).toBe(false);
  });

  it("escapes wildcard characters in user input", async () => {
    // A bare `%` previously matched the whole table; with escaping it
    // should match zero rows from this namespace because none have
    // an actual `%` in their fields.
    const baseline = await listAdminOrders(srv, { q: TAG });
    const pct = await listAdminOrders(srv, { q: `${TAG}%` });
    // Searching "<TAG>%" looks for the literal "%" character after
    // the tag — our fixtures don't contain that, so the result set
    // must be EMPTY, NOT identical to the baseline (which would
    // indicate `%` was treated as wildcard).
    expect(pct.items.length).toBe(0);
    expect(baseline.items.length).toBeGreaterThan(0);
  });

  it("empty q is treated as no-search and doesn't narrow", async () => {
    const baseline = await listAdminOrders(srv, { q: TAG });
    const emptyQ = await listAdminOrders(srv, { q: "" });
    // baseline narrows by TAG; emptyQ should be unfiltered (and ≥
    // baseline) — but the count beats us in a busy DB. Use the
    // TAG-narrowed query as a sanity check that empty q yields the
    // SAME shape as omitting q.
    const noQ = await listAdminOrders(srv, {});
    expect(emptyQ.total).toBe(noQ.total);
    expect(baseline.items.length).toBeGreaterThan(0);
  });
});
