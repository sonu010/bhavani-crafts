import type { Metadata } from "next";
import { CheckoutClient } from "./checkout-client";

/**
 * /checkout — collects contact + shipping address, shows cart
 * summary + totals, posts to the order-create server action.
 *
 * The whole page is dynamic + client-rendered because the cart lives
 * in localStorage (Zustand persist). SSR can't read it; we mount a
 * client component that reads from `useCartStore` and shows the form
 * + summary against the hydrated state.
 *
 * Per the design-system + ADR-011:
 *   - INR only (₹ formatting, no FX).
 *   - Flat shipping ₹50 — server recomputes (see lib/db/checkout.ts).
 *   - No customer accounts at MVP — fields are per-order.
 *   - Razorpay test keys are owner-pending. While missing, the
 *     server action still creates the local pending_payment order
 *     and returns `razorpay: null`; the page shows a "Payment
 *     integration pending" notice rather than crash.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false, follow: false },
};

export default function CheckoutPage() {
  return <CheckoutClient />;
}
