---
id: P3-T25
phase: 3
title: Orders schema + payments ADR
status: done
depends_on: [P3-T21]
estimate_hours: 3
owner: shared
last_updated: 2026-06-07
---

# Goal

Lay the foundation for checkout: an ADR recording the Razorpay
decision (it OVERRIDES overview.md §"Out of MVP", which listed
payments as out of scope), and the `orders` + `order_items` schema
the checkout + verification flow writes to.

# ⚠️ Scope note

Payments were explicitly OUT of MVP in `overview.md`. The owner
reversed this on 2026-05-18 ("we will integrate razorpay for
payments"). This cluster (T25–T28) implements that reversal. Before
writing code, the ADR below must be written + the overview.md
"Out of MVP" list updated to remove checkout/payments.

# Prerequisites (read first)

- claude/architecture/overview.md §"Out of MVP" (the line this
  reverses) + §"Data model"
- claude/decisions/ — ADR format (see existing ADR-0xx files)
- claude/architecture/security.md — RLS patterns; orders are
  owner/admin-readable, customer-writable-on-create only
- claude/architecture/database-schema.md — table + enum conventions,
  smoke-block requirement
- P3-T21 — cart line shape (orders snapshot these lines)

# Files to touch

- `claude/decisions/ADR-0NN-razorpay-payments.md` (new) — decision,
  context, consequences. Cover: test vs live keys, what we DON'T do
  (refunds, partial payments, saved cards, subscriptions), webhook vs
  callback verification, inventory-on-payment policy, currency INR.
- `web/supabase/migrations/<NNNN>_orders.sql` (new) — `orders` +
  `order_items` tables + enums + RLS + smoke block.
- `claude/architecture/overview.md` (modified) — move checkout/
  payments out of the "Out of MVP" list; add an "Orders" data-model
  entry.

# Implementation notes

- **`orders`**: id, order_number (human-friendly, e.g. BC-2026-0001),
  status enum (`pending_payment` / `paid` / `failed` / `cancelled` /
  `refunded`), customer contact (name, phone, email — no accounts in
  MVP), shipping address (jsonb or columns), subtotal_inr,
  total_inr, razorpay_order_id, razorpay_payment_id,
  razorpay_signature, created_at, paid_at, soft-delete columns.
- **`order_items`**: id, order_id (FK CASCADE), product_id (FK SET
  NULL so deleting a product doesn't erase order history), variant_id,
  sku, name (snapshot), unit_price_inr (snapshot), quantity,
  line_total_inr. Snapshot prices/names so historical orders are
  immutable even when the catalog changes.
- **RLS:** anon can INSERT a pending order (the checkout creates it)
  but cannot read others'; admin reads all. Lock this carefully —
  orders contain PII. Mirror the security.md RLS EXISTS templates.
- **Smoke block:** assert an order + item insert round-trips + the
  status enum rejects bad values; clean up `zzz-` fixtures.
- **pglite-validate before push** (ADR-010).

# Acceptance criteria

- [ ] ADR-0NN written: Razorpay decision, scope boundaries (no
      refunds/subscriptions/saved-cards in MVP), verification method.
- [ ] overview.md updated — payments removed from "Out of MVP";
      Orders added to data model.
- [ ] `orders` + `order_items` migration validates via pglite + has a
      green smoke block; pushed to live.
- [ ] RLS: anon can create a pending order, cannot read others'; admin
      reads all (tested).
- [ ] Prices/names snapshotted on `order_items`.
- [ ] tsc + lint + `pnpm validate:migrations` green.

# Verification

```bash
cd web
pnpm validate:migrations
pnpm dlx supabase db push
# psql: insert an order + items as anon → ok; select another order as
#   anon → blocked by RLS; select all as service-role → ok
```

# Dependencies added

(none) — schema only.

# Notes for next agent

(empty)
