import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types.gen";
import type {
  CheckoutCartLine,
  CustomerInfo,
  ShippingAddress,
} from "@/lib/schemas/checkout";

type SC = SupabaseClient<Database>;

/**
 * Server-side checkout helpers (P3-T26 scaffold). Two concerns:
 *
 *   1. Re-resolve unit prices from the catalog so the client can't
 *      cheat by editing localStorage. The cart sends a snapshot for
 *      display; the server overrides it with the current
 *      `products.base_price_inr` (or the variant's `price_inr` when
 *      we add variant-level pricing in a later phase).
 *   2. Insert the `orders` row + `order_items` snapshots atomically
 *      enough that an interrupted write doesn't leave a parentless
 *      items batch. PostgREST doesn't do user transactions, but the
 *      FK CASCADE means an orphan would be impossible anyway — items
 *      can't exist without an order_id.
 *
 * Returns the created order's id, order_number, and the resolved
 * total in whole rupees. Razorpay creation is layered ON TOP of this
 * (in actions.ts) once keys are configured.
 */

interface ResolvedLine extends CheckoutCartLine {
  resolvedUnitPriceInr: number;
  resolvedSku: string;
  resolvedName: string;
}

/**
 * Re-read each cart line's unit price + sku + name from the catalog.
 * Returns the lines enriched with the server-side values. If a
 * product is unavailable (unpublished, soft-deleted, missing) the
 * line is omitted; callers should reject the order when the resolved
 * set is shorter than the input.
 */
export async function resolveCartLines(
  supabase: SC,
  lines: CheckoutCartLine[],
): Promise<ResolvedLine[]> {
  const productIds = Array.from(new Set(lines.map((l) => l.productId)));
  const { data: products, error } = await supabase
    .from("products")
    .select("id, name, sku, base_price_inr")
    .in("id", productIds)
    .eq("is_published", true)
    .is("deleted_at", null);
  if (error) throw new Error(`resolveCartLines: ${error.message}`);

  const byId = new Map(
    (products ?? []).map((p) => [
      p.id,
      {
        sku: p.sku as string,
        name: p.name as string,
        priceInr: p.base_price_inr as number,
      },
    ]),
  );

  return lines
    .map((l) => {
      const p = byId.get(l.productId);
      if (!p) return null;
      return {
        ...l,
        resolvedUnitPriceInr: p.priceInr,
        resolvedSku: l.sku || p.sku,
        resolvedName: l.name || p.name,
      } satisfies ResolvedLine;
    })
    .filter((l): l is ResolvedLine => l !== null);
}

/**
 * Compute the order totals from the resolved lines. Whole rupees
 * only; no fractional paise math at this layer. Shipping is a flat
 * rate constant for now (per overview.md "Out of MVP" — flat rate
 * until volume justifies a calculator).
 */
const FLAT_SHIPPING_INR = 50;

export function computeTotals(lines: ResolvedLine[]): {
  subtotalInr: number;
  shippingInr: number;
  totalInr: number;
} {
  const subtotalInr = lines.reduce(
    (acc, l) => acc + l.resolvedUnitPriceInr * l.quantity,
    0,
  );
  return {
    subtotalInr,
    shippingInr: FLAT_SHIPPING_INR,
    totalInr: subtotalInr + FLAT_SHIPPING_INR,
  };
}

/**
 * Insert the `orders` row + its `order_items`. Anon-RLS-friendly
 * (status='pending_payment', razorpay_* null, user_id null) so this
 * runs through the public client just like any checkout would.
 *
 * Returns the created order's id + order_number (the BC-YYYY-NNNN
 * trigger fills the latter automatically).
 */
export async function createPendingOrder(
  supabase: SC,
  opts: {
    customer: CustomerInfo;
    shipping: ShippingAddress;
    lines: ResolvedLine[];
    subtotalInr: number;
    shippingInr: number;
    totalInr: number;
    notes?: string;
  },
): Promise<{ id: string; orderNumber: string }> {
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .insert({
      customer_name: opts.customer.name,
      customer_email: opts.customer.email,
      customer_phone: opts.customer.phone,
      shipping_address: opts.shipping,
      subtotal_inr: opts.subtotalInr,
      shipping_inr: opts.shippingInr,
      total_inr: opts.totalInr,
      notes: opts.notes && opts.notes.length ? opts.notes : null,
    })
    .select("id, order_number")
    .single();
  if (orderErr) throw new Error(`createPendingOrder: ${orderErr.message}`);

  const itemsPayload = opts.lines.map((l) => ({
    order_id: order!.id as string,
    product_id: l.productId,
    variant_id: l.variantId,
    sku: l.resolvedSku,
    name: l.resolvedName,
    variant_label: l.variantLabel ?? null,
    unit_price_inr: l.resolvedUnitPriceInr,
    quantity: l.quantity,
    line_total_inr: l.resolvedUnitPriceInr * l.quantity,
  }));

  const { error: itemsErr } = await supabase
    .from("order_items")
    .insert(itemsPayload);
  if (itemsErr) {
    // Best-effort cleanup of the parent row so we don't leave an
    // empty pending order around. RLS lets anon INSERT but not
    // DELETE, so this only works under the service-role caller. The
    // FK CASCADE will pick up the slack if the cleanup itself fails.
    await supabase.from("orders").delete().eq("id", order!.id);
    throw new Error(`createPendingOrder items: ${itemsErr.message}`);
  }

  return {
    id: order!.id as string,
    orderNumber: order!.order_number as string,
  };
}
