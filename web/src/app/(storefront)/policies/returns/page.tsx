import type { Metadata } from "next";

const LAST_UPDATED = "2026-06-07";

export const metadata: Metadata = {
  title: "Returns & refunds",
  description: "How returns work at Bhavani Crafts and what is refundable.",
  alternates: { canonical: "/policies/returns" },
};

/**
 * Returns policy.
 *
 * Reflects ADR-011 §"What we deliberately do NOT do at MVP" — no
 * refunds in the app itself. Refunds are owner-initiated via the
 * Razorpay dashboard; the admin can then mark the order as
 * `refunded` for the audit trail.
 *
 * Defaults: 7-day window for damaged-on-arrival, no returns for
 * custom/made-to-order, refunds to the original payment method
 * within 7 business days.
 */
export default function ReturnsPage() {
  return (
    <>
      <h1>Returns &amp; refunds</h1>
      <p>
        We want you to be happy with what you ordered. If something
        went wrong â damaged on arrival, wrong item, didn’t match the
        listing â we’ll make it right. Read on for the window, the
        process, and what’s eligible.
      </p>

      <h2>Eligible returns</h2>
      <ul>
        <li>
          <strong>Damaged on arrival.</strong> Photograph the parcel
          before opening + the damaged item, and contact us within{" "}
          <strong>48 hours</strong> of delivery. We’ll arrange
          collection and a replacement (or a refund if the item is
          out of stock).
        </li>
        <li>
          <strong>Wrong item shipped.</strong> Same process — photo
          + WhatsApp, within 7 days of delivery. We pay for the
          return courier.
        </li>
        <li>
          <strong>Significantly different from the listing.</strong>{" "}
          Within 7 days of delivery, you can return the item for a
          full refund. The item must be unused and in its original
          packaging.
        </li>
      </ul>

      <h2>Not eligible</h2>
      <ul>
        <li>
          <strong>Custom or made-to-order items.</strong> These are
          made for you specifically; we cannot resell them. Flagged
          on the product page.
        </li>
        <li>
          <strong>Used or partially-used items.</strong> Once a
          consumable (paint, resin, paper, etc.) has been opened we
          cannot accept a return for any reason other than damage.
        </li>
        <li>
          <strong>Sale or clearance items</strong> are final unless
          they arrive damaged.
        </li>
        <li>
          <strong>&ldquo;Changed my mind&rdquo;</strong> returns outside the 7-day
          window. Within the window, contact us and we’ll work
          something out where we can.
        </li>
      </ul>

      <h2>How to start a return</h2>
      <p>
        Message us on WhatsApp (see the{" "}
        <a href="/contact">contact page</a>) with your order number
        (BC-YYYY-NNNN), what’s wrong, and photos. We’ll respond
        within one business day with the next step.
      </p>

      <h2>How refunds work</h2>
      <p>
        Approved refunds are issued to the original payment method
        through Razorpay. Timing depends on the bank:
      </p>
      <ul>
        <li>
          <strong>UPI / wallets:</strong> 1–3 business days from
          approval.
        </li>
        <li>
          <strong>Cards / netbanking:</strong> 5–7 business days from
          approval.
        </li>
      </ul>
      <p>
        We do not refund the original shipping fee unless the return
        was caused by us (damaged on arrival, wrong item, or
        significantly different).
      </p>

      <h2>Exchanges</h2>
      <p>
        Yes, where we have stock. Same process as a return; tell us
        what you’d like instead and we’ll send a fresh dispatch
        once the original is back with us.
      </p>

      <p className="mt-12 text-xs text-stone-500">
        Last updated: {LAST_UPDATED}.
      </p>
    </>
  );
}
