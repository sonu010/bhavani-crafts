# `claude/` — working memory for the Bhavani Crafts rebuild

This folder is the project's **persistent context**. Every AI agent (and every human) working on the rebuild reads from here before touching code.

The master plan lives at `~/.claude/plans/i-just-web-scraped-goofy-bubble.md` (outside this repo, in the planning workspace). This folder contains the **executable distillation** of that plan: an index, per-task files, architecture references, decisions, runbooks, and progress state.

## For AI agents starting a new session

Read in this order — **do not skip**:

1. **`architecture/engineering-principles.md`** — non-negotiable rules for how we work. Read this every session.
2. `plans.md` — find the next task with `status: not_started` whose `depends_on` are all `done`. Pick it.
3. `progress.md` — verify the chosen task is still the right next step. If anything looks stale, fix `progress.md` before proceeding.
4. `blockers.md` — skip the task if it's blocked.
5. The task file itself (`tasks/<phase>/<task-id>-*.md`) — read top to bottom.
6. Every file listed under the task's **Prerequisites** section.

Then, and only then, start work.

## Task workflow

For every task you take on:

1. **Mark in-progress.** Edit the task file's frontmatter: `status: in_progress`. Also bump it in `plans.md` (`⬜` → `🟡`) and in `progress.md` (move it to "In progress").
2. **Implement** following the task's Implementation notes. Stay within the listed files; if you need to touch a file not listed, surface that change in your end-of-task notes.
3. **Verify.** Run every command in the Verification section. Do not mark done if any verification fails.
4. **Mark done.** Edit frontmatter: `status: done`, set `last_updated` to today's date. Update `plans.md` (`🟡` → `✅`) and `progress.md` (move to "Done", bump counts).
5. **Write "Notes for next agent."** Anything surprising, anything that should change in `architecture/*.md` or a future task. This is the channel by which one session's learning reaches the next.

## Forbidden moves

- Never change `web/supabase/migrations/0001_init.sql` retroactively. Schema changes go in a new migration file.
- Never bypass RLS. Server actions go through the cookie-authed Supabase client, not the service-role key, unless the task explicitly authorizes service-role use.
- Never commit secrets. The pre-commit hook will block `.env*` files; if you trip it, fix the staging, don't disable the hook.
- Never invent customer-facing copy (testimonials, store details, prices). Placeholders are flagged `TODO(copy):`.
- Never add a dependency without listing it in the task's "Dependencies added" section with a one-line justification.
- Never auto-publish AI-generated content. Every AI suggestion lands in `ai_generations` with `status='proposed'` and waits for an admin accept.
- Never use `// @ts-ignore`, `eslint-disable`, or `// @ts-expect-error` without an inline comment explaining why.

## Folder layout

```
claude/
  README.md            ← you are here
  plans.md             ← master index (every task, with status)
  progress.md          ← rollup: counts done / in-progress / blocked + last 5 + next 3
  blockers.md          ← waiting-on-owner items (assets, credentials)
  glossary.md          ← project vocabulary (SKU, slug, attribute, variant, …)
  architecture/        ← reference docs (read for context, edit only when reality changes)
  decisions/           ← ADRs — immutable once accepted, supersede with new ADR if reversed
  runbooks/            ← step-by-step operational guides (seed, deploy, restore, etc.)
  tasks/
    _template.md       ← copy this when creating a new task file
    phase-0-setup/
    phase-1-foundation/
    phase-2-admin/
    phase-3-storefront/
    phase-4-ai-and-polish/
    phase-5-launch/
  .local/              ← gitignored scratch space for AI; do not commit
```

## When to update which file

| Change | File(s) to update |
|---|---|
| Task status / progress | the task file's frontmatter, `plans.md`, `progress.md` |
| New blocker discovered | `blockers.md` + leave the task `in_progress` (don't mark blocked silently) |
| Schema change | new migration in `web/supabase/migrations/`, then update `architecture/database-schema.md` |
| Design tweak | `architecture/design-system.md` |
| Dependency or trade-off decision | new ADR in `decisions/` (do not edit accepted ADRs) |
| New ops procedure | new runbook in `runbooks/` |
| New task discovered | new task file from `tasks/_template.md`, then add to `plans.md` |

Last principle: **if a future-you couldn't pick this up cold and continue, the docs aren't good enough.** Fix the docs before fixing more code.
