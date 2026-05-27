---
id: P2-T23
phase: 2
title: CSV import — upload + validate
status: done
depends_on: [P2-T11]
estimate_hours: 4
owner: ai
last_updated: 2026-05-18
---

# Goal

After this task, `/admin/imports/new` accepts a CSV file via upload, parses it streaming, validates every row against the product schema, and creates an `import_runs` row + one `import_run_rows` row per source row tagged with `action` (`create` / `update` / `skip` / `error`) and `error_message`. The preview view at `/admin/imports/:id` lists the rows with their classification, sample sample of error messages, and a "Run import" button (the run itself lands in P2-T24). No mutations to catalog tables happen in this task — purely staging + diagnostics.

# Prerequisites (read first)

- [claude/architecture/database-schema.md](../../architecture/database-schema.md) §"import_runs, import_run_rows" — table shapes + `import_action` enum
- [`web/supabase/migrations/0004_ops_tables.sql`](../../../web/supabase/migrations/0004_ops_tables.sql) — table definitions
- [claude/runbooks/seed-from-justkraft.md](../../runbooks/seed-from-justkraft.md) — analogous pipeline (clean → seed). The CSV importer parallels the "seed" half but with admin-driven input.
- [P2-T11](P2-T11-product-editor-basic-fields.md) — `ProductEditInput` Zod schema; reuse for row validation
- [claude/architecture/security.md](../../architecture/security.md) §"File-upload validation" — same upload security applies (size cap, MIME sniff). CSV: max 20 MB, MIME `text/csv` or `application/vnd.ms-excel`

# Files to touch

- `web/src/app/admin/imports/page.tsx` (new) — list of `import_runs` (history); link to "Start new import"
- `web/src/app/admin/imports/new/page.tsx` (new) — file picker + "Upload + validate" button
- `web/src/app/admin/imports/[id]/page.tsx` (new) — preview view: row counts by action + per-row table (paginated)
- `web/src/app/api/admin/imports/upload/route.ts` (new) — POST handler. Validates file, parses streaming, writes `import_runs` + `import_run_rows`.
- `web/src/lib/imports/csv-parser.ts` (new) — streaming parser using `papaparse` (or `csv-parse/sync` for batch — start with `papaparse.parse(stream, { worker: false, step: ... })` since we're server-side)
- `web/src/lib/imports/row-validator.ts` (new) — classifies each row: validates fields, looks up SKU/slug to determine create vs update vs skip, returns `{ action, error_message?, normalized_row }`
- `web/src/lib/db/admin/imports.ts` (new) — `createImportRun(supabase, opts)`, `insertImportRunRow(supabase, runId, row)`, `getImportRunWithRows(supabase, runId)`
- `web/src/lib/schemas/import-csv.ts` (new) — Zod schema for the CSV row shape (column → field mapping)
- `web/__tests__/api/admin/imports-upload.test.ts` (new)

# Implementation notes

**Two-phase import pattern (mirrors `seed-from-justkraft.md`).** Phase 1 (this task): upload + validate, no mutations. Phase 2 (P2-T24): execute the staged rows. Phase 3 (P2-T25): post-run report.

**CSV column → product field mapping.** Standard set:

| CSV column | Product field | Required |
|---|---|---|
| `sku` | `sku` | YES — used as the upsert key |
| `slug` | `slug` | NO — auto-derived if absent |
| `name` | `name` | YES |
| `short_description` | `short_description` | NO |
| `description` | `description` (markdown) | NO |
| `base_price_inr` | `base_price_inr` | YES |
| `compare_at_price_inr` | `compare_at_price_inr` | NO |
| `stock_status` | `stock_status` | NO (default `unknown`) |
| `stock_quantity` | `stock_quantity` | NO |
| `category_slug` | `category_id` (resolved) | NO |
| `tags` | `product_tags` (resolved) | NO; comma-separated |
| `image_urls` | `product_images` (deferred to P2-T24) | NO; comma-separated |

Unknown columns ignored with a warning logged in `job_events` (P2-T27 viewer).

**Row classification (`action` enum value):**

- `error` — Zod validation fails on a required field, or a referenced category_slug / tag doesn't exist (and won't be auto-created by this importer)
- `skip` — row matches an existing product by SKU AND every field in the CSV matches the DB row (no-op)
- `update` — row matches an existing SKU but at least one field differs
- `create` — no SKU match

**Idempotency via SKU.** SKU is the upsert key. The cleaner runbook's "DELETE FROM products WHERE source='justkraft_seed'" cleanup pass is the analog; for admin imports, we never delete — we only update or create.

**Streaming.** For a 5,000-row CSV at ~200 bytes/row = 1 MB, streaming isn't strictly necessary, but it's good hygiene (allows ≤ 20 MB files without buffering all rows in memory). Use `papaparse` with the `step` callback to process rows as they arrive.

**Validation strategy.** Per row:
1. Schema validation (Zod) — types, required, ranges
2. Reference resolution: lookup `category_slug` → category_id; lookup tag slugs → tag ids. Cache lookups across rows (batch fetch at start).
3. Existence check by SKU → sets `action`
4. Insert `import_run_rows` with `raw_json` (original row) + `error_message` (if any) + resolved foreign-key ids in a separate side-channel for the executor to consume

**No mutations.** The validate phase writes only to `import_runs` and `import_run_rows`. Catalog tables are untouched.

**Upload security.** Same constraints as image upload (P2-T15) with adjusted limits:
- Max 20 MB CSV
- MIME sniff: must be `text/csv` or `text/plain`; reject Excel binaries (we want CSV, not xls)
- Encoding: assume UTF-8 with BOM tolerated; explicit error on Latin-1 or CP1252 with helpful message

**`import_runs` row shape on creation:**
```ts
{
  filename: "products-may-2026.csv",
  status: "queued",  // becomes 'succeeded' after validate phase; row-level actions still pending
  total_rows: 0,
  success_count: 0,
  error_count: 0,
  created_by: userId,
}
```
Then after parsing finishes, update counts.

**Audit log.** One `import.upload` row per upload (entity_id = import_run_id).

# Acceptance criteria

- [ ] `/admin/imports/new` accepts a CSV. Bad MIME or > 20 MB rejected with clear messages.
- [ ] Successful upload creates an `import_runs` row + N `import_run_rows`.
- [ ] Row classification correct: 4 categories (create / update / skip / error) populate as expected on a hand-crafted test CSV with one of each.
- [ ] Reference resolution: an unknown category_slug surfaces as `action='error', error_message='unknown_category: <slug>'`.
- [ ] The preview view at `/admin/imports/:id` shows row counts by action + a paginated table.
- [ ] No catalog rows mutated by the validate phase (verify via SELECT before/after).
- [ ] `pnpm tsc --noEmit`, `pnpm lint`, `pnpm build`, `pnpm exec vitest run __tests__/api/admin/imports-upload.test.ts` green.

# Verification

```bash
cd web
pnpm exec vitest run __tests__/api/admin/imports-upload.test.ts
pnpm dev &
sleep 4
# /admin/imports/new → upload a CSV with 100 rows (mix of new/existing/bad)
# Preview shows: 60 create, 20 update, 15 skip, 5 error
# Click into an error row → see specific error_message
# Verify no products table changes:
psql "$DB_URL" -c "SELECT count(*) FROM products;"  # same before + after
```

# Dependencies added

- `papaparse` + `@types/papaparse` — CSV parsing

# Notes for next agent

(empty)

  - **Two-phase model preserved.** Validate-only via the upload
    route; the catalog stays untouched until "Run import" fires.
    Confirmed via the integration test (apply happens through the
    explicit action layer).

  - **CSV row schema** lives in
    `web/src/lib/schemas/import-csv.ts`. Required columns:
    `sku`, `name`, `base_price_inr`. Optional: slug (auto-derived),
    short_description, description, compare_at_price_inr,
    stock_status (defaults `unknown`), stock_quantity,
    category_slug, tags (comma-separated).

  - **Pre-fetched refs** — one round-trip each for categories +
    tags + existing products (by SKU). Avoids the N-query trap on
    a 5K-row CSV. `fetchValidatorRefs()` returns three Maps the
    classifier hits in O(1).

  - **15-test coverage.** 4 parser tests (BOM strip, header
    normalisation, blank-row drop, empty CSV); 11 classifier tests
    (validation failures, unknown refs, create/update/skip
    detection, slug auto-derivation, _normalized + _tag_ids
    pack).

  - **`_normalized` + `_tag_ids` side-channel.** Stored inside
    `raw_json` instead of adding a schema column. The executor
    reads from there directly — no re-resolution needed at apply
    time.

  - **Schema check before staging.** Missing required columns
    return a 400 before any row work. Owner sees the headers we
    detected + the list of missing required columns.
