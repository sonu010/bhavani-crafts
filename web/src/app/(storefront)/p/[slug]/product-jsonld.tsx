import type { ProductDetail } from "@/lib/schemas/product";
import type { PdpVariant } from "@/lib/db/products";

/**
 * schema.org `Product` JSON-LD (P3-T17). Renders a
 * `<script type="application/ld+json">` so search engines emit a rich
 * snippet (price, availability, image) on the product result.
 *
 * Built server-side from the already-fetched PDP data — no extra
 * queries. Description is markdown-stripped + HTML-safe.
 *
 * NEVER mount this on the preview render (unpublished products): we
 * don't want crawlers to find the signed preview link in a leaked
 * Referer header or shared screenshot.
 *
 * For variant products with multiple distinct prices we emit an
 * `AggregateOffer` (low/high). Single-price variants and variant-less
 * products emit a single `Offer`.
 */

// schema.org availability values map directly from our stock_status enum.
const AVAILABILITY_BY_STOCK: Record<
  ProductDetail["stock_status"],
  string
> = {
  in_stock: "https://schema.org/InStock",
  low_stock: "https://schema.org/LimitedAvailability",
  out_of_stock: "https://schema.org/OutOfStock",
  made_to_order: "https://schema.org/MadeToOrder",
  unknown: "https://schema.org/InStoreOnly",
};

/**
 * Strip markdown to plain text. Lightweight and intentionally regex-only
 * — schema.org descriptions are short and we don't want a dep just for
 * this. Removes: headings, emphasis, links (keeps the text), inline
 * code, list bullets, and HTML tags as a defensive measure. Collapses
 * whitespace and trims to 5000 chars (Google's documented cap is 5000).
 */
function stripMarkdown(input: string | null | undefined): string {
  if (!input) return "";
  let s = input;
  // Inline code
  s = s.replace(/`+([^`]+)`+/g, "$1");
  // Images ![alt](url) → alt
  s = s.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1");
  // Links [text](url) → text
  s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  // Headings, blockquote markers, list bullets
  s = s.replace(/^[#>\s]*#+\s*/gm, "");
  s = s.replace(/^[>\s]*\s/gm, "");
  s = s.replace(/^\s*[-*+]\s+/gm, "");
  s = s.replace(/^\s*\d+\.\s+/gm, "");
  // Emphasis markers
  s = s.replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, "$1");
  // Stray HTML tags — defensive, the input is already trusted markdown.
  s = s.replace(/<[^>]+>/g, "");
  // Collapse whitespace
  s = s.replace(/\s+/g, " ").trim();
  return s.slice(0, 5000);
}

interface JsonLdOffer {
  "@type": "Offer";
  url: string;
  priceCurrency: "INR";
  price: string;
  availability: string;
  sku: string;
}

interface JsonLdAggregateOffer {
  "@type": "AggregateOffer";
  url: string;
  priceCurrency: "INR";
  lowPrice: string;
  highPrice: string;
  offerCount: number;
  availability: string;
}

/**
 * Build the offers fragment. With variants → AggregateOffer if prices
 * differ; otherwise → single Offer.
 */
function buildOffers(
  product: ProductDetail,
  variants: PdpVariant[],
  productUrl: string,
): JsonLdOffer | JsonLdAggregateOffer | null {
  const variantPrices = variants
    .map((v) => v.price_inr)
    .filter((p): p is number => typeof p === "number");

  if (variants.length > 0 && variantPrices.length > 0) {
    const low = Math.min(...variantPrices);
    const high = Math.max(...variantPrices);
    if (low !== high) {
      // Availability: in_stock if ANY variant is in stock.
      const anyInStock = variants.some(
        (v) => v.stock_status === "in_stock" || v.stock_status === "low_stock",
      );
      return {
        "@type": "AggregateOffer",
        url: productUrl,
        priceCurrency: "INR",
        lowPrice: String(low),
        highPrice: String(high),
        offerCount: variants.length,
        availability: anyInStock
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
      };
    }
  }

  // Single-price path: use the default variant's price + stock if
  // available; otherwise the product's base.
  const defaultVariant = variants.find((v) => v.is_default) ?? variants[0];
  const price = defaultVariant?.price_inr ?? product.base_price_inr;
  const stock = defaultVariant?.stock_status ?? product.stock_status;
  if (price == null) return null;
  const sku = defaultVariant?.sku ?? product.sku;
  return {
    "@type": "Offer",
    url: productUrl,
    priceCurrency: "INR",
    price: String(price),
    availability: AVAILABILITY_BY_STOCK[stock],
    sku,
  };
}

export function ProductJsonLd({
  product,
  variants,
  baseUrl,
}: {
  product: ProductDetail;
  variants: PdpVariant[];
  /** Absolute origin used to build the `url` field (e.g. `https://bhavanicrafts.in`). */
  baseUrl: string;
}) {
  const productUrl = `${baseUrl.replace(/\/$/, "")}/p/${product.slug}`;
  const offers = buildOffers(product, variants, productUrl);

  const ld: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    sku: product.sku,
    description: stripMarkdown(product.description ?? product.short_description),
    image: product.images.map((img) => img.url),
    brand: { "@type": "Brand", name: "Bhavani Crafts" },
    url: productUrl,
  };
  if (offers) ld.offers = offers;

  // Escape `<` so an attacker-controlled name/description can't break
  // out of the script tag with `</script>`. Standard JSON-LD pattern.
  const serialized = JSON.stringify(ld).replace(/</g, "\\u003c");

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serialized }}
    />
  );
}
