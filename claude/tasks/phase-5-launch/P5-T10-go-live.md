---
id: P5-T10
phase: 5
title: Go live
status: not_started
depends_on: [P5-T09]
estimate_hours: 1
owner: shared
last_updated: 2026-06-07
---

# Goal

The moment we flip the switch. After this task:
- The live domain serves the rebuild-v2 storefront.
- The old `main` branch's prototype is no longer reachable (DNS
  cutover OR Vercel project-branch swap).
- Razorpay LIVE keys are in (test keys retired).
- The owner has the first 24 hours of operational visibility set up
  (Sentry, analytics, broken-image cron schedule).

# Prerequisites (read first)

- `claude/runbooks/launch-day.md` (the QA checklist from P5-T09) —
  every box ticked
- `claude/decisions/ADR-011-razorpay-payments.md` §"Owner-pending"
  — confirm every blocker cleared
- Vercel project settings — the "Production Branch" config (Path A
  vs Path B from the architecture discussion earlier this session)

# Files to touch

- Vercel project settings (UI, not code) — switch Production Branch
  to `rebuild-v2` OR merge `rebuild-v2` → `main` and let Vercel
  deploy from main.
- Live env vars (Vercel UI) — confirm all set:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `NEXT_PUBLIC_SITE_URL` (the live origin, no trailing slash)
  - `NEXT_PUBLIC_WHATSAPP_NUMBER` (or empty; app_settings overrides)
  - `RAZORPAY_KEY_ID` (live)
  - `RAZORPAY_KEY_SECRET` (live)
  - `RAZORPAY_WEBHOOK_SECRET` (live; see T28 runbook)
  - `SENTRY_DSN`
  - `PREVIEW_TOKEN_SECRET`
- DNS records at the registrar (CNAME or A → Vercel).
- `claude/progress.md` (modified) — bump status: launched + date.

# Implementation notes

- **Sequence:**
  1. **Final pre-flight:** P5-T09 checklist all ticked.
  2. **Razorpay LIVE keys:** swap test → live in Vercel env vars.
     `RAZORPAY_KEY_ID` flips from `rzp_test_*` → `rzp_live_*`.
     Update webhook URL in Razorpay dashboard to the production
     domain.
  3. **One last preview deploy** with live env vars in a preview-
     branch override → quick smoke test → if green, proceed.
  4. **Promote:** merge `rebuild-v2` → `main` OR set Vercel
     Production Branch to `rebuild-v2`. Either way Vercel
     auto-deploys.
  5. **DNS:** point apex + www at Vercel. Wait for HTTPS cert.
  6. **Verify:** load the live URL in incognito. Run through the
     anon journey once.
  7. **Monitoring tail:** open Sentry + analytics + Vercel logs.
     Watch for the first hour.
- **Rollback plan:** if anything blows up, revert the Vercel
  Production Branch to whatever it was (pre-cutover the prototype
  `main` was serving). DNS doesn't have to revert — Vercel will
  serve whichever branch is Production.
- **Backup:** kick a manual backup right after launch via the
  GitHub Action so we have a known-good post-launch snapshot.
- **First-day comms:** owner-side, not in scope here — but the
  runbook notes when to post on Instagram / WhatsApp groups /
  email list.

# Acceptance criteria

- [ ] Live domain serves the rebuild-v2 codebase (curl the home
      page, see the editorial hero).
- [ ] HTTPS works; cert valid.
- [ ] Razorpay test keys swapped for live keys; a live ₹10 test
      payment from the owner completes + the order shows up in
      /admin/orders + status paid.
- [ ] Sentry receives a test error from the live origin.
- [ ] Analytics dashboard shows live sessions.
- [ ] DNS resolves consistently (`dig`, `nslookup` — apex + www).
- [ ] First post-launch backup exists.
- [ ] No P0 errors in Sentry in the first hour.

# Verification

```bash
curl -sI https://<live-domain>/                # 200 + Cache-Control headers
curl -sI https://<live-domain>/p/brass-diya-small
curl -s https://<live-domain>/robots.txt | head
dig <live-domain>                              # confirm Vercel IPs
openssl s_client -connect <live-domain>:443 -servername <live-domain> < /dev/null 2>/dev/null | openssl x509 -dates -noout
```

# Notes for next agent

(empty)
