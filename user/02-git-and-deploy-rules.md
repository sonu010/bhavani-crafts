# Git + deploy rules during the rebuild

Simple rules to keep the live site safe while the AI rebuilds.

## The two-branch rule

| Branch | What it is | Who touches it |
|---|---|---|
| `main` | Legacy prototype. The live site at https://bhavani-crafts.vercel.app/ deploys from this. | **Don't touch** until rebuild is ready to ship. |
| `rebuild-v2` | The rebuild. AI commits here. Vercel preview deploys appear at a different URL. | AI commits; you review; we push together. |

Anything new the AI builds happens on `rebuild-v2`. When you're satisfied with the preview, **you** (not the AI) approve the merge of `rebuild-v2` → `main`. That's the only path to a production deploy.

## What "Do not deploy yet" enforces

- AI will not push commits to `main`.
- AI will not push commits to `rebuild-v2` either, until you explicitly say "push." Local commits accumulate; you see exactly what's queued before anything hits GitHub.
- AI will not touch Vercel project settings.

## Allowed operations during the rebuild

The AI may do these without asking each time:

- ✅ Create files, branches, tags **locally**.
- ✅ Run `pnpm install`, `pnpm dev`, `pnpm build`, `pnpm test` locally.
- ✅ Create migrations in `web/supabase/migrations/`.
- ✅ Read from the seed data in `data/justkraft-inventory/`.
- ✅ Update `claude/`, `user/`, `scripts/`, `docs/` files.

These need your nod first:

- 🟡 `git push` — anything to GitHub.
- 🟡 `supabase db push` — applies migrations to the live Supabase project (changes your database).
- 🟡 Vercel env var changes.
- 🟡 Running the seed script (writes ~8,500 rows to your Supabase).
- 🟡 Anything billed (Anthropic API calls).

When the AI is about to do something in the 🟡 list, it will pause and tell you. You can say yes/no in chat.

## "Show me before you push" workflow

Before pushing anything, the AI runs:

```
git status                  # what files changed
git diff --stat origin/main # what would land
```

…and posts the output to you. You glance, say "push," and only then `git push -u origin rebuild-v2`.

## Restoring from disaster

If the rebuild ever goes off the rails:

```bash
cd web
git checkout main
# bhavani-crafts.vercel.app is still serving main; you're back where you started.
git tag pre-rebuild
# the tag is also on GitHub once we push it, so you can recover even if local is gone.
```

The `pre-rebuild` tag points at the legacy prototype's last commit. As long as that tag exists (locally and/or on GitHub), the prototype is recoverable.

## When we're ready to ship the rebuild

The path:

1. You approve the rebuild on the preview URL.
2. AI runs the launch-blocker SQL queries to confirm no seed leakage.
3. AI runs the Lighthouse + Playwright + RLS attack tests.
4. AI opens a PR from `rebuild-v2` → `main`.
5. You merge it on GitHub.
6. Vercel auto-deploys the new `main`. The old prototype is replaced.
7. Old prototype is still recoverable via the `pre-rebuild` tag.

We are nowhere close to this step yet. This is a few weeks out.
