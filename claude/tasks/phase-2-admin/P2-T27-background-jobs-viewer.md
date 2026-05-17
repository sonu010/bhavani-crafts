---
id: P2-T27
phase: 2
title: Background jobs viewer
status: not_started
depends_on: [P2-T05]
estimate_hours: 2
owner: ai
last_updated: 2026-05-17
---

# Goal

After this task, `/admin/jobs` lists `background_jobs` rows with status pills (queued / running / succeeded / failed / cancelled), progress bars, kind, created_by, started_at, finished_at, and a link to the per-job detail at `/admin/jobs/:id`. Detail view shows the full `job_events` audit trail + a "Retry from checkpoint" button for failed jobs + a "Cancel" button for queued jobs.

# Prerequisites (read first)

- [claude/architecture/database-schema.md](../../architecture/database-schema.md) §"background_jobs, job_events"
- [P2-T24](P2-T24-csv-import-execute-jobified.md) — the worker; cancel/retry semantics
- [P2-T05](P2-T05-admin-shell-layout.md) — nav link target

# Files to touch

- `web/src/app/admin/jobs/page.tsx` (new) — server component. Lists jobs with filter by status + kind.
- `web/src/app/admin/jobs/jobs-table.tsx` (new) — server-rendered; status pills + progress bars.
- `web/src/app/admin/jobs/[id]/page.tsx` (new) — server component. Renders job summary + `<JobEventsTimeline>` + action buttons.
- `web/src/app/admin/jobs/[id]/job-events-timeline.tsx` (new) — server; lists `job_events` chronologically.
- `web/src/app/admin/jobs/[id]/actions.ts` (new) — `retryJob(id)`, `cancelJob(id)`.
- `web/src/lib/db/admin/jobs.ts` (new) — `listJobs`, `getJob`, `listJobEvents`, `retryJob`, `cancelJob`.

# Implementation notes

**Status pills.**

| status | bg | text |
|---|---|---|
| queued | `husk-200` | `stone-500` |
| running | `teal-50` | `teal-800` |
| succeeded | `moss-100` | `moss-600` |
| failed | `brick-50` | `brick-600` |
| cancelled | `husk-200` | `stone-500` |

Progress bar uses `teal-800` fill, `husk-200` track. For `running` jobs, animate a subtle pulse (180ms ease-in-out, repeating) per the design system's motion rules.

**Retry from checkpoint.** Failed jobs have a `checkpoint` field set. `retryJob(id)`:
1. `UPDATE background_jobs SET status='queued', error=NULL WHERE id=$1 AND status='failed'`
2. Insert a `job_events` row `level='info', message='retry requested by <actor>'`
3. The next cron tick picks it up; worker reads `checkpoint` and resumes.

**Cancel.** Only valid for `queued` jobs (running jobs can't be cancelled mid-tick; cooperative cancellation is deferred). `cancelJob(id)`: `UPDATE background_jobs SET status='cancelled', finished_at=now() WHERE id=$1 AND status='queued'`.

**Filters.** Status (multi), kind (single), date range. AND-composed via URL params.

**Live updates.** Poll every 2s on the list page when any job is `queued` or `running`. Stop polling when all visible jobs are terminal. Same polling pattern as P2-T25.

**Event timeline.** Each `job_events` row shows: timestamp (JetBrains Mono), level pill (info / warn / error), message, expandable `data_json` blob (collapsed by default to keep the timeline scannable).

**Audit log.** `job.retry`, `job.cancel`. No audit for the job's own internal events (those live in `job_events`).

**Performance.** Both list and detail queries use indexes from 0007 (`background_jobs(status, created_at)` if not present, add in this task).

# Acceptance criteria

- [ ] `/admin/jobs` lists jobs with correct status pills + progress.
- [ ] Status filter narrows by any combination of statuses.
- [ ] Kind filter narrows by single kind.
- [ ] Polling refreshes every 2s when non-terminal jobs visible; stops when all terminal.
- [ ] `/admin/jobs/:id` shows event timeline.
- [ ] Retry button visible only on failed jobs; clicking enqueues for retry; status flips to queued; next cron processes.
- [ ] Cancel button visible only on queued jobs; flips to cancelled.
- [ ] If a new migration was needed for indexing: `pnpm validate:migrations` green.
- [ ] `pnpm tsc --noEmit`, `pnpm lint`, `pnpm build` green.

# Verification

```bash
cd web
pnpm validate:migrations
pnpm dev &
sleep 4
# /admin/jobs → seeded or recently-created jobs visible
# Run an import that fails (e.g., introduce a bad row to fail mid-chunk)
# → status=failed → Retry → status=queued → next cron tick processes → success
```

# Dependencies added

None.

# Notes for next agent

(empty)
