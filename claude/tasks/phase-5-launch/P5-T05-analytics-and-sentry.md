---
id: P5-T05
phase: 5
title: Analytics + Sentry wiring
status: done
depends_on: [P5-T00]
estimate_hours: 2
owner: shared
last_updated: 2026-06-10
---

# Goal

After this task:

- **Sentry** captures every uncaught exception (server + edge + client),
  reports source-mapped stack traces, and dedupes by fingerprint.
  Owner gets an email/Slack ping on the first occurrence of any new
  error class.
- **Plausible** (or Vercel Analytics — see Implementation notes) tracks
  page views + cart-add + checkout-submit + WhatsApp-click — cookie-
  less, no PII, no GDPR banner needed.
- The "landing-atlas read fetch failed" class of bug that surfaced
  during the storefront preview would have pinged the owner within
  minutes instead of being discovered by manual reload.

# Prerequisites (read first)

- `web/.env.example` — `SENTRY_DSN` and Sentry-related env vars already
  templated; just need values
- `claude/architecture/observability.md` (if it exists; if not, write
  it as part of this task) — single page on "what we log, what we
  monitor, what triggers an alert"
- `web/src/lib/storefront/safe-read.ts` — currently swallows storefront
  read failures with a console.warn; Sentry needs to grab those too

# Files to touch

- `web/package.json` — add `@sentry/nextjs` (+ Plausible script tag is
  inline, no package)
- `web/sentry.server.config.ts` (new)
- `web/sentry.edge.config.ts` (new)
- `web/sentry.client.config.ts` (new)
- `web/next.config.ts` (modified) — wrap export in
  `withSentryConfig(...)` from `@sentry/nextjs`
- `web/src/app/layout.tsx` (modified) — Plausible / Vercel Analytics
  script tag; CSP `script-src` already allows
  `https://va.vercel-scripts.com` per next.config.ts
- `web/src/lib/storefront/safe-read.ts` (modified) — call
  `Sentry.captureException(err, { tags: { source: "storefront-safe-read", key } })`
  inside the catch block (still swallow + render fallback)
- `web/.env.example` (modified) — add `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`
  (if going with Plausible), document SENTRY env vars
- `claude/architecture/observability.md` (new or modified) — "what
  triggers an alert" table + alert routing

# Implementation notes

- **Analytics provider:** pick ONE of:
  - **Plausible** — owner-hosted or plausible.io, cookie-less, has a
    free tier for the first 10k pageviews/month. Add
    `<script defer data-domain="<live>" src="https://plausible.io/js/script.js" />`.
    Custom-event tracking via `window.plausible('Cart add', { props: { sku } })`.
  - **Vercel Analytics** — comes free with the Vercel deploy, no
    third-party domain. Add `<Analytics />` from `@vercel/analytics/next`.
    Less granular events without the Pro tier.
  - **Recommended:** Vercel Analytics for MVP (zero config, free with
    the host), revisit Plausible if granular event tracking is needed.
- **Sentry:**
  - `tunnelRoute: "/monitoring"` to route Sentry requests through Next
    (defeats ad-blockers blocking sentry.io domains).
  - `tracesSampleRate: 0.1` for the first month, drop to 0.01 once
    volume picks up.
  - Don't sample errors — `sampleRate: 1.0`.
  - `beforeSend` hook to scrub PII from order rows (email/phone/
    address). Anything in `extra.order` gets redacted to `<scrubbed>`.
- **Events to track (Plausible custom events):**
  - `Cart add` — sku, qty
  - `Checkout start` — total INR
  - `Checkout submit` — order_number, total INR
  - `WhatsApp click` — surface (bulk_enquiry, footer, pending_page)
- **safe-read.ts wire-up** — every storefront section that catches
  via readOrEmpty(key, fn, fallback) now also reports to Sentry. The
  fallback still renders so customers see no broken page; the owner
  gets the alert.

# Acceptance criteria

- [x] `pnpm build` runs Sentry's source-map upload OR skips
      gracefully when SENTRY_AUTH_TOKEN is unset — verified
      locally, build passes with `sourcemaps.disable: true` when
      token is empty.
- [x] safe-read.ts wraps `Sentry.captureException` inside its catch,
      tagged `source: "storefront-safe-read"` + `key`.
- [x] `observability.md` documents file map + sampling + PII scrub.
- [x] Vercel Analytics `<Analytics />` mounted in root layout.
- [ ] Intentionally throwing from a test route → error appears in
      Sentry within 1 minute — DEFERRED (owner-blocked on DSN).
      Verify after DSN paste: hit `/api/_diag/sentry-test` (TBD),
      see the issue in Sentry's UI within 60s.
- [ ] Analytics dashboard shows a fresh session — DEFERRED to
      post-deploy.
- [ ] PII scrub end-to-end verified — DEFERRED. Throw from
      `createCheckoutOrder` with extra.order populated; confirm
      `email/phone/address` come through as `<scrubbed>`.

# Verification

```bash
# Local
pnpm build  # source-map upload runs if SENTRY_AUTH_TOKEN set
curl -s http://localhost:3000/_error-test  # crashes intentionally
# Sentry dashboard: should show the error within 60s
```

# Notes for next agent

(empty)
