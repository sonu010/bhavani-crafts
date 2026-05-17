---
id: P2-T25
phase: 2
title: CSV import — report
status: not_started
depends_on: [P2-T24]
estimate_hours: 2
owner: ai
last_updated: 2026-05-17
---

# Goal

After this task, `/admin/imports/:id` (post-execute) shows a full report: counts (created, updated, skipped, errored), the full list of error rows with their messages, links to each created/updated product, and a "Download errors as CSV" button so the owner can fix-and-re-upload the failed rows. Read-only consumer of `import_runs` + `import_run_rows`; no mutations.

# Prerequisites (read first)

- [P2-T23](P2-T23-csv-import-upload-and-validate.md) — `import_run_rows` shape; `action` enum
- [P2-T24](P2-T24-csv-import-execute-jobified.md) — execution lifecycle + `applied_at` field
- [claude/architecture/database-schema.md](../../architecture/database-schema.md) §"import_runs, import_run_rows"

# Files to touch

- `web/src/app/admin/imports/[id]/page.tsx` (modified — extends P2-T23 preview) — view branches on `import_runs.status`: queued/running → live progress; succeeded/failed → full report
- `web/src/app/admin/imports/[id]/_report/summary.tsx` (new) — count cards (created / updated / skipped / errored)
- `web/src/app/admin/imports/[id]/_report/errors-table.tsx` (new) — paginated table of error rows with `row_number`, `sku`, `error_message`, `raw_json` preview
- `web/src/app/admin/imports/[id]/_report/applied-table.tsx` (new) — paginated table of created + updated rows with links to `/admin/products/:id/edit`
- `web/src/app/admin/imports/[id]/_report/download-errors.tsx` (new) — client component; "Download errors as CSV" button hits a route that streams the CSV
- `web/src/app/api/admin/imports/[id]/errors.csv/route.ts` (new) — GET handler; streams CSV of error rows
- `web/src/lib/db/admin/imports.ts` (modified — extends P2-T23) — `getImportReport(supabase, id)` joins import_runs to summary counts + `streamErrorRows(supabase, id)` async-iterates error rows for the CSV download

# Implementation notes

**View shape:**

```
┌──────────────────────────────────────────────────┐
│ products-may-2026.csv · run #42                  │
│ Started 2026-05-17 14:00 · Finished 14:08        │
│ Status: succeeded                                 │
├──────────────────────────────────────────────────┤
│ Created  60    Updated  20    Skipped  15    Errors  5  │
├──────────────────────────────────────────────────┤
│ Errors (5)                  [Download as CSV]   │
│ Row 12 │ SKU-9 │ unknown_category: 'misc'        │
│ Row 17 │ SKU-...                                  │
│ ...                                              │
├──────────────────────────────────────────────────┤
│ Applied rows (80)                                │
│ Row  1 │ SKU-1 │ created │ → /admin/products/... │
│ Row  2 │ SKU-2 │ updated │ → /admin/products/... │
│ ...                                              │
└──────────────────────────────────────────────────┘
```

**Live progress for in-flight jobs.** When `status='running'`, the page polls `background_jobs` every 2s (or subscribes via Supabase Realtime if it's wired up; otherwise polling) and renders `progress / total` + the most recent `job_events`. When status flips to `succeeded`/`failed`, the polling switches to the static report.

**Failed jobs.** Show the `background_jobs.error` field at the top + a "Retry from checkpoint" button (P2-T27 link). The applied-rows table still shows what got through before the failure.

**Errors CSV download.** Stream-formatted CSV with columns: `row_number,sku,error_message,raw_json`. The raw_json column is stringified so the owner can fix-and-re-upload (rename column, etc.). Use a `Transform` stream or just emit chunks in the route handler.

**Pagination.** Error rows and applied rows each paginate at 100 per page. Cursor-based by `row_number` (already a sequential int).

**Links to created/updated products.** The `import_run_rows` table doesn't store the resulting product id. **Add a `applied_product_id uuid REFERENCES products(id)` column in a new migration**, OR look up by SKU at report-render time (slower; acceptable for an admin-only page). Prefer the column for the clean path — small migration, validate via pglite. **Verify whether 0004 already includes this column before adding.**

**Real-time considerations.** Polling at 2s is wasteful but simple. If Supabase Realtime is set up later, switch to channel subscriptions on `background_jobs.id = $1`. Deferred.

**Audit log.** None — this is a read-only view.

# Acceptance criteria

- [ ] Report view renders for completed imports (succeeded + failed).
- [ ] Count cards show all four counts; numbers match a manual SELECT.
- [ ] Errors table lists every `action='error'` row with `error_message` and `raw_json` preview.
- [ ] Applied table lists every `applied_at IS NOT NULL` row with link to the product editor.
- [ ] Download CSV produces a valid CSV with the error rows; reuploading after fixing flows through P2-T23 cleanly.
- [ ] Live-progress view renders for `status='running'` jobs; polls every 2s; updates progress.
- [ ] Failed jobs show error + retry link.
- [ ] If a migration was added for `applied_product_id`: `pnpm validate:migrations` green; smoke block asserts the column.
- [ ] `pnpm tsc --noEmit`, `pnpm lint`, `pnpm build` green.

# Verification

```bash
cd web
pnpm validate:migrations    # if migration added
pnpm dev &
sleep 4
# /admin/imports → click into a completed run → verify the report renders correctly
# Click "Download errors as CSV" → file downloads; opens cleanly in Excel/Sheets
# Trigger a fresh import → watch the live progress
```

# Dependencies added

None.

# Notes for next agent

(empty)
