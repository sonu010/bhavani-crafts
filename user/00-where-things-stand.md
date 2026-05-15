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

## Git layout note (we will revisit)

The git repo currently lives **inside** `web/`. The AI's `claude/` working-memory folder lives at the **project root** — outside the repo. That means right now `claude/` is **not** tracked in git.

Two options to fix this, both fine, decide later:

| Option | What it means | When to pick |
|---|---|---|
| **A. Move `claude/` into `web/claude/`** | The AI rewrites internal paths so the folder lives inside the repo. Quick, no Vercel config change. | If we want the rebuild to ship sooner and revisit repo layout later. |
| **B. Move git up to project root** | The repo tracks everything (`web/`, `claude/`, `data/`, `scripts/`, `docs/`). Cleaner long-term. Vercel needs a one-line config change ("Root Directory" → `web`). | If we want the cleaner structure from the start. |

Both are reversible. **For this turn, the AI is working with `claude/` outside the repo** — that's fine, since we're not pushing anything to GitHub yet. Decision can wait until just before the first push.

## What's in the repo on `rebuild-v2` right now

Identical to `main` — the legacy prototype. The AI will gut this on `rebuild-v2` and replace it with the fresh Next.js app, one commit at a time. `main` stays as the prototype until you say "ship it."

## What's NOT in the repo

- `claude/` — AI's working memory (see above)
- `user/` — this folder, your instructions (also at project root)
- `data/justkraft-inventory/*` — scraped Just Kraft catalog (8,509 products); used as a dev seed only, never deployed publicly
- `scripts/scrape-justkraft-inventory.mjs` — the scraper

None of these contain secrets. We can decide to track them after we settle the layout question.
