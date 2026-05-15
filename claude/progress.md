# Build progress

Last updated: 2026-05-15

## Counts

- ✅ Done: 11 (P0-T01..T02, P0-T04..T09, P0-T11, P1-T01, P1-T02)
- 🟡 In progress: 3 (P0-T10 Vercel · P1-T03 + P1-T04 apply side)
- 🚧 Blocked: 0
- ⏸️ Deferred: 1 (P0-T03)
- ⬜ Not started: 80

## Currently in progress

- **P0-T10** — Vercel Root Directory + env vars await owner action. See `user/06`.
- **P1-T03 + P1-T04** — both SQL files written, validated locally via pglite, committed, pushed to `rebuild-v2`. Single `supabase db push` from web/ will apply both.

## Last 5 completed

1. **P1-T02** — Attributes migration applied (2026-05-15) — 7 seeded attribute definitions visible via REST probe
2. **P1-T01** — Core tables applied (2026-05-15)
3. **P0-T11** — Security headers (2026-05-15)
4. **P0-T09** — Supabase clients wired (2026-05-15)
5. **P0-T08** — Supabase project + env (2026-05-15)

## Validator harness status

`pnpm validate:migrations` (web/) — runs all 4 migrations through pglite. Current result:
```
✅ 0001_init.sql              core tables (profiles, categories, products)
✅ 0002_attributes.sql        attribute_definitions, product_attributes
✅ 0003_variants_images_tags  product_images, product_options, product_option_values,
                              product_variants, variant_option_values, tags, product_tags
✅ 0004_ops_tables.sql        audit_logs, background_jobs, job_events, import_runs,
                              import_run_rows, ai_generations + publish-state trigger

▶ Resulting schema: enums=11 tables=18 indexes=28 functions=5
```

## Awaiting owner action

1. **Vercel:** Root Directory → `web`, add 3 env vars, redeploy. (`user/06`)
2. **Supabase:** `cd web && pnpm dlx supabase@latest db push` — applies BOTH 0003 + 0004 in one command.

## Next 3 to work (after P1-T03/T04 close)

1. **P1-T05** — Migration 0005: `fts` generated column + GIN indexes + `search_synonyms` + `search_logs` (seed common craft synonyms: mould/mold, colour/color, resin/epoxy)
2. **P1-T06** — Migration 0006: RLS policies on every table + RLS attack tests. This is the migration that locks anon down to public-select only.
3. **P1-T07** — Migration 0007: catalog indexes + `category_with_descendants` recursive view

## Notes log (most recent first)

- 2026-05-15 — **P1-T03 + P1-T04 written + validated.** Bundled because they're independent of each other and the user said "proceed." 13 new tables added to schema, publish-state trigger enforces invariants.
- 2026-05-15 — **P1-T02 done.** REST probe confirmed 7 seeded attribute_definitions.
- 2026-05-15 — **P1-T01 done.** Live Supabase has core tables.
- 2026-05-15 — Phase 0 functionally complete (AI side); Vercel config awaits owner.
- 2026-05-15 — Plan v2.1 approved.
