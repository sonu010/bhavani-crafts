import Image from "next/image";
import Link from "next/link";
import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/db/public-client";
import { getProductCards } from "@/lib/db/storefront";
import { listTopLevelCategories } from "@/lib/db/categories";
import { formatInr } from "@/lib/storefront/format";
import { readOrEmpty } from "@/lib/storefront/safe-read";
import type { ProductCardItem } from "@/components/storefront/product-card";

/**
 * Section #1 of the landing page (design-system.md §"Landing page
 * composition" #1): the editorial split hero.
 *
 *   left  (7-col): oversized Newsreader headline (3 lines, one italic
 *                  word) + one body line + one teal-800 primary CTA
 *   right (5-col): a single hand-photographed product bleeding off the
 *                  right edge, JetBrains Mono margin caption
 *
 * The hero product is the newest FEATURED product (fall back to the
 * newest published product if nothing is featured yet, so the hero is
 * never empty during early catalog setup).
 */

// Static editorial copy — the owner edits these three lines in one place.
// Phase 4's homepage settings will make this data-driven.
const HEADLINE_PRE = "Craft supplies,";
const HEADLINE_EM = "lovingly";
const HEADLINE_POST = "stocked in Hyderabad.";
const BODY =
  "Brass, clay, resin and paper — the materials a city of makers reaches for.";
const CTA_LABEL = "Browse the catalog";

const getHeroData = unstable_cache(
  async (): Promise<{ product: ProductCardItem | null; ctaHref: string }> => {
    const supabase = createPublicClient();
    // Prefer a featured product; fall back to newest published.
    let cards = await getProductCards(supabase, {
      onlyFeatured: true,
      sort: "newest",
      perPage: 1,
    });
    if (cards.length === 0) {
      cards = await getProductCards(supabase, { sort: "newest", perPage: 1 });
    }
    const cats = await listTopLevelCategories(supabase);
    return {
      product: cards[0] ?? null,
      ctaHref: cats[0] ? `/c/${cats[0].slug}` : "/search",
    };
  },
  ["landing-hero"],
  { tags: ["products", "featured", "categories", "homepage"], revalidate: 300 },
);

export async function Hero() {
  const { product, ctaHref } = await readOrEmpty("landing-hero", getHeroData, {
    product: null,
    ctaHref: "/search",
  });

  return (
    <section className="mx-auto w-full max-w-6xl px-6 pt-12 pb-16 sm:pt-16 lg:pt-24">
      <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-8">
        {/* Left — headline + body + CTA */}
        <div className="lg:col-span-7">
          <h1 className="font-[family-name:var(--font-display)] text-5xl leading-[1.04] tracking-tight text-bark-900 sm:text-6xl lg:text-7xl">
            {HEADLINE_PRE}
            <br />
            <em className="italic text-clay-600">{HEADLINE_EM}</em>{" "}
            {HEADLINE_POST}
          </h1>
          <p className="mt-6 max-w-md text-base leading-relaxed text-stone-600">
            {BODY}
          </p>
          <Link
            href={ctaHref}
            className="mt-8 inline-flex items-center rounded-full bg-teal-800 px-6 py-3 text-sm font-medium text-paper-0 transition-colors hover:bg-teal-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800"
          >
            {CTA_LABEL}
          </Link>
        </div>

        {/* Right — single product bleeding off the right edge */}
        {product ? (
          <div className="lg:col-span-5">
            <Link href={`/p/${product.slug}`} className="group block">
              <div className="relative aspect-[4/5] overflow-hidden rounded-l-lg border border-husk-200 bg-husk-100 lg:-mr-6 xl:-mr-12">
                {product.imageUrl ? (
                  <Image
                    src={product.imageUrl}
                    alt={product.imageAlt ?? product.name}
                    fill
                    priority
                    sizes="(max-width: 1024px) 100vw, 40vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                    placeholder={product.blurDataUrl ? "blur" : "empty"}
                    blurDataURL={product.blurDataUrl ?? undefined}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-stone-400">
                    <span className="font-mono text-xs">no image</span>
                  </div>
                )}
              </div>
              <p className="mt-3 font-mono text-xs uppercase tracking-[0.15em] text-stone-500">
                {product.name} · {formatInr(product.base_price_inr)}
              </p>
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}
