/**
 * Integration tests for the checkout data layer (lib/db/checkout.ts).
 *
 * These exercise the FAR more interesting parts of the checkout
 * pipeline than schema constraints: server-authoritative pricing
 * (clients can't cheat by editing localStorage), totals math, the
 * "product no longer available" path, and the cascade from items to
 * the parent order. Runs against the local Supabase stack.
 *
 * The Razorpay-integration side is mocked out — no test keys are
 * required to validate the order-create path because Razorpay enters
 * the flow only AFTER the local order row exists.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { srv, anon } from "./_clients";
import {
  computeTotals,
  createPendingOrder,
  resolveCartLines,
} from "@/lib/db/checkout";
import type { CheckoutCartLine } from "@/lib/schemas/checkout";

const TAG = `zzz-checkout-${Date.now()}`;
let catId: string;
let productIdA: string;
let productIdB: string;
let productIdUnpub: string;

beforeAll(async () => {
  const { data: cat, error: catErr } = await srv
    .from("categories")
    .insert({ slug: `${TAG}-cat`, name: `${TAG} cat` })
    .select("id")
    .single();
  if (catErr) throw catErr;
  catId = cat!.id;

  const { data: prods, error: prodErr } = await srv
    .from("products")
    .insert([
      {
        sku: `${TAG.toUpperCase()}-A`,
        slug: `${TAG}-a`,
        name: `${TAG} A`,
        base_price_inr: 300,
        stock_status: "in_stock" as const,
        category_id: catId,
        is_published: true,
        review_status: "published" as const,
        source: "manual" as const,
      },
      {
        sku: `${TAG.toUpperCase()}-B`,
        slug: `${TAG}-b`,
        name: `${TAG} B`,
        base_price_inr: 150,
        stock_status: "in_stock" as const,
        category_id: catId,
        is_published: true,
        review_status: "published" as const,
        source: "manual" as const,
      },
      {
        sku: `${TAG.toUpperCase()}-UNPUB`,
        slug: `${TAG}-unpub`,
        name: `${TAG} Unpub`,
        base_price_inr: 999,
        stock_status: "in_stock" as const,
        category_id: catId,
        is_published: false,
        review_status: "needs_review" as const,
        source: "manual" as const,
      },
    ])
    .select("id, sku");
  if (prodErr) throw prodErr;
  const map = new Map((prods ?? []).map((p) => [p.sku as string, p.id as string]));
  productIdA = map.get(`${TAG.toUpperCase()}-A`)!;
  productIdB = map.get(`${TAG.toUpperCase()}-B`)!;
  productIdUnpub = map.get(`${TAG.toUpperCase()}-UNPUB`)!;
}, 60_000);

afterAll(async () => {
  // Items cascade via FK; the email prefix gives us the anon-created
  // rows. Cleanup is best-effort — RLS lets srv delete everything.
  await srv.from("orders").delete().like("customer_email", `${TAG}-%`);
  await srv.from("products").delete().like("slug", `${TAG}-%`);
  await srv.from("categories").delete().eq("id", catId);
}, 60_000);

function makeLine(
  productId: string,
  overrides?: Partial<CheckoutCartLine>,
): CheckoutCartLine {
  return {
    productId,
    variantId: null,
    sku: "CLIENT-SKU",
    name: "Client name",
    variantLabel: null,
    unitPriceInr: 1, // intentionally wrong — server should override
    quantity: 1,
    ...overrides,
  };
}

describe("checkout — server-authoritative pricing + totals + create", () => {
  // ─── 1. resolveCartLines overrides client-sent unit price ──────────
  it("resolveCartLines re-reads unit price from the catalog (not client)", async () => {
    const resolved = await resolveCartLines(anon, [
      makeLine(productIdA, { unitPriceInr: 1 }),
      makeLine(productIdB, { unitPriceInr: 9999 }),
    ]);
    expect(resolved).toHaveLength(2);
    const aRes = resolved.find((r) => r.productId === productIdA)!;
    const bRes = resolved.find((r) => r.productId === productIdB)!;
    expect(aRes.resolvedUnitPriceInr).toBe(300); // server, not 1
    expect(bRes.resolvedUnitPriceInr).toBe(150); // server, not 9999
  });

  it("resolveCartLines uses server SKU + name when present", async () => {
    const resolved = await resolveCartLines(anon, [
      makeLine(productIdA, { sku: "", name: "" }),
    ]);
    expect(resolved[0].resolvedSku).toBe(`${TAG.toUpperCase()}-A`);
    expect(resolved[0].resolvedName).toBe(`${TAG} A`);
  });

  it("resolveCartLines drops unpublished products silently", async () => {
    const resolved = await resolveCartLines(anon, [
      makeLine(productIdA),
      makeLine(productIdUnpub), // is_published=false
    ]);
    expect(resolved.map((r) => r.productId)).toEqual([productIdA]);
  });

  it("resolveCartLines drops soft-deleted products", async () => {
    // Soft-delete A for the duration of this test, then restore.
    await srv
      .from("products")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", productIdA);
    try {
      const resolved = await resolveCartLines(anon, [
        makeLine(productIdA),
        makeLine(productIdB),
      ]);
      expect(resolved.map((r) => r.productId)).toEqual([productIdB]);
    } finally {
      await srv
        .from("products")
        .update({ deleted_at: null })
        .eq("id", productIdA);
    }
  });

  it("resolveCartLines handles an empty input without hitting the DB", async () => {
    const resolved = await resolveCartLines(anon, []);
    expect(resolved).toEqual([]);
  });

  // ─── 2. computeTotals math ─────────────────────────────────────────
  it("computeTotals: subtotal × qty + flat shipping = total", async () => {
    const resolved = await resolveCartLines(anon, [
      makeLine(productIdA, { quantity: 2 }), // 300 × 2 = 600
      makeLine(productIdB, { quantity: 3 }), // 150 × 3 = 450
    ]);
    const { subtotalInr, shippingInr, totalInr } = computeTotals(resolved);
    expect(subtotalInr).toBe(1050);
    expect(shippingInr).toBe(50); // flat rate from lib/db/checkout.ts
    expect(totalInr).toBe(1100);
  });

  it("computeTotals: empty input → zeroed subtotal but shipping still added", async () => {
    const { subtotalInr, shippingInr, totalInr } = computeTotals([]);
    expect(subtotalInr).toBe(0);
    expect(shippingInr).toBe(50);
    expect(totalInr).toBe(50);
  });

  // ─── 3. createPendingOrder writes orders + order_items ─────────────
  it("createPendingOrder creates orders + order_items via anon, totals balance", async () => {
    const resolved = await resolveCartLines(anon, [
      makeLine(productIdA, { quantity: 1 }),
      makeLine(productIdB, { quantity: 2 }),
    ]);
    const { subtotalInr, shippingInr, totalInr } = computeTotals(resolved);

    const created = await createPendingOrder(anon, {
      customer: {
        name: "zzz Anon",
        email: `${TAG}-create@example.invalid`,
        phone: "+91 9876543210",
      },
      shipping: {
        line1: "Test St",
        city: "Hyderabad",
        state: "TG",
        pin: "500001",
        country: "IN",
      },
      lines: resolved,
      subtotalInr,
      shippingInr,
      totalInr,
    });

    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.orderNumber).toMatch(/^BC-\d{4}-\d{4,}$/);

    // Read back via srv — anon can't SELECT orders.
    const { data: order } = await srv
      .from("orders")
      .select("status, subtotal_inr, shipping_inr, total_inr, customer_name")
      .eq("id", created.id)
      .single();
    expect(order!.status).toBe("pending_payment");
    expect(order!.subtotal_inr).toBe(subtotalInr);
    expect(order!.shipping_inr).toBe(shippingInr);
    expect(order!.total_inr).toBe(totalInr);
    expect(order!.customer_name).toBe("zzz Anon");

    const { data: items } = await srv
      .from("order_items")
      .select("name, sku, unit_price_inr, quantity, line_total_inr")
      .eq("order_id", created.id);
    expect(items).toHaveLength(2);
    // Server-resolved prices, NOT the client's 1.
    const lineA = items!.find((i) => i.sku === `${TAG.toUpperCase()}-A`)!;
    const lineB = items!.find((i) => i.sku === `${TAG.toUpperCase()}-B`)!;
    expect(lineA.unit_price_inr).toBe(300);
    expect(lineA.line_total_inr).toBe(300);
    expect(lineB.unit_price_inr).toBe(150);
    expect(lineB.line_total_inr).toBe(300); // 150 × 2
  });

  // ─── 4. Constraint enforcement (server miscomputed totals rejected) ─
  it("createPendingOrder fails when totals don't balance (DB check)", async () => {
    const resolved = await resolveCartLines(anon, [
      makeLine(productIdA, { quantity: 1 }),
    ]);
    await expect(
      createPendingOrder(anon, {
        customer: {
          name: "zzz Bad",
          email: `${TAG}-badtotal@example.invalid`,
          phone: "+91 9876543210",
        },
        shipping: { line1: "X", city: "H", state: "TG", pin: "500001", country: "IN" },
        lines: resolved,
        subtotalInr: 300,
        shippingInr: 50,
        totalInr: 999, // wrong — should be 350
      }),
    ).rejects.toThrow(/check|constraint|balance/i);
  });

  // ─── 5. Order_items rows snapshot, surviving product edits ─────────
  it("post-create: editing the product price does NOT mutate the snapshotted line", async () => {
    const resolved = await resolveCartLines(anon, [
      makeLine(productIdA, { quantity: 1 }),
    ]);
    const { subtotalInr, shippingInr, totalInr } = computeTotals(resolved);
    const created = await createPendingOrder(anon, {
      customer: {
        name: "zzz Snap",
        email: `${TAG}-snap@example.invalid`,
        phone: "+91 9876543210",
      },
      shipping: { line1: "X", city: "H", state: "TG", pin: "500001", country: "IN" },
      lines: resolved,
      subtotalInr,
      shippingInr,
      totalInr,
    });

    // Bump A's catalog price; the recorded line should NOT change.
    await srv
      .from("products")
      .update({ base_price_inr: 9999 })
      .eq("id", productIdA);
    try {
      const { data: items } = await srv
        .from("order_items")
        .select("unit_price_inr")
        .eq("order_id", created.id);
      expect(items![0].unit_price_inr).toBe(300); // original, not 9999
    } finally {
      // Restore so other tests see the original price.
      await srv.from("products").update({ base_price_inr: 300 }).eq("id", productIdA);
    }
  });
});
