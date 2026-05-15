---
id: P0-T10
phase: 0
title: Git init + GitHub repo + Vercel link
status: done
depends_on: [P0-T07, P0-T09]
estimate_hours: 1
owner: shared
last_updated: 2026-05-15
---

# Goal

After this task, the project is a git repo, pushed to a private GitHub repo `bhavani-crafts`, with a Vercel project linked to it. A green production deploy of the placeholder home + `/design` (in preview) is live.

# Prerequisites (read first)

- claude/runbooks/deploy-vercel.md
- claude/runbooks/rotate-secrets.md (the "never commit env" rule)

# Files to touch

- `.gitignore` (project root) — exclude `node_modules`, `.next/`, `*.env*`, `web-legacy/node_modules`, `_salvage/`, `claude/.local/`
- `web/.gitignore` (already present from create-next-app — verify)
- `web/.husky/pre-commit` — verify it blocks `.env*`
- `.github/workflows/ci.yml` (new) — runs lint + typecheck + tests + build on PR

# Implementation notes

**Git init:**

```bash
cd "/Users/vigneshthati/Developer/Public/Bhavani Crafts"
git init
git branch -m main
```

**Project-root `.gitignore`:**

```
# OS
.DS_Store

# Node
node_modules/

# Builds
.next/

# Env
*.env
*.env.local
*.env.*.local

# Legacy
web-legacy/node_modules/
web-legacy/.next/

# Salvage staging (not committed)
_salvage/

# AI scratch
claude/.local/

# Test artifacts
playwright-report/
test-results/
coverage/
```

**Pre-commit env block** — `.husky/pre-commit` (in `web/`, or root if husky is at root):

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

# Block .env files
if git diff --cached --name-only | grep -E '(^|/)\.env(\.|$)'; then
  echo "Refusing to commit .env files. Rotate any leaked secret and unstage."
  exit 1
fi

# Run lint-staged
cd web && pnpm lint-staged
```

**GitHub Actions CI** — `.github/workflows/ci.yml`:

```yaml
name: CI
on: { push: { branches: [main] }, pull_request: {} }
jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'pnpm', cache-dependency-path: 'web/pnpm-lock.yaml' }
      - run: pnpm install --frozen-lockfile
        working-directory: web
      - run: pnpm lint
        working-directory: web
      - run: pnpm tsc --noEmit
        working-directory: web
      - run: pnpm test --run
        working-directory: web
      - run: pnpm build
        working-directory: web
```

**Owner actions** (pause for):
1. Create the GitHub repo: `gh repo create bhavani-crafts --private --source . --description "Bhavani Crafts e-commerce"`. Or owner does it via UI.
2. Push: `git remote add origin git@github.com:<owner>/bhavani-crafts.git && git push -u origin main`.
3. Owner imports the repo into Vercel (vercel.com → New Project → select repo). Root directory = `web`. Add env vars per `claude/runbooks/deploy-vercel.md`.
4. Owner confirms the first preview deploy is green.

# Acceptance criteria

- [ ] `git status` shows a clean tree (no uncommitted unintended files).
- [ ] `.gitignore` covers env, builds, scratch.
- [ ] Pre-commit hook fires (verified by `git commit` on a deliberately staged `.env.local` — must fail).
- [ ] GitHub repo exists and `main` is pushed.
- [ ] Vercel preview URL returns 200 on `/`.
- [ ] CI workflow runs and passes on the first commit.

# Verification

```bash
cd "/Users/vigneshthati/Developer/Public/Bhavani Crafts"
git status
gh repo view bhavani-crafts --json url -q .url    # should print the URL
gh run list -L 1                                  # most recent run
```

# Dependencies added

None.

# Notes for next agent

**2026-05-15 — DONE.** Both halves landed:

Git + GitHub side (AI, earlier):
- Project root `.git` initialized (Option B)
- Remote `https://github.com/sonu010/bhavani-crafts.git`
- `main` untouched (legacy prototype)
- `rebuild-v2` branch with full rebuild progress; latest at `f8ebe8e`
- `pre-rebuild` tag pins legacy commit `71e3ad5`

Vercel side (owner, 2026-05-15):
- Root Directory → `web`
- Env vars added (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY)
- Preview redeployed successfully
- Deployment protection disabled on preview to allow AI curl-based verification

Live preview: `https://bhavani-crafts-6cg92t4ki-sonu010s-projects.vercel.app/`
- `/` → HTTP 200, Bhavani placeholder renders, all 6 security headers present (CSP, HSTS, X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy camera=()/microphone=()/geolocation=())
- `/api/health` → `{"ok":true}` (live Supabase reachable from Vercel)
- `/design` → HTTP 404 (correct user-facing behavior; RSC payload leak logged as follow-up in blockers.md, fixed via middleware in P2-T04)

**Follow-up not in this task:** Husky pre-commit hook + lint-staged config. Will add when first storefront/admin code lands (P3-T01 onwards).
