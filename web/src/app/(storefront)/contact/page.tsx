import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getStorefrontSettings } from "@/lib/storefront/settings";
import { hasWhatsapp, whatsappHref } from "@/lib/storefront/whatsapp";
import { CopyAddress } from "@/app/(storefront)/_landing/copy-address";

const LAST_UPDATED = "2026-06-07";

// DRAFT placeholders — owner replaces before launch. Kept in sync
// with the landing-page Visit section (`_landing/visit.tsx`).
const ADDRESS = "Bhavani Crafts, Plot 00, Road 00, Hyderabad, Telangana 500000";
const CONTACT_EMAIL = "hello@bhavanicrafts.example";
const HOURS: Array<{ days: string; time: string }> = [
  { days: "Tue – Sat", time: "10:00 – 19:00" },
  { days: "Sun", time: "11:00 – 17:00" },
  { days: "Mon", time: "Closed" },
];

const MAPS_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
  ADDRESS,
)}`;

const WHATSAPP_PREFILL = "Hi Bhavani Crafts — I'd like to ask about an order.";

export const metadata: Metadata = {
  title: "Contact",
  description: "How to reach Bhavani Crafts — WhatsApp, email, address, hours.",
  alternates: { canonical: "/contact" },
};

/**
 * Contact page (P5-T02). The canonical "how to reach us" surface,
 * deep-linked from the policy pages, the footer, and inline error
 * states across the storefront ("can't find your order? message us
 * on WhatsApp").
 *
 * Reads WhatsApp + Instagram from `app_settings` (owner-editable in
 * /admin/settings). Email + address + hours are placeholder
 * constants pending owner content review — promoting them to
 * `app_settings` is a follow-up (see Notes for next agent in
 * P5-T02 task file).
 */
export default async function ContactPage() {
  const { whatsappNumber, instagramUrl } = await getStorefrontSettings();
  const showWhatsapp = hasWhatsapp(whatsappNumber);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-stone-500 transition-colors hover:text-bark-900"
      >
        <ChevronLeft className="size-3.5" />
        Back to Bhavani Crafts
      </Link>

      <article className="mt-6">
        <h1 className="font-[family-name:var(--font-display)] text-3xl tracking-tight text-bark-900 sm:text-4xl">
          Contact
        </h1>

        <p className="mt-4 text-sm leading-relaxed text-stone-700">
          The fastest way to reach us is WhatsApp. We answer Tuesday
          through Sunday during studio hours; messages outside hours
          get a reply the next working day.
        </p>

        {/* Primary contact methods */}
        <dl className="mt-8 grid gap-6 sm:grid-cols-2">
          {showWhatsapp ? (
            <div>
              <dt className="font-mono text-[11px] uppercase tracking-[0.2em] text-stone-500">
                WhatsApp
              </dt>
              <dd className="mt-2">
                <a
                  href={whatsappHref(whatsappNumber, WHATSAPP_PREFILL)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-teal-800 underline-offset-2 hover:underline"
                >
                  Message us on WhatsApp →
                </a>
              </dd>
            </div>
          ) : null}

          <div>
            <dt className="font-mono text-[11px] uppercase tracking-[0.2em] text-stone-500">
              Email
            </dt>
            <dd className="mt-2">
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-sm text-teal-800 underline-offset-2 hover:underline"
              >
                {CONTACT_EMAIL}
              </a>
            </dd>
          </div>

          {instagramUrl ? (
            <div>
              <dt className="font-mono text-[11px] uppercase tracking-[0.2em] text-stone-500">
                Instagram
              </dt>
              <dd className="mt-2">
                <a
                  href={instagramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-teal-800 underline-offset-2 hover:underline"
                >
                  @bhavanicrafts →
                </a>
              </dd>
            </div>
          ) : null}
        </dl>

        {/* Visit */}
        <h2 className="mt-12 font-[family-name:var(--font-display)] text-2xl text-bark-900">
          Visit the studio
        </h2>

        <div className="mt-4">
          <CopyAddress address={ADDRESS} />
        </div>

        <dl className="mt-6 space-y-1">
          {HOURS.map((h) => (
            <div key={h.days} className="flex gap-4 text-sm">
              <dt className="w-24 shrink-0 text-stone-500">{h.days}</dt>
              <dd className="font-mono tabular-nums text-bark-900">{h.time}</dd>
            </div>
          ))}
        </dl>

        <a
          href={MAPS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-8 inline-flex w-fit items-center rounded-full border border-husk-200 px-5 py-2.5 text-sm font-medium text-bark-900 transition-colors hover:border-bark-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800"
        >
          Open in Google Maps
        </a>

        {/* Bulk + custom enquiries CTA */}
        <h2 className="mt-12 font-[family-name:var(--font-display)] text-2xl text-bark-900">
          Bulk orders &amp; custom work
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-stone-700">
          For orders of more than 20 of the same item, school
          workshops, or custom-made pieces, message us on WhatsApp
          with what you have in mind and we&rsquo;ll send a quote.
        </p>

        <p className="mt-12 text-xs text-stone-500">
          Last updated: {LAST_UPDATED}.
        </p>
      </article>
    </main>
  );
}
