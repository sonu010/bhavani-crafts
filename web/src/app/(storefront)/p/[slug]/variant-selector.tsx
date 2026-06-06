"use client";

import { useMemo, useState } from "react";
import type {
  PdpOption,
  PdpVariant,
} from "@/lib/db/products";
import type { ProductDetail } from "@/lib/schemas/product";
import { formatInr } from "@/lib/storefront/format";
import { AddToCart } from "./add-to-cart";

/**
 * PDP variant selector (P3-T15). Renders one chip group per option;
 * picking values resolves the matching variant by set-equality on its
 * `option_value_ids`. The default variant is preselected from the data.
 *
 * If a product has NO options, the selector renders nothing and
 * add-to-cart targets the product itself (no variant id).
 *
 * Price + stock fall back to the product's base when a variant lacks its
 * own. Invalid combos disable add-to-cart with a clear reason; we do NOT
 * pre-disable individual value chips (greying-out by combo is a
 * "candidate-set intersection" problem the seed isn't rich enough to
 * justify yet — flagged for a later iteration).
 */
const STOCK_LABEL: Record<ProductDetail["stock_status"], string> = {
  in_stock: "In stock",
  low_stock: "Low stock",
  out_of_stock: "Out of stock",
  made_to_order: "Made to order",
  unknown: "Stock unknown",
};

function setEquals(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const ba = [...a].sort();
  const bb = [...b].sort();
  return ba.every((v, i) => v === bb[i]);
}

export function VariantSelector({
  product,
  options,
  variants,
}: {
  product: Pick<
    ProductDetail,
    | "id"
    | "sku"
    | "slug"
    | "name"
    | "base_price_inr"
    | "compare_at_price_inr"
    | "stock_status"
  > & { imageUrl: string | null };
  options: PdpOption[];
  variants: PdpVariant[];
}) {
  const defaultVariant = useMemo(
    () => variants.find((v) => v.is_default) ?? variants[0] ?? null,
    [variants],
  );

  const initialSelection = useMemo(() => {
    const m: Record<string, string> = {};
    if (defaultVariant) {
      // Map each option_value_id in the default variant to its option.
      for (const o of options) {
        const valueId = o.values
          .map((v) => v.id)
          .find((id) => defaultVariant.option_value_ids.includes(id));
        if (valueId) m[o.id] = valueId;
      }
    }
    return m;
  }, [defaultVariant, options]);

  const [selection, setSelection] =
    useState<Record<string, string>>(initialSelection);

  const resolvedVariant = useMemo(() => {
    const selected = options.map((o) => selection[o.id]).filter(Boolean) as string[];
    if (selected.length !== options.length) return null;
    return variants.find((v) => setEquals(v.option_value_ids, selected)) ?? null;
  }, [options, selection, variants]);

  const allChosen = options.every((o) => selection[o.id]);
  const hasOptions = options.length > 0;

  // Build a human label like "Small / Teal" from the resolved variant's
  // option-value ids. Stable order = options.sort_order (already sorted
  // by the loader). null when no resolved variant (so the cart line is
  // unambiguous for variant-less products).
  const variantLabel = useMemo(() => {
    if (!resolvedVariant) return null;
    const parts: string[] = [];
    for (const o of options) {
      const v = o.values.find((val) =>
        resolvedVariant.option_value_ids.includes(val.id),
      );
      if (v) parts.push(v.value);
    }
    return parts.length > 0 ? parts.join(" / ") : null;
  }, [resolvedVariant, options]);

  const price =
    resolvedVariant?.price_inr ?? product.base_price_inr ?? null;
  const compareAt =
    resolvedVariant?.compare_at_price_inr ?? product.compare_at_price_inr ?? null;
  const stock = resolvedVariant?.stock_status ?? product.stock_status;
  const onSale =
    compareAt != null && price != null && compareAt > price;

  const outOfStock = stock === "out_of_stock";
  const invalidCombo = hasOptions && allChosen && !resolvedVariant;
  const disabled = outOfStock || invalidCombo || (hasOptions && !allChosen);
  const reason = invalidCombo
    ? "This combination isn't available."
    : outOfStock
    ? "Out of stock."
    : hasOptions && !allChosen
    ? "Choose every option."
    : undefined;

  return (
    <div className="space-y-6">
      {/* Price + stock */}
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-2xl font-medium tabular-nums text-bark-900">
          {formatInr(price)}
        </span>
        {onSale ? (
          <span className="font-mono text-sm tabular-nums text-stone-500 line-through">
            {formatInr(compareAt)}
          </span>
        ) : null}
        <span
          className={[
            "ml-auto rounded-full px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide",
            stock === "in_stock"
              ? "bg-moss-100 text-moss-800"
              : stock === "low_stock"
              ? "bg-saffron-50 text-clay-700"
              : stock === "out_of_stock"
              ? "bg-brick-50 text-brick-700"
              : "bg-husk-100 text-stone-700",
          ].join(" ")}
        >
          {STOCK_LABEL[stock]}
        </span>
      </div>

      {/* Option chips */}
      {options.map((opt) => (
        <fieldset key={opt.id} className="space-y-2">
          <legend className="text-xs font-medium uppercase tracking-wide text-stone-500">
            {opt.name}
          </legend>
          <div className="flex flex-wrap gap-2">
            {opt.values.map((val) => {
              const selected = selection[opt.id] === val.id;
              return (
                <button
                  key={val.id}
                  type="button"
                  onClick={() =>
                    setSelection((prev) => ({ ...prev, [opt.id]: val.id }))
                  }
                  aria-pressed={selected}
                  className={[
                    "rounded-full border px-3 py-1.5 text-sm transition",
                    selected
                      ? "border-bark-900 bg-bark-900 text-paper-0"
                      : "border-husk-200 bg-paper-0 text-bark-900 hover:border-bark-900",
                  ].join(" ")}
                >
                  {val.value}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}

      <AddToCart
        line={
          price != null && (!hasOptions || resolvedVariant !== null)
            ? {
                productId: product.id,
                slug: product.slug,
                name: product.name,
                imageUrl: product.imageUrl,
                variantId: resolvedVariant?.id ?? null,
                variantSku: resolvedVariant?.sku ?? product.sku,
                variantLabel,
                unitPriceInr: price,
              }
            : null
        }
        disabled={disabled}
        reason={reason}
      />
    </div>
  );
}
