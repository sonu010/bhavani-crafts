import type { Metadata } from "next";
import { getStorefrontSettings } from "@/lib/storefront/settings";

const LAST_UPDATED = "2026-06-07";

export const metadata: Metadata = {
  title: "Shipping policy",
  description: "Where Bhavani Crafts ships, what it costs, and how long it takes.",
  alternates: { canonical: "/policies/shipping" },
};

function inr(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

/**
 * Shipping policy.
 *
 * Reads the live shipping_flat_inr from app_settings so the page never
 * contradicts what the checkout charges. Owner edits in
 * /admin/settings; the storefront-settings cache flushes on save.
 */
export default async function ShippingPage() {
  const { shippingFlatInr } = await getStorefrontSettings();

  return (
    <>
      <h1>Shipping policy</h1>
      <p>
        We ship pan-India. Most orders reach the customer in 3–7
        business days; remote PIN codes take a few days longer. This
        page covers the where, what, and when of delivery.
      </p>

      <h2>Where we ship</h2>
      <p>
        Domestic India only. We do not currently ship internationally.
        If you are outside India and want a quote, write to us via{" "}
        <a href="/contact">the contact page</a> — bulk and gift orders
        we can sometimes accommodate as a one-off.
      </p>

      <h2>What it costs</h2>
      <p>
        Flat-rate shipping of {inr(shippingFlatInr)} per order,
        applied at checkout, regardless of order size or destination
        PIN code. Free shipping promotions are advertised at the top
        of the home page when running.
      </p>

      <h2>When you’ll get it</h2>
      <ul>
        <li>
          <strong>Dispatch:</strong> within 2 business days of payment
          confirmation. We will send a tracking link to your phone and
          email when the parcel leaves us.
        </li>
        <li>
          <strong>Delivery:</strong> 3–7 business days for metro
          destinations; up to 12 business days for remote PIN codes.
          Courier partner varies by destination.
        </li>
        <li>
          <strong>Made-to-order items:</strong> add the lead time
          shown on the product page (typically 5–10 business days)
          before the dispatch window starts.
        </li>
      </ul>

      <h2>If a delivery fails</h2>
      <ul>
        <li>
          The courier will attempt delivery up to 3 times before
          returning the parcel. They’ll call the phone number on the
          order — please answer.
        </li>
        <li>
          If the parcel returns to us undelivered we will contact you
          to arrange a redelivery (paid by you) or a refund (less the
          original shipping cost).
        </li>
        <li>
          Damaged in transit? Photograph the package before opening
          and contact us within 48 hours of delivery. We’ll arrange a
          replacement or refund per the{" "}
          <a href="/policies/returns">returns policy</a>.
        </li>
      </ul>

      <h2>Custom or bulk orders</h2>
      <p>
        For very large orders (more than 20 of the same item, or
        over 10 kg), shipping is quoted separately. Request a quote
        via the bulk-enquiry CTA on the home page.
      </p>

      <h2>Tracking</h2>
      <p>
        You’ll receive a tracking link by WhatsApp + email within 2
        business days of dispatch. If you don’t, message us — we may
        have an old contact number on file.
      </p>

      <p className="mt-12 text-xs text-stone-500">
        Last updated: {LAST_UPDATED}.
      </p>
    </>
  );
}
