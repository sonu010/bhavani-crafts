---
id: P5-T01
phase: 5
title: Legal pages stubs (privacy/terms/shipping/returns)
status: not_started
depends_on: [P5-T00]
estimate_hours: 3
owner: shared
last_updated: 2026-06-07
---

# Goal

After this task, the four footer links the storefront ships today
land on real pages instead of 404s:

- `/policies/privacy`
- `/policies/terms` (T&C)
- `/policies/shipping`
- `/policies/returns`

Content is owner-supplied (or owner-approved Markdown drafts); the
rendering scaffold is identical for all four — server-rendered with
the same chrome the rest of the storefront uses (header, footer,
"— Bhavani Crafts" title template).

**Launch-gating.** Indian payment gateways (Razorpay included) require
visible policy pages before they let live keys process real
transactions.

# Prerequisites (read first)

- `claude/architecture/overview.md` §"What's deliberately not in MVP"
  — tax handling, fulfillment scope, refund posture
- `claude/decisions/ADR-011-razorpay-payments.md` §"What we
  deliberately do NOT do at MVP" — no refunds in-app, GST status,
  receipt-handling
- `web/src/components/storefront/site-footer.tsx` — current
  POLICY_LINKS array points at these four URLs

# Files to touch

- `web/src/app/(storefront)/policies/layout.tsx` (new) — shared chrome:
  `prose` container, max-w-3xl, "Last updated" footer.
- `web/src/app/(storefront)/policies/privacy/page.tsx` (new)
- `web/src/app/(storefront)/policies/terms/page.tsx` (new)
- `web/src/app/(storefront)/policies/shipping/page.tsx` (new)
- `web/src/app/(storefront)/policies/returns/page.tsx` (new)
- `web/e2e/anon/policies.spec.ts` (new) — assert each URL 200 + heading
  visible + body non-empty + footer reachable

# Implementation notes

- **Content source:** owner-supplied Markdown (or AI-drafted +
  owner-reviewed) per policy. Reasonable placeholder copy:
  - **Privacy** — data collected (name/email/phone/address captured
    per order in `orders` table; no `customers` table; no cookies
    beyond Next's session); RLS gate; retention.
  - **Terms** — buyer relationship, dispute path (WhatsApp first,
    then email), shipping-window estimate, jurisdiction (Hyderabad,
    Telangana, India).
  - **Shipping** — flat-rate (₹50 default, owner-editable in
    /admin/settings), domestic India only, expected delivery window,
    courier partner.
  - **Returns** — refund posture per ADR-011 §"No refunds in-app."
    Refunds are a manual process via Razorpay dashboard + WhatsApp.
- **No CMS.** Plain TSX with the policy text as JSX, OR Next's MDX —
  pick one approach across all four files. MDX wins if owner wants
  to edit Markdown later without touching code.
- **No client JS.** `export const dynamic = "force-static"` + ISR.
  Policies change rarely; cacheable forever.
- **SEO:** each page sets its own `metadata.title` so the title
  template wraps ("Privacy — Bhavani Crafts"). `robots: { index:
  true, follow: true }` (default) — these are public-facing.
- **"Last updated":** a single `LAST_UPDATED` const at the top of
  each page; the layout surfaces it in the page footer.
- **Footer link verify:** site-footer.tsx already has POLICY_LINKS
  pointing here; no change needed there.

# Acceptance criteria

- [ ] All four URLs return 200 with rendered content.
- [ ] Each `<title>` ends with " — Bhavani Crafts" (template wraps).
- [ ] Storefront chrome (header + footer + skip-link) renders on
      every policy page.
- [ ] Each page has a "Last updated: <date>" line.
- [ ] Pages are crawler-indexable (no noindex).
- [ ] `e2e/anon/policies.spec.ts` passes (each URL 200, heading
      visible, body > 200 chars).
- [ ] sitemap.xml includes all four policy URLs (P5-T03 verifies).

# Verification

```bash
cd web && pnpm build && pnpm start
for p in privacy terms shipping returns; do
  curl -s -o /dev/null -w "%{http_code} /policies/$p\n" "http://localhost:3000/policies/$p"
done
pnpm playwright test e2e/anon/policies.spec.ts
```

# Notes for next agent

(empty)
