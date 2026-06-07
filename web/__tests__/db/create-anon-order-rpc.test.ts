/**
 * Direct tests for the `create_anon_order(...)` RPC (migration 0018).
 *
 * The RPC underlies `createPendingOrder` (lib/db/checkout.ts) — that
 * wrapper is tested via `checkout-action.test.ts`. This file pins the
 * RPC's contract directly so a future caller (a server-side admin
 * tool that creates orders on behalf of a customer, etc.) has a
 * green floor without piggy-backing on the wrapper's tests.
 *
 * Contract:
 *   1. Returns {id, order_number} where order_number matches the
 *      BC-YYYY-NNNN regex (the column DEFAULT fires).
 *   2. The order is inserted with status='pending_payment' (the RPC
 *      hard-codes it — no `status` argument).
 *   3. razorpay_* refs are NULL on creation (anon can't pre-populate).
 *   4. Items are inserted with the expected snapshot fields.
 *   5. The RPC rejects unbalanced totals (subtotal + shipping ≠ total).
 *   6. The RPC rejects an empty items array.
 *   7. The RPC rejects more than 50 items (DoS guard).
 *   8. Anon (the storefront's actual caller) can invoke it.
 */
import { afterAll, describe, expect, it } from "vitest";
import { anon, srv } from "./_clients";

const TAG = `zzz-rpc-create-${Date.now()}`;
const createdEmails: string[] = [];

interface CreatedOrder {
  id: string;
  order_number: string;
}

async function callCreate(opts: {
  emailSuffix: string;
  subtotal: number;
  shipping: number;
  total: number;
  items: Array<{
    product_id?: string | null;
    variant_id?: string | null;
    sku: string;
    name: string;
    variant_label?: string | null;
    unit_price_inr: number;
    quantity: number;
    line_total_inr: number;
  }>;
  notes?: string | null;
  via?: "srv" | "anon";
}) {
  const client = (opts.via ?? "anon") === "anon" ? anon : srv;
  const email = `${TAG}-${opts.emailSuffix}@example.invalid`;
  createdEmails.push(email);
  return client.rpc("create_anon_order", {
    p_customer_name: `${TAG} ${opts.emailSuffix}`,
    p_customer_email: email,
    p_customer_phone: "+919876543210",
    p_shipping: {
      line1: "Test",
      city: "Hyderabad",
      state: "TG",
      pin: "500001",
      country: "IN",
    } as unknown as never,
    p_subtotal_inr: opts.subtotal,
    p_shipping_inr: opts.shipping,
    p_total_inr: opts.total,
    p_notes: opts.notes ?? "",
    p_items: opts.items.map((it) => ({
      product_id: it.product_id ?? null,
      variant_id: it.variant_id ?? null,
      sku: it.sku,
      name: it.name,
      variant_label: it.variant_label ?? null,
      unit_price_inr: it.unit_price_inr,
      quantity: it.quantity,
      line_total_inr: it.line_total_inr,
    })) as unknown as never,
  });
}

afterAll(async () => {
  await srv.from("orders").delete().in("customer_email", createdEmails);
}, 60_000);

describe("create_anon_order RPC", () => {
  it("happy path: returns {id, order_number} with BC-YYYY-NNNN format", async () => {
    const { data, error } = await callCreate({
      emailSuffix: "happy",
      subtotal: 250,
      shipping: 50,
      total: 300,
      items: [
        {
          sku: "ZZZ-SKU",
          name: "zzz item",
          unit_price_inr: 250,
          quantity: 1,
          line_total_inr: 250,
        },
      ],
    });
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    const row = (data as unknown as CreatedOrder[])[0];
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(row.order_number).toMatch(/^BC-\d{4}-\d{4,}$/);
  });

  it("created row has status='pending_payment' + razorpay refs NULL", async () => {
    const { data } = await callCreate({
      emailSuffix: "status",
      subtotal: 100,
      shipping: 50,
      total: 150,
      items: [
        {
          sku: "ZZZ-S",
          name: "x",
          unit_price_inr: 100,
          quantity: 1,
          line_total_inr: 100,
        },
      ],
    });
    const id = (data as unknown as CreatedOrder[])[0].id;
    const { data: row } = await srv
      .from("orders")
      .select(
        "status, razorpay_order_id, razorpay_payment_id, razorpay_signature, user_id",
      )
      .eq("id", id)
      .single();
    expect(row!.status).toBe("pending_payment");
    expect(row!.razorpay_order_id).toBeNull();
    expect(row!.razorpay_payment_id).toBeNull();
    expect(row!.razorpay_signature).toBeNull();
    expect(row!.user_id).toBeNull();
  });

  it("items are inserted with snapshot fields", async () => {
    const { data } = await callCreate({
      emailSuffix: "items",
      subtotal: 600,
      shipping: 50,
      total: 650,
      items: [
        {
          sku: "ZZZ-A",
          name: "Item A",
          variant_label: "Small / Teal",
          unit_price_inr: 200,
          quantity: 2,
          line_total_inr: 400,
        },
        {
          sku: "ZZZ-B",
          name: "Item B",
          unit_price_inr: 200,
          quantity: 1,
          line_total_inr: 200,
        },
      ],
    });
    const id = (data as unknown as CreatedOrder[])[0].id;
    const { data: items } = await srv
      .from("order_items")
      .select("sku, name, variant_label, unit_price_inr, quantity, line_total_inr")
      .eq("order_id", id)
      .order("sku");
    expect(items).toHaveLength(2);
    const a = items!.find((i) => i.sku === "ZZZ-A")!;
    const b = items!.find((i) => i.sku === "ZZZ-B")!;
    expect(a.variant_label).toBe("Small / Teal");
    expect(a.line_total_inr).toBe(400);
    expect(b.variant_label).toBeNull();
    expect(b.line_total_inr).toBe(200);
  });

  it("rejects unbalanced totals (RPC's pre-check fires before the DB CHECK)", async () => {
    const { error } = await callCreate({
      emailSuffix: "unbalanced",
      subtotal: 100,
      shipping: 50,
      total: 999, // ≠ 100 + 50
      items: [
        {
          sku: "ZZZ-X",
          name: "x",
          unit_price_inr: 100,
          quantity: 1,
          line_total_inr: 100,
        },
      ],
    });
    expect(error).not.toBeNull();
    expect(error?.message ?? "").toMatch(/balance|total/i);
  });

  it("rejects an empty items array", async () => {
    const { error } = await callCreate({
      emailSuffix: "empty",
      subtotal: 0,
      shipping: 0,
      total: 0,
      items: [],
    });
    expect(error).not.toBeNull();
    expect(error?.message ?? "").toMatch(/required|item/i);
  });

  it("rejects more than 50 items (DoS guard)", async () => {
    const items = Array.from({ length: 51 }, (_, i) => ({
      sku: `ZZZ-${i}`,
      name: `Item ${i}`,
      unit_price_inr: 1,
      quantity: 1,
      line_total_inr: 1,
    }));
    const { error } = await callCreate({
      emailSuffix: "toomany",
      subtotal: 51,
      shipping: 50,
      total: 101,
      items,
    });
    expect(error).not.toBeNull();
    expect(error?.message ?? "").toMatch(/50|max/i);
  });

  it("anon (the actual storefront caller) can invoke the RPC", async () => {
    // The RPC's EXECUTE grant goes to anon explicitly; this asserts
    // the grant didn't drift in a later migration.
    const { data, error } = await callCreate({
      emailSuffix: "anon-direct",
      subtotal: 100,
      shipping: 50,
      total: 150,
      items: [
        {
          sku: "ZZZ-ANON",
          name: "x",
          unit_price_inr: 100,
          quantity: 1,
          line_total_inr: 100,
        },
      ],
      via: "anon",
    });
    expect(error).toBeNull();
    expect((data as unknown as CreatedOrder[])[0].order_number).toMatch(
      /^BC-\d{4}-\d{4,}$/,
    );
  });
});
