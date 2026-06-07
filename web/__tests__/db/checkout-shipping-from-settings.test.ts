/**
 * End-to-end: owner edits shipping_flat_inr → checkout charges the new
 * rate, the snapshot on `orders.shipping_inr` matches.
 *
 * Catches the "display says ₹50, server charges ₹75" class of bugs
 * (the very thing the page → checkout-client prop-drilling commit
 * fixed). Verifies the contract by going through the actual data
 * layer, not the cached `getStorefrontSettings()` reader — that
 * reader is unstable_cache wrapped and the tag is flushed by the
 * admin save, so a vitest-time edit would otherwise be hidden by the
 * cache.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { srv } from "./_clients";
import {
  computeTotals,
  createPendingOrder,
  resolveCartLines,
} from "@/lib/db/checkout";
import { upsertAppSetting } from "@/lib/db/app-settings";

const TAG = `zzz-shipping-${Date.now()}`;
let catId: string;
let productId: string;
let originalShipping = "";

beforeAll(async () => {
  // Seed a product to check out.
  const { data: cat } = await srv
    .from("categories")
    .insert({ slug: `${TAG}-cat`, name: `${TAG} cat` })
    .select("id")
    .single();
  catId = cat!.id as string;
  const { data: prod } = await srv
    .from("products")
    .insert({
      sku: `${TAG.toUpperCase()}-P`,
      slug: `${TAG}-p`,
      name: `${TAG} product`,
      base_price_inr: 200,
      stock_status: "in_stock" as const,
      category_id: catId,
      is_published: true,
      review_status: "published" as const,
      source: "manual" as const,
    })
    .select("id")
    .single();
  productId = prod!.id as string;

  // Snapshot the current setting so we can restore on teardown.
  const { data: before } = await srv
    .from("app_settings")
    .select("value")
    .eq("key", "shipping_flat_inr")
    .single();
  originalShipping = (before?.value as string) ?? "50";
}, 60_000);

afterAll(async () => {
  await upsertAppSetting(srv, "shipping_flat_inr", originalShipping, null);
  await srv.from("orders").delete().like("customer_email", `${TAG}-%`);
  await srv.from("products").delete().eq("id", productId);
  await srv.from("categories").delete().eq("id", catId);
}, 60_000);

describe("end-to-end shipping rate from app_settings", () => {
  it("changing shipping_flat_inr changes what computeTotals + createPendingOrder use", async () => {
    // 1. Owner sets shipping to ₹75.
    await upsertAppSetting(srv, "shipping_flat_inr", "75", null);

    // 2. Customer checks out with 2× our seeded product.
    const lines = await resolveCartLines(srv, [
      {
        productId,
        variantId: null,
        sku: "CLIENT",
        name: "client name",
        variantLabel: null,
        unitPriceInr: 1,
        quantity: 2,
      },
    ]);
    // computeTotals takes the rate as an arg — caller has to pass it
    // through. Here we simulate what the server action does: read
    // shipping_flat_inr fresh + pass it in.
    const { data: settingRow } = await srv
      .from("app_settings")
      .select("value")
      .eq("key", "shipping_flat_inr")
      .single();
    const liveShipping = Number(settingRow!.value);
    expect(liveShipping).toBe(75);

    const { subtotalInr, shippingInr, totalInr } = computeTotals(
      lines,
      liveShipping,
    );
    expect(subtotalInr).toBe(400); // 2 × 200
    expect(shippingInr).toBe(75);
    expect(totalInr).toBe(475);

    const created = await createPendingOrder(srv, {
      customer: {
        name: "zzz Shipping Test",
        email: `${TAG}-ship@example.invalid`,
        phone: "+91 9876543210",
      },
      shipping: {
        line1: "X",
        city: "Hyderabad",
        state: "TG",
        pin: "500001",
        country: "IN",
      },
      lines,
      subtotalInr,
      shippingInr,
      totalInr,
    });

    // 3. The persisted order row must reflect the NEW rate.
    const { data: row } = await srv
      .from("orders")
      .select("subtotal_inr, shipping_inr, total_inr")
      .eq("id", created.id)
      .single();
    expect(row!.subtotal_inr).toBe(400);
    expect(row!.shipping_inr).toBe(75);
    expect(row!.total_inr).toBe(475);
  });

  it("zero shipping ('free shipping above threshold' use case) works end-to-end", async () => {
    await upsertAppSetting(srv, "shipping_flat_inr", "0", null);

    const lines = await resolveCartLines(srv, [
      {
        productId,
        variantId: null,
        sku: "CLIENT",
        name: "client name",
        variantLabel: null,
        unitPriceInr: 1,
        quantity: 1,
      },
    ]);
    const totals = computeTotals(lines, 0);
    expect(totals.shippingInr).toBe(0);
    expect(totals.totalInr).toBe(200);

    const created = await createPendingOrder(srv, {
      customer: {
        name: "zzz Free Ship",
        email: `${TAG}-free@example.invalid`,
        phone: "+91 9876543210",
      },
      shipping: {
        line1: "X",
        city: "Hyderabad",
        state: "TG",
        pin: "500001",
        country: "IN",
      },
      lines,
      ...totals,
    });
    const { data: row } = await srv
      .from("orders")
      .select("shipping_inr, total_inr")
      .eq("id", created.id)
      .single();
    expect(row!.shipping_inr).toBe(0);
    expect(row!.total_inr).toBe(200);
  });
});
