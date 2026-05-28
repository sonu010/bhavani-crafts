import Image from "next/image";
import Link from "next/link";
import type { ProductListItem } from "@/lib/schemas/product";
import { formatInr } from "@/lib/storefront/format";

/**
 * The single product card reused across every catalog surface: hero,
 * Atlas-adjacent rows, weekly collection, kits, category grid, search
 * results, related products. Built once here (P3-T01); do NOT fork it
 * per consumer.
 *
 * Server-renderable (no "use client") so it stays cheap inside cached
 * server-component pages.
 *
 * Spec (design-system.md §"Component patterns"):
 *   - 4:5 image (magazine feel), blur-up placeholder
 *   - name Manrope 600, hover underline-grow
 *   - price JetBrains Mono 500, tabular-nums, bark-900
 *   - stock pill (moss in-stock / brick out-of-stock)
 *   - saffron "Sale" chip top-left when compare_at_price is set
 *   - links to /p/[slug]
 */

/** A product plus the display fields the card needs. Consumers fetch
 *  the product list item + its primary image (one batched query keyed
 *  on the visible ids — same pattern the admin list uses) and map to
 *  this shape. */
export interface ProductCardItem extends ProductListItem {
  imageUrl: string | null;
  blurDataUrl: string | null;
  imageAlt: string | null;
}

const STOCK_PILL: Record<
  ProductListItem["stock_status"],
  { label: string; className: string } | null
> = {
  in_stock: { label: "In stock", className: "bg-moss-100 text-moss-800" },
  low_stock: { label: "Low stock", className: "bg-saffron-50 text-clay-700" },
  out_of_stock: { label: "Out of stock", className: "bg-brick-50 text-brick-700" },
  made_to_order: { label: "Made to order", className: "bg-husk-100 text-stone-700" },
  unknown: null,
};

export function ProductCard({
  product,
  /** Hint next/image about the rendered size for correct srcset. */
  sizes = "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw",
  priority = false,
}: {
  product: ProductCardItem;
  sizes?: string;
  priority?: boolean;
}) {
  const onSale =
    product.compare_at_price_inr != null &&
    product.base_price_inr != null &&
    product.compare_at_price_inr > product.base_price_inr;
  const pill = STOCK_PILL[product.stock_status];

  return (
    <Link
      href={`/p/${product.slug}`}
      className="group block focus-visible:outline-none"
    >
      <div className="relative aspect-[4/5] overflow-hidden rounded-lg border border-husk-200 bg-husk-100">
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.imageAlt ?? product.name}
            fill
            sizes={sizes}
            priority={priority}
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            placeholder={product.blurDataUrl ? "blur" : "empty"}
            blurDataURL={product.blurDataUrl ?? undefined}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-stone-400">
            <span className="font-mono text-xs">no image</span>
          </div>
        )}

        {onSale ? (
          <span className="absolute left-2 top-2 rounded-full bg-saffron-500 px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-bark-900">
            Sale
          </span>
        ) : null}
      </div>

      <div className="mt-2 space-y-1">
        <h3
          className="text-sm font-semibold leading-snug text-bark-900 [text-decoration:underline_transparent] decoration-1 underline-offset-2 transition-colors group-hover:decoration-bark-900"
          title={product.name}
        >
          <span className="line-clamp-2">{product.name}</span>
        </h3>
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-medium tabular-nums text-bark-900">
            {formatInr(product.base_price_inr)}
          </span>
          {onSale ? (
            <span className="font-mono text-xs tabular-nums text-stone-500 line-through">
              {formatInr(product.compare_at_price_inr)}
            </span>
          ) : null}
          {pill ? (
            <span
              className={`ml-auto rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${pill.className}`}
            >
              {pill.label}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
