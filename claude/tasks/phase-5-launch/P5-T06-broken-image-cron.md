---
id: P5-T06
phase: 5
title: Broken-image nightly cron
status: not_started
depends_on: [P5-T00]
estimate_hours: 2
owner: ai
last_updated: 2026-06-07
---

# Goal

A nightly GitHub Action sweeps every `product_images` row, HEADs the
URL, and flips `license_status` to `removed` for any URL that returns
a non-2xx or a 4xx. The dashboard's Broken-images widget already
shows the count + a Review link (P3-T23 polish); this task makes
sure the count reflects reality continuously, not just at the
moment images were initially imported.

Catches: cloudfront URLs that JustKraft rotates, Supabase Storage
objects that got moved, hot-linked sources where the origin
removed the asset.

# Prerequisites (read first)

- `web/src/lib/db/admin/dashboard.ts` `getBrokenImagesCount` — already
  reads `license_status IN ('disputed', 'removed')`
- `web/src/lib/db/admin/products.ts` `candidateIdsForBrokenImages` —
  used by the dashboard's Review link filter
- `.github/workflows/backup.yml` — pattern reference for an admin-
  side scheduled GitHub Action

# Files to touch

- `web/scripts/sweep-broken-images.mjs` (new) — the actual sweep
  script: page through `product_images`, HEAD each URL with a 5s
  timeout + 3-retry budget, flip `license_status` on confirmed-dead
  ones. Logs a single summary row per run.
- `.github/workflows/broken-image-sweep.yml` (new) — schedule:
  daily at 02:00 IST (cron 30 20 * * *). Job pulls Supabase service-
  role from secrets, runs the script, posts a Slack/email
  notification if more than N URLs flipped (configurable, default 20).
- `web/supabase/migrations/0021_broken_image_sweep_audit.sql`
  (optional) — adds a `broken_image_sweep_runs(id, started_at,
  finished_at, total_checked, total_flipped)` table so the dashboard
  can show "last sweep: 8h ago, 3 flipped." Defer if owner doesn't
  want that visibility.

# Implementation notes

- **HEAD not GET** — 50× less bandwidth. If HEAD is unsupported (some
  CDNs), fall back to a Range: bytes=0-0 GET.
- **Concurrency:** 8 in-flight HEAD requests via a small p-limit.
  More overwhelms cloudfront's IP-throttling on the runner side.
- **What counts as "broken":**
  - HTTP 4xx → flip to `removed`.
  - HTTP 5xx → DON'T flip (CDN may be temporarily down); log + skip.
  - Network error / timeout → DON'T flip on first miss; flip only
    after 3 consecutive nightly misses (track via the audit table).
  - 2xx → leave alone OR re-set to the prior license_status if it
    had been auto-flipped to removed earlier.
- **Best-effort:** if the sweep itself errors mid-run, the audit row's
  `finished_at` stays NULL. The dashboard widget can surface
  "last sweep didn't finish" if both `last_run.finished_at` is NULL
  and `started_at` is > 1h old.
- **Service-role usage:** `scripts/sweep-broken-images.mjs` reads
  `SUPABASE_SERVICE_ROLE_KEY` directly via the same env-loading
  pattern as `scripts/flip-publish-all.mjs`. Goes through the
  `scripts/` ESLint allowlist; no need to touch admin client.
- **Sentry:** report unexpected errors (not URL-level fails) via
  `Sentry.captureException` if `process.env.SENTRY_DSN` is set.

# Acceptance criteria

- [ ] Running the script against the local stack with a seeded mix
      of valid + invalid URLs flips only the invalid ones.
- [ ] Running against live with `--dry-run` reports flips without
      writing.
- [ ] GitHub Action passes on a fresh PR with the workflow file.
- [ ] First scheduled run produces a Slack/email when threshold
      exceeded.
- [ ] `getBrokenImagesCount` reflects the count post-run.

# Verification

```bash
# Dry-run against live
SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node web/scripts/sweep-broken-images.mjs --dry-run

# Real run (against local first)
pnpm dlx supabase start
node web/scripts/sweep-broken-images.mjs

# Trigger the GitHub Action manually
gh workflow run broken-image-sweep.yml
```

# Notes for next agent

(empty)
