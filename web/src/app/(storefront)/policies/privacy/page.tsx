import type { Metadata } from "next";

const LAST_UPDATED = "2026-06-07";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "How Bhavani Crafts handles your data.",
  alternates: { canonical: "/policies/privacy" },
};

/**
 * Privacy policy.
 *
 * DRAFT — owner to review before launch. Reflects the actual posture
 * the codebase ships today:
 *   - PII captured per-order (name/email/phone/address on the orders
 *     table). No customers table, no separate signups.
 *   - Anon SELECT denied on orders by RLS; admin SELECT only.
 *   - No cookies beyond Next’s session state.
 *   - No third-party trackers at MVP (analytics + Sentry land with
 *     P5-T05; mention them once they’re live).
 */
export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy policy</h1>
      <p>
        This policy explains what data Bhavani Crafts collects when you
        use the storefront, why we collect it, and what we do with it.
        Plain language; no legalese except where the law requires it.
      </p>

      <h2>What we collect</h2>
      <p>
        We collect data in two situations only: when you place an order,
        and when you contact us. No cookies are used for tracking and we
        do not run third-party trackers on the site.
      </p>
      <ul>
        <li>
          <strong>When you order:</strong> your name, email, phone
          number, and shipping address. These are stored against the
          order so we can deliver it and contact you about it.
        </li>
        <li>
          <strong>When you contact us:</strong> whatever you choose to
          share on WhatsApp, email, or in person. We do not record
          calls or messages beyond what’s necessary to answer you.
        </li>
        <li>
          <strong>Anonymous usage data:</strong> aggregate page views
          and search queries, kept for two weeks to spot broken pages
          and zero-result searches. No personal identifiers attached.
        </li>
      </ul>

      <h2>What we do with it</h2>
      <ul>
        <li>Process and ship your order.</li>
        <li>Answer your questions when you contact us.</li>
        <li>Improve the catalogue based on what visitors search for.</li>
      </ul>
      <p>
        We do not sell, rent, or share your personal data with third
        parties. The two exceptions are{" "}
        <strong>Razorpay</strong> (our payment processor, which receives
        the order total + your name + email so it can collect the
        payment) and our shipping courier (whose name, phone, and
        address we share so they can deliver). Razorpay’s own privacy
        policy applies to its handling of your payment instrument data;
        Bhavani Crafts never stores card numbers or UPI IDs.
      </p>

      <h2>How we store it</h2>
      <p>
        Customer data lives in our database (Supabase, hosted in India).
        Access is gated by row-level security: the database itself
        refuses anonymous reads on the orders table. Only signed-in
        admin sessions with two-factor authentication can read order
        rows.
      </p>

      <h2>How long we keep it</h2>
      <p>
        Order records: indefinitely, for accounting and consumer-law
        compliance. Anonymous search logs: 14 days. If you would like
        your order records deleted, contact us and we will comply
        within 30 days; we may retain a redacted record for our books.
      </p>

      <h2>Your rights</h2>
      <p>
        You can request a copy of the data we hold on you, ask us to
        correct anything wrong, or ask us to delete it (with the
        caveat above). Email or WhatsApp the address listed on the
        <a href="/contact"> contact page</a>.
      </p>

      <h2>Children</h2>
      <p>
        The storefront is not aimed at children under 13. We do not
        knowingly collect data from them. If you believe a child has
        ordered without parental consent, contact us and we will
        delete the record.
      </p>

      <h2>Changes</h2>
      <p>
        We will note any change to this policy at the bottom of this
        page (date below). Material changes will be flagged at the top
        for the first 30 days after they land.
      </p>

      <p className="mt-12 text-xs text-stone-500">
        Last updated: {LAST_UPDATED}.
      </p>
    </>
  );
}
