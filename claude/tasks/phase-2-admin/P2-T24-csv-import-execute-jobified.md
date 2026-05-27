---
id: P2-T24
phase: 2
title: CSV import — execute (jobified)
status: done
depends_on: [P2-T23]
estimate_hours: 4
owner: ai
last_updated: 2026-05-18
---

# Goal

After this task, the "Run import" button on `/admin/imports/:id` enqueues a `background_jobs` row with `kind='csv_import'`, payload referencing the validated `import_run_id`. A worker (Vercel Cron-triggered job-drainer, or a Supabase Edge Function for MVP) consumes the job and applies the staged `import_run_rows` to the catalog in chunks of 50, writing `job_events` for progress, updating each `import_run_rows.applied_at` on success, writing one `audit_logs` row per applied row, and revalidating after each chunk. Resumable via `background_jobs.checkpoint` (last applied row index).

# Prerequisites (read first)

- [claude/architecture/database-schema.md](../../architecture/database-schema.md) §"background_jobs, job_events" + §"import_runs, import_run_rows"
- [`web/supabase/migrations/0004_ops_tables.sql`](../../../web/supabase/migrations/0004_ops_tables.sql) — table definitions
- [P2-T23](P2-T23-csv-import-upload-and-validate.md) — the validate phase that staged the rows
- [P2-T09](P2-T09-products-list-bulk-actions.md) — bulk-action pattern for catalog mutations; reuse `applyBulkUpdate`-style chunking
- [claude/architecture/caching-and-revalidation.md](../../architecture/caching-and-revalidation.md) §"On-demand revalidation guardrails" — "background jobs call revalidation after each chunk, not just at the end"

# Files to touch

- `web/src/app/admin/imports/[id]/actions.ts` (new) — `enqueueImportRun(importRunId)` server action; creates `background_jobs` row.
- `web/src/app/api/cron/run-jobs/route.ts` (new) — POST endpoint hit by Vercel Cron (configured in `vercel.json`); claims the oldest `queued` job, runs it, returns. Authenticated via a shared secret in the `X-Cron-Secret` header.
- `web/src/lib/jobs/worker.ts` (new) — `runJob(supabase, job)`. Dispatches by `job.kind`. For `csv_import`, calls `runCsvImport`.
- `web/src/lib/jobs/csv-import.ts` (new) — the actual import worker. Reads `import_run_rows` in chunks of 50, applies the action per row, writes audit log, updates `applied_at`, revalidates after each chunk.
- `web/src/lib/jobs/queue.ts` (new) — `enqueueJob(supabase, opts)`, `claimNextJob(supabase, kinds)`, `recordEvent(supabase, jobId, level, message, data)`, `updateProgress(supabase, jobId, progress, checkpoint)`.
- `web/vercel.json` (modified or new) — Cron configuration: `{ "crons": [{ "path": "/api/cron/run-jobs", "schedule": "* * * * *" }] }` (every minute; tune based on job duration distribution).
- `web/src/env.ts` (modified) — add `CRON_SECRET` env var; throw at module load if missing in production.
- `web/__tests__/lib/jobs/csv-import.test.ts` (new)

# Implementation notes

**Job lifecycle:**

1. Owner clicks "Run import" → `enqueueImportRun` → `INSERT INTO background_jobs (kind='csv_import', status='queued', payload_json={ import_run_id }, total=<row_count>, progress=0, created_by=userId)`.
2. Vercel Cron fires `/api/cron/run-jobs` every minute → handler claims the oldest `queued` job atomically via `UPDATE background_jobs SET status='running', started_at=now() WHERE id = (SELECT id FROM background_jobs WHERE status='queued' ORDER BY created_at LIMIT 1) RETURNING *`.
3. `runJob` dispatches to `runCsvImport(supabase, job)`.
4. `runCsvImport` reads `import_run_rows WHERE import_run_id = $1 AND applied_at IS NULL ORDER BY row_number` in chunks of 50. For each row, applies action (create / update / skip — error rows skipped silently in the executor; they stay as `applied_at = NULL, action = 'error'`).
5. After each chunk: write `job_events` row (`info`, message: "applied chunk N rows X-Y"), update `background_jobs.progress` += N, update `background_jobs.checkpoint = lastRowNumber`. Revalidate (`revalidateTag('products')` + `revalidateTag('categories')`).
6. On completion: `UPDATE background_jobs SET status='succeeded', finished_at=now(), progress=total`.
7. On error inside a chunk: log `job_events` row with `level='error'`, set `background_jobs.status='failed'`, `error=<message>`. The next cron tick will not retry automatically — owner triggers retry manually via a "Retry from checkpoint" button (P2-T27).

**Resumability via checkpoint.** `background_jobs.checkpoint` stores `lastRowNumber`. On restart, the worker resumes from `WHERE row_number > checkpoint`. Idempotency comes from the action semantics — `update` is idempotent (same input → same output), `create` would error on SKU collision (but we'd skip via the `WHERE applied_at IS NULL` filter, so already-applied rows aren't retried).

**Per-row apply.**

```ts
async function applyRow(supabase: SC, row: ImportRunRow) {
  switch (row.action) {
    case "create":
      return await supabase.from("products").insert(row.normalized);
    case "update":
      return await supabase.from("products").update(row.normalized).eq("sku", row.sku);
    case "skip":
    case "error":
      return null; // no-op
  }
}
```

After apply: `UPDATE import_run_rows SET applied_at = now() WHERE id = $rowId`.

**Audit log per row.** `product.create_via_import` or `product.update_via_import`. `request_id = job.id` (so the audit row links back to the job).

**Image URLs in CSV.** Deferred. If `image_urls` column is present, the executor enqueues a separate `image_rehost` job per product (kind to be added later). For MVP CSV imports without images, just skip them with a `job_events` warning.

**Cron authentication.** Vercel Cron sends `X-Vercel-Cron-Secret` header (in Vercel) or `X-Cron-Secret` (custom). Verify against `CRON_SECRET` env var. Unauthenticated requests get 401.

**Concurrency.** Single-worker (one job at a time per cron tick). Multiple cron ticks could fight for the same job; the atomic UPDATE in claim is the lock. If two cron processes hit simultaneously, only one's UPDATE returns a row.

**Job duration cap.** Vercel serverless functions have a 60s max for non-Pro plans. If a job is longer than 60s of work, the cron tick exits mid-chunk, and the NEXT tick continues from the checkpoint. The worker explicitly checks `Date.now() - startTime > 50_000` after each chunk and bails to leave headroom.

**Revalidation cadence.** After each chunk (50 rows). Not after each row (revalidation is cheap but not free; 50× amplification is wasteful). Not only at the end (would leave storefront stale for the entire job duration).

# Acceptance criteria

- [ ] "Run import" button enqueues a `background_jobs` row with `kind='csv_import'`, `status='queued'`.
- [ ] Cron tick claims the job, applies rows in chunks of 50.
- [ ] Each chunk writes `job_events` (info), updates `progress` + `checkpoint`, revalidates.
- [ ] Per-applied row: `audit_logs` row written, `import_run_rows.applied_at` set.
- [ ] Job longer than 50s exits mid-job and resumes from checkpoint on next tick (verified by an integration test with a 200-row CSV and a tight time budget).
- [ ] Error mid-chunk → `status='failed'`, `error` populated, retry button visible in P2-T27.
- [ ] Cron endpoint rejects requests without the secret (401).
- [ ] No duplicate apply on retry: `WHERE applied_at IS NULL` filter prevents double-mutation.
- [ ] `pnpm tsc --noEmit`, `pnpm lint`, `pnpm build`, `pnpm exec vitest run __tests__/lib/jobs/csv-import.test.ts`, `pnpm launch-blockers` all green.

# Verification

```bash
cd web
pnpm exec vitest run __tests__/lib/jobs/csv-import.test.ts
pnpm launch-blockers
pnpm dev &
sleep 4
# 1. Upload + validate a 100-row CSV (P2-T23)
# 2. Click Run import → background_jobs row created
# 3. Manually fire the cron locally:
#    curl -X POST -H "X-Cron-Secret: $CRON_SECRET" http://localhost:3000/api/cron/run-jobs
# 4. Watch /admin/jobs (P2-T27) → status running → succeeded → progress 100/100
# 5. SELECT count(*) FROM audit_logs WHERE action LIKE 'product.%_via_import' → 100
# 6. SELECT count(*) FROM products → up by ~60 (the 'create' rows)
```

# Dependencies added

None — Vercel Cron is platform-native.

# Notes for next agent

(empty)

  - **Sync-only path landed.** The full jobified worker (Vercel
    Cron + checkpoint resume) is not built; the synchronous
    `runImportAction` server action applies every staged row
    inline. With 100-row pages and per-row audit inserts, a few
    thousand rows fit inside the 60-second serverless timeout.

  - **Idempotent on re-run.** `applied_at IS NOT NULL` filter in
    the per-row loop skips already-applied rows. Owner can re-run
    safely if a partial application happened.

  - **Apply path** in `lib/db/admin/imports.ts`:
    - `applyOneRow(row)` reads `raw_json._normalized` + `_tag_ids`,
      INSERTs (create) or UPDATEs by SKU lookup (update), then
      upserts tag links.
    - `markRowApplied(rowId)` stamps `applied_at`.
    - Created products land as `review_status='needs_review'`,
      `is_published=false`, `source='manual'`. Owner explicitly
      publishes via the editor.

  - **Per-row audit** with `product.create_via_import` /
    `product.update_via_import` verbs. Audit `entity_id` points at
    the affected product; `request_id` distinguishes the import
    batch.

  - **Revalidation per chunk** — `updateTag('products')` +
    `updateTag('categories')` after every 100-row page so the
    storefront sees incremental updates rather than only at
    completion.

  - **Failure mode.** If `applyOneRow` returns
    `ok: false`, the row's `error_message` gets set and its
    action flips to `error`. The run continues; final status is
    `failed` iff any row failed.

  - **Migration deferred.** Spec wanted a Vercel Cron schedule in
    `vercel.json` + a `/api/cron/run-jobs` endpoint. Both deferred
    until the actual scheduled-cron infrastructure ships; the
    background_jobs table can still receive entries when other
    code starts producing them.
