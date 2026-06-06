import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { encodeProductCursor } from "@/lib/db/products";
import { ProductCardGrid } from "@/components/storefront/product-card-grid";
import {
  getCategoryView,
  getCategoryFirstPage,
  getCategoryProducts,
  hasActiveFilters,
  type CategoryFilters,
  type CategoryStock,
} from "./data";
import { CategoryHeader } from "./category-header";
import { FiltersSidebar } from "./filters-sidebar";
import { LoadMore } from "./load-more";

// ISR backstop; the underlying reads are also tag-cached so admin edits
// flush immediately. The page itself is dynamic when filter params are
// present (searchParams access), but the canonical /c/<slug> read is
// served from the tagged cache.
export const revalidate = 300;

type SearchParams = Promise<{
  min?: string;
  max?: string;
  stock?: string;
}>;

const STOCK_VALUES: CategoryStock[] = ["in_stock", "low_stock", "out_of_stock"];

function parseFilters(sp: Awaited<SearchParams>): CategoryFilters {
  const filters: CategoryFilters = {};
  const min = Number(sp.min);
  const max = Number(sp.max);
  if (sp.min !== undefined && Number.isFinite(min) && min >= 0) {
    filters.minPriceInr = Math.floor(min);
  }
  if (sp.max !== undefined && Number.isFinite(max) && max >= 0) {
    filters.maxPriceInr = Math.floor(max);
  }
  if (sp.stock && (STOCK_VALUES as string[]).includes(sp.stock)) {
    filters.stockStatus = sp.stock as CategoryStock;
  }
  return filters;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { category } = await getCategoryView(slug);
  if (!category) return { title: "Category not found" };
  const description = category.description ?? `Shop ${category.name} at Bhavani Crafts.`;
  const canonical = `/c/${category.slug}`;
  const ogImage = category.image_url ?? undefined;
  return {
    // Root metadata sets the "— Bhavani Crafts" suffix via title.template.
    title: category.name,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      title: category.name,
      description,
      url: canonical,
      images: ogImage ? [{ url: ogImage, alt: category.name }] : undefined,
    },
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: SearchParams;
}) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const { category, descendantIds } = await getCategoryView(slug);
  if (!category) notFound();

  const filters = parseFilters(sp);
  const page = hasActiveFilters(filters)
    ? await getCategoryProducts({ descendantIds, filters, cursor: null })
    : await getCategoryFirstPage(slug, descendantIds);

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <CategoryHeader category={category} />

      <div className="mt-8 grid gap-8 lg:grid-cols-[16rem_1fr]">
        <FiltersSidebar initial={filters} />

        <div className="space-y-6">
          <ProductCardGrid
            products={page.items}
            emptyLabel="No products in this category yet."
          />
          <LoadMore
            slug={slug}
            filters={filters}
            initialNextCursor={
              page.nextCursor ? encodeProductCursor(page.nextCursor) : null
            }
          />
        </div>
      </div>
    </main>
  );
}
