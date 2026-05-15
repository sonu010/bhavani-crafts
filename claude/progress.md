# Build progress

Last updated: 2026-05-15

## Counts

- ✅ Done: 4 (P0-T01, P0-T02, P0-T04, P0-T05)
- 🟡 In progress: 0
- 🚧 Blocked: 1 (P0-T08 — waiting on Supabase credentials)
- ⏸️ Deferred: 1 (P0-T03)
- ⬜ Not started: 89

## Currently in progress

(none — paused for owner action)

## Last 5 completed

1. **P0-T05** — Install core dependencies (2026-05-15) — Supabase clients, Zod, Zustand, sonner, react-hook-form, sharp+file-type, react-markdown+rehype-sanitize, Vitest, Playwright, MSW, size-limit, prettier, husky+lint-staged, tsx+stream-json. `pnpm-workspace.yaml` allows sharp+msw native builds.
2. **P0-T04** — Scaffold fresh Next.js app (2026-05-15) — Next 16.2.6 + React 19.2.4 + Tailwind v4 + TypeScript + App Router + Turbopack default.
3. **P0-T02** — Archive old web/ (2026-05-15) — **revised**. Instead of moving web/ → web-legacy/, we tagged `pre-rebuild` on main and branched `rebuild-v2`. Legacy code recoverable any time; Vercel keeps deploying main untouched.
4. **P0-T01** — Materialize the `claude/` folder (2026-05-15) — 102 files of plan/architecture/decisions/runbooks/tasks.

## Currently blocked (waiting on owner)

- **P0-T08** — Create Supabase project + wire env. Owner needs to share `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PROJECT_REF` per `user/01-share-supabase-credentials.md`.

## Next 3 to work (after current blocker clears)

1. **P0-T06** — Install shadcn/ui primitives (does not need credentials; can run in parallel with the wait)
2. **P0-T07** — Write design tokens + theme + `/design` page
3. **P0-T09** — Wire Supabase clients (needs P0-T08)

## Notes log (most recent first)

- 2026-05-15 — **P0-T02/T04/T05 done.** Three commits on `rebuild-v2` locally; **nothing pushed yet** per owner instruction.
- 2026-05-15 — `user/` folder materialized with 6 owner-facing docs.
- 2026-05-15 — **`pre-rebuild` tag** placed on legacy main at commit `71e3ad5` for safety.
- 2026-05-15 — **`rebuild-v2` branch** created locally; main untouched; Vercel still deploying legacy prototype.
- 2026-05-15 — **Git secrets audit:** clean. No `.env*` ever tracked. No keys in any commit. `.gitignore` already excludes env files.
- 2026-05-15 — **P0-T01 done.** Full `claude/` working-memory folder is live.
- 2026-05-15 — Plan v2.1 approved.
