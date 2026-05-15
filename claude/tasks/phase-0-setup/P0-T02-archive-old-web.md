---
id: P0-T02
phase: 0
title: Archive old web/ to web-legacy/ (revised — preserved via main branch + tag)
status: done
depends_on: [P0-T01]
estimate_hours: 0.5
owner: ai
last_updated: 2026-05-15
---

> **Revision (2026-05-15):** Original plan was to move `web/` to `web-legacy/`. Because the existing git repo lives **inside** `web/` (`web/.git`) and is wired to Vercel, doing a filesystem rename would disrupt the deployment pipeline. Instead we preserved the legacy via:
>
> 1. `git tag pre-rebuild` on main (snapshot of the legacy prototype)
> 2. `git checkout -b rebuild-v2` (rebuild work happens here; main stays untouched)
> 3. Wiped `web/` contents on the rebuild-v2 branch and scaffolded fresh in P0-T04
>
> The legacy code is recoverable any time via `git checkout main` or `git checkout pre-rebuild`. Vercel still deploys `main` to https://bhavani-crafts.vercel.app/ — the live prototype is undisturbed.

# Goal

After this task, the half-finished prototype lives at `web-legacy/` (visible reference only). The `web/` directory is empty and ready for a fresh scaffold.

# Prerequisites (read first)

- claude/README.md (forbidden-moves section)

# Files to touch

- Rename `web/` → `web-legacy/`
- Add `web-legacy/README.md` (new — one paragraph noting "reference only, do not edit, see /claude/plans.md")

# Implementation notes

- Use `mv` (or `git mv` once the repo is initialized). At this point the project is not yet a git repo, so plain `mv` is fine.
- **Do not delete** anything. The legacy app contains useful patterns we'll cherry-pick from in P0-T03 (Zustand cart, shadcn UI primitives, design references).
- `web-legacy/node_modules` can be deleted to save space — `pnpm install` there is not needed again.
- `web-legacy/.next` (build artifacts) can be deleted similarly.

# Acceptance criteria

- [ ] `web-legacy/` exists with the prior contents.
- [ ] `web/` no longer exists at the project root.
- [ ] `web-legacy/README.md` explains the folder's status.
- [ ] No files lost (compare top-level file lists pre and post).

# Verification

```bash
cd "/Users/vigneshthati/Developer/Public/Bhavani Crafts"
ls -la web-legacy/ | head -20
test ! -d web && echo "OK: web/ is gone"
test -f web-legacy/README.md && echo "OK: README in place"
```

# Dependencies added

None.

# Notes for next agent

**Done 2026-05-15.** Approach revised (see banner above). Legacy commit `71e3ad5` is preserved on `main` and at the `pre-rebuild` tag. Working tree on `rebuild-v2` was wiped and scaffolded fresh in P0-T04. `web/.git` lives inside `web/`; the `claude/` working memory at the project root is **not** tracked by this repo yet — a follow-up decision (move git to project root, or move claude/ into web/claude/) is captured in `user/00-where-things-stand.md`.
