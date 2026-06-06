import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/db/public-client";
import { getProductCardsPage } from "@/lib/db/storefront";
import { readOrEmpty } from "@/lib/storefront/safe-read";
import {
  ProductCard,
  type ProductCardItem,
} from "@/components/storefront/product-card";

/**
 * "You might also like" row (P3-T16). Up to 8 same-category products,
 * current product excluded. Falls back to newest overall when the
 * category is thin. Hides entirely when no candidates remain.
 *
 * Cached by (categoryId, excludeId) so each PDP shares a cache entry
 * with siblings hitting the same row. Tagged `products`/`categories` so
 * admin edits flush.
 */
const FETCH_LIMIT = 9;
const SHOW_LIMIT = 8;

async function readRelated(opts: {
  categoryId: string | null;
  excludeId: string;
}): Promise<ProductCardItem[]> {
  const sb = createPublicClient();

  // Primary read: same-category siblings.
  if (opts.categoryId) {
    const sameCat = await getProductCardsPage(sb, {
      categoryIds: [opts.categoryId],
      sort: "newest",
      perPage: FETCH_LIMIT,
    });
    const filtered = sameCat.items.filter((p) => p.id !== opts.excludeId);
    if (filtered.length > 0) return filtered.slice(0, SHOW_LIMIT);
  }

  // Fallback: newest overall.
  const fallback = await getProductCardsPage(sb, {
    sort: "newest",
    perPage: FETCH_LIMIT,
  });
  return fallback.items
    .filter((p) => p.id !== opts.excludeId)
    .slice(0, SHOW_LIMIT);
}

function cacheKey(categoryId: string | null, excludeId: string): string[] {
  return ["pdp-related", categoryId ?? "_none", excludeId];
}

export async function Related({
  categoryId,
  excludeId,
}: {
  categoryId: string | null;
  excludeId: string;
}) {
  const fetcher = unstable_cache(
    () => readRelated({ categoryId, excludeId }),
    cacheKey(categoryId, excludeId),
    { tags: ["products", "categories"], revalidate: 600 },
  );

  const products = await readOrEmpty<ProductCardItem[]>(
    "pdp-related",
    fetcher,
    [],
  );
  if (products.length === 0) return null;

  return (
    <section className="space-y-4 pt-12">
      <h2 className="font-[family-name:var(--font-display)] text-2xl tracking-tight text-bark-900 sm:text-3xl">
        You might also like
      </h2>
      <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {products.map((p) => (
          <div
            key={p.id}
            className="w-[70%] shrink-0 snap-start sm:w-[40%] lg:w-1/4"
          >
            <ProductCard product={p} sizes="(max-width: 640px) 70vw, 25vw" />
          </div>
        ))}
      </div>
    </section>
  );
}
