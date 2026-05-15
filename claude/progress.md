# Build progress

Last updated: 2026-05-15

## Counts

- ✅ Done: 16 (P0-T01..T02, P0-T04..T09, P0-T11, P1-T01..T07)
- 🟡 In progress: 1 (P0-T10 — Vercel side awaits owner)
- 🚧 Blocked: 0
- ⏸️ Deferred: 1 (P0-T03 — cart store port; pulled when P3-T21 lands)
- ⬜ Not started: 78

## Phase 1 schema is complete

All 7 schema migrations applied to live Supabase project `lyycugadkxjtevmugqol`:

```
0001_init.sql                    profiles, categories, products + 4 enums
0002_attributes.sql              attribute_definitions, product_attributes + 7 seeded
0003_variants_images_tags.sql    product_images (with license), product_options,
                                 product_option_values, product_variants,
                                 variant_option_values, tags, product_tags + 2 enums
0004_ops_tables.sql              audit_logs, background_jobs, job_events, import_runs,
                                 import_run_rows, ai_generations + publish-state trigger + 4 enums
0005_search.sql                  products.fts + 3 GIN indexes + search_synonyms (7 seeded) + search_logs
0006_rls.sql                     RLS enabled on all 20 tables; 33 policies; child tables EXISTS-join to parent
0007_indexes_views.sql           9 catalog indexes + category_with_descendants recursive view

Live schema: 11 enums, 20 tables, 43 indexes, 36 functions (incl. pg_trgm contrib)
```

**RLS attack test (run against live) — 10/10 pass.** Anon clients cannot read unpublished products, cannot read unverified images, cannot read ops tables, and cannot mutate anything.

## Remaining Phase 1 tasks (not schema)

- **P1-T08** — Seed script: streaming Just Kraft JSON → live Supabase. ~8,509 products, all `is_published=false`, `source='justkraft_seed'`. Will be invoked from a Node script.
- **P1-T09** — Typed data layer at `web/src/lib/db/{products,categories,images,variants,attributes,search,tags}.ts` with Zod schemas + `unstable_cache` for storefront reads.
- **P1-T10** — Verify seed counts post-load + integrate the RLS attack probe into CI as `scripts/launch-blockers.ts`.
- **P1-T11** — Regenerate `architecture/database-schema.md` from the live deployed schema. Reconcile with the doc; create follow-up migrations for any drift.

## Awaiting owner action

- **Vercel:** Root Directory → `web`, add 3 env vars, redeploy. (`user/06`). Independent of P1 schema work — can happen any time.

## Next 3 to work

1. **P1-T08** — Seed script (`scripts/seed-from-justkraft.mjs`). Will need to handle the 22MB JSON via `stream-json`.
2. **P1-T09** — Typed data layer with first read functions: `listProducts`, `getProductBySlug`, `getCategoryTree`.
3. **P1-T10** — `scripts/launch-blockers.ts` formalizes today's RLS attack probe + the 7 SQL checks from `runbooks/launch-blockers.sql`.

## Notes log (most recent first)

- 2026-05-15 — **P1-T06 + P1-T07 done.** RLS locked down (10/10 attack probes pass), 9 catalog indexes + recursive view added. Phase 1 schema migrations COMPLETE.
- 2026-05-15 — **Engineering principles adopted** from owner's cross-project standard. See `architecture/engineering-principles.md`. Three audit-fix violations corrected in commit `4c1acab`.
- 2026-05-15 — **P1-T05 applied.** AI runs `db push` itself from here.
- 2026-05-15 — **P1-T03/T04 done.** Variants/images/tags + ops tables.
- 2026-05-15 — **P1-T02 done.** 7 seeded attribute definitions.
- 2026-05-15 — **P1-T01 done.** Live Supabase has core tables.
- 2026-05-15 — Plan v2.1 approved.
