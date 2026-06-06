import { whatsappHref, hasWhatsapp } from "@/lib/storefront/whatsapp";

/**
 * Section #6 of the landing page (design-system.md §"Landing page
 * composition" #6): a full-bleed paper-0 strip with an oversized
 * Newsreader pull-quote and one CTA that opens WhatsApp prefilled.
 *
 * The CTA only renders when a WhatsApp number is configured
 * (NEXT_PUBLIC_WHATSAPP_NUMBER); otherwise the quote stands alone.
 */

const QUOTE_PRE = "Doing a class of 40?";
const QUOTE_EM = "We deliver to your school.";
const PREFILL =
  "Hi Bhavani Crafts — I'd like a bulk quote for a workshop. Here's what I need:";

export function BulkEnquiry() {
  return (
    <section className="w-full bg-paper-0 py-20">
      <div className="mx-auto max-w-4xl px-6 text-center">
        <p className="font-[family-name:var(--font-display)] text-3xl leading-[1.15] tracking-tight text-bark-900 sm:text-4xl lg:text-5xl">
          {QUOTE_PRE} <em className="italic text-clay-600">{QUOTE_EM}</em>
        </p>
        {hasWhatsapp() ? (
          <a
            href={whatsappHref(PREFILL)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-8 inline-flex items-center rounded-full bg-teal-800 px-6 py-3 text-sm font-medium text-paper-0 transition-colors hover:bg-teal-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800"
          >
            Enquire on WhatsApp
          </a>
        ) : null}
      </div>
    </section>
  );
}
