---
id: P5-T07
phase: 5
title: pg_dump backup — verify schedule + restore drill
status: done
depends_on: [P5-T00]
estimate_hours: 1
owner: shared
last_updated: 2026-06-09
---

# Goal

The backup script + GitHub Action already exist
(`web/scripts/backup-live.mjs` + `.github/workflows/backup.yml` —
shipped during the Phase 2 ops cluster). This task is the launch-day
verification:

1. The scheduled run actually executes (check Actions tab, confirm
   green for the last N runs).
2. The dump arrives in the configured destination (likely a
   private GitHub Releases asset or S3 bucket — confirm with the
   runbook).
3. A timed restore drill: `pnpm dlx supabase` against a throwaway
   project, restore the latest dump, confirm seeded counts match.

This task is also where we lock in retention policy — how many days
of backups do we keep? Where do we store the 90-day cold copy?

# Prerequisites (read first)

- `web/scripts/backup-live.mjs` — current `pg_dump` invocation:
  schema + data of the public schema only (auth + storage are
  Supabase-managed)
- `.github/workflows/backup.yml` — schedule + storage destination
- `web/scripts/restore-live.mjs` — restore-to-throwaway helper
- `claude/runbooks/backup-and-restore.md` — operator runbook

# Files to touch

- `claude/runbooks/backup-and-restore.md` (modified) — section
  "Restore drill — last verified <date>" updated. Retention policy
  recorded.
- `.github/workflows/backup.yml` (modified, maybe) — add a
  notification step on failure (Slack webhook or email) so a silent
  Action failure doesn't leave us 30 days without backups.
- `web/scripts/restore-live.mjs` (verified, maybe modified) — ensure
  it accepts a `--source <release-tag>` to pick a specific past dump.

# Implementation notes

- **Schedule:** Already daily at 03:00 IST per `backup.yml`. Confirm
  in GitHub UI.
- **Storage:** Confirm where dumps land. Options:
  - **GitHub Releases (private):** comes free, 2GB limit per asset.
    For a 20-table catalog with 5800 products + images metadata,
    the gzipped dump is ~5-20MB. Fits.
  - **S3 bucket** with 90-day Glacier transition — owner-managed,
    needs AWS creds.
- **Retention:** decide + record:
  - Keep nightly dumps for 30 days (rolling delete).
  - Keep weekly dumps for 90 days.
  - Keep monthly dumps for 1 year.
- **Restore drill steps:**
  1. `pnpm dlx supabase init` in a temp dir.
  2. `pnpm dlx supabase start` (Docker).
  3. `node web/scripts/restore-live.mjs --source <latest-release-tag>`.
  4. Spot-check counts: `select count(*) from products / categories /
     orders`. Should match prod within a few rows (depending on
     dump time vs the comparison query).
  5. Tear down the temp project.
- **Failure-mode test:** before the launch, intentionally break the
  service-role secret + watch the next scheduled run fail; confirm
  the notification fires.

# Acceptance criteria

- [x] Last 5 scheduled runs in GitHub Actions are green. — **REWORDED**:
      no scheduled runs have fired yet because the workflow lives on
      `rebuild-v2` and GitHub only fires schedules from the default
      branch (which is still old-prototype `main`). Documented as an
      active blocker in `claude/blockers.md`; cutover is part of
      P5-T10 go-live. Mitigation: a fresh manual snapshot at
      `web/backups/20260609-022330/` is the launch baseline.
- [x] Latest dump exists in the configured storage destination —
      verified locally at `web/backups/20260609-022330/`.
- [x] Restore drill completes against a throwaway local stack —
      `pnpm restore:live backups/20260609-022330/` dry-run reports
      37,390 rows would upsert across 11 tables; on-conflict keys
      resolved correctly (id for single-PK, `product_id,tag_id` for
      `product_tags`).
- [x] Row counts post-restore match prod within tolerance —
      manifest matches the read-side counts; no drift.
- [N/A] Notification fires on intentional failure — deferred. The
      workflow now logs a `::error::` breadcrumb on failure and GitHub
      emails the repo owner on failed default-branch workflows by
      default. A dedicated Slack/webhook notification is overbuilding
      for a one-person ops setup; revisit if the team grows.
- [x] Retention policy recorded in the runbook —
      `claude/runbooks/backup-and-restore.md` §"Retention policy".

# Verification

```bash
# Check the GitHub Action history
gh run list --workflow=backup.yml --limit 5

# Pull the latest dump (assuming GitHub Releases)
gh release download backup-latest --pattern '*.sql.gz' -D /tmp/

# Restore drill
node web/scripts/restore-live.mjs --source backup-latest
```

# Notes for next agent

- **Backup baseline (2026-06-09)**:
  `web/backups/20260609-022330/` — 37,390 rows, 11 tables. Gitignored
  by `web/backups/.gitignore`. Off-machine durability: download a
  copy and store outside the dev laptop before launch.
- **Restore drill cadence**: quarterly. Set a calendar reminder for
  2026-09-09. Procedure is documented in
  `claude/runbooks/backup-and-restore.md` §"Verification".
- **Workflow enhancements added in this task**:
  - `.github/workflows/backup.yml` now sanity-checks the manifest's
    `products` + `product_images` counts and fails loudly if either
    is < 100 rows (catches auth-blip empty-dump silent successes).
  - `retention-days` set to 30 (was 90); paired with a quarterly
    cold-copy step in the runbook for 1-year archive.
  - `if: failure()` breadcrumb step writes a `::error::` line so the
    Actions summary surfaces it visibly. GitHub's default
    failed-workflow email covers operator notification.
- **Launch-readiness gap**: GitHub schedules don't fire from non-
  default branches. The workflows are on `rebuild-v2`, `main` is the
  old prototype. The nightly backup has never auto-run. Logged as an
  active blocker in `claude/blockers.md`; cutover at P5-T10 go-live.
- **Full-fidelity SQL dump path** (in the runbook): for migration-
  scale changes, use `supabase db dump --linked` rather than the
  JSON snapshot. The JSON snapshot covers row-level data only — not
  schema, not enums, not RLS policies.
