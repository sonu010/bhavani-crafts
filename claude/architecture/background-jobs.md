# Background jobs

Every operation that may exceed 30 s is modeled as a chunked, resumable job. Vercel functions time out (10s hobby / 60s pro / 300s enterprise). Supabase Edge Functions cap around 150s. Long jobs (> 5 min contiguous compute) run as GitHub Actions, not Edge Functions.

## State machine

```
queued → running → succeeded
           │     ↘ failed       (after MAX_ATTEMPTS retries)
           ↓
       cancelled  (admin clicked Cancel between chunks)
```

Stored in `background_jobs(status, progress, total, checkpoint)`. Every chunk writes a `job_events` row.

## Chunked-resumable pattern

```ts
// pseudocode for a chunk runner
export async function runChunk(jobId: string) {
  const job = await fetchJob(jobId);
  if (job.status === 'cancelled') return;

  const cursor = job.checkpoint ?? initialCursor(job);
  const chunk = await loadChunk(job.payload_json, cursor, CHUNK_SIZE);

  for (const item of chunk) {
    try {
      await processOne(item);                  // idempotent: upsert keyed on natural id
    } catch (err) {
      await logEvent(jobId, 'error', err.message, { item });
      // do not throw — continue with next item; final report aggregates errors
    }
  }

  const nextCursor = advance(cursor, chunk.length);
  const done = chunk.length < CHUNK_SIZE;

  await updateJob(jobId, {
    progress: job.progress + chunk.length,
    checkpoint: done ? null : nextCursor,
    status: done ? 'succeeded' : 'running',
    finished_at: done ? new Date() : null,
  });

  if (!done) {
    // schedule next chunk
    scheduleNext(jobId);                       // see "Scheduling next chunks" below
  }
}
```

**Idempotency is non-negotiable.** Every `processOne` upserts on a natural key (SKU, image id, etc.), never blindly inserts. If a chunk re-runs because of a crash, the result is the same.

## Scheduling next chunks

Three options, picked per job kind:

| Option | When to use | How |
|---|---|---|
| **Client polling** | Admin is staring at the progress bar (CSV import, bulk publish) | Admin page polls `GET /api/jobs/[id]` every 2s; if `status='running'` and last update > 5s ago, calls `POST /api/jobs/[id]/tick` |
| **Supabase Webhook** (pg_net) | Job kicks off without an open admin tab (nightly cron) | DB trigger on `background_jobs.updated_at` → webhook → Edge Function → next chunk |
| **GitHub Actions** | Job runs > 5 min total OR needs unusual resources | The action checks out the repo, runs `pnpm tsx scripts/run-job.ts $JOB_ID`, exits |

## Chunk sizes (defaults — tune in tasks)

| Job kind | Chunk size | Runner | Notes |
|---|---|---|---|
| `bulk_publish` | 200 rows | Edge Function (client polled) | Transactional UPDATE … WHERE id IN (chunk). Precondition: `review_status='ready_to_publish'`. |
| `csv_import` | 100 rows | Edge Function | Parse + Zod-validate the full file once into `import_run_rows`, then process IDs in chunks. |
| `image_rehost` | 20 images | Edge Function (or GH Actions for full migration) | HEAD source → GET → sharp → upload → UPDATE. Skip rows with `storage_path IS NOT NULL`. |
| `broken_image_audit` | 500 images | pg_cron → Edge Function | HEAD-checks public URLs; failures append to `audit_logs`. Nightly. |
| `ai_batch_suggest` | 20 products per Anthropic call, 5 calls per chunk | In-process server action | Token budget enforced per call. |
| `pg_dump_backup` | full DB | GitHub Actions | External — not a Supabase function. |

## Failure handling

- Each item retries up to 3 times within the same chunk with exponential backoff (250ms, 1s, 4s).
- After 3 failures, the item is recorded in `job_events` at level `error` and skipped — the job continues with the rest.
- If > 50% of items in a chunk fail, the chunk aborts and `background_jobs.status = 'failed'`. Admin sees the report.
- Cancel button writes `status='cancelled'`. The next chunk sees it and exits cleanly without processing more items.

## Admin UX

`/admin/jobs` lists all `background_jobs` rows for the current week, newest first. Click a row → detail page:

- Progress bar (`progress / total`)
- Status badge
- Last 50 `job_events` (auto-scrolling)
- "Cancel" button (when `status IN ('queued','running')`)
- "Retry" button (when `status='failed'` — creates a new job with the same payload but skips already-succeeded items)
- "Download error report" button (CSV of all items at level `error`)

## Files

- `web/src/lib/jobs/runner.ts` — generic chunk runner
- `web/src/lib/jobs/kinds/*.ts` — one file per job kind, exporting `processChunk()` and `loadChunk()`
- `web/src/app/api/jobs/[id]/route.ts` — status + tick
- `web/src/app/admin/jobs/page.tsx` — list view
- `web/src/app/admin/jobs/[id]/page.tsx` — detail view
- `supabase/functions/jobs-tick/index.ts` — Edge Function entry point
- `scripts/run-job.ts` — GitHub Actions entry point
