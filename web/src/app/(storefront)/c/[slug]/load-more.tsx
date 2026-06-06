"use client";

import { useState, useTransition } from "react";
import { ProductCard, type ProductCardItem } from "@/components/storefront/product-card";
import { loadMoreCategoryProducts } from "./actions";
import type { CategoryFilters } from "./data";

/**
 * "Load more" for the category grid (P3-T12). The server-rendered page
 * shows page 1 (cached, SEO-friendly); this client component appends
 * pages 2+ in place — no scroll jump, no offset drift (stable
 * `(created_at, id)` cursor). The button hides when the cursor is null.
 */
export function LoadMore({
  slug,
  filters,
  initialNextCursor,
}: {
  slug: string;
  filters: CategoryFilters;
  /** Already base64url-encoded by the server page (null = no more). */
  initialNextCursor: string | null;
}) {
  const [extra, setExtra] = useState<ProductCardItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(initialNextCursor);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!cursor && extra.length === 0) return null;

  function onLoadMore() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await loadMoreCategoryProducts({ slug, filters, cursor });
        setExtra((prev) => [...prev, ...res.items]);
        setCursor(res.nextCursor);
      } catch {
        setError("Couldn't load more. Try again.");
      }
    });
  }

  return (
    <>
      {extra.length > 0 ? (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {extra.map((p) => (
            <li key={p.id}>
              <ProductCard product={p} />
            </li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <p role="alert" className="text-center text-sm text-brick-600">
          {error}
        </p>
      ) : null}

      {cursor ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={isPending}
            className="rounded-full border border-husk-200 px-6 py-2.5 text-sm font-medium text-bark-900 transition-colors hover:border-bark-900 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800"
          >
            {isPending ? "Loading…" : "Load more"}
          </button>
        </div>
      ) : null}
    </>
  );
}
