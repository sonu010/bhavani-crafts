---
id: P1-T06
phase: 1
title: RLS policies + RLS attack test
status: not_started
depends_on: [P1-T02, P1-T03, P1-T04, P1-T05]
estimate_hours: 2
owner: ai
last_updated: 2026-05-15
---

# Goal

After this task, every table has RLS enabled with the right policies (public select on published+licensed, admin full write, ops admin-only). An automated RLS attack test runs in CI and blocks deploys if anon clients can see anything they shouldn't.

# Prerequisites (read first)

- claude/architecture/security.md (§"RLS policies" — full SQL is there)
- claude/runbooks/launch-blockers.sql (RLS sanity queries 6, 7, 8)

# Files to touch

- `web/supabase/migrations/0006_rls.sql` (new)
- `web/__tests__/security/rls-anon-cannot-read.test.ts` (new)
- `web/__tests__/security/rls-anon-cannot-write.test.ts` (new)
- `scripts/launch-blockers.ts` (new — runs in CI)

# Implementation notes

Enable RLS on every table:

```sql
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;
-- ... every catalog and ops table
```

Then add the policies per `architecture/security.md` §RLS. Key patterns:

- **Public read on products:** `is_published = true AND deleted_at IS NULL`.
- **Public read on child catalog tables (images, variants, attributes, tags, option values):** `EXISTS (SELECT 1 FROM products p WHERE p.id = <table>.product_id AND p.is_published = true AND p.deleted_at IS NULL)`. `product_images` additionally requires `license_status IN ('owned','licensed','public_domain')` and its own `deleted_at IS NULL`.
- **Admin write** on all catalog tables: `auth.uid()` belongs to a profile with `role IN ('owner','admin','editor')`.
- **Ops tables (`audit_logs`, `background_jobs`, `import_runs`, `import_run_rows`, `job_events`, `ai_generations`, `search_logs`):** select only for admin role; no insert/update/delete policies (only service-role can write).
- **`search_synonyms`:** public select (used by the search expander); admin write.
- **`profiles`:** users can select their own row; admin can select all.

Define a `is_admin()` helper function once:

```sql
CREATE OR REPLACE FUNCTION is_admin() RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role IN ('owner', 'admin', 'editor')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;
```

Reuse in every admin-write policy.

**RLS attack test** (`rls-anon-cannot-read.test.ts`) — using a Supabase client with the anon key, attempts:
- read a soft-deleted product → expect 0 rows
- read an unpublished product → expect 0 rows
- read images of an unpublished product → expect 0 rows
- read images of a published product with `license_status='unverified'` → expect 0 rows
- read variants of a soft-deleted product → expect 0 rows
- read `audit_logs`, `background_jobs`, `ai_generations` → expect 0 rows

`rls-anon-cannot-write.test.ts` — attempts inserts/updates/deletes against every table, expects errors.

# Acceptance criteria

- [ ] RLS enabled on every table.
- [ ] Policies in place per spec.
- [ ] Two RLS test files pass.
- [ ] `scripts/launch-blockers.ts` runs and exits 0 against fresh seed data.
- [ ] CI step added that runs `pnpm tsx scripts/launch-blockers.ts` on every PR.

# Verification

```bash
cd web
pnpm dlx supabase db push
pnpm test --run security/
pnpm tsx ../scripts/launch-blockers.ts
```

# Dependencies added

None.

# Notes for next agent

(filled in when status → done)
