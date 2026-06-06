"use client";

import Link from "next/link";
import { StorefrontImage as Image } from "@/components/storefront/storefront-image";
import { X, Minus, Plus, ShoppingBag } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  useCartStore,
  selectSubtotalInr,
  useCartHasHydrated,
  type CartLine,
} from "@/lib/storefront/cart-store";
import { formatInr } from "@/lib/storefront/format";

/**
 * Cart drawer (P3-T20). A Sheet that slides in from the right on
 * desktop, bottom on mobile, listing the active cart lines with image
 * thumb, name + variant label, qty stepper, line total, remove, and a
 * Checkout CTA → /checkout (built in the payments cluster, T25+).
 *
 * Mounted in the storefront layout so every public page has it
 * available. Open state lives in the store so any component (header
 * cart button, PDP add-to-cart) can open it without prop drilling.
 */
export function CartDrawer() {
  const isOpen = useCartStore((s) => s.isOpen);
  const lines = useCartStore((s) => s.lines);
  const closeCart = useCartStore((s) => s.closeCart);
  const subtotal = useCartStore(selectSubtotalInr);
  const hydrated = useCartHasHydrated();

  // Render an empty Sheet on the server so the markup matches the
  // first client render; once persist rehydrates we re-render with the
  // real lines + open state.
  const visualLines: CartLine[] = hydrated ? lines : [];
  const visualSubtotal = hydrated ? subtotal : 0;

  return (
    <Sheet open={hydrated && isOpen} onOpenChange={(open) => (open ? null : closeCart())}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b border-husk-200 px-5 py-4">
          <SheetTitle className="flex items-center gap-2 font-display text-lg">
            <ShoppingBag className="size-5" />
            Your cart
          </SheetTitle>
        </SheetHeader>

        {visualLines.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-5 py-12 text-center">
            <p className="text-base text-stone-600">Your cart is empty.</p>
            <Link
              href="/"
              onClick={closeCart}
              className="text-sm text-teal-800 underline underline-offset-2 hover:text-teal-900"
            >
              Browse the catalog
            </Link>
          </div>
        ) : (
          <>
            <ul className="flex-1 divide-y divide-husk-200 overflow-y-auto px-5">
              {visualLines.map((line) => (
                <CartLineRow key={line.key} line={line} onClose={closeCart} />
              ))}
            </ul>

            <div className="border-t border-husk-200 px-5 py-4 [padding-bottom:max(theme(spacing.4),env(safe-area-inset-bottom))]">
              <div className="flex items-baseline justify-between pb-3">
                <span className="text-sm text-stone-600">Subtotal</span>
                <span className="font-mono text-lg font-medium tabular-nums text-bark-900">
                  {formatInr(visualSubtotal)}
                </span>
              </div>
              <p className="pb-3 text-xs text-stone-500">
                Shipping + taxes calculated at checkout.
              </p>
              <Link
                href="/checkout"
                onClick={closeCart}
                className="inline-flex h-11 w-full items-center justify-center rounded-full bg-teal-800 px-6 text-sm font-medium text-paper-0 transition-colors hover:bg-teal-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800"
              >
                Checkout
              </Link>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function CartLineRow({ line, onClose }: { line: CartLine; onClose: () => void }) {
  const setQuantity = useCartStore((s) => s.setQuantity);
  const removeLine = useCartStore((s) => s.removeLine);
  const lineTotal = line.unitPriceInr * line.quantity;

  return (
    <li className="flex gap-3 py-4">
      <Link
        href={`/p/${line.slug}`}
        onClick={onClose}
        className="relative size-20 shrink-0 overflow-hidden rounded-md border border-husk-200 bg-husk-100"
      >
        {line.imageUrl ? (
          <Image
            src={line.imageUrl}
            alt={line.name}
            fill
            sizes="80px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-stone-400">
            <span className="font-mono text-[10px]">no img</span>
          </div>
        )}
      </Link>

      <div className="min-w-0 flex-1 space-y-1">
        <Link
          href={`/p/${line.slug}`}
          onClick={onClose}
          className="block truncate text-sm font-medium text-bark-900 hover:text-teal-800"
          title={line.name}
        >
          {line.name}
        </Link>
        {line.variantLabel ? (
          <p className="text-xs text-stone-500">{line.variantLabel}</p>
        ) : null}

        <div className="flex items-center justify-between pt-1">
          <div
            className="flex items-center gap-0 overflow-hidden rounded-md border border-husk-200"
            role="group"
            aria-label={`Quantity of ${line.name}`}
          >
            <button
              type="button"
              onClick={() => setQuantity(line.key, line.quantity - 1)}
              className="grid size-7 place-items-center text-bark-900 transition-colors hover:bg-husk-100 focus-visible:outline-none focus-visible:bg-husk-100"
              aria-label="Decrease quantity"
            >
              <Minus className="size-3.5" />
            </button>
            <span
              className="grid w-8 place-items-center text-sm tabular-nums"
              aria-label="Quantity"
            >
              {line.quantity}
            </span>
            <button
              type="button"
              onClick={() => setQuantity(line.key, line.quantity + 1)}
              className="grid size-7 place-items-center text-bark-900 transition-colors hover:bg-husk-100 focus-visible:outline-none focus-visible:bg-husk-100"
              aria-label="Increase quantity"
            >
              <Plus className="size-3.5" />
            </button>
          </div>
          <span className="font-mono text-sm tabular-nums text-bark-900">
            {formatInr(lineTotal)}
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={() => removeLine(line.key)}
        aria-label={`Remove ${line.name} from cart`}
        className="grid size-7 shrink-0 place-items-center self-start rounded-md text-stone-500 transition-colors hover:bg-husk-100 hover:text-bark-900"
      >
        <X className="size-4" />
      </button>
    </li>
  );
}
