# Runbook: Add a new database migration

**When to run:** Every schema change after `0001_init.sql` lands.

## Preconditions

- Supabase CLI installed and logged in (`supabase login`).
- Local project linked (`supabase link --project-ref <ref>`).
- A clean working tree (commit or stash pending changes first).

## Steps

1. **Create the migration file:**
   ```bash
   cd web
   supabase migration new <short_snake_case_description>
   # creates web/supabase/migrations/<YYYYMMDDHHMMSS>_<description>.sql
   ```

2. **Write the migration.** First line must be a rollback note:
   ```sql
   -- rollback: DROP COLUMN products.foo;

   ALTER TABLE products ADD COLUMN foo text;
   ```

   For new tables: include columns, constraints, indexes, RLS enable + policies, all in this file.

3. **Apply locally** (against the local Supabase dev DB or a feature-branch Supabase project):
   ```bash
   supabase db push --linked
   ```

4. **Regenerate types:**
   ```bash
   supabase gen types typescript --linked > src/lib/db/types.gen.ts
   ```

5. **Update `claude/architecture/database-schema.md`** to reflect the new shape.

6. **Add a test** (Vitest or SQL assertion) verifying the migration's intent. E.g., for a new column with NOT NULL DEFAULT: assert that existing rows have the default.

7. **Commit** both the migration file, the regenerated types, and the doc + test:
   ```bash
   git add web/supabase/migrations/ web/src/lib/db/types.gen.ts claude/architecture/database-schema.md web/__tests__/migration-<id>.test.ts
   git commit -m "<phase-task-id>: <one-liner>"
   ```

8. **Push** → CI runs the migration against a clean Supabase instance and the test suite.

## Production deploy

- Vercel auto-deploys the Next.js side from the PR merge.
- The migration must be applied to production Supabase **before** the deploy goes live.
- Workflow:
  1. Merge the PR to `main`.
  2. Apply the migration to production: `supabase db push --linked --project-ref <prod-ref>`.
  3. Vercel deploy is already in progress; it will succeed because the schema matches.

If the migration is risky (drops a column, changes a constraint), schedule a maintenance window first (see [restore-from-backup.md](restore-from-backup.md) for the maintenance pattern).

## Never

- Never edit a migration file after it has been applied to production. Always add a new migration.
- Never edit `0001_init.sql` retroactively (or any merged migration).
- Never bypass `supabase db push` and run SQL manually against prod, except via a runbook with explicit approval.
