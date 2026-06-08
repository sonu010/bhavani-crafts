---
id: P5-T08
phase: 5
title: RLS attack test (deploy gate)
status: not_started
depends_on: [P1-T06, P3-T29]
estimate_hours: 1
owner: ai
last_updated: 2026-06-07
---

# Goal

A single launch-blocker probe script that runs against the LIVE
Supabase project (anon JWT, never service-role) and asserts every
table has the expected anon posture. Runs as a CI gate before
go-live and exits non-zero on any RLS surprise.

The vitest `__tests__/db/*-rls.test.ts` suite already pins the anon
contract per-table:

- `orders-rls.test.ts` — anon INSERT pending only, anon SELECT denied
- `app-settings-rls.test.ts` — anon SELECT only public-allowlisted
- `search-cards-and-logs.test.ts` — anon insert log only, anon SELECT
  denied
- `orders-soft-delete.test.ts` — deleted_at filter applies for anon

This task adds a single executable script that runs the equivalent
probes against LIVE (not the local stack) right before go-live + as
a smoke-test in CI on any RLS migration.

# Prerequisites (read first)

- `web/__tests__/db/*-rls.test.ts` — current anon-posture pins (per
  table)
- `claude/architecture/security.md` §"RLS Policies" — the EXISTS
  pattern + the public-allowlist pattern
- `web/scripts/launch-blockers.ts` (if it exists from Phase 1) — this
  is the file we extend; otherwise create it
- All migrations 0001-0020 — every table needs to be covered

# Files to touch

- `web/scripts/launch-blockers.ts` (new or extended) — the probe
  script. Runs each anon-posture assertion against live, exits 0 on
  pass + non-zero on any fail. Outputs a single-line summary per
  table: `products: anon SELECT ok, anon INSERT denied, anon DELETE
  denied — ✓`
- `package.json` (modified) — `pnpm launch-blockers` script
- `.github/workflows/launch-blockers.yml` (new) — manual-trigger
  workflow + required check on the main branch before tagging a
  release
- `claude/runbooks/launch-day.md` (modified) — "Pre-flight: run RLS
  attack test, confirm 0 failures"

# Implementation notes

- **Anon JWT only.** The script reads `NEXT_PUBLIC_SUPABASE_URL` +
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` from env. Hard-refuse to read
  `SUPABASE_SERVICE_ROLE_KEY` — if it's loaded, the test posture
  isn't real.
- **Per-table assertions:**
  - `products`: anon SELECT works for is_published=true,
    deleted_at IS NULL only. anon INSERT denied. anon UPDATE denied.
  - `product_images`: anon SELECT only for license_status IN (owned,
    licensed, public_domain) on a published product.
  - `product_variants` + the variant graph: anon SELECT only for
    variants of published products.
  - `categories`: anon SELECT for non-deleted only.
  - `orders`: anon INSERT for pending_payment + user_id NULL. anon
    SELECT denied entirely.
  - `order_items`: anon INSERT only via the create_anon_order RPC
    (which is SECURITY DEFINER). Direct anon INSERT denied.
  - `audit_logs` / `search_logs`: anon insert allowed for search_logs
    (with user_id NULL); audit_logs anon insert denied.
  - `app_settings`: anon SELECT only for the public-allowlist set.
  - `profiles`: anon SELECT denied.
  - `import_runs` / `background_jobs` / `job_events`: all anon denied.
- **Output format:** one line per table + a final summary. JSON-line
  alternative for CI parsing if needed.
- **Idempotent + side-effect-free:** the probes use SELECT only
  except for the documented `search_logs` insert path. Any test
  fixture written gets deleted in a finally block.
- **Failure mode:** prints the failing assertion's table + the
  attempted operation + the actual error (or, worse, the
  successful-but-shouldn't-have-been response). Exits 1.

# Acceptance criteria

- [ ] `pnpm launch-blockers` exits 0 against the current live
      project on a green build.
- [ ] Every public table is covered (drift caught by a coverage
      grep of `from(\"<table>\")` in the script vs migrations).
- [ ] Intentionally widening an RLS policy in a test branch and
      running the script reports the failure with a clear message.
- [ ] GitHub Action runs the probe; manual trigger works.
- [ ] launch-day.md cites this as a pre-flight gate.

# Verification

```bash
# Local — should also pass against the local stack as a smoke
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=… \
  pnpm launch-blockers

# Live — final go/no-go check
SUPABASE_URL=https://<ref>.supabase.co SUPABASE_ANON_KEY=… \
  pnpm launch-blockers
```

# Notes for next agent

(empty)
