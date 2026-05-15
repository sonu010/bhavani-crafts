---
id: P1-T11
phase: 1
title: Author claude/architecture/database-schema.md fully from live schema
status: not_started
depends_on: [P1-T10]
estimate_hours: 1
owner: ai
last_updated: 2026-05-15
---

# Goal

After this task, `claude/architecture/database-schema.md` is regenerated to reflect the actual deployed schema (which may have minor deltas from the v2.1 plan, e.g. exact enum names or index variations decided during P1-T01..T07). Future Phase 2+ tasks can trust this doc as the single source of truth for the schema.

# Prerequisites (read first)

- claude/architecture/database-schema.md (current state — written from the plan; may now be slightly drifted)

# Files to touch

- `claude/architecture/database-schema.md` (rewritten)

# Implementation notes

Approach:
1. Dump the actual schema: `pg_dump --schema-only "$DB_URL" > /tmp/schema.sql`. Inspect.
2. Reconcile with `claude/architecture/database-schema.md`. For each difference:
   - If the **plan was right and the schema drifted**, write a new migration in a follow-up task. Surface this in "Notes for next agent."
   - If the **schema is right and the plan drifted**, update the doc.
3. Keep the doc's structure: enums → catalog tables → ops tables → indexes → views → RLS pointer.
4. Add a "Last regenerated from live schema on 2026-MM-DD" note at the top.

# Acceptance criteria

- [ ] Doc reflects every table, column, enum, constraint, trigger, and index that exists in production.
- [ ] No drift between doc and migrations.
- [ ] If drift was found, follow-up tasks are created in `plans.md`.

# Verification

```bash
pg_dump --schema-only "$DB_URL" > /tmp/schema.sql
# Manual diff against the doc — paste key sections into a tmp file and visually verify.
```

# Dependencies added

None.

# Notes for next agent

(filled in when status → done. Importantly: list any drift discovered and where the new follow-up migrations live.)
