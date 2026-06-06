import Link from "next/link";
import { whatsappHref, hasWhatsapp } from "@/lib/storefront/whatsapp";
import { NewsletterForm } from "@/app/(storefront)/_footer/newsletter-form";

/**
 * Editorial 4-column footer (design-system.md §"Landing page
 * composition" #8): brand + tagline · Catalog · Policies · Contact.
 * Collapses to a single stack on mobile. Rendered inside the storefront
 * layout so every public page gets it; admin pages never do.
 *
 * Policy routes are stubbed (full policy pages land later). The
 * Instagram link only shows when NEXT_PUBLIC_INSTAGRAM_URL is set.
 */

const INSTAGRAM_URL = process.env.NEXT_PUBLIC_INSTAGRAM_URL ?? "";
const WHATSAPP_PREFILL = "Hi Bhavani Crafts — I have a question.";

const POLICY_LINKS = [
  { href: "/policies/shipping", label: "Shipping" },
  { href: "/policies/returns", label: "Returns" },
  { href: "/policies/privacy", label: "Privacy" },
];

export function SiteFooter({
  categories,
}: {
  categories: Array<{ slug: string; name: string }>;
}) {
  return (
    <footer className="mt-16 border-t border-husk-200 bg-cream-50">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-12 sm:grid-cols-2 lg:grid-cols-4">
        {/* Brand + tagline + newsletter */}
        <div>
          <p className="font-[family-name:var(--font-display)] text-2xl text-bark-900">
            Bhavani <em className="italic text-clay-600">Crafts</em>
          </p>
          <p className="mt-2 text-sm leading-relaxed text-stone-500">
            A craft-supply studio in Hyderabad.
          </p>
          <NewsletterForm />
        </div>

        {/* Catalog */}
        <nav aria-label="Catalog">
          <h3 className="font-mono text-[11px] uppercase tracking-[0.2em] text-stone-500">
            Catalog
          </h3>
          <ul className="mt-3 space-y-2 text-sm">
            {categories.slice(0, 6).map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/c/${c.slug}`}
                  className="text-bark-900 transition-colors hover:text-teal-800"
                >
                  {c.name}
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/search"
                className="text-bark-900 transition-colors hover:text-teal-800"
              >
                Search all
              </Link>
            </li>
          </ul>
        </nav>

        {/* Policies */}
        <nav aria-label="Policies">
          <h3 className="font-mono text-[11px] uppercase tracking-[0.2em] text-stone-500">
            Policies
          </h3>
          <ul className="mt-3 space-y-2 text-sm">
            {POLICY_LINKS.map((p) => (
              <li key={p.href}>
                <Link
                  href={p.href}
                  className="text-bark-900 transition-colors hover:text-teal-800"
                >
                  {p.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Contact */}
        <div>
          <h3 className="font-mono text-[11px] uppercase tracking-[0.2em] text-stone-500">
            Contact
          </h3>
          <ul className="mt-3 space-y-2 text-sm">
            {hasWhatsapp() ? (
              <li>
                <a
                  href={whatsappHref(WHATSAPP_PREFILL)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-bark-900 transition-colors hover:text-teal-800"
                >
                  WhatsApp
                </a>
              </li>
            ) : null}
            {INSTAGRAM_URL ? (
              <li>
                <a
                  href={INSTAGRAM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-bark-900 transition-colors hover:text-teal-800"
                >
                  Instagram
                </a>
              </li>
            ) : null}
            <li className="text-stone-500">Hyderabad, Telangana</li>
          </ul>
        </div>
      </div>

      <div className="border-t border-husk-200">
        <div className="mx-auto max-w-6xl px-6 py-4">
          <p className="font-mono text-[11px] text-stone-400">
            © {new Date().getFullYear()} Bhavani Crafts
          </p>
        </div>
      </div>
    </footer>
  );
}
