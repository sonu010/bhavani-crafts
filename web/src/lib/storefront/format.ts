/**
 * Storefront formatting helpers. No "use client" / no "server-only" —
 * usable on both sides.
 */

const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

/**
 * Format a rupee amount (stored as an integer number of rupees, e.g.
 * `base_price_inr`) as `₹680` / `₹1,250`. Returns an em dash for null.
 */
export function formatInr(rupees: number | null | undefined): string {
  if (rupees == null) return "—";
  return inrFormatter.format(rupees);
}
