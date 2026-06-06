import { CopyAddress } from "./copy-address";

/**
 * Section #7 of the landing page (design-system.md §"Landing page
 * composition" #7): "Visit Bhavani Crafts" — store photo + address +
 * hours + a maps link. The address is click-to-copy.
 *
 * Static content. The address, hours, photo, and maps link are
 * PLACEHOLDERS pending the owner's real store details (see
 * claude/blockers.md §"Real-content gate"). Edit them here in one place.
 * Per T08 we link out to Google Maps rather than embedding an iframe, to
 * protect the Lighthouse budget (T23).
 */

// PLACEHOLDER content — owner replaces before launch.
const ADDRESS = "Bhavani Crafts, Plot 00, Road 00, Hyderabad, Telangana 500000";
const HOURS: Array<{ days: string; time: string }> = [
  { days: "Tue – Sat", time: "10:00 – 19:00" },
  { days: "Sun", time: "11:00 – 17:00" },
  { days: "Mon", time: "Closed" },
];
const MAPS_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
  ADDRESS,
)}`;

export function Visit() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-16">
      <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
        {/* Photo (placeholder until the owner supplies a store photo) */}
        <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-husk-200 bg-husk-100">
          <div className="flex h-full items-center justify-center">
            <span className="font-mono text-xs uppercase tracking-[0.2em] text-stone-400">
              Store photo
            </span>
          </div>
        </div>

        {/* Details */}
        <div className="flex flex-col justify-center">
          <h2 className="font-[family-name:var(--font-display)] text-3xl tracking-tight text-bark-900 sm:text-4xl">
            Visit Bhavani Crafts
          </h2>

          <div className="mt-6">
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
        </div>
      </div>
    </section>
  );
}
