# Where things stand — 2026-05-15

## TL;DR

- **Live site:** https://bhavani-crafts.vercel.app/ (the **legacy prototype**, not the rebuild)
- **Git repo:** `github.com/sonu010/bhavani-crafts`
- **Local repo location:** `web/.git` (inside the `web/` folder, not at project root)
- **Branches:**
  - `main` — legacy prototype. Untouched. Vercel deploys this.
  - `rebuild-v2` — **the rebuild branch.** Local only; not pushed yet.
- **Safety tag:** `pre-rebuild` — points at the same commit as `main`. We can always recover the prototype.
- **Secrets check:** ✅ Clean. No `.env*` files were ever tracked. No keys appear in any commit. `.gitignore` already excludes env files.

## Why the rebuild is on a branch

You said "do not deploy yet" — exactly right. Vercel's GitHub integration auto-deploys whichever commit is on `main`. By working on `rebuild-v2`, we:

- Leave the live prototype undisturbed.
- Get Vercel **preview** deploys for the rebuild branch (separate URL, not bhavanicrafts.in or the production URL).
- Decide together when the rebuild is ready to merge into `main` and replace the prototype.

## Git layout (resolved → Option B, 2026-05-15)

The git repo now lives at the **project root**. It tracks the full layout: `web/`, `claude/`, `user/`, `scripts/`, `docs/`, `assets/`, `extracted_ideas/`, and a root `.gitignore`. The legacy prototype is preserved on `origin/main` (untouched) and at the `pre-rebuild` tag.

### What this means for you

- **One repo, one source of truth.** Clone the repo → get everything (plan + code + ops docs + scrapers + design refs).
- **Vercel config note (apply when we ship the rebuild):** Vercel's "Root Directory" project setting must change from the repo root to `web/` so it builds the Next.js app, not the project root. This is a one-line change in the Vercel dashboard. We'll do it together when the rebuild is ready to merge into `main`. Until then, Vercel keeps deploying `main` (the legacy prototype, where Next.js was at the repo root in the old shape) — that's still fine because `main` is untouched.
- **GitHub repo will see new top-level paths** the first time we push the rebuild branch — `claude/`, `user/`, `assets/`, etc. all show up. This is expected.

## What's in the repo on `rebuild-v2` right now

The first commit on `rebuild-v2` (sha `838c7a3`) contains the new project layout:

- `web/` — fresh Next.js 16.2.6 + React 19.2.4 + Tailwind v4 scaffold with P0-T05 deps installed
- `claude/` — AI working memory (plan index, architecture, ADRs, runbooks, 100+ task files)
- `user/` — these owner-facing instructions
- `scripts/` — the Just Kraft inventory scraper
- `docs/`, `assets/`, `extracted_ideas/` — references
- `.gitignore` — root safety net

Compared to `origin/main`, `rebuild-v2` is a **divergent** history (different first commit). That's intentional — main keeps its old shape for Vercel; rebuild-v2 has the new shape.

## What's NOT committed (intentionally gitignored)

- `web/.env.local` — your Supabase credentials (local only)
- `web/.env.example` — IS committed (placeholder template)
- `data/justkraft-inventory/*.json | *.csv | *.checkpoint.json` — 36 MB of Just Kraft scraped seed. Stays on your machine; obtained out-of-band by any future developer
- `stitch_bhavani_creator_studio.zip` — 7.5 MB original design export blob (`extracted_ideas/` already contains the unpacked structured version, which IS tracked)
- `web/node_modules/`, `web/.next/`, `*.tsbuildinfo`, `.DS_Store`, IDE config
- `claude/.local/` — AI scratch space
- `.claude/` (Anthropic Claude Code tooling state, distinct from `claude/`)
