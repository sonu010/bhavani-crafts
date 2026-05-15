# Build progress

Last updated: 2026-05-15

## Counts

- ✅ Done: 10 (P0-T01..T02, P0-T04..T09, P0-T11, P1-T01)
- 🟡 In progress: 2 (P0-T10 Vercel side · P1-T02 apply side)
- 🚧 Blocked: 0
- ⏸️ Deferred: 1 (P0-T03)
- ⬜ Not started: 82

## Currently in progress

- **P0-T10** — Git + GitHub done. Vercel side awaits owner (Root Directory → `web`, env vars). See `user/06`.
- **P1-T02** — Migration `0002_attributes.sql` written + validated locally; awaits `supabase db push`.

## Last 5 completed

1. **P1-T01** — Core tables (profiles, categories, products) applied to live Supabase via Path B (2026-05-15)
2. **P0-T11** — Security headers + image remotePatterns (2026-05-15)
3. **P0-T09** — Wire Supabase clients (2026-05-15)
4. **P0-T08** — Create Supabase project + wire env (2026-05-15)
5. **P0-T07** — Design tokens + `/design` gallery (2026-05-15)

## New tooling this session

**`pnpm validate:migrations`** — runs every `web/supabase/migrations/*.sql` against pglite (embedded Postgres 17 WASM) before push. Stubs `auth.users` + `auth.uid()`, strips Supabase-managed extension lines. Lives at `web/scripts/validate-migrations.mjs`. Will be added to CI in a later task.

Result on 0001 + 0002:
```
enums=5  tables=5  indexes=9  functions=4   ✅
```

## Awaiting owner action

1. **Vercel:** Root Directory → `web`, add 3 env vars, redeploy. (`user/06`)
2. **Supabase:** apply `0002_attributes.sql` via `pnpm dlx supabase@latest db push` from `web/`.

## Next 3 to work (after P1-T02 closes)

1. **P1-T03** — Migration 0003: variants + options + images (with license tracking) + tags
2. **P1-T04** — Migration 0004: ops tables + publish-state trigger
3. **P1-T05** — Migration 0005: search column + indexes + synonyms seed

## Notes log (most recent first)

- 2026-05-15 — **P1-T02 SQL written + validated locally.** New pglite harness catches bugs before they hit the owner. `0002_attributes.sql` defines `attribute_type` enum, `attribute_definitions` + `product_attributes` (composite PK), value-type validation trigger, and 7 seeded starter attributes.
- 2026-05-15 — **P1-T01 done.** Live Supabase has `profiles`, `categories`, `products` + 4 enums + 4 triggers. Verified via direct REST API probe.
- 2026-05-15 — **P0-T11 done + pushed.** Security headers verified via `curl -I`.
- 2026-05-15 — **P0-T06/T07/T08/T09 done.** shadcn, design tokens, Supabase clients, lint isolation.
- 2026-05-15 — **Option B applied.** Git relocated to project root.
- 2026-05-15 — Plan v2.1 approved.
