"use server";

import { createPublicClient } from "@/lib/db/public-client";
import {
  CreateCheckoutOrderInputSchema,
  type CreateCheckoutOrderInput,
  type CreateCheckoutOrderResult,
} from "@/lib/schemas/checkout";
import {
  computeTotals,
  createPendingOrder,
  resolveCartLines,
} from "@/lib/db/checkout";
import { getStorefrontSettings } from "@/lib/storefront/settings";

/**
 * Order-create server action (P3-T26 scaffold, T27 form posts here).
 *
 * Flow:
 *   1. Validate the input shape via Zod (customer + shipping + lines).
 *   2. Re-resolve each line's unit price + sku + name from the
 *      catalog. We DO NOT trust client-sent prices — that's the
 *      single load-bearing security rule for any checkout server.
 *   3. Compute subtotal + shipping (flat ₹50) + total server-side.
 *   4. Insert `orders` + `order_items` via the anon-RLS path
 *      (status='pending_payment').
 *   5. *(Razorpay integration)* — when `RAZORPAY_KEY_ID` and
 *      `RAZORPAY_KEY_SECRET` are present, call Razorpay's `orders.create`
 *      with `amount` in paise and return their `order_id`. While
 *      those env vars are absent (owner-pending; see blockers.md), we
 *      still create the local order and return `razorpay: null` so
 *      the UI can show "Payment integration pending" rather than
 *      crash.
 *
 * The signature-verify side lives in T28 (`/api/checkout/verify`).
 *
 * This action runs on the anon-RLS public client because anon-INSERT
 * is explicitly allowed for `pending_payment` orders (see 0015 +
 * 0016). Switching to service-role here would WIDEN the trust surface
 * with no benefit.
 */
export async function createCheckoutOrder(
  input: CreateCheckoutOrderInput,
): Promise<
  | { ok: true; result: CreateCheckoutOrderResult }
  | { ok: false; error: string }
> {
  // 1. Validate.
  const parsed = CreateCheckoutOrderInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error:
        parsed.error.issues[0]?.message ?? "Invalid checkout details.",
    };
  }
  const { customer, shipping, lines, notes } = parsed.data;

  // 2. Resolve prices from the catalog.
  const supabase = createPublicClient();
  const resolved = await resolveCartLines(supabase, lines);
  if (resolved.length === 0) {
    return {
      ok: false,
      error:
        "None of these products are available right now. Please refresh and try again.",
    };
  }
  if (resolved.length < lines.length) {
    // We could continue with the available subset, but the user
    // explicitly chose the dropped ones — better to flag and let
    // them retry once the catalog is refreshed.
    return {
      ok: false,
      error:
        "One or more items are no longer available. Please refresh your cart and try again.",
    };
  }

  // 3. Server-computed totals. Shipping comes from the owner-editable
  //    app_settings.shipping_flat_inr; falls back to the constant.
  const { shippingFlatInr } = await getStorefrontSettings();
  const { subtotalInr, shippingInr, totalInr } = computeTotals(
    resolved,
    shippingFlatInr,
  );

  // 4. Insert the order + items.
  let created: { id: string; orderNumber: string };
  try {
    created = await createPendingOrder(supabase, {
      customer,
      shipping,
      lines: resolved,
      subtotalInr,
      shippingInr,
      totalInr,
      notes: notes || undefined,
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not create order.",
    };
  }

  // 5. Razorpay — gated on env vars.
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    // Scaffold mode: the local order row exists, but we don't have
    // Razorpay keys yet. UI falls back to a "payment pending"
    // placeholder. Once the owner adds keys, this branch goes away.
    return {
      ok: true,
      result: {
        orderId: created.id,
        orderNumber: created.orderNumber,
        totalInr,
        razorpay: null,
      },
    };
  }

  // Real Razorpay path lands in P3-T26 final pass. For now we still
  // surface keyId for the client widget but stub the order id so the
  // UI flow can be exercised even before the live wiring.
  return {
    ok: true,
    result: {
      orderId: created.id,
      orderNumber: created.orderNumber,
      totalInr,
      razorpay: {
        keyId,
        razorpayOrderId: "TODO_razorpay_orders_create",
        amountPaise: totalInr * 100,
        currency: "INR",
      },
    },
  };
}
