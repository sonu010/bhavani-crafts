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
        // ALWAYS use catalog values, never the client snapshot — the
        // client's sku/name are accepted by the schema for display
        // metadata but never authoritative. This is the same rule as
        // unit price.
        resolvedUnitPriceInr: p.priceInr,
        resolvedSku: p.sku,
        resolvedName: p.name,
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
 * Insert the `orders` row + its `order_items` via the
 * `create_anon_order(...)` RPC (0018). Why an RPC instead of two
 * client-side inserts:
 *
 *   1. The orders RLS denies anon SELECT (PII gate, ADR-011 §1).
 *      A normal `.insert(...).select("id")` chain therefore can't
 *      read back the new id and order_number under anon.
 *   2. The RPC is SECURITY DEFINER, so it inserts + reads back in
 *      one round trip with no service-role on the call site —
 *      `app/(storefront)/...` stays clean of the admin client.
 *   3. Atomicity: both inserts happen inside the function body, so
 *      there's no half-written-order failure mode where the items
 *      slot is empty.
 *
 * The RPC re-enforces the totals-balance + bounds checks the policy
 * already enforces, so a malformed call surfaces a clear error
 * before the row-level CHECK constraints fire.
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
  const itemsPayload = opts.lines.map((l) => ({
    product_id: l.productId,
    variant_id: l.variantId,
    sku: l.resolvedSku,
    name: l.resolvedName,
    variant_label: l.variantLabel ?? null,
    unit_price_inr: l.resolvedUnitPriceInr,
    quantity: l.quantity,
    line_total_inr: l.resolvedUnitPriceInr * l.quantity,
  }));

  // PostgREST jsonb args accept arrays/objects directly; the cast
  // through `unknown` papers over Supabase JS's narrower Json typing.
  const { data, error } = await supabase.rpc("create_anon_order", {
    p_customer_name: opts.customer.name,
    p_customer_email: opts.customer.email,
    p_customer_phone: opts.customer.phone,
    p_shipping: opts.shipping as unknown as Database["public"]["Functions"]["create_anon_order"]["Args"]["p_shipping"],
    p_subtotal_inr: opts.subtotalInr,
    p_shipping_inr: opts.shippingInr,
    p_total_inr: opts.totalInr,
    p_notes: opts.notes && opts.notes.length ? opts.notes : "",
    p_items: itemsPayload as unknown as Database["public"]["Functions"]["create_anon_order"]["Args"]["p_items"],
  });

  if (error) throw new Error(`createPendingOrder: ${error.message}`);
  const row = (data ?? [])[0];
  if (!row) {
    throw new Error("createPendingOrder: RPC returned no row");
  }
  return {
    id: row.id as string,
    orderNumber: row.order_number as string,
  };
}
