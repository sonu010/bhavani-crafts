"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { useCartStore, type AddLineInput } from "@/lib/storefront/cart-store";

/**
 * Add-to-cart button (P3-T13 + T20/T21). Now wired to the real cart
 * store. Parent (variant selector or variant-less PDP branch) computes
 * the line snapshot — productId / slug / name / imageUrl / variantId /
 * variantSku / variantLabel / unitPriceInr — and hands it over. On
 * click we push the line + open the drawer.
 *
 * The button stays inert when:
 *   • `disabled` is true (parent decided — out of stock, invalid combo,
 *     incomplete option selection), OR
 *   • the snapshot is missing a unit price (parent still resolving).
 *
 * The cart store is client-only; this component is "use client".
 */
export function AddToCart({
  line,
  disabled,
  reason,
}: {
  line: AddLineInput | null;
  disabled?: boolean;
  /** Why disabled, shown next to the button (e.g. "Out of stock"). */
  reason?: string;
}) {
  const [pending, startTransition] = useTransition();
  const addLine = useCartStore((s) => s.addLine);
  const openCart = useCartStore((s) => s.openCart);

  const inert = disabled || line === null || line.unitPriceInr <= 0;

  function onClick() {
    if (inert || !line) return;
    startTransition(() => {
      addLine(line);
      openCart();
      toast.success("Added to cart");
    });
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onClick}
        disabled={inert || pending}
        aria-disabled={inert || pending}
        className="inline-flex h-11 w-full items-center justify-center rounded-full bg-teal-800 px-6 text-sm font-medium text-paper-0 transition-colors hover:bg-teal-900 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800 sm:w-auto sm:min-w-56"
      >
        {pending ? "Adding…" : "Add to cart"}
      </button>
      {inert && reason ? (
        <p className="text-xs text-stone-500">{reason}</p>
      ) : null}
    </div>
  );
}
