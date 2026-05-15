# Runbook: Restore Postgres from a `pg_dump` backup

**When to run:** After a destructive incident (accidental drop, mass corruption, failed migration). Hopefully never.

**Backup location:** GitHub Actions artifact retention (90 days). For longer retention, sync to S3/R2.

## Preconditions

- A recent `bhavani-crafts-pg-dump-YYYY-MM-DD.sql.gz` artifact exists.
- You have a Supabase service-role key for the target project.
- `psql` and `gunzip` installed locally.

## Steps

### 1. Pause writes

In Vercel, switch the production deployment to a maintenance page (or take the admin offline by toggling an env var like `MAINTENANCE_MODE=true` that middleware checks).

### 2. Download the backup

```bash
gh run download <run-id> -n bhavani-crafts-pg-dump-<date>
gunzip bhavani-crafts-pg-dump-<date>.sql.gz
```

### 3. Restore to a fresh database

**Option A — restore to a new Supabase project, then swap:**
1. Create a new Supabase project.
2. `psql "$NEW_DB_URL" < bhavani-crafts-pg-dump-<date>.sql`
3. Verify counts: `SELECT count(*) FROM products; SELECT count(*) FROM categories;`
4. Update Vercel env vars to point at the new project.
5. Trigger a redeploy.

**Option B — restore in place (if the issue is data corruption, not full DB loss):**
1. Drop the affected schema/tables with extreme caution.
2. `psql "$DB_URL" < bhavani-crafts-pg-dump-<date>.sql`
3. Verify and re-enable traffic.

### 4. Resume writes

Toggle off the maintenance flag. Confirm `/admin` and storefront work.

### 5. Postmortem

- Write a short note in `claude/.local/incident-<date>.md` (not committed) capturing what happened and what changed.
- If process needs to change, write an ADR.

## Backup verification (quarterly)

We don't trust a backup we haven't restored. Quarterly:
1. Download the most recent backup.
2. Spin up a throwaway Postgres locally (Docker).
3. Restore. Verify counts.
4. Tear down.

If the restore fails, fix the backup process immediately.
