# Build progress

Last updated: 2026-05-15

## Counts

- ✅ Done: 4 (P0-T01, P0-T02, P0-T04, P0-T05)
- 🟡 In progress: 1 (P0-T06)
- 🚧 Blocked: 0
- ⏸️ Deferred: 1 (P0-T03)
- ⬜ Not started: 89

## Currently in progress

- **P0-T06** — Install shadcn/ui primitives (no creds needed)

## Last 5 completed

1. **P0-T05** — Install core dependencies (2026-05-15)
2. **P0-T04** — Scaffold fresh Next.js 16 app (2026-05-15)
3. **P0-T02** — Archive legacy (revised: preserved on main + pre-rebuild tag) (2026-05-15)
4. **P0-T01** — Materialize claude/ folder (102 files) (2026-05-15)

## Git layout (Option B applied)

- **Repo root:** project root (not inside web/ anymore).
- **Branch:** `rebuild-v2` (1 commit: `838c7a3` Option B initial commit).
- **Tag:** `pre-rebuild` pinned to legacy commit `71e3ad5` (the old main).
- **Remote:** `https://github.com/sonu010/bhavani-crafts.git` — `origin/main` still has the legacy prototype, untouched. **Nothing pushed yet.**
- **Vercel:** still deploying `main` to `bhavani-crafts.vercel.app`. Root Directory must change to `web/` when we ship the rebuild.

## Next 3 to work

1. **P0-T06** — Install shadcn/ui primitives (in progress)
2. **P0-T07** — Write design tokens + theme + `/design` page (where you'll first see the brand palette)
3. **P0-T09** — Wire Supabase clients (browser/server/admin) — creds are saved, ready

## Notes log (most recent first)

- 2026-05-15 — **Option B applied.** Git relocated from `web/.git` to project root. `web/` is now a subfolder of the repo. First commit on `rebuild-v2` at `838c7a3` includes fresh Next.js scaffold + claude/ + user/ + scripts/ + docs/ + assets/ + extracted_ideas/ + root `.gitignore`. 196 files staged, zero `.env*` files, zero secrets.
- 2026-05-15 — **Supabase credentials received** for project `lyycugadkxjtevmugqol`. Saved to `web/.env.local` (gitignored, never committed). `web/.env.example` committed as template.
- 2026-05-15 — **P0-T02/T04/T05 done.** Three commits originally on a `rebuild-v2` branch inside the old `web/.git`. Those were squashed into the Option B initial commit (history simplification; legacy still recoverable via origin/main and pre-rebuild tag).
- 2026-05-15 — `user/` folder materialized with 6 owner-facing docs.
- 2026-05-15 — **`pre-rebuild` tag** placed on legacy main at commit `71e3ad5` for safety. Local only; not pushed.
- 2026-05-15 — **`rebuild-v2` branch** is the active branch. main untouched; Vercel still deploying legacy prototype.
- 2026-05-15 — **Git secrets audit:** clean. No `.env*` ever tracked. No keys in any commit.
- 2026-05-15 — **P0-T01 done.** Full claude/ working-memory folder is live.
- 2026-05-15 — Plan v2.1 approved.
