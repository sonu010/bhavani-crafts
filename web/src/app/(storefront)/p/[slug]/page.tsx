import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import { getPdpView, getPdpPreview, type PdpView } from "@/lib/db/pdp";
import { verifyPreviewToken } from "@/lib/auth/preview-token";
import { formatInr } from "@/lib/storefront/format";
import { siteUrl } from "@/lib/storefront/site-url";
import { Gallery } from "./gallery";
import { VariantSelector } from "./variant-selector";
import { AttributesTable } from "./attributes-table";
import { AddToCart } from "./add-to-cart";
import { Related } from "./related";
import { ProductJsonLd } from "./product-jsonld";

// ISR backstop for the cached public path. The preview branch (when
// `?preview=…` is supplied) is dynamic — it must bypass the cache to
// reflect unpublished edits the owner is staging.
export const revalidate = 300;

type SearchParams = Promise<{ preview?: string }>;

async function loadPdp(slug: string, previewToken: string | null): Promise<{
  view: PdpView | null;
  isPreview: boolean;
}> {
  // 1. Public path first — caches the canonical published render.
  const publicView = await getPdpView(slug);
  if (publicView) return { view: publicView, isPreview: false };

  // 2. Preview path — service-role read gated by a verified token.
  //    Order matters: we resolve the product first via service-role to
  //    get its id, THEN verify the token against that id. Token-product
  //    binding makes a stolen/expired/mismatched token useless.
  if (previewToken) {
    const previewView = await getPdpPreview(slug);
    if (previewView) {
      const valid = await verifyPreviewToken(previewToken, previewView.product.id);
      if (valid) return { view: previewView, isPreview: true };
    }
  }

  return { view: null, isPreview: false };
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: SearchParams;
}): Promise<Metadata> {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const { view, isPreview } = await loadPdp(slug, sp.preview ?? null);
  if (!view) return { title: "Product not found" };
  const p = view.product;
  const description = p.short_description ?? `Shop ${p.name} at Bhavani Crafts.`;
  const ogImage = p.images[0]?.url;
  const canonical = `/p/${p.slug}`;
  return {
    // Root metadata sets the "— Bhavani Crafts" suffix via title.template,
    // so the per-page title is just the product name.
    title: p.name,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      title: p.name,
      description,
      url: canonical,
      images: ogImage ? [{ url: ogImage, alt: p.name }] : undefined,
    },
    twitter: {
      card: ogImage ? "summary_large_image" : "summary",
      title: p.name,
      description,
      images: ogImage ? [ogImage] : undefined,
    },
    // Preview renders MUST NOT be indexed even if a crawler somehow finds
    // the URL (the token is unguessable in practice, but defense in depth).
    robots: isPreview ? { index: false, follow: false } : undefined,
  };
}

export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: SearchParams;
}) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const { view, isPreview } = await loadPdp(slug, sp.preview ?? null);
  if (!view) notFound();

  const { product, variants, attributeDefs, attributeRows } = view;
  const hasVariants = variants.options.length > 0;
  const onSale =
    product.compare_at_price_inr != null &&
    product.base_price_inr != null &&
    product.compare_at_price_inr > product.base_price_inr;

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8 sm:py-12">
      {/* JSON-LD for search engines. Skip on preview — we don't want
          crawlers to index an unpublished product via a leaked link. */}
      {!isPreview ? (
        <ProductJsonLd
          product={product}
          variants={variants.variants}
          baseUrl={siteUrl()}
        />
      ) : null}

      {isPreview ? (
        <div className="mb-6 rounded-md border border-saffron-300 bg-saffron-50 px-4 py-2 text-sm text-clay-800">
          <strong>Preview mode.</strong> This product is unpublished. Only
          people with this signed link can see it.
        </div>
      ) : null}

      <nav className="mb-6 text-xs uppercase tracking-[0.15em] text-stone-500">
        <Link href="/" className="hover:text-bark-900">Home</Link>
        {product.category ? (
          <>
            <span aria-hidden> · </span>
            <Link
              href={`/c/${product.category.slug}`}
              className="hover:text-bark-900"
            >
              {product.category.name}
            </Link>
          </>
        ) : null}
      </nav>

      <div className="grid gap-10 lg:grid-cols-2 lg:gap-12">
        <Gallery images={product.images} productName={product.name} />

        <div className="space-y-6">
          <header className="space-y-2">
            <h1 className="font-[family-name:var(--font-display)] text-3xl tracking-tight text-bark-900 sm:text-4xl">
              {product.name}
            </h1>
            {product.short_description ? (
              <p className="text-base leading-relaxed text-stone-600">
                {product.short_description}
              </p>
            ) : null}
          </header>

          {hasVariants ? (
            <VariantSelector
              product={{ ...product, imageUrl: product.images[0]?.url ?? null }}
              options={variants.options}
              variants={variants.variants}
            />
          ) : (
            // Variant-less product: show price/stock inline + AddToCart
            // direct on the product.
            <div className="space-y-6">
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-2xl font-medium tabular-nums text-bark-900">
                  {formatInr(product.base_price_inr)}
                </span>
                {onSale ? (
                  <span className="font-mono text-sm tabular-nums text-stone-500 line-through">
                    {formatInr(product.compare_at_price_inr)}
                  </span>
                ) : null}
              </div>
              <AddToCart
                line={
                  product.base_price_inr != null
                    ? {
                        productId: product.id,
                        slug: product.slug,
                        name: product.name,
                        imageUrl: product.images[0]?.url ?? null,
                        variantId: null,
                        variantSku: product.sku,
                        variantLabel: null,
                        unitPriceInr: product.base_price_inr,
                      }
                    : null
                }
                disabled={product.stock_status === "out_of_stock"}
                reason={
                  product.stock_status === "out_of_stock"
                    ? "Out of stock."
                    : undefined
                }
              />
            </div>
          )}

          <AttributesTable defs={attributeDefs} rows={attributeRows} />
        </div>
      </div>

      {product.description ? (
        <section className="mt-12 max-w-3xl space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-wide text-stone-500">
            Description
          </h2>
          <div className="prose prose-sm prose-stone max-w-none">
            <ReactMarkdown rehypePlugins={[rehypeSanitize]}>
              {product.description}
            </ReactMarkdown>
          </div>
        </section>
      ) : null}

      <Related
        categoryId={product.category?.id ?? null}
        excludeId={product.id}
      />
    </main>
  );
}
