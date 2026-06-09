import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

const LAST_UPDATED = "2026-06-07";

export const metadata: Metadata = {
  title: "About",
  description: "About Bhavani Crafts — craft supplies + gifting, made in Hyderabad.",
  alternates: { canonical: "/about" },
};

/**
 * About page (P5-T02). The brand story: who we are, where we work,
 * why this shop exists. Three short editorial paragraphs in the
 * Newsreader display tone the landing copy already uses.
 *
 * DRAFT — owner reviews + signs off the copy before launch.
 * Placeholder photo lives where the Visit-section photo does and
 * follows the same swap-when-real-photo-lands convention.
 */
export default function AboutPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-stone-500 transition-colors hover:text-bark-900"
      >
        <ChevronLeft className="size-3.5" />
        Back to Bhavani Crafts
      </Link>

      <article className="mt-6 space-y-6">
        <header>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-stone-500">
            About
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl tracking-tight text-bark-900 sm:text-4xl">
            A craft-supplies studio in Hyderabad.
          </h1>
        </header>

        {/* Placeholder image — swap for owner's real studio photo
            when it lands. */}
        <div className="relative aspect-[16/9] overflow-hidden rounded-lg border border-husk-200 bg-husk-100">
          <div className="flex h-full items-center justify-center">
            <span className="font-mono text-xs uppercase tracking-[0.2em] text-stone-600">
              Studio photo — placeholder
            </span>
          </div>
        </div>

        <div className="space-y-5 text-sm leading-relaxed text-stone-700 [&_strong]:font-medium [&_strong]:text-bark-900">
          <p>
            Bhavani Crafts started in a small Hyderabad workroom with
            a simple idea: most people buy craft supplies twice —
            once for the project they have in mind, and once again
            when the first set turns out to be the wrong gauge,
            wrong colour, or wrong scale. We wanted to be the shop
            you can trust to send the right thing the first time.
          </p>

          <p>
            Today we ship pan-India from the same workroom. Our
            catalogue covers <strong>pooja items</strong> in brass and
            terracotta, <strong>resin and casting kits</strong> for
            home crafters, <strong>gifting bundles</strong> for
            weddings and small gatherings, and the slow-but-steady
            additions our regulars ask for. Everything we list, we
            keep on hand; nothing here is drop-shipped.
          </p>

          <p>
            We aren&rsquo;t a marketplace and we aren&rsquo;t a
            wholesale catalogue with a checkout bolted on. Each
            product is photographed in our own light, described in
            our own words, and stocked in our own room. If something
            is missing or you&rsquo;re not sure which of three
            options is right for your project — message us on{" "}
            <Link href="/contact" className="text-teal-800 underline-offset-2 hover:underline">
              WhatsApp
            </Link>
            . A real person reads every message.
          </p>
        </div>

        <p className="pt-6 text-xs text-stone-500">
          Last updated: {LAST_UPDATED}.
        </p>
      </article>
    </main>
  );
}
