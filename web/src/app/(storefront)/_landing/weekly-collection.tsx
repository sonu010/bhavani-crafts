import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/db/public-client";
import { getProductCards } from "@/lib/db/storefront";
import { readOrEmpty } from "@/lib/storefront/safe-read";
import { ProductCard, type ProductCardItem } from "@/components/storefront/product-card";

/**
 * Section #4 of the landing page (design-system.md §"Landing page
 * composition" #4): a named, dated collection block with a Newsreader
 * italic intro and a 4-product horizontal scroll-snap row.
 *
 * Data: the newest 4 FEATURED products. Title + intro are static copy
 * the owner edits here (Phase 4 homepage settings replaces this). If
 * there are no featured products yet, the section hides entirely.
 */

// Static editorial copy — owner edits in one place.
const COLLECTION_TITLE = "This week: Monsoon resin colors";
const COLLECTION_INTRO =
  "Deep teals and ochres, picked for the season. A small set we are quietly proud of.";

const getWeekly = unstable_cache(
  async (): Promise<ProductCardItem[]> => {
    const supabase = createPublicClient();
    return getProductCards(supabase, {
      onlyFeatured: true,
      sort: "newest",
      perPage: 4,
    });
  },
  ["landing-weekly-collection"],
  { tags: ["products", "featured", "homepage"], revalidate: 300 },
);

export async function WeeklyCollection() {
  const products = await readOrEmpty<ProductCardItem[]>(
    "landing-weekly-collection",
    getWeekly,
    [],
  );
  if (products.length === 0) return null;

  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-16">
      <h2 className="font-[family-name:var(--font-display)] text-3xl tracking-tight text-bark-900 sm:text-4xl">
        {COLLECTION_TITLE}
      </h2>
      <p className="mt-3 max-w-xl font-[family-name:var(--font-display)] text-lg italic leading-relaxed text-stone-600">
        {COLLECTION_INTRO}
      </p>

      <div className="mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {products.map((product) => (
          <div
            key={product.id}
            className="w-[70%] shrink-0 snap-start sm:w-[45%] lg:w-1/4"
          >
            <ProductCard product={product} sizes="(max-width: 640px) 70vw, 25vw" />
          </div>
        ))}
      </div>
    </section>
  );
}
