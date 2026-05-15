---
id: P1-T01
phase: 1
title: Migration — core tables (profiles, categories, products)
status: not_started
depends_on: [P0-T09]
estimate_hours: 2
owner: ai
last_updated: 2026-05-15
---

# Goal

After this task, the foundational tables exist in Supabase: `profiles`, `categories`, `products`, plus the enums they depend on. `supabase db push` succeeds, types are regenerated, and a smoke insert+select via service-role works.

# Prerequisites (read first)

- claude/architecture/database-schema.md (§"Enums", §"profiles", §"categories", §"products")
- claude/architecture/auth-and-roles.md (profile_role enum)
- claude/runbooks/add-new-migration.md

# Files to touch

- `web/supabase/migrations/0001_init.sql` (new)
- `web/src/lib/db/types.gen.ts` (regenerated)

# Implementation notes

This is the foundational migration. RLS policies + indexes + the publish-state trigger come in later P1 tasks; this one creates the **shapes**.

Order matters:
1. Extensions (`pgcrypto` for `gen_random_uuid()`, `pg_trgm`, `unaccent`).
2. Enums (every enum in `architecture/database-schema.md` §"Enums").
3. `profiles` (references `auth.users`).
4. `categories` (self-referential).
5. `products` (references `categories`).
6. Profile-creation trigger so a new `auth.users` row auto-creates a `profiles` row with `role='viewer'`.

First line is rollback note: `-- rollback: DROP TABLE products, categories, profiles CASCADE; DROP TYPE …;`

The `products` table includes both `is_published` and `review_status` per the schema doc — but the trigger that enforces their alignment is **deferred to P1-T04** so we can write tests that prove the trigger works before relying on it.

Use `gen_random_uuid()` for all `uuid pk default …`.

Use `created_at timestamptz not null default now()` and `updated_at timestamptz not null default now()`. Add a trigger function `set_updated_at()` once and reuse.

# Acceptance criteria

- [ ] `supabase db push` succeeds against the linked Supabase project.
- [ ] `psql "$DB_URL" -c "\dt"` lists `profiles`, `categories`, `products`.
- [ ] `psql "$DB_URL" -c "\dT"` lists all enums.
- [ ] Service-role can INSERT a category, then a product referencing it; SELECT confirms.
- [ ] `supabase gen types typescript --linked > src/lib/db/types.gen.ts` produces non-empty output with `categories`, `products`, `profiles` types.

# Verification

```bash
cd web
pnpm dlx supabase db push
pnpm dlx supabase gen types typescript --linked > src/lib/db/types.gen.ts
psql "$(pnpm dlx supabase status --output env | grep DB_URL | cut -d= -f2)" <<'SQL'
INSERT INTO categories (slug, name) VALUES ('test-cat', 'Test Category') RETURNING id;
SQL
```

# Dependencies added

None.

# Notes for next agent

(filled in when status → done. Be sure to mention any enum value tweaks vs the doc.)
