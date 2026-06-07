---
id: P3-T26
phase: 3
title: Razorpay order creation (server)
status: blocked
depends_on: [P3-T25]
estimate_hours: 3
owner: ai
last_updated: 2026-06-07
---

# Goal

A server endpoint that, given the cart + customer details, creates a
local `orders` row (status `pending_payment`) AND a Razorpay order via
their API, returning the Razorpay order id + key for the client
checkout widget. Server is the source of truth for prices — the client
never sends amounts.

# Prerequisites (read first)

- P3-T25 — orders schema + ADR (keys, scope)
- claude/architecture/security.md §"Service-role key isolation",
  §"File-upload validation" (same server-validation discipline)
- Razorpay Orders API docs (server SDK or REST)

# Files to touch

- `web/src/app/api/checkout/create-order/route.ts` (new) — POST;
  validates the cart server-side, recomputes totals from the DB,
  creates the order rows + the Razorpay order.
- `web/src/lib/payments/razorpay.ts` (new) — thin client around the
  Razorpay API (create order, verify signature). Reads
  `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` from env.
- `web/src/lib/db/admin/orders.ts` (new) — `createPendingOrder(...)`,
  `attachRazorpayOrderId(...)`.
- `web/.env.example` (modified) — `RAZORPAY_KEY_ID`,
  `RAZORPAY_KEY_SECRET`, `NEXT_PUBLIC_RAZORPAY_KEY_ID`.

# Implementation notes

- **Server recomputes every price** from the DB by product/variant id;
  NEVER trust client-sent amounts (the canonical payments footgun).
  Reject if a line references a missing/unpublished product or an
  out-of-stock item.
- **Two-step:** (1) INSERT local order `pending_payment` with
  snapshotted items + server totals; (2) call Razorpay
  `orders.create({ amount: total*100, currency: 'INR', receipt:
  order_number })`; (3) store `razorpay_order_id` on the local row.
- **Secrets:** `RAZORPAY_KEY_SECRET` is server-only (never
  `NEXT_PUBLIC_`). Only `NEXT_PUBLIC_RAZORPAY_KEY_ID` reaches the
  client (it's a public key by design).
- **Rate limit** the endpoint (reuse `enforceImageUploadRateLimit`'s
  sliding-window limiter pattern, new bucket) to blunt abuse.
- **Amounts in paise** (Razorpay uses the smallest currency unit).
- Audit: write an `order.create` audit row.

# Acceptance criteria

- [ ] POST creates a `pending_payment` order with server-recomputed
      totals + a Razorpay order id.
- [ ] Client-sent amounts are ignored; totals come from the DB.
- [ ] Out-of-stock / unpublished / missing line → 400, no order
      created.
- [ ] Secret key never ships to the client; only the public key id.
- [ ] Endpoint rate-limited.
- [ ] tsc + lint + build green; unit test for the total recomputation.

# Verification

```bash
cd web && pnpm dev
# POST /api/checkout/create-order with a cart → returns razorpay_order_id
# Tamper an amount in the request → server still charges the DB total
```

# Dependencies added

- `razorpay` (server SDK) OR use `fetch` against the REST API — pick
  one; document in the ADR.

# Notes for next agent

(empty)
