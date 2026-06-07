"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShoppingBag, Lock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StorefrontImage as Image } from "@/components/storefront/storefront-image";
import {
  selectSubtotalInr,
  useCartHasHydrated,
  useCartStore,
  type CartLine,
} from "@/lib/storefront/cart-store";
import { createCheckoutOrder } from "./actions";

/**
 * /checkout client — form + cart summary side-by-side.
 *
 * Three states drive the render:
 *   1. Cart store hasn't hydrated yet → loading shell (avoids the
 *      SSR/client mismatch that hit us before in the cart drawer).
 *   2. Cart is empty post-hydrate → empty state with a link back.
 *   3. Normal → form on the left, summary on the right (stacked on
 *      mobile, two-column on desktop).
 *
 * Form is plain controlled inputs — no react-hook-form for the
 * scaffold; the server action does authoritative validation via Zod
 * and surfaces field-level errors as a sonner toast for now. We can
 * graduate to inline field errors when we have field-level Zod
 * messages plumbed through.
 */
function inr(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

const INPUT_CLASS =
  "h-10 w-full rounded-md border border-husk-200 bg-paper-0 px-3 text-base md:text-sm text-bark-900 outline-none focus-visible:border-teal-800 focus-visible:ring-3 focus-visible:ring-teal-800/30";
const LABEL_CLASS = "block text-xs font-medium uppercase tracking-wide text-stone-600";

interface FormState {
  name: string;
  email: string;
  phone: string;
  line1: string;
  line2: string;
  landmark: string;
  city: string;
  state: string;
  pin: string;
  notes: string;
}

const initialForm: FormState = {
  name: "",
  email: "",
  phone: "",
  line1: "",
  line2: "",
  landmark: "",
  city: "",
  state: "",
  pin: "",
  notes: "",
};

export function CheckoutClient({
  shippingFlatInr,
}: {
  shippingFlatInr: number;
}) {
  const router = useRouter();
  const hydrated = useCartHasHydrated();
  const lines = useCartStore((s) => s.lines);
  const subtotal = useCartStore(selectSubtotalInr);
  const clearCart = useCartStore((s) => s.clear);
  const [form, setForm] = useState<FormState>(initialForm);
  const [submitting, setSubmitting] = useState(false);

  const total = subtotal + (lines.length > 0 ? shippingFlatInr : 0);

  function field<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    if (lines.length === 0) return;

    setSubmitting(true);
    try {
      const res = await createCheckoutOrder({
        customer: {
          name: form.name,
          email: form.email,
          phone: form.phone,
        },
        shipping: {
          line1: form.line1,
          line2: form.line2,
          landmark: form.landmark,
          city: form.city,
          state: form.state,
          pin: form.pin,
          country: "IN",
        },
        lines: lines.map((l: CartLine) => ({
          productId: l.productId,
          variantId: l.variantId,
          sku: l.variantSku ?? "",
          name: l.name,
          variantLabel: l.variantLabel ?? null,
          unitPriceInr: l.unitPriceInr,
          quantity: l.quantity,
        })),
        notes: form.notes,
      });

      if (!res.ok) {
        toast.error(res.error);
        return;
      }

      // Razorpay scaffold: keys aren't configured yet (or are stubbed
      // in T26 final pass), so we route to the "payment pending"
      // page with the order number. Once T28 ships, this branches
      // to either Razorpay's widget OR a real success page.
      clearCart();
      router.push(
        `/checkout/pending?order=${encodeURIComponent(res.result.orderNumber)}`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Checkout failed.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!hydrated) {
    return (
      <main className="mx-auto w-full max-w-6xl px-6 py-16">
        <div className="flex items-center gap-2 text-sm text-stone-500">
          <Loader2 className="size-4 animate-spin" />
          Loading your cart…
        </div>
      </main>
    );
  }

  if (lines.length === 0) {
    return (
      <main className="mx-auto w-full max-w-2xl px-6 py-16 text-center">
        <ShoppingBag className="mx-auto size-10 text-stone-400" />
        <h1 className="mt-4 font-[family-name:var(--font-display)] text-3xl tracking-tight text-bark-900">
          Your cart is empty
        </h1>
        <p className="mt-2 text-sm text-stone-500">
          Add something to checkout. We&rsquo;ll be here.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center rounded-full bg-teal-800 px-5 py-2.5 text-sm font-medium text-paper-0 transition-colors hover:bg-teal-900"
        >
          Browse the catalog
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <h1 className="font-[family-name:var(--font-display)] text-3xl tracking-tight text-bark-900 sm:text-4xl">
        Checkout
      </h1>
      <p className="mt-2 flex items-center gap-1.5 text-xs text-stone-500">
        <Lock className="size-3" />
        Payments are processed by Razorpay. We never see your card details.
      </p>

      <form
        onSubmit={onSubmit}
        className="mt-8 grid gap-10 lg:grid-cols-[1fr_22rem]"
      >
        {/* Left — customer + shipping */}
        <div className="space-y-8">
          <section className="space-y-4">
            <h2 className="font-[family-name:var(--font-display)] text-xl text-bark-900">
              Contact
            </h2>
            <div>
              <label htmlFor="name" className={LABEL_CLASS}>Full name</label>
              <input
                id="name"
                name="name"
                required
                autoComplete="name"
                value={form.name}
                onChange={(e) => field("name", e.target.value)}
                className={INPUT_CLASS + " mt-1.5"}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="email" className={LABEL_CLASS}>Email</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={form.email}
                  onChange={(e) => field("email", e.target.value)}
                  className={INPUT_CLASS + " mt-1.5"}
                />
              </div>
              <div>
                <label htmlFor="phone" className={LABEL_CLASS}>Phone</label>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  required
                  autoComplete="tel"
                  placeholder="+91 9876543210"
                  value={form.phone}
                  onChange={(e) => field("phone", e.target.value)}
                  className={INPUT_CLASS + " mt-1.5"}
                />
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="font-[family-name:var(--font-display)] text-xl text-bark-900">
              Shipping address
            </h2>
            <div>
              <label htmlFor="line1" className={LABEL_CLASS}>Address line 1</label>
              <input
                id="line1"
                name="line1"
                required
                autoComplete="address-line1"
                value={form.line1}
                onChange={(e) => field("line1", e.target.value)}
                className={INPUT_CLASS + " mt-1.5"}
              />
            </div>
            <div>
              <label htmlFor="line2" className={LABEL_CLASS}>
                Address line 2 <span className="lowercase text-stone-400">(optional)</span>
              </label>
              <input
                id="line2"
                name="line2"
                autoComplete="address-line2"
                value={form.line2}
                onChange={(e) => field("line2", e.target.value)}
                className={INPUT_CLASS + " mt-1.5"}
              />
            </div>
            <div>
              <label htmlFor="landmark" className={LABEL_CLASS}>
                Landmark <span className="lowercase text-stone-400">(optional)</span>
              </label>
              <input
                id="landmark"
                name="landmark"
                value={form.landmark}
                onChange={(e) => field("landmark", e.target.value)}
                className={INPUT_CLASS + " mt-1.5"}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label htmlFor="city" className={LABEL_CLASS}>City</label>
                <input
                  id="city"
                  name="city"
                  required
                  autoComplete="address-level2"
                  value={form.city}
                  onChange={(e) => field("city", e.target.value)}
                  className={INPUT_CLASS + " mt-1.5"}
                />
              </div>
              <div>
                <label htmlFor="pin" className={LABEL_CLASS}>PIN</label>
                <input
                  id="pin"
                  name="pin"
                  required
                  inputMode="numeric"
                  pattern="[1-9][0-9]{5}"
                  maxLength={6}
                  autoComplete="postal-code"
                  value={form.pin}
                  onChange={(e) => field("pin", e.target.value)}
                  className={INPUT_CLASS + " mt-1.5"}
                />
              </div>
            </div>
            <div>
              <label htmlFor="state" className={LABEL_CLASS}>State</label>
              <input
                id="state"
                name="state"
                required
                autoComplete="address-level1"
                value={form.state}
                onChange={(e) => field("state", e.target.value)}
                className={INPUT_CLASS + " mt-1.5"}
              />
            </div>
          </section>

          <section className="space-y-2">
            <label htmlFor="notes" className={LABEL_CLASS}>
              Order notes <span className="lowercase text-stone-400">(optional, max 500 chars)</span>
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={3}
              maxLength={500}
              value={form.notes}
              onChange={(e) => field("notes", e.target.value)}
              className={INPUT_CLASS + " h-auto py-2 resize-y"}
            />
          </section>
        </div>

        {/* Right — cart summary */}
        <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-lg border border-husk-200 bg-paper-0 p-5">
            <h2 className="font-[family-name:var(--font-display)] text-lg text-bark-900">
              Your order
            </h2>
            <ul className="mt-4 space-y-3">
              {lines.map((line) => (
                <li key={line.key} className="flex gap-3">
                  <div className="relative size-14 shrink-0 overflow-hidden rounded-md border border-husk-200 bg-husk-100">
                    {line.imageUrl ? (
                      <Image
                        src={line.imageUrl}
                        alt={line.name}
                        fill
                        sizes="56px"
                        className="object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-bark-900">{line.name}</p>
                    {line.variantLabel ? (
                      <p className="truncate text-xs text-stone-500">{line.variantLabel}</p>
                    ) : null}
                    <p className="mt-0.5 text-xs text-stone-500">
                      Qty {line.quantity} · {inr(line.unitPriceInr)}
                    </p>
                  </div>
                  <p className="shrink-0 font-mono text-sm tabular-nums text-bark-900">
                    {inr(line.unitPriceInr * line.quantity)}
                  </p>
                </li>
              ))}
            </ul>
            <dl className="mt-5 space-y-1.5 border-t border-husk-200 pt-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-stone-600">Subtotal</dt>
                <dd className="font-mono tabular-nums text-bark-900">{inr(subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-stone-600">Shipping</dt>
                <dd className="font-mono tabular-nums text-bark-900">{inr(shippingFlatInr)}</dd>
              </div>
              <div className="flex justify-between border-t border-husk-200 pt-2 text-base font-medium">
                <dt className="text-bark-900">Total</dt>
                <dd className="font-mono tabular-nums text-bark-900">{inr(total)}</dd>
              </div>
            </dl>
          </div>

          <Button
            type="submit"
            disabled={submitting || lines.length === 0}
            className="h-11 w-full"
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Placing order…
              </>
            ) : (
              <>
                <Lock className="size-3.5" /> Place order · {inr(total)}
              </>
            )}
          </Button>

          <p className="text-xs text-stone-500">
            You&rsquo;ll be redirected to Razorpay to complete payment.
            We don&rsquo;t store your card.
          </p>
        </aside>
      </form>
    </main>
  );
}
