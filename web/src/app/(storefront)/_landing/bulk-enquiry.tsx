import { whatsappHref, hasWhatsapp } from "@/lib/storefront/whatsapp";
import { getStorefrontSettings } from "@/lib/storefront/settings";

/**
 * Section #6 of the landing page (design-system.md §"Landing page
 * composition" #6): a full-bleed paper-0 strip with an oversized
 * Newsreader pull-quote and one CTA that opens WhatsApp prefilled.
 *
 * Server component — reads the WhatsApp number from app_settings
 * (cached with the `app-settings` tag, flushed by the admin Settings
 * page on save). Falls back to NEXT_PUBLIC_WHATSAPP_NUMBER for fresh
 * deploys + DEFAULTS.whatsappNumber as the last resort. The CTA hides
 * entirely when nothing is configured.
 */

const QUOTE_PRE = "Doing a class of 40?";
const QUOTE_EM = "We deliver to your school.";
const PREFILL =
  "Hi Bhavani Crafts — I'd like a bulk quote for a workshop. Here's what I need:";

export async function BulkEnquiry() {
  const { whatsappNumber } = await getStorefrontSettings();
  const showCta = hasWhatsapp(whatsappNumber);

  return (
    <section className="w-full bg-paper-0 py-20">
      <div className="mx-auto max-w-4xl px-6 text-center">
        <p className="font-[family-name:var(--font-display)] text-3xl leading-[1.15] tracking-tight text-bark-900 sm:text-4xl lg:text-5xl">
          {QUOTE_PRE} <em className="italic text-clay-600">{QUOTE_EM}</em>
        </p>
        {showCta ? (
          <a
            href={whatsappHref(whatsappNumber, PREFILL)}
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
