---
id: P3-T28
phase: 3
title: Payment verification + order confirmation
status: blocked
depends_on: [P3-T27]
estimate_hours: 3
owner: ai
last_updated: 2026-06-07
---

# Goal

Server-side verification of the Razorpay payment signature, flipping
the order to `paid`, and an order-confirmation page the customer lands
on. Optionally a webhook for the case where the client never returns.

# Prerequisites (read first)

- P3-T26 — order rows + razorpay lib (signature helper)
- P3-T25 — order status enum (pending_payment → paid / failed)
- Razorpay signature verification docs (HMAC-SHA256 over
  `razorpay_order_id|razorpay_payment_id` with the key secret)
- claude/architecture/security.md — never trust client-reported
  payment success

# Files to touch

- `web/src/app/api/checkout/verify/route.ts` (new) — POST; verifies
  the signature, marks the order paid, returns the order number.
- `web/src/app/api/webhooks/razorpay/route.ts` (new) — webhook
  fallback; verifies the webhook signature, idempotently marks paid.
- `web/src/app/(storefront)/order/[number]/page.tsx` (new) — order
  confirmation (read-only; shows items + total + status).
- `web/src/lib/db/admin/orders.ts` (modified) — `markOrderPaid(...)`,
  `getOrderByNumber(...)`.

# Implementation notes

- **Verification is the security boundary.** Recompute the HMAC
  signature server-side from `razorpay_order_id + '|' +
  razorpay_payment_id` using `RAZORPAY_KEY_SECRET`; compare to the
  client-sent `razorpay_signature` with a timing-safe equal. Only on
  match flip status → `paid`, store `razorpay_payment_id` +
  `razorpay_signature`, set `paid_at`. NEVER mark paid on the client's
  word alone.
- **Idempotency:** both the verify endpoint AND the webhook can mark
  the same order paid; use `WHERE status = 'pending_payment'` so the
  second writer is a no-op. The webhook covers the "customer closed
  the tab after paying" case.
- **Webhook signature** uses a separate `RAZORPAY_WEBHOOK_SECRET`;
  verify the `X-Razorpay-Signature` header. Add to .env.example.
- **On paid:** clear the client cart (the confirmation page or the
  verify response signals the client to call `clearCart()`).
  Optionally write an audit row + (later) trigger an order-notification
  email/WhatsApp — defer notifications.
- **Confirmation page** `/order/[number]` reads the order by number;
  guard against enumeration (the number is the only key — acceptable
  for MVP, or add a short token). Shows items, total, status, contact.
- **Inventory:** decide in the ADR whether `paid` decrements stock.
  MVP can skip stock decrement (made-to-order / manual fulfillment);
  document the choice.

# Acceptance criteria

- [ ] Verify endpoint recomputes the HMAC signature server-side;
      mismatched signature → 400, order stays pending.
- [ ] Valid signature → order `paid`, payment id + signature stored,
      `paid_at` set.
- [ ] Webhook independently marks paid; double-marking is idempotent.
- [ ] `/order/[number]` shows the confirmed order.
- [ ] Cart clears only after verified payment.
- [ ] `RAZORPAY_WEBHOOK_SECRET` documented in .env.example.
- [ ] tsc + lint + build green; unit test for signature verification
      (known-good + tampered vectors).

# Verification

```bash
cd web && pnpm dev
# Full flow: checkout → test card → verify → order flips to paid →
#   /order/<number> renders → cart cleared
# Replay verify with a tampered signature → rejected, order stays pending
# Fire a test webhook → idempotent (no double-paid)
```

# Dependencies added

(none) — Node `crypto` for HMAC.

# Notes for next agent

(empty)
