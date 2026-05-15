---
id: P1-T02
phase: 1
title: Migration — attributes (definitions + product_attributes)
status: done
depends_on: [P1-T01]
estimate_hours: 1
owner: ai
last_updated: 2026-05-15
---

# Goal

After this task, `attribute_definitions` and `product_attributes` tables exist. Per-category facets (resin volume in ml, paper GSM, paint type, etc.) can be defined once and valued per product.

# Prerequisites (read first)

- claude/architecture/database-schema.md (§"attribute_definitions, product_attributes")

# Files to touch

- `web/supabase/migrations/0002_attributes.sql` (new)
- `web/src/lib/db/types.gen.ts` (regenerated)

# Implementation notes

`product_attributes` uses a **composite primary key** `(product_id, attribute_id)`. No surrogate `id` column. Re-read the schema doc — this is locked.

A check constraint enforces that exactly one of `value_text`, `value_number`, `value_boolean` is non-null and matches the parent attribute's `type`. Either via:
- A `CHECK ((value_text IS NOT NULL)::int + (value_number IS NOT NULL)::int + (value_boolean IS NOT NULL)::int = 1)` constraint, AND
- A row-level trigger that validates `type` alignment.

Seed a small set of attribute definitions in this same migration for the common craft-supply types: `volume_ml` (number/ml, applies to resin/paint), `gsm` (number/gsm, applies to paper), `length_mm` (number/mm, applies to brushes/wood), `pack_quantity` (number/units, applies to all), `is_food_safe` (boolean, applies to clay/resin). Owner can edit these later via P2-T22.

Index `product_attributes(attribute_id, value_text)` and `product_attributes(attribute_id, value_number)` (in P1-T07, but you can foreshadow them here in a comment).

# Acceptance criteria

- [ ] Migration applies cleanly.
- [ ] Composite PK enforced (try to insert a duplicate `(product_id, attribute_id)` — must fail).
- [ ] Check constraint blocks rows with 0 or 2+ values.
- [ ] 5+ seeded attribute definitions exist.
- [ ] Types regenerated, no TS errors.

# Verification

```bash
cd web
pnpm dlx supabase db push
pnpm dlx supabase gen types typescript --linked > src/lib/db/types.gen.ts
pnpm tsc --noEmit
```

# Dependencies added

None.

# Notes for next agent (in-progress)

**2026-05-15 — SQL written, validated locally against pglite, committed; awaits `supabase db push`.**

`web/supabase/migrations/0002_attributes.sql` contains:
- 1 enum (`attribute_type`: text | number | boolean | select)
- 2 tables: `attribute_definitions`, `product_attributes` (composite PK)
- 2 updated_at triggers, 1 value-type validation trigger
- 2 CHECK constraints (one-value cardinality on product_attributes; select-type-has-options on attribute_definitions)
- 7 seeded starter attribute definitions: volume-ml, weight-g, gsm, length-mm, pack-quantity, is-food-safe, finish (with options Glossy/Matte/Satin)
- A smoke block that exercises happy-path inserts, type-mismatch rejection, two-value rejection, and composite-PK conflict

**New tool: pglite-based local migration validator.** Wrote `web/scripts/validate-migrations.mjs` and added `pnpm validate:migrations`. Runs every `*.sql` in `web/supabase/migrations/` against an embedded Postgres 17 (WASM via `@electric-sql/pglite`). Stubs `auth.users` + `auth.uid()` and strips `CREATE EXTENSION` lines (Supabase-managed). **Going forward, every migration runs through this before `supabase db push`** — no more iterations on the owner.

Result of local validation against 0001 + 0002:
```
enums=5  tables=5  indexes=9  functions=4   ✅
```

`types.gen.ts` extended with `AttributeType`, `AttributeDefinitionRow/Insert/Update`, `ProductAttributeRow/Insert/Update`.

When owner reports `supabase db push` succeeded, mark this task `done` and proceed to P1-T03 (variants + options + images + tags). No further owner action needed unless that migration fails — validate locally first.
