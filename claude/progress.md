# Build progress

Last updated: 2026-05-15

## Counts

- ✅ Done: 9 (P0-T01..T02, P0-T04..T09, P0-T11)
- 🟡 In progress: 2 (P0-T10 Vercel side · P1-T01 migration apply side)
- 🚧 Blocked: 0
- ⏸️ Deferred: 1 (P0-T03 — cart store port)
- ⬜ Not started: 83

## Currently in progress

- **P0-T10** — Git + GitHub pushed. Vercel side awaits owner: change Root Directory → `web/`, add env vars, redeploy. See `user/06`.
- **P1-T01** — Migration SQL written + committed. Awaits owner application via SQL Editor OR `supabase login` + `supabase db push`. See `user/07`.

## Last 5 completed

1. **P0-T11** — Security headers + image remotePatterns (2026-05-15)
2. **P0-T09** — Wire Supabase clients (2026-05-15)
3. **P0-T08** — Create Supabase project + wire env (2026-05-15)
4. **P0-T07** — Design tokens + /design gallery (2026-05-15)
5. **P0-T06** — shadcn primitives (2026-05-15)

## Git state on GitHub

- **`origin/main`** at `71e3ad5` — legacy prototype, untouched. Vercel deploys this → live site.
- **`origin/rebuild-v2`** at `[next push]` — rebuild branch. Will include `web/supabase/migrations/0001_init.sql` after this turn's push.
- **`pre-rebuild` tag** pinned to `71e3ad5`. Safety net.

## Awaiting owner action

1. **Vercel:** Root Directory → `web`, add 3 env vars, redeploy `rebuild-v2`. (`user/06`)
2. **Supabase:** apply `0001_init.sql` — Path A (SQL Editor, 30s) or Path B (CLI login). (`user/07`)
3. Supabase region confirmation (Mumbai recommended). (`user/06` step 2.1)

Note: items (1) and (2) are independent. Vercel preview build will succeed without the migration (the placeholder page doesn't touch the DB). `/api/health` will report `db: connected, note: schema empty` until the migration lands.

## Next 3 to work (after P1-T01 closes)

1. **P1-T02** — Migration 0002: `attribute_definitions` + `product_attributes` (composite PK)
2. **P1-T03** — Migration 0003: `product_options` + `product_option_values` + `product_variants` + `variant_option_values` + `product_images` (with license tracking) + `tags` + `product_tags`
3. **P1-T04** — Migration 0004: ops tables (audit_logs, background_jobs, job_events, import_runs, import_run_rows, ai_generations) + publish-state trigger

## Notes log (most recent first)

- 2026-05-15 — **P1-T01 SQL written.** Migration `0001_init.sql` ready; awaits owner application. `web/src/lib/db/types.gen.ts` hand-written to match. tsc + eslint clean. `user/07-apply-first-migration.md` gives owner two paths.
- 2026-05-15 — **P0-T11 done + pushed.** Security headers + image remotePatterns; `rebuild-v2` at `289f813` on GitHub.
- 2026-05-15 — **P0-T06/T07/T08/T09 done.** shadcn, design tokens, Supabase clients, lint isolation.
- 2026-05-15 — **Option B applied.** Git relocated to project root.
- 2026-05-15 — **Supabase credentials received** for `lyycugadkxjtevmugqol`.
- 2026-05-15 — **`pre-rebuild` tag** placed on legacy `71e3ad5`. Safety net.
- 2026-05-15 — **Git secrets audit:** clean.
- 2026-05-15 — **P0-T01 done.** claude/ working-memory folder live.
- 2026-05-15 — Plan v2.1 approved.
