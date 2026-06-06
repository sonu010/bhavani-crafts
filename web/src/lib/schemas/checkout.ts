/**
 * Zod schemas for the checkout flow (P3-T26 / T27).
 *
 * Two scopes:
 *   - `CustomerInfoSchema` + `ShippingAddressSchema`: what the
 *     /checkout form collects from the customer. The form-level types
 *     drive react-hook-form + the inline field errors.
 *   - `CreateCheckoutOrderInputSchema`: what the order-create server
 *     action accepts. Includes the cart lines too — server recomputes
 *     totals from these, NEVER trusts a client-sent total. See ADR-011
 *     §"Server-side order creation; client-side checkout-widget open."
 *
 * Validation strictness mirrors the database constraints in
 * `0015_orders.sql` so a row that passes Zod also passes the CHECK
 * constraints, and the user sees a friendly error before the round
 * trip rather than a 500 from a constraint violation.
 */
import { z } from "zod";

const trimmed = (n: number) => z.string().trim().min(1).max(n);

/** Indian phone digits — UPI/SMS need at least 10. Accept +91 prefix. */
const phoneRe = /^\+?[0-9 \-()]{7,20}$/;
/** PIN code — India only at MVP. 6 digits, can't start with 0. */
const pinRe = /^[1-9][0-9]{5}$/;

export const CustomerInfoSchema = z.object({
  name: trimmed(120),
  email: trimmed(254).pipe(z.string().email("Enter a valid email")),
  phone: trimmed(20).regex(
    phoneRe,
    "Enter a valid phone (digits, optional +91 prefix)",
  ),
});

export type CustomerInfo = z.infer<typeof CustomerInfoSchema>;

/**
 * Shipping address — flat shape stored as jsonb in orders.shipping_address.
 * Keys match the DB column's documented shape (`lib/db/checkout.ts`
 * reads them back the same way). Country is locked to IN at MVP.
 */
export const ShippingAddressSchema = z.object({
  line1: trimmed(120),
  line2: z.string().trim().max(120).optional().or(z.literal("")),
  landmark: z.string().trim().max(120).optional().or(z.literal("")),
  city: trimmed(60),
  state: trimmed(40),
  pin: z.string().trim().regex(pinRe, "Enter a valid 6-digit PIN"),
  country: z.literal("IN").default("IN"),
});

export type ShippingAddress = z.infer<typeof ShippingAddressSchema>;

/**
 * One cart line as the checkout server action expects it. We accept
 * the client's snapshot for SKU + name + unit price purely as
 * metadata — the server STILL re-reads price from the catalog and
 * overrides the client's value (per ADR-011 §"Server is source of
 * truth for prices"). The snapshot is here for display + audit.
 */
export const CheckoutCartLineSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().nullable(),
  sku: trimmed(60),
  name: trimmed(200),
  variantLabel: z.string().trim().max(200).nullable().optional(),
  // Client-reported unit price — informational only.
  unitPriceInr: z.number().int().nonnegative(),
  quantity: z.number().int().min(1).max(999),
});

export type CheckoutCartLine = z.infer<typeof CheckoutCartLineSchema>;

/** Top-level input for the order-create server action. */
export const CreateCheckoutOrderInputSchema = z.object({
  customer: CustomerInfoSchema,
  shipping: ShippingAddressSchema,
  lines: z.array(CheckoutCartLineSchema).min(1).max(50),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});

export type CreateCheckoutOrderInput = z.infer<
  typeof CreateCheckoutOrderInputSchema
>;

/**
 * What the server returns to the client after a successful order
 * create. When Razorpay is configured the `razorpay` field is filled;
 * otherwise it's null and the client falls back to the "payment
 * pending" placeholder flow (P3-T27 scaffold while owner provides
 * the keys).
 */
export interface CreateCheckoutOrderResult {
  orderId: string; // local orders.id (uuid)
  orderNumber: string; // BC-YYYY-NNNN
  totalInr: number;
  razorpay: {
    keyId: string;
    razorpayOrderId: string;
    amountPaise: number;
    currency: "INR";
  } | null;
}
