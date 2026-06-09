# Runbook: Back up and roll back the live catalog

**Why:** accidents happen — a bad bulk edit, a wrong CSV import, a fat-fingered
delete. We keep two independent backup paths so we can always roll back.

| Path | Tool | Fidelity | When |
|---|---|---|---|
| **JSON snapshot** | `pnpm backup:live` | Catalog tables, row-level | Before ANY risky op; nightly in CI |
| **Full SQL dump** | `supabase db dump` | Whole database (schema + data + roles) | Before migrations / disaster recovery |

Supabase's own platform backups (daily on Pro / PITR) are a third layer, out of
our control. Treat the two below as the ones WE own and test.

---

## 1. JSON snapshot — the fast pre-op net

Run this **before** any bulk mutation, import, reseed, or migration:

```bash
cd web
pnpm backup:live
# → web/backups/<YYYYMMDD-HHMMSS>/<table>.json + manifest.json
```

- Uses only the service-role key in `web/.env.local`. No DB password, no pg
  tooling. Reads are paginated, so the 5.8K-row `products` table is captured in
  full (PostgREST caps responses at 1000 rows).
- Output is gitignored (`web/backups/`). For off-machine durability, copy the
  folder to cloud storage, or rely on the nightly CI artifact (below).
- Covers: categories, attribute_definitions, tags, products, product_images,
  product_options, product_option_values, product_variants, product_attributes,
  product_tags, search_synonyms.

### Roll back from a JSON snapshot

```bash
cd web
# 1. DRY RUN first — prints exactly what would change, writes nothing:
pnpm restore:live backups/20260528-181019

# 2. Execute — you must type the live host as confirmation:
pnpm restore:live backups/20260528-181019 --confirm=lyycugadkxjtevmugqol.supabase.co
```

- Upserts every backed-up row (parents → children) keyed on primary key,
  restoring rows that were **changed or deleted after** the snapshot back to
  their snapshot state. This covers the common accident (bad bulk edit, mass
  soft-delete, wrong import overwrite).
- It does **not** delete rows created *after* the snapshot — an upsert can't
  know about them. If you need those gone, delete them explicitly or use the
  full SQL restore below.
- Always dry-run first and eyeball the row counts against the manifest.

---

## 2. Full SQL dump — disaster recovery / pre-migration

For a complete, restorable artifact (schema + data), use the Supabase CLI:

```bash
cd web
# Full dump (schema + data) of the linked live project:
supabase db dump --linked -f backups/full-$(date +%Y%m%d).sql            # schema
supabase db dump --linked --data-only -f backups/data-$(date +%Y%m%d).sql # data
gzip backups/*.sql
```

(`--linked` uses the project you linked with `supabase link`; it will prompt
for the DB password the first time. Alternatively pass `--db-url "<conn>"`.)

Restore procedure for the SQL path lives in
[`restore-from-backup.md`](restore-from-backup.md) (pause writes → restore to a
fresh project or in place → verify counts → resume).

---

## 3. Nightly automated backup (CI)

`.github/workflows/backup.yml` runs `pnpm backup:live` on a daily schedule and
uploads the JSON snapshot as a workflow artifact (90-day retention). It reuses
the same three Supabase secrets as the `live` CI job. Trigger it on demand from
the Actions tab ("Run workflow") before a big change if you don't want to run
locally.

Download the latest artifact with:

```bash
gh run list --workflow=backup.yml --limit 5
gh run download <run-id> -n catalog-backup-<date>
```

---

## Verification (do this quarterly — we don't trust an untested backup)

1. `pnpm backup:live` against live.
2. `pnpm test:setup` to get a clean local stack.
3. Point `restore:live`'s dry-run at the snapshot (sanity-check counts), or load
   a few `<table>.json` files and confirm they hold real rows.
4. For the SQL path: restore the dump into a throwaway local Postgres and verify
   `select count(*) from products;` matches the manifest.

If any step fails, fix the backup process immediately — a backup you can't
restore is not a backup.

### Last verified — 2026-06-09 (P5-T07)

- `pnpm backup:live` ran cleanly against the live project. Snapshot:
  37,390 rows across 11 catalog tables (categories 365 · attribute_definitions
  7 · tags 458 · products 5,811 · product_images 14,969 · product_variants
  7,802 · product_tags 7,971 · search_synonyms 7; product_options + values +
  attributes empty — expected, those are only populated for variant-bearing
  products which the seed doesn't include).
- `pnpm restore:live backups/<ts>` dry-run reported the same counts the
  manifest holds; on-conflict keys resolved correctly (id for single-PK
  tables, `product_id,tag_id` for `product_tags`, `product_id,attribute_id`
  for `product_attributes`).
- No write was performed. Restore-execution is gated on
  `--confirm=<live-host>` and refuses local stacks.

### Retention policy (locked in P5-T07)

- **CI workflow artifact** — 30-day rolling. `.github/workflows/backup.yml`
  now sets `retention-days: 30`.
- **Quarterly cold copy** — download one snapshot from CI per quarter and
  commit it to the private archive bucket (or `gh release upload` to a
  `backups-<year-quarter>` private release). 1-year retention.
- **Pre-migration snapshots** — taken manually before any risky write op
  (bulk import, mass edit, ADR-deciding migration). Kept on the operator's
  local disk until the change is verified, then deleted.
- **Restore drill** — quarterly. Latest: 2026-06-09. Next due: 2026-09-09.

### Launch-readiness gap (P5-T07 finding)

**Scheduled GitHub Actions only fire from the repository's default branch.**
At the moment, `main` is the old prototype tree with no `.github/`
directory. `rebuild-v2` carries every workflow (`backup.yml`,
`rls-attack.yml`, `ci.yml`) but the schedules never trigger. **No
automated backup has run.**

Mitigations until cutover:
- Operator runs `pnpm backup:live` manually before any risky change.
- The fresh snapshot at `web/backups/20260609-022330/` is the launch
  baseline.

Cutover plan (executes as part of P5-T10 go-live):
1. Merge `rebuild-v2` → `main` (or flip the default branch to
   `rebuild-v2`).
2. Within 24 hours: confirm the next scheduled `backup.yml` run
   completes successfully (Actions tab → Backup live catalog →
   green check).
3. Within 7 days: confirm one nightly fired without manual touch.
