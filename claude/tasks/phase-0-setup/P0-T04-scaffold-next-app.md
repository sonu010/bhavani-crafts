---
id: P0-T04
phase: 0
title: Scaffold fresh Next.js app at web/
status: done
depends_on: [P0-T02]
estimate_hours: 0.5
owner: ai
last_updated: 2026-05-15
---

# Goal

After this task, a fresh Next.js 15+ App Router project lives at `web/` with TypeScript and Tailwind already wired. `pnpm dev` starts the dev server with the default Next placeholder.

# Prerequisites (read first)

- claude/architecture/overview.md (stack section)
- claude/architecture/design-system.md (we will replace defaults in P0-T07)

# Files to touch

- Run `pnpm create next-app@latest web --typescript --tailwind --app --eslint --no-src-dir=false --import-alias "@/*"`
- After scaffold:
  - `web/.gitignore` — confirm `.env*` and `.next/` are listed
  - `web/package.json` — confirm `"packageManager": "pnpm@..."` is set; if not, add it
  - `web/next.config.ts` — leave default; P0-T11 adds security headers

# Implementation notes

- Use **pnpm** (faster, deterministic).
- We use **App Router** (`app/` directory), not Pages.
- We use **`src/`** layout (default in the create-next-app prompt — answer "Yes" to "Would you like to use src/ directory?").
- Import alias: `@/*` → `./src/*`.
- Default React/Next version is fine (whatever is current). Pin major versions in `package.json` only for security-sensitive packages (`next`, `react`).
- Delete the default `web/src/app/page.tsx` placeholder content and replace with a minimal "Bhavani Crafts" h1 in Manrope — so we can visually verify P0-T07's design tokens land correctly.

# Acceptance criteria

- [ ] `web/package.json` exists with Next.js 15+, React 19, TypeScript.
- [ ] `web/src/app/` exists.
- [ ] `web/tailwind.config.ts` exists (or `web/postcss.config.mjs` for Tailwind v4 inline syntax).
- [ ] `pnpm dev` (from `web/`) starts the dev server cleanly.
- [ ] `http://localhost:3000` loads.

# Verification

```bash
cd "/Users/vigneshthati/Developer/Public/Bhavani Crafts/web"
cat package.json | grep "\"next\""    # should print the next version line
pnpm dev &
PID=$!
sleep 6
curl -s http://localhost:3000 | head -1
kill $PID
```

# Dependencies added

The create-next-app defaults: `next`, `react`, `react-dom`, `typescript`, `tailwindcss`, `postcss`, `autoprefixer`, `eslint`, `eslint-config-next`. Justifications are the framework itself.

# Notes for next agent

**Done 2026-05-15.** Scaffolded with `pnpm create next-app@latest web --typescript --tailwind --app --eslint --src-dir --import-alias "@/*" --use-pnpm --turbopack --skip-install --yes`.

Resulting versions:
- Next.js **16.2.6**
- React **19.2.4**
- Tailwind v4 (via `@tailwindcss/postcss`)
- TypeScript ^5
- Turbopack default (no `--turbopack` flag in dev/build scripts per Next 16 default)

**Next 16 gotchas to remember** (from `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`):
- Async Request APIs are non-negotiable: `await cookies()`, `await headers()`, `await params`, `await searchParams`. Synchronous fallback removed.
- `experimental.turbopack` is now top-level `turbopack` in `next.config.ts`.
- `middleware` convention may be migrated to `proxy` — verify in P0-T11/P2-T04.
- Custom webpack config + `next build` (Turbopack) is now an error unless `--webpack` is passed.

Scaffold artifacts kept: `AGENTS.md` (Next 16 agent guidance), `CLAUDE.md` (`@AGENTS.md`), `pnpm-workspace.yaml` (build script approvals).

Placeholder `src/app/page.tsx` and `src/app/layout.tsx` still use Tailwind default zinc/black colors. These get replaced in P0-T07 (design tokens). Do not leave them in main.
