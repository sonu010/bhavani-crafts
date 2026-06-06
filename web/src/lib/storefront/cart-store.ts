/**
 * Storefront cart — Zustand store + localStorage persistence.
 *
 * Ported from `origin/main:src/store/cart.ts` and retyped for the
 * rebuild's variant-aware product model:
 *   • Lines store a FLATTENED snapshot (id/slug/name/image/price), not
 *     the whole product object. Smaller localStorage payload and no
 *     stale embeds when a product changes.
 *   • Lines are keyed by `variantId ?? productId` so the same product
 *     in two variants becomes two cart lines.
 *
 * Persisted under `bc-cart-v1`. A schema change should bump the suffix
 * + add a `migrate` step rather than mutating the existing payload.
 *
 * SSR safety: the persist middleware rehydrates AFTER first client
 * render. Consumers reading derived counts during render (the header
 * badge) must guard with `useCartHasHydrated()` or risk a SSR/client
 * mismatch warning. The hook returns false on SSR + the first client
 * render, then true once persist finishes; gate any visible "count"
 * UI on it.
 *
 * This is NOT a checkout; the Razorpay checkout (T25+) reads lines off
 * this store.
 */
"use client";

import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

const STORAGE_KEY = "bc-cart-v1";

export interface CartLine {
  /** Stable line key — `variantId ?? productId`. */
  key: string;
  productId: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  variantId: string | null;
  /** Variant SKU when variantId is set; falls back to product SKU otherwise. */
  variantSku: string | null;
  /** Human-readable variant label, e.g. "Small / Teal". Null for variant-less products. */
  variantLabel: string | null;
  /** Whole rupees, integer. */
  unitPriceInr: number;
  quantity: number;
}

/** Input shape for `addLine` — caller hands over the resolved snapshot. */
export interface AddLineInput {
  productId: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  variantId: string | null;
  variantSku: string | null;
  variantLabel: string | null;
  unitPriceInr: number;
  /** Optional, defaults to 1. */
  quantity?: number;
}

interface CartState {
  lines: CartLine[];
  isOpen: boolean;

  /** Add or merge a line into the cart. */
  addLine: (input: AddLineInput) => void;
  removeLine: (key: string) => void;
  setQuantity: (key: string, qty: number) => void;
  clear: () => void;

  openCart: () => void;
  closeCart: () => void;
  toggleCart: () => void;
}

function makeKey(productId: string, variantId: string | null): string {
  return variantId ?? productId;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      lines: [],
      isOpen: false,

      addLine: (input) => {
        const qty = Math.max(1, Math.floor(input.quantity ?? 1));
        const key = makeKey(input.productId, input.variantId);
        set((state) => {
          const existing = state.lines.find((l) => l.key === key);
          if (existing) {
            return {
              lines: state.lines.map((l) =>
                l.key === key ? { ...l, quantity: l.quantity + qty } : l,
              ),
            };
          }
          const line: CartLine = {
            key,
            productId: input.productId,
            slug: input.slug,
            name: input.name,
            imageUrl: input.imageUrl,
            variantId: input.variantId,
            variantSku: input.variantSku,
            variantLabel: input.variantLabel,
            unitPriceInr: input.unitPriceInr,
            quantity: qty,
          };
          return { lines: [...state.lines, line] };
        });
      },

      removeLine: (key) => {
        set((state) => ({ lines: state.lines.filter((l) => l.key !== key) }));
      },

      setQuantity: (key, qty) => {
        const n = Math.floor(qty);
        if (n < 1) {
          get().removeLine(key);
          return;
        }
        set((state) => ({
          lines: state.lines.map((l) =>
            l.key === key ? { ...l, quantity: n } : l,
          ),
        }));
      },

      clear: () => set({ lines: [] }),

      openCart: () => set({ isOpen: true }),
      closeCart: () => set({ isOpen: false }),
      toggleCart: () => set((state) => ({ isOpen: !state.isOpen })),
    }),
    {
      name: STORAGE_KEY,
      // Persist only durable data — never `isOpen`. The drawer should
      // start closed on every page load.
      partialize: (state) => ({ lines: state.lines }),
    },
  ),
);

// ─── Selectors (call as functions, NOT hooks, when computing inside an event) ──

export function selectTotalItems(state: CartState): number {
  return state.lines.reduce((sum, l) => sum + l.quantity, 0);
}

export function selectSubtotalInr(state: CartState): number {
  return state.lines.reduce((sum, l) => sum + l.unitPriceInr * l.quantity, 0);
}

// ─── Hydration helper ──────────────────────────────────────────────────
// `persist` rehydrates AFTER the first client render. Until then, any
// derived count rendered in JSX risks a SSR/client mismatch warning.
// Gate visible "count" UI on this hook returning true.
//
// Built on `useSyncExternalStore` rather than useState+useEffect — the
// React Compiler rejects setState-in-effect (see SESSION-RESUME
// gotcha), and useSyncExternalStore is the canonical primitive for
// "external store status" with a stable SSR snapshot.

// `persist` finishes hydration DURING store creation when storage is
// synchronous (localStorage). By the time we register the listener
// below, the callback has already fired and our flag would stay false.
// Initialize from the live `hasHydrated()` getter so the sync case is
// handled; the listener still catches the async case (any future
// migration to AsyncStorage, IndexedDB, etc).
let hasHydrated = useCartStore.persist?.hasHydrated() ?? false;
const hydrationListeners = new Set<() => void>();
useCartStore.persist?.onFinishHydration?.(() => {
  hasHydrated = true;
  for (const listener of hydrationListeners) listener();
});

function subscribeHydration(listener: () => void): () => void {
  hydrationListeners.add(listener);
  return () => hydrationListeners.delete(listener);
}

function getHydrated(): boolean {
  return hasHydrated;
}

function getServerHydrated(): false {
  return false;
}

export function useCartHasHydrated(): boolean {
  return useSyncExternalStore(subscribeHydration, getHydrated, getServerHydrated);
}
