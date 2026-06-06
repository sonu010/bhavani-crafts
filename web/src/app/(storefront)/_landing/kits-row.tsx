import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/db/public-client";
import { getCategoryBySlug } from "@/lib/db/categories";
import { getProductCards } from "@/lib/db/storefront";
import { readOrEmpty } from "@/lib/storefront/safe-read";
import { ProductCard, type ProductCardItem } from "@/components/storefront/product-card";

/**
 * Section #5 of the landing page (design-system.md §"Landing page
 * composition" #5): a horizontal scroller of workshop kits, each
 * numbered "01 / 02 / 03" in JetBrains Mono.
 *
 * Data: products in the `workshop-kits` category. If that category
 * doesn't exist yet, the section hides — the owner creates a
 * `workshop-kits` category and assigns products to populate this row.
 */

const KITS_CATEGORY_SLUG = "workshop-kits";

const getKits = unstable_cache(
  async (): Promise<ProductCardItem[]> => {
    const supabase = createPublicClient();
    const category = await getCategoryBySlug(supabase, KITS_CATEGORY_SLUG);
    if (!category) return [];
    return getProductCards(supabase, {
      categoryIds: [category.id],
      sort: "newest",
      perPage: 8,
    });
  },
  ["landing-kits-row"],
  { tags: ["products", "categories", "homepage"], revalidate: 300 },
);

export async function KitsRow() {
  const kits = await readOrEmpty<ProductCardItem[]>("landing-kits-row", getKits, []);
  if (kits.length === 0) return null;

  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-16">
      <h2 className="font-[family-name:var(--font-display)] text-3xl tracking-tight text-bark-900 sm:text-4xl">
        Workshop kits
      </h2>
      <p className="mt-2 text-sm text-stone-500">
        Everything for one session, boxed and ready.
      </p>

      <div className="mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {kits.map((kit, i) => (
          <div
            key={kit.id}
            className="relative w-[70%] shrink-0 snap-start sm:w-[45%] lg:w-1/4"
          >
            <span className="absolute left-2 top-2 z-10 rounded-full bg-paper-0/90 px-2 py-0.5 font-mono text-[11px] font-medium tabular-nums text-bark-900">
              {String(i + 1).padStart(2, "0")}
            </span>
            <ProductCard product={kit} sizes="(max-width: 640px) 70vw, 25vw" />
          </div>
        ))}
      </div>
    </section>
  );
}
