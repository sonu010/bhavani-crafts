---
id: P3-T27
phase: 3
title: Checkout page + Razorpay widget
status: not_started
depends_on: [P3-T26]
estimate_hours: 3
owner: ai
last_updated: 2026-05-18
---

# Goal

`/checkout` collects customer contact + shipping details, shows the
cart summary, and launches the Razorpay checkout widget against the
order created by T26. On payment success the client posts the
Razorpay response to the verification endpoint (T28).

# Prerequisites (read first)

- P3-T26 — create-order endpoint + razorpay lib
- P3-T20/T21 — cart drawer + store (source of the line items)
- Razorpay Checkout (web) docs — the `Razorpay()` browser widget
- claude/architecture/design-system.md — form + button patterns

# Files to touch

- `web/src/app/(storefront)/checkout/page.tsx` (new) — server shell.
- `web/src/app/(storefront)/checkout/checkout-form.tsx` (new) —
  client; contact + address form (react-hook-form + Zod), cart
  summary, "Pay" button.
- `web/src/lib/schemas/checkout.ts` (new) — Zod schema for customer
  details (name, phone, email, address).
- `web/src/app/(storefront)/checkout/razorpay-launcher.tsx` (new) —
  client; loads the Razorpay script + opens the widget.

# Implementation notes

- **Flow:** form valid → POST T26 create-order → get
  `razorpay_order_id` + `NEXT_PUBLIC_RAZORPAY_KEY_ID` → open the
  Razorpay widget with `{ order_id, amount, currency, prefill: {name,
  email, contact} }` → on `handler(response)` POST to T28 verify →
  on verified, route to the confirmation page; on dismiss/failure,
  keep the cart + show a retry message.
- **Load the Razorpay script** lazily (only on /checkout) via
  next/script `afterInteractive`; don't ship it site-wide.
- **Empty cart guard:** if the cart is empty, redirect to `/`.
- **Phone/email validation** in Zod; phone is the primary contact
  (WhatsApp-first audience).
- **Do not clear the cart** until T28 confirms payment — a dismissed
  widget must leave the cart intact.

# Acceptance criteria

- [ ] `/checkout` shows the cart summary + a validated contact/address
      form.
- [ ] "Pay" creates the order (T26) then opens the Razorpay widget
      with the right amount + prefill.
- [ ] Empty cart redirects away from checkout.
- [ ] Razorpay script loads only on /checkout.
- [ ] Widget dismiss leaves the cart intact.
- [ ] No horizontal scroll at 360px.
- [ ] tsc + lint + build green.

# Verification

```bash
cd web && pnpm dev
# Add items → Checkout → fill form → Pay → Razorpay test widget opens
# Use a Razorpay test card → success → confirmation
# Dismiss the widget → cart still has items
```

# Dependencies added

(none) — Razorpay widget is a script tag, not an npm dep.

# Notes for next agent

(empty)
