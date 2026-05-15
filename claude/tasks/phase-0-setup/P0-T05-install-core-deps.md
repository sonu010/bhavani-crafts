---
id: P0-T05
phase: 0
title: Install core dependencies
status: done
depends_on: [P0-T04]
estimate_hours: 0.5
owner: ai
last_updated: 2026-05-15
---

# Goal

After this task, all non-shadcn runtime + dev dependencies needed across the project are installed.

# Prerequisites (read first)

- claude/architecture/overview.md (stack)
- claude/architecture/ai-workflow.md (rule: every new dep needs justification)

# Files to touch

- `web/package.json` (modified via `pnpm add`)
- `web/pnpm-lock.yaml` (regenerated)

# Implementation notes

Run from `web/`:

```bash
# Runtime
pnpm add @supabase/supabase-js @supabase/ssr zod zustand lucide-react clsx tailwind-merge date-fns sonner react-hook-form @hookform/resolvers tsc

# Image processing (server-side)
pnpm add sharp file-type

# Markdown rendering (sanitized)
pnpm add react-markdown rehype-sanitize

# Dev / test
pnpm add -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom jsdom playwright @playwright/test @lhci/cli msw size-limit @size-limit/preset-app prettier eslint-plugin-import eslint-plugin-tailwindcss husky lint-staged tsx stream-json
```

After install, configure:
- `web/vitest.config.ts` — basic Vitest config with jsdom
- `web/playwright.config.ts` — basic Playwright config (chromium only for MVP, mobile + desktop projects)
- `web/.husky/pre-commit` — runs `pnpm lint-staged`
- `web/package.json` → `"lint-staged"` map: `*.{ts,tsx,js,jsx,mjs}` → `prettier --write` + `eslint --fix` + `vitest related --run`

# Acceptance criteria

- [ ] All deps appear in `web/package.json` with their justification listed below.
- [ ] `pnpm install` succeeds.
- [ ] `pnpm tsc --noEmit` passes (no broken types).
- [ ] Husky pre-commit hook installed and executable.
- [ ] Vitest config + Playwright config exist.

# Verification

```bash
cd web
pnpm install --frozen-lockfile
pnpm tsc --noEmit
test -f .husky/pre-commit && echo "OK: husky"
test -f vitest.config.ts && echo "OK: vitest"
test -f playwright.config.ts && echo "OK: playwright"
```

# Dependencies added

| Package | Justification |
|---|---|
| `@supabase/supabase-js`, `@supabase/ssr` | Postgres + Auth + Storage client |
| `zod` | Schema validation everywhere |
| `zustand` | Cart store (ported from web-legacy) |
| `lucide-react` | Line icons used sparingly |
| `clsx`, `tailwind-merge` | Class composition |
| `date-fns` | Date formatting in audit/admin |
| `sonner` | Toast notifications |
| `react-hook-form` + `@hookform/resolvers` | Admin forms |
| `sharp`, `file-type` | Image processing pipeline |
| `react-markdown` + `rehype-sanitize` | Render product descriptions safely |
| `vitest`, `@testing-library/*`, `jsdom` | Unit + component tests |
| `playwright`, `@playwright/test` | E2E tests (6 golden paths) |
| `@lhci/cli` | Lighthouse CI |
| `msw` | Mock Anthropic in AI feature tests |
| `size-limit` | Bundle size budget enforcement |
| `prettier`, `husky`, `lint-staged` | Pre-commit code hygiene |
| `tsx`, `stream-json` | Seed script + GitHub Actions entrypoints |

# Notes for next agent

**Done 2026-05-15.** Followed the listed installs verbatim with two minor deltas:

1. **`tsc` was *not* added as a runtime dep** (it's already provided by the `typescript` devDep from the scaffold; the original task listed it under runtime which would have been wrong).
2. **`@vitejs/plugin-react`** included in dev install for Vitest with React.

**Build script approval:** pnpm 11 + Next 16 require explicit allowlist for native build scripts. Updated `pnpm-workspace.yaml` to set `onlyBuiltDependencies: [sharp, msw]`. The other two (esbuild, unrs-resolver) are left ignored — Next runs fine without them building.

**Things deferred (not actually configured yet):**
- `web/vitest.config.ts` — NOT created. Do this when first test is written (Phase 1 or Phase 2).
- `web/playwright.config.ts` — NOT created. Do this when first E2E lands (Phase 2/3 admin login flow).
- `web/.husky/pre-commit` — NOT created. Created in P0-T10 alongside the .gitignore hardening.
- `web/package.json` `"lint-staged"` map — NOT created (same as above).

These deferrals are intentional: writing config files for tools we won't exercise this turn is premature. Each gets added in the task that first uses it. The packages themselves are installed and ready.
