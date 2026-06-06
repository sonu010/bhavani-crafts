# ADR-011 — Razorpay for checkout + payments (MVP)

**Status:** Accepted · **Date:** 2026-05-29 · **Authors:** Owner + Claude

## Context

[overview.md §"What's deliberately not in MVP"](../architecture/overview.md) originally listed *"checkout, payments (Razorpay), orders, fulfillment, shipping, tax, invoices"* as out of scope. The MVP was framed as a discoverable catalog with WhatsApp-based ordering — fast to build, no payment-gateway compliance, and a manual fulfillment process the owner already runs.

The owner reversed this on **2026-05-18** during the P3-T00 expansion: *"we will integrate razorpay for payments."* Real money + a real cart at launch, not a follow-up phase.

This ADR records the reversal, scopes what the payments integration *is* and *is not* at MVP, and locks the architectural decisions that the implementation tasks (P3-T25 schema, T26 order create, T27 checkout page, T28 verify + confirmation) build on. Everything below is the contract for those four tasks.

Razorpay is the only payment gateway under consideration:
- Owner is India-based (Hyderabad) — Razorpay covers UPI, cards, netbanking, EMI, BNPL natively in INR with no foreign-exchange friction.
- KYC + merchant onboarding is days, not weeks (vs. Stripe India which still requires Atlas-style entity work).
- Test mode is no-touch — keys are generated on signup and gated by the dashboard. Production keys swap in via env vars on go-live.
- Sandboxes a "Standard Checkout" widget Razorpay maintains, so the storefront does not embed PAN/card data directly (PCI scope = SAQ-A, which Razorpay handles).

## Decision

### 1. Razorpay Standard Checkout, not Razorpay Custom UI

We embed the [Razorpay Standard Checkout](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/) widget. The customer enters card / UPI / netbanking details inside the Razorpay-served iframe; the storefront never sees the raw payment instrument.

PCI scope stays at SAQ-A (the lightest tier). We are explicitly NOT eligible for any tier where we touch card numbers — that requires SAQ-D + an annual penetration test we are not in a position to fund at MVP.

### 2. Server-side order creation; client-side checkout-widget open

The flow:

1. **Server creates a Razorpay order** (`POST /api/checkout/create-order`). Reads cart lines from the request body, recomputes the total server-side (NEVER trust the client), calls Razorpay's `orders.create` with the verified total + INR currency, and writes a row to our `orders` table with `status='pending_payment'`. Returns the Razorpay `order_id` + our internal `order_id` to the client.
2. **Client opens the Razorpay widget** with the `order_id`. The customer pays inside the widget.
3. **On widget success callback**, the client POSTs the `(razorpay_order_id, razorpay_payment_id, razorpay_signature)` triplet back to `POST /api/checkout/verify`. The server verifies the HMAC-SHA256 signature against `RAZORPAY_KEY_SECRET`; on match, sets `orders.status='paid'` + records the payment id.
4. **A webhook backstop** (`POST /api/checkout/webhook`) receives `payment.captured` from Razorpay and re-confirms the order even if the customer closes the tab before the callback fires.

The webhook is not optional. The success callback can be lost (tab close, network glitch, browser back-button); the webhook is the only authoritative confirmation. Both paths verify the signature; the second-to-arrive is idempotent (it sees `status='paid'` and exits).

### 3. The secret key never ships to the client

Only the `key_id` is `NEXT_PUBLIC_*` (it appears in the widget script's data-key). `RAZORPAY_KEY_SECRET` is server-only and lives in `web/.env.local` / Vercel env. ESLint's existing `no-restricted-imports` rule (blocks `@/lib/db/admin` outside admin namespaces) will be extended to block `RAZORPAY_KEY_SECRET` reads outside `app/api/checkout/**`.

### 4. Test keys vs live keys

Two distinct Razorpay key pairs:
- `rzp_test_…` — embedded in `.env.local` for local dev + Vercel preview deployments.
- `rzp_live_…` — only on the production Vercel project, configured manually by the owner before go-live.

The codebase does not branch on `NODE_ENV` for keys; it always reads the same `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` env vars. Which key is loaded is a deployment concern, not a code concern.

### 5. Inventory is reserved on `paid`, not on `pending_payment`

Cart abandonment is the norm. If we decremented stock on cart-open or even on order-create-pending, an abandoned cart would block legitimate buyers behind it. We decrement `products.stock_quantity` (when populated) inside the verify handler, in the same transaction as the status flip to `paid`. The decrement is best-effort — stock is informational at MVP, not a hard gate; over-sells are reconciled manually.

For `stock_status='out_of_stock'` products, the storefront already disables add-to-cart, so the gate happens before checkout opens.

### 6. Currency is INR. Period.

`orders.total_inr` is a non-negative integer of whole rupees. Razorpay expects amounts in paise (₹1 = 100 paise) — we multiply on the way out and divide on the way back; the database never stores paise. No multi-currency at MVP, no FX, no locale formatting beyond `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })`.

### 7. Order numbers are human-friendly + sequence-backed

`orders.order_number` is `BC-YYYY-NNNN`, e.g. `BC-2026-0001`. Generated by a Postgres function reading a sequence + the current year. Customers see this on the confirmation page + in any future WhatsApp/email follow-up. The internal `orders.id` (uuid) is the FK target.

### 8. What we deliberately do NOT do at MVP

Listing this explicitly so a future request to "just add X" gets a clear scope reset:

- **No refunds in-app.** A refund is a 3-step manual process the owner runs from the Razorpay dashboard. The admin can mark an order `refunded` after the fact, but the money movement is dashboard-side.
- **No partial payments / split payments / payment plans / EMI surcharge handling.** Razorpay's widget covers EMI as a payment method; we treat the resulting transaction as a single payment.
- **No saved cards / tokenized payments.** Every checkout is fresh.
- **No subscriptions / recurring.** Every order is one-shot.
- **No customer accounts.** Email + phone are captured per-order; we don't create a `customers` table. (This may change in a later phase — orders carry enough contact info to backfill.)
- **No address book.** Address is entered per-order.
- **No shipping calculation.** Flat rate or free shipping above a threshold; configured as a constant in `lib/storefront/shipping.ts` (Phase 3.5 if we ever need it).
- **No tax computation.** Owner is below the GST threshold at MVP; prices are GST-inclusive when applicable. A `tax_inr` column is intentionally absent until we cross the threshold.
- **No invoices in PDF.** Razorpay sends the customer a payment receipt; that's the audit trail.

### 9. Smoke testing: Razorpay's test cards

Razorpay publishes test cards that succeed (`4111 1111 1111 1111`), fail (`4242 4242 4242 4242` flips to failure in test mode), and trigger 3D-Secure flows. We do not maintain our own list — link to [Razorpay's test card docs](https://razorpay.com/docs/payments/payments/test-card-details/) in the runbook.

## Consequences

**Positive:**

- The cart already has a real total + line snapshots (P3-T21). Plugging it into Razorpay is mechanical work, not architectural.
- Single payment gateway means a single auth model, a single webhook receiver, a single signature scheme. No abstraction-layer tax.
- Owner already has a UPI-first customer base; Razorpay is the obvious match.

**Negative / accepted trade-offs:**

- We now hold customer PII (name, phone, email, address) on `orders` rows. RLS gates anon SELECT entirely; admin SELECT is gated on `is_admin()`. A breach is materially worse than the pre-orders catalog-only state.
- Webhook handlers need to be idempotent and to survive Razorpay's retry storm if our endpoint is briefly down. Verify-by-signature + the `orders.status` check handles both.
- Cart-to-checkout is now a single-page funnel. If checkout breaks for any reason, the cart is the only safety net (it persists, so the customer can retry).
- One more env var pair to manage. `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` get the same treatment as `SUPABASE_SERVICE_ROLE_KEY`: documented in `.env.example`, never committed, owner-configured per environment.

## Owner-pending before this cluster can ship

The implementation tasks (T25 schema, T26 order-create, T27 checkout, T28 verify) can land without these. Production go-live cannot.

- Owner creates a Razorpay account (test mode is free; live mode needs KYC).
- Owner supplies `rzp_test_…` keys for local dev + Vercel preview.
- Owner supplies `rzp_live_…` keys for the Vercel production project at go-live.
- Owner configures the Razorpay webhook URL (`https://<prod-domain>/api/checkout/webhook`) + records the webhook secret (separate from `KEY_SECRET`).
- Owner sets the `payment.captured` (and optionally `payment.failed`) webhook events on the Razorpay dashboard.

Tracked in `claude/blockers.md`.

## See also

- T26 — `POST /api/checkout/create-order` (server-side order create + Razorpay create + DB insert)
- T27 — `/checkout` page (address form, payment widget, callback wiring)
- T28 — `POST /api/checkout/verify` + `POST /api/checkout/webhook` + `/checkout/success` confirmation
- [overview.md](../architecture/overview.md) — "Out of MVP" list, updated to reflect this reversal
- [security.md](../architecture/security.md) §"RLS Policies" — the EXISTS pattern `orders` policies follow
