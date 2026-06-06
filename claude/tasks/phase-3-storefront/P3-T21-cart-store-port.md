---
id: P3-T21
phase: 3
title: Cart store port (from origin/main)
status: done
depends_on: [P3-T01]
estimate_hours: 1
owner: ai
last_updated: 2026-05-29
---

# Goal

Port the legacy zustand cart store into the rebuild, retyped to the
new product/variant shapes, persisted to localStorage, and
variant-aware (a line is keyed by variant id, not just product id).

# Prerequisites (read first)

- Source (reference): `git show origin/main:src/store/cart.ts` —
  zustand + persist; current API: addItem / removeItem /
  updateQuantity / clearCart / open/close/toggle / totalItems /
  totalPrice
- `web/src/lib/schemas/product.ts` — `ProductListItem` / detail types
- P3-T15 — variant resolution (cart lines carry variant id + sku)

# Files to touch

- `web/src/lib/storefront/cart-store.ts` (new) — the ported store.
- `web/package.json` — add `zustand`.

# Implementation notes

- **Retype.** Legacy `CartItem` was `{ product: Product; quantity }`.
  New line shape: `{ productId, slug, name, image, variantId | null,
  variantSku | null, unitPriceInr, quantity }` — store a flattened
  snapshot, not the whole product object (smaller localStorage, no
  stale embeds). Line key = `variantId ?? productId`.
- **Persist** via `zustand/middleware` `persist` to localStorage under
  a versioned key (e.g. `bc-cart-v1`) so a schema change can migrate
  or reset cleanly.
- **Selectors:** `totalItems()`, `subtotalInr()`. Keep them as derived
  getters (the legacy used `totalPrice`).
- **SSR safety:** the store is client-only; consumers must guard
  against reading it during SSR (render cart UI after mount). Document
  this for T20.
- This is NOT a checkout — it only holds the line items the Razorpay
  checkout (T25+) reads.

# Acceptance criteria

- [ ] Cart store adds/removes/updates lines keyed by variant.
- [ ] Persists across reload (versioned localStorage key).
- [ ] `totalItems` + `subtotalInr` selectors correct.
- [ ] Stores flattened line snapshots (no full product object).
- [ ] tsc + lint + build green.

# Verification

```bash
cd web && pnpm dev
# Add same product with two different variants → two lines
# Add same variant twice → one line, qty 2 → reload → persists
```

# Dependencies added

- `zustand` — client cart state + persist middleware (matches legacy).

# Notes for next agent

  - `lib/storefront/cart-store.ts`. `zustand` (5.0.13 already in deps) +
    `persist` middleware under `bc-cart-v1`. `partialize` strips
    `isOpen` so the drawer always starts closed on a fresh page.
  - Line shape is a FLATTENED snapshot (productId/slug/name/imageUrl/
    variantId/variantSku/variantLabel/unitPriceInr/quantity), keyed by
    `variantId ?? productId` so the same product in two variants becomes
    two lines. No full Product object retained → small localStorage
    footprint, no stale embeds when admin edits a product.
  - Selectors `selectTotalItems` and `selectSubtotalInr` are exported
    PLAIN FUNCTIONS (call as `useCartStore(selectTotalItems)`), not
    custom hooks — keeps them inlineable.
  - **Hydration gotcha for sync storage:** zustand's persist finishes
    rehydration DURING store creation when using localStorage, BEFORE
    any module-level listener registers. Initialize the local
    `hasHydrated` flag from `useCartStore.persist?.hasHydrated()` rather
    than waiting on `onFinishHydration` alone (which still fires for the
    async-storage case).
  - **`useCartHasHydrated()`** is built on `useSyncExternalStore` — NOT
    useState+useEffect — because the React Compiler's
    `react-hooks/set-state-in-effect` rule rejects the obvious pattern.
    SSR snapshot returns `false`; client snapshot reflects the live
    persist state.
