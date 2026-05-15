# Runbook: Run long jobs as GitHub Actions

**When to use:** When a background job's contiguous runtime exceeds ~5 minutes and you cannot reliably chunk it through Edge Functions (e.g. a full image-rehost of 20k images, or a one-off data migration).

## Pattern

A GitHub Actions workflow checks out the repo, exports the necessary env vars (from Actions secrets), runs a small TypeScript entrypoint that talks to the same Supabase instance.

## Setup (one-time per job kind)

1. **Register secrets** in GitHub repo settings → Secrets and variables → Actions:
   - `SUPABASE_DB_URL` (the direct Postgres connection string for migrations)
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (for app-level operations)
   - Any per-job specific keys (e.g. external CDN tokens).

2. **Create the workflow file** at `.github/workflows/<job-name>.yml`:
   ```yaml
   name: <job-name>
   on:
     workflow_dispatch:
       inputs:
         filter:
           description: 'Filter expression'
           required: false
           default: 'review_status=ready_to_publish'
   jobs:
     run:
       runs-on: ubuntu-latest
       timeout-minutes: 360
       steps:
         - uses: actions/checkout@v4
         - uses: pnpm/action-setup@v3
         - uses: actions/setup-node@v4
           with: { node-version: 20, cache: 'pnpm', cache-dependency-path: 'web/pnpm-lock.yaml' }
         - run: pnpm install --frozen-lockfile
           working-directory: web
         - run: pnpm tsx ../scripts/<job-entrypoint>.ts --filter "${{ inputs.filter }}"
           working-directory: web
           env:
             SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
             SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
   ```

3. **Trigger** from CLI:
   ```bash
   gh workflow run <job-name>.yml -f filter="review_status=ready_to_publish"
   gh run watch  # tail logs
   ```

## Idempotency requirement

GitHub Actions has a 6-hour ceiling on hosted runners. Jobs that may exceed that must:
- Be **idempotent**: re-running picks up where the last attempt left off.
- Write progress to `background_jobs.checkpoint` after each batch.
- On crash mid-job, the next run reads `checkpoint` and resumes.

## When NOT to use GitHub Actions

- Real-time admin operations (use server actions / Edge Functions instead).
- Jobs that need < 10 seconds (Vercel Hobby serverless is fine).
- Jobs that admin must Cancel mid-run (Edge Function with client polling cancel is better; GitHub Actions cancel works but is more clunky).

## Existing workflows

- `.github/workflows/pg-dump-backup.yml` — nightly backup (P5-T07)
- `.github/workflows/rehost-images.yml` — full image migration (P4-T11)
- `.github/workflows/broken-image-audit.yml` — nightly HEAD-check (P5-T06)
