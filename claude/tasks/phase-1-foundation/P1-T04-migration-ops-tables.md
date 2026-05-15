---
id: P1-T04
phase: 1
title: Migration — ops tables + publish-state trigger
status: in_progress
depends_on: [P1-T01]
estimate_hours: 1.5
owner: ai
last_updated: 2026-05-15
---

# Goal

After this task, the operational tables exist: `audit_logs`, `background_jobs`, `job_events`, `import_runs`, `import_run_rows`, `ai_generations`. The trigger that enforces the `review_status` ↔ `is_published` invariant on `products` is in place and tested.

# Prerequisites (read first)

- claude/architecture/database-schema.md (§"Ops tables")
- claude/architecture/background-jobs.md (state machine)
- claude/architecture/observability.md (audit_logs usage)

# Files to touch

- `web/supabase/migrations/0004_ops_tables.sql` (new)
- `web/src/lib/db/types.gen.ts` (regenerated)
- `web/__tests__/triggers/publish-state.test.ts` (new — SQL assertion)

# Implementation notes

**Trigger** `products_publish_state_consistency`:

```sql
CREATE OR REPLACE FUNCTION enforce_publish_state() RETURNS trigger AS $$
BEGIN
  IF NEW.review_status = 'published' AND NEW.is_published = false THEN
    RAISE EXCEPTION 'review_status=''published'' requires is_published=true';
  END IF;
  IF NEW.review_status = 'archived' AND NEW.is_published = true THEN
    RAISE EXCEPTION 'review_status=''archived'' requires is_published=false';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER products_publish_state_consistency
  BEFORE INSERT OR UPDATE OF is_published, review_status ON products
  FOR EACH ROW EXECUTE FUNCTION enforce_publish_state();
```

The trigger validates the two directional invariants from the schema doc. Note that it does **not** auto-sync — it rejects bad inputs and forces server-side code to set both fields consistently. That's intentional; auto-sync would hide bugs.

`audit_logs.action` uses dotted strings: `product.create`, `product.update`, `product.delete`, `product.restore`, `category.update`, etc. Document the convention as a comment.

# Acceptance criteria

- [ ] Migration applies cleanly.
- [ ] Insert a product with `review_status='published', is_published=false` — must fail.
- [ ] Insert a product with `review_status='archived', is_published=true` — must fail.
- [ ] Insert a product with `review_status='published', is_published=true` — must succeed.
- [ ] Insert a product with `review_status='draft', is_published=false` — must succeed.
- [ ] Types regenerated.

# Verification

```bash
cd web
pnpm dlx supabase db push
pnpm test --run triggers/publish-state
```

# Dependencies added

None.

# Notes for next agent (in-progress)

**2026-05-15 — SQL written, validated locally, committed, pushed; awaits `supabase db push`.**

`web/supabase/migrations/0004_ops_tables.sql` contains:
- 4 enums: `job_status`, `import_action`, `ai_task_type`, `ai_generation_status`
- 6 tables: `audit_logs`, `background_jobs`, `job_events`, `import_runs`, `import_run_rows`, `ai_generations`
- 1 trigger function: `public.enforce_publish_state()`
- 1 trigger: `products_publish_state_consistency` (BEFORE INSERT/UPDATE on products)
- Smoke block exercising both trigger rejection directions + valid state transitions through draft → ready_to_publish → published → archived

**Note: `background_jobs` deliberately has NO `updated_at` column.** Workers update specific columns (status, progress, checkpoint, finished_at) directly. Initial draft had a fake "no-op trigger for symmetry" using a WHEN(FALSE) clause; that's invalid SQL syntax (`WHEN` requires a preceding `CREATE TRIGGER ... AFTER ...`). Removed; replaced with a comment.

Local pglite chain result after 0004:
```
enums=11 tables=18 indexes=28 functions=5
```

`types.gen.ts` extended with 4 new enum types + 6 new table Row/Insert/Update typings.

Move to `done` once owner reports `supabase db push` succeeded and verify via REST probe (insert an audit_logs row via service-role, confirm round-trips).
