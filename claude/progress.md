# Build progress

Last updated: 2026-05-15

## Counts

- ✅ Done: 9 (P0-T01, P0-T02, P0-T04..T09, P0-T11)
- 🟡 In progress: 1 (P0-T10 — Vercel config awaits owner action)
- 🚧 Blocked: 0
- ⏸️ Deferred: 1 (P0-T03 — cart store port; will fetch from origin/main when needed in P3-T21)
- ⬜ Not started: 84

## Currently in progress

- **P0-T10** — Git + GitHub side is done (pushed `rebuild-v2` branch + `pre-rebuild` tag). Vercel side awaits owner: change Root Directory to `web/`, add 3 env vars, redeploy. See `user/06-next-steps-vercel-and-supabase.md`.

## Phase 0 status

**Phase 0 is functionally complete on the AI side.** Remaining items waiting on owner (Vercel config) before we can verify the preview deploy succeeds end-to-end. Phase 1 work is unblocked and can proceed in parallel — the schema migrations live in `web/supabase/migrations/` and don't need Vercel preview to be green.

## Last 5 completed

1. **P0-T11** — Security headers + image remotePatterns (2026-05-15) — all 6 headers verified via curl
2. **P0-T09** — Wire Supabase clients (2026-05-15) — health check returns `connected`
3. **P0-T08** — Create Supabase project + wire env (2026-05-15) — project `lyycugadkxjtevmugqol`
4. **P0-T07** — Design tokens (2026-05-15) — Bhavani palette + Newsreader/Manrope/JetBrains Mono + /design gallery
5. **P0-T06** — shadcn/ui primitives (2026-05-15) — 17 components

## Git layout — pushed to GitHub

- **Remote `main`** — legacy prototype at `71e3ad5`. Untouched. Vercel still deploys to https://bhavani-crafts.vercel.app/.
- **Remote `rebuild-v2`** — the rebuild branch at `c369523`. Two commits. Pushed 2026-05-15.
- **Remote tag `pre-rebuild`** — pinned to legacy `71e3ad5`. Pushed 2026-05-15.

## Awaiting owner action

- **Vercel:** Root Directory → `web`, add 3 env vars, redeploy `rebuild-v2`. See `user/06`.
- **Supabase:** confirm region (Mumbai recommended). DB password backup. See `user/06`.

## Next 3 to work

1. **P1-T01** — Migration 0001: profiles, categories, products tables + enums + profile trigger (waits for owner confirmation that we can push migrations to the live Supabase project)
2. **P1-T02** — Migration 0002: attribute_definitions, product_attributes
3. **P1-T03** — Migration 0003: variants, options, images (with license tracking), tags

## Notes log (most recent first)

- 2026-05-15 — **P0-T11 done + push.** `next.config.ts` carries all six security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy) and `images.remotePatterns` for Supabase Storage + Just Kraft CDN. `rebuild-v2` branch and `pre-rebuild` tag pushed to GitHub. Owner needs to update Vercel Root Directory + env vars per `user/06`.
- 2026-05-15 — **P0-T06/T07/T08/T09 done.** shadcn primitives installed, Bhavani design tokens + fonts wired, Supabase clients wired with service-role lint isolation, `/api/health` returns `connected` against live Supabase.
- 2026-05-15 — **Option B applied.** Git relocated from `web/.git` to project root.
- 2026-05-15 — **Supabase credentials received** for project `lyycugadkxjtevmugqol`.
- 2026-05-15 — `user/` folder materialized with 7 owner-facing docs (added 06 today).
- 2026-05-15 — **`pre-rebuild` tag** placed on legacy main at commit `71e3ad5` for safety.
- 2026-05-15 — **Git secrets audit:** clean. No `.env*` ever tracked. No keys in any commit.
- 2026-05-15 — **P0-T01 done.** Full claude/ working-memory folder is live.
- 2026-05-15 — Plan v2.1 approved.
