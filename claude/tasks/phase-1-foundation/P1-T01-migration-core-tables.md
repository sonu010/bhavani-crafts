---
id: P1-T01
phase: 1
title: Migration — core tables (profiles, categories, products)
status: in_progress
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

# Notes for next agent (in-progress)

**2026-05-15 — migration SQL written and committed; awaiting owner application.**

`web/supabase/migrations/0001_init.sql` contains:
- 4 enums (profile_role, stock_status, product_source, review_status)
- 3 extensions (pgcrypto, pg_trgm, unaccent)
- 2 helper functions (`set_updated_at`, `is_admin`)
- 3 tables (`profiles`, `categories`, `products`) with full check constraints
- 4 triggers (3 × updated_at, 1 × on_auth_user_created)
- A `DO $$ ... $$` smoke block at the end that inserts/deletes test rows so the migration fails loudly if anything's structurally broken

**Hand-written `web/src/lib/db/types.gen.ts`** mirrors the SQL. Will be regenerated via `supabase gen types typescript --linked` once CLI auth is set up.

**Decision: did not initialize Supabase CLI auth this turn.** `supabase login` is browser-OAuth interactive, can't run from the AI. Wrote `user/07-apply-first-migration.md` with two clear paths:
- Path A: paste into SQL Editor (zero CLI setup; 30 seconds)
- Path B: `supabase login` once + `supabase db push` (one-time setup; future migrations auto-apply)

Once the owner applies the migration, status → done. Then:
1. Verify schema via a quick `SELECT count(*) FROM information_schema.tables WHERE table_schema='public'` (or by hitting an expanded /api/health that reads from `categories`)
2. Promote owner's account if they've signed up (P2-T02 + runbook); not strictly required to proceed to P1-T02
3. Move on to P1-T02 (attributes)

**Choices documented inline in the SQL:**
- Compound check constraints (e.g. `compare_at_price_inr > base_price_inr`) wrap `base_price_inr IS NULL OR ...` so "Price on request" rows aren't rejected
- `min_order_qty >= 1` default 1; `max_order_qty NULL OR >= min_order_qty`
- All audit columns (`created_by`/`updated_by`/`deleted_by`) FK to `profiles(id)` with `ON DELETE SET NULL` so deleting a profile doesn't cascade-destroy their work
- `category_id` FK uses `ON DELETE RESTRICT` — admin can't drop a category that still has products; matches P2-T19 UX
- Slug regex `^[a-z0-9][a-z0-9-]{0,79}$` enforced at the DB level. Same regex used for product slugs.
