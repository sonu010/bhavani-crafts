---
id: P5-T07
phase: 5
title: pg_dump backup — verify schedule + restore drill
status: not_started
depends_on: [P5-T00]
estimate_hours: 1
owner: shared
last_updated: 2026-06-07
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

- [ ] Last 5 scheduled runs in GitHub Actions are green.
- [ ] Latest dump exists in the configured storage destination.
- [ ] Restore drill completes against a throwaway local stack.
- [ ] Row counts post-restore match prod within tolerance.
- [ ] Notification fires on intentional failure (single test run).
- [ ] Retention policy recorded in the runbook.

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

(empty)
