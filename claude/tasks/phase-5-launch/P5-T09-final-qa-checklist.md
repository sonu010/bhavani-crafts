---
id: P5-T09
phase: 5
title: Final QA checklist
status: done
depends_on: [P5-T01, P5-T02, P5-T03, P5-T04, P5-T05, P5-T06, P5-T07, P5-T08]
estimate_hours: 3
owner: shared
last_updated: 2026-06-10
---

# Goal

A single document — `claude/runbooks/launch-day.md` — that the owner
walks through start to finish before flipping DNS. Every box ticked
= go for launch. Anything unchecked = no launch, fix it.

This is the "we ship when this is green, not before" gate.

# Prerequisites (read first)

- Every other Phase 5 task (T01-T08) and the rehomed P4-T10/T11/T12
- `claude/architecture/security.md` — what we promised on PII +
  payments + auth
- `claude/decisions/ADR-011-razorpay-payments.md` — the payment
  scope boundary

# Files to touch

- `claude/runbooks/launch-day.md` (new) — the full checklist. Living
  doc; updated each launch.
- Existing runbooks pulled in by reference: `backup-and-restore.md`,
  any payment-runbook that lands with T26-T28.

# Implementation notes

The checklist groups by category. Each item is a one-liner with the
command or URL the owner runs to verify.

**Functional**
- [ ] Anon journey: load `/`, click an Atlas tile, filter by price,
      open a PDP, add to cart, checkout, land on /checkout/pending.
- [ ] Admin journey: log in (TOTP), create a new product via the
      header button, upload an image, publish; product appears on
      storefront within revalidate window.
- [ ] Admin orders: a pending_payment row → click Mark paid → status
      flips + audit row written + stock decremented.
- [ ] Settings: change shop name + WhatsApp number; storefront
      footer + bulk-enquiry CTA reflect within revalidate window.
- [ ] CSV import: upload + validate + execute the sample CSV;
      counts on the report page match.
- [ ] Trash: soft-delete a product → appears in Trash → restore →
      back in /admin/products.

**Pages exist + content**
- [ ] /policies/privacy, /terms, /shipping, /returns all 200
      with owner-approved content.
- [ ] /about + /contact 200 with owner copy.
- [ ] /search empty-state has a useful message.
- [ ] /404 page renders (curl /this-doesnt-exist).

**SEO + share**
- [ ] /sitemap.xml lists all expected URLs.
- [ ] /robots.txt allows / and disallows /admin /auth /api.
- [ ] OG cards render for /, /c/<slug>, /p/<slug> (opengraph.xyz
      check).
- [ ] PDP JSON-LD validates (Google Rich Results test).
- [ ] Title template wraps every page.

**Performance + a11y**
- [ ] Lighthouse mobile: Perf ≥ 80 / A11y ≥ 95 / BP ≥ 95 / SEO ≥ 95.
- [ ] No horizontal scroll at 360 px.
- [ ] Skip-link works (Tab on home, see "Skip to content").

**Security**
- [ ] `pnpm launch-blockers` exits 0 against LIVE (P5-T08).
- [ ] Admin login enforces TOTP (cannot reach /admin/products without
      AAL2).
- [ ] Service-role key is NOT in any `NEXT_PUBLIC_*` env, NOT in any
      client-side bundle (grep `_next/static` for the key prefix).
- [ ] hCaptcha + Upstash creds configured (P2-T01).
- [ ] CSP headers present on every route (curl -I).

**Ops + monitoring**
- [ ] Sentry receives a test error (P5-T05).
- [ ] Analytics dashboard shows a fresh session (P5-T05).
- [ ] Backup GitHub Action's last 5 runs green; restore drill done
      in the last week (P5-T07).
- [ ] Broken-image cron has run successfully overnight (P5-T06).

**Payments (gated on Razorpay keys arriving)**
- [ ] Test-key checkout end-to-end: place an order, pay with
      Razorpay test card, signature verified, status flips to paid,
      stock decrements.
- [ ] Webhook receiver responds 200 to a Razorpay test webhook
      delivery from the dashboard.
- [ ] LIVE keys swapped in; placeholder webhook URL updated.
- [ ] Refund flow documented (Razorpay-dashboard side; admin Mark
      refunded records the row).

**Content**
- [ ] Real product corpus loaded (P4-T10 real-content swap).
- [ ] Images rehosted onto Supabase Storage where appropriate
      (P4-T11).
- [ ] Featured products picked for the Weekly Collection.
- [ ] Top categories ordered correctly in the Atlas grid.

**DNS + domain**
- [ ] Domain registered (Cloudflare / Namecheap / GoDaddy).
- [ ] DNS records point at Vercel.
- [ ] Apex + www both resolve.
- [ ] HTTPS certificate provisioned (Vercel auto).
- [ ] NEXT_PUBLIC_SITE_URL set to the live origin in Vercel env.

# Acceptance criteria

- [x] **Runbook authored** at `claude/runbooks/launch-day.md` — 10
      sections (cutover prereqs → DNS), plus day-after + week-after
      follow-ups, plus sign-off block. ~150 individual checkbox items.
- [ ] Every checkbox is ticked — DEFERRED to actual launch day.
      Owner walks the runbook section by section before flipping DNS.
- [ ] Owner has read it end-to-end and signed off — DEFERRED to launch.

# Verification

```bash
# Spot-check the checklist exists + is non-trivial
wc -l claude/runbooks/launch-day.md
grep -c "^- \[" claude/runbooks/launch-day.md  # count of checkbox items
```

# Notes for next agent

- The runbook **leads with the cutover prerequisite** — flipping
  the default branch to `rebuild-v2` so the GitHub Actions
  schedules (`backup.yml`, `rls-attack.yml`,
  `broken-image-sweep.yml`) actually fire. Without that, three
  scheduled jobs we built don't run. See `blockers.md` for the
  full context.
- Sections 1-4 (functional + content + SEO) can be run today
  against the Vercel preview URL. Section 5 (perf + a11y) and 6
  (security/RLS) can also be run today. Section 8 (payments) is
  owner-blocked on Razorpay test keys. Section 9 (real content)
  is owner-blocked. Section 10 (DNS) waits on owner.
- The runbook references **`pnpm rls-attack --live`** and
  **`pnpm launch-blockers`** as the canonical pre-flight checks —
  both already wired and green as of 2026-06-09.
- Day-after + week-after blocks are intentional: launch isn't
  the finish line; first-week observability matters.
- The runbook links sideways to the related runbooks
  (backup-and-restore, promote-admin-user, deploy-vercel,
  rotate-secrets, restore-from-backup) rather than restating —
  keeps each doc shorter, harder to drift.
