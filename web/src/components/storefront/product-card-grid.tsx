import { ProductCard, type ProductCardItem } from "./product-card";

/**
 * Responsive grid of product cards, reused by category, search, and
 * related-products surfaces. 2 cols mobile → 3 → 4 at lg.
 */
export function ProductCardGrid({
  products,
  emptyLabel = "No products to show.",
}: {
  products: ProductCardItem[];
  emptyLabel?: string;
}) {
  if (products.length === 0) {
    return (
      <p className="rounded-lg border border-husk-200 bg-paper-0 p-6 text-center text-sm text-stone-500">
        {emptyLabel}
      </p>
    );
  }
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {products.map((p) => (
        <li key={p.id}>
          <ProductCard product={p} />
        </li>
      ))}
    </ul>
  );
}
