import type { Metadata } from "next";

const LAST_UPDATED = "2026-06-07";

export const metadata: Metadata = {
  title: "Terms & conditions",
  description: "The rules that apply when you buy from Bhavani Crafts.",
  alternates: { canonical: "/policies/terms" },
};

/**
 * Terms & conditions.
 *
 * DRAFT — owner to review before launch. Defaults:
 *   - Jurisdiction Hyderabad, Telangana, India.
 *   - Dispute path: WhatsApp first, email second, consumer forum
 *     third.
 *   - Prices in INR, GST-inclusive when applicable.
 *   - Order can be cancelled by the owner before payment captured.
 */
export default function TermsPage() {
  return (
    <>
      <h1>Terms &amp; conditions</h1>
      <p>
        By placing an order on this site you agree to the terms below.
        If anything is unclear, ask us on{" "}
        <a href="/contact">the contact page</a> before you order.
      </p>

      <h2>Who we are</h2>
      <p>
        Bhavani Crafts is a craft-supplies and gifting business based
        in Hyderabad, Telangana, India. Owner-run; no separate legal
        entity behind a curtain. When you buy from us you’re buying
        from us directly.
      </p>

      <h2>Ordering</h2>
      <ul>
        <li>
          Prices on the site are in Indian rupees (INR). GST is
          included in the displayed price when applicable to that
          product.
        </li>
        <li>
          Your order is confirmed when payment is captured. Up to
          that point either side may walk away with no obligation.
        </li>
        <li>
          We reserve the right to refuse an order — for example, if a
          listed price is obviously wrong, if stock is genuinely
          unavailable, or if the order looks fraudulent. We will
          refund any payment captured in such a case.
        </li>
        <li>
          Bulk-order enquiries (more than 20 of the same item, or
          order value above ₹10,000) get a custom quote via WhatsApp
          rather than the standard checkout. See the bulk-enquiry
          link on the home page.
        </li>
      </ul>

      <h2>Pricing &amp; payment</h2>
      <p>
        Payments are processed by Razorpay. We never see your full
        card number or UPI handle; Razorpay handles that
        infrastructure under its own terms. We see your name, contact
        details, and the order total. See our{" "}
        <a href="/policies/privacy">privacy policy</a> for details.
      </p>

      <h2>Shipping</h2>
      <p>
        See the <a href="/policies/shipping">shipping policy</a> for
        delivery windows, geographic coverage, and what happens if a
        delivery fails.
      </p>

      <h2>Returns &amp; refunds</h2>
      <p>
        See the <a href="/policies/returns">returns policy</a> for the
        window, condition, and process. Custom or made-to-order items
        are not returnable; this is flagged on the product page.
      </p>

      <h2>Use of the site</h2>
      <ul>
        <li>
          The site is for personal, non-commercial use. You may
          browse, order, and share product links. You may not scrape,
          mirror, or republish our catalogue or photos.
        </li>
        <li>
          Product photos and descriptions are © Bhavani Crafts unless
          otherwise marked. Some images may be licensed from
          suppliers; usage rights are tracked internally and reflect
          on the storefront.
        </li>
      </ul>

      <h2>Liability</h2>
      <p>
        We try to describe products accurately and ship them safely.
        We are not liable for indirect or consequential damages (for
        example, lost profits because a delivery was late). Our total
        liability for any order is capped at the amount you paid for
        that order, except where the law of India provides otherwise.
      </p>

      <h2>Disputes</h2>
      <p>
        If something has gone wrong, please tell us first — most
        issues resolve within a day or two on WhatsApp. If we can’t
        reach an agreement, the courts at Hyderabad, Telangana, India
        have exclusive jurisdiction over any dispute. Indian law
        applies.
      </p>

      <h2>Changes</h2>
      <p>
        We may update these terms occasionally; the date below
        reflects the latest version. Material changes will be flagged
        at the top for the first 30 days after they land. Continuing
        to use the site after a change means you accept it.
      </p>

      <p className="mt-12 text-xs text-stone-500">
        Last updated: {LAST_UPDATED}.
      </p>
    </>
  );
}
