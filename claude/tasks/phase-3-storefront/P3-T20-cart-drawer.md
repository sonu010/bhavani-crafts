---
id: P3-T20
phase: 3
title: Cart drawer (Sheet)
status: done
depends_on: [P3-T01, P3-T21]
estimate_hours: 2
owner: ai
last_updated: 2026-05-29
---

# Goal

A slide-in cart drawer (Sheet) listing added items with thumbnail,
name, variant, unit price, quantity stepper, line total, and a
running subtotal. A primary "Checkout" CTA routes to the Razorpay
checkout (payments cluster, P3-T25..T28). The cart icon in the header
shows a live item-count badge.

# Prerequisites (read first)

- P3-T21 — the cart store (zustand) this renders
- P3-T01 — header cart trigger + `<ProductCard>` add-to-cart wiring
- claude/architecture/design-system.md §"Component patterns" (Sheet,
  buttons)
- Reference only: `git show origin/main:src/components/cart/CartDrawer.tsx`

# Files to touch

- `web/src/components/storefront/cart-drawer.tsx` (new) — client;
  the Sheet.
- `web/src/app/(storefront)/site-header.tsx` (modified) — cart trigger
  + count badge bound to the store.

# Implementation notes

- **Sheet** slides from the right (desktop) / bottom (mobile). Reuse
  the shadcn `Sheet` primitive.
- **Lines** read from the cart store: each shows image, name, variant
  label, qty stepper (+/-), line total (JetBrains Mono). Remove (×)
  per line. Subtotal at the bottom.
- **Checkout CTA** → `/checkout` (built in the payments cluster).
  Until that lands, the button can be present but disabled with a
  "Checkout coming soon" tooltip — but since payments are now in
  scope, wire it to `/checkout` and let T25+ build the page.
- **Empty state:** "Your cart is empty" + a link to browse.
- **Count badge** on the header icon reflects `totalItems()`; hidden
  when zero. Hydration-safe (cart is client-persisted; guard against
  SSR/client mismatch by rendering the badge only after mount).

# Acceptance criteria

- [ ] Cart drawer lists items with qty steppers + line totals +
      subtotal.
- [ ] Add-to-cart from PDP/card opens or updates the drawer; count
      badge updates.
- [ ] Remove + quantity edits persist (via the store).
- [ ] Checkout CTA routes to `/checkout`.
- [ ] Empty state renders; no hydration warning for the badge.
- [ ] No horizontal scroll at 360px.
- [ ] tsc + lint + build green.

# Verification

```bash
cd web && pnpm dev
# Add a product → drawer opens → adjust qty → subtotal updates →
#   reload → cart persists → Checkout → /checkout
```

# Dependencies added

(none) — zustand arrives with T21.

# Notes for next agent

  - `components/storefront/cart-drawer.tsx`. Slides from the right
    (desktop) / bottom (mobile) via shadcn Sheet. Lines list thumb +
    name + variant label + qty stepper (Plus/Minus + tabular num count)
    + line total + remove ×. Subtotal + 'shipping calculated at checkout'
    + primary Checkout CTA → `/checkout` (payments cluster T25+ wires
    the page; 404 today by design).
  - Mounted ONCE in the storefront layout below the footer. Open state
    lives in the cart store (`isOpen`), so the header cart button +
    PDP add-to-cart can both `openCart()` without prop drilling.
  - Header (`site-header.tsx`) now wires the cart icon to `toggleCart()`
    and renders a teal-800 count badge fed by `selectTotalItems`. Both
    badge + open state are gated on `useCartHasHydrated()` to dodge
    SSR/client mismatch.
  - PDP `add-to-cart.tsx` rewritten: takes a single `line: AddLineInput`
    prop (caller computes the snapshot) + `disabled` + `reason`. On
    click → `addLine(line) + openCart()`. variant-selector + the
    variant-less page branch each build their own snapshot.
  - E2E covers all 4 happy paths (drawer open, qty stepper updates,
    localStorage persistence + badge reflects count after reload,
    variant-keyed line + remove + checkout href).
