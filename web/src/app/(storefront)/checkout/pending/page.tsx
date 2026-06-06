import type { Metadata } from "next";
import Link from "next/link";
import { Hourglass, MessageSquare } from "lucide-react";

/**
 * /checkout/pending — placeholder confirmation while Razorpay test
 * keys are owner-pending (blockers.md). The order has been created
 * in `pending_payment` status; we surface the order number, tell the
 * customer payment integration is being finalised, and offer
 * WhatsApp as the human follow-up channel (the same one the bulk-
 * enquiry CTA uses).
 *
 * Once T28 ships:
 *   - This page is replaced by /checkout/success for the real
 *     post-payment confirmation.
 *   - Razorpay's widget runs between order-create and confirmation;
 *     this "pending" route stays as the fallback for when the
 *     customer closes the widget before paying (the webhook back-
 *     stop in T28 then resolves the row).
 */
export const metadata: Metadata = {
  title: "Order received",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ order?: string | string[] }>;

function readOrderNumber(sp: Awaited<SearchParams>): string | null {
  const raw = Array.isArray(sp.order) ? sp.order[0] : sp.order;
  if (typeof raw !== "string") return null;
  // Defensive — only accept the BC-YYYY-NNNN shape the trigger mints.
  return /^BC-\d{4}-\d{4,}$/.test(raw) ? raw : null;
}

export default async function CheckoutPendingPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const orderNumber = readOrderNumber(sp);
  const waNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER;
  const waHref =
    waNumber && orderNumber
      ? `https://wa.me/${waNumber}?text=${encodeURIComponent(
          `Hi Bhavani Crafts — my order ${orderNumber} is awaiting payment. How should I complete it?`,
        )}`
      : null;

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16 text-center">
      <div className="mx-auto grid size-12 place-items-center rounded-full bg-husk-100">
        <Hourglass className="size-5 text-clay-600" />
      </div>
      <h1 className="mt-5 font-[family-name:var(--font-display)] text-3xl tracking-tight text-bark-900">
        Order received
      </h1>
      {orderNumber ? (
        <p className="mt-2 text-sm text-stone-600">
          Reference{" "}
          <span className="font-mono text-bark-900">{orderNumber}</span>
        </p>
      ) : null}
      <p className="mt-6 text-sm leading-relaxed text-stone-600">
        Your order is reserved. Online payment via Razorpay is being finalised
        — we&rsquo;ll send a payment link to your email shortly. If you&rsquo;d
        rather complete by WhatsApp, ping us with your order number and
        we&rsquo;ll guide you the rest of the way.
      </p>

      <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        {waHref ? (
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-teal-800 px-5 py-2.5 text-sm font-medium text-paper-0 transition-colors hover:bg-teal-900"
          >
            <MessageSquare className="size-3.5" />
            Continue on WhatsApp
          </a>
        ) : null}
        <Link
          href="/"
          className="inline-flex items-center rounded-full border border-husk-200 bg-paper-0 px-5 py-2.5 text-sm font-medium text-bark-900 transition-colors hover:border-bark-900"
        >
          Keep browsing
        </Link>
      </div>
    </main>
  );
}
