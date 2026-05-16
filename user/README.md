# Owner Instructions — Bhavani Crafts rebuild

This folder is **your** companion to the AI's `claude/` folder. The AI writes plans, code, and progress; this folder tells **you** what to do (and what *not* to do).

Read these files in order:

1. [`00-where-things-stand.md`](00-where-things-stand.md) — current status of the project (git, Vercel, branches, secrets)
2. [`01-share-supabase-credentials.md`](01-share-supabase-credentials.md) — **action required** — what to send the AI so it can wire up the backend
3. [`02-git-and-deploy-rules.md`](02-git-and-deploy-rules.md) — branch/push/deploy etiquette during the rebuild
4. [`03-what-to-expect-each-day.md`](03-what-to-expect-each-day.md) — the rhythm of the rebuild, what blockers look like
5. [`04-glossary-for-owner.md`](04-glossary-for-owner.md) — terms you'll see (RLS, ISR, slug, SKU, …) explained in plain English
6. [`05-content-the-AI-needs-from-you.md`](05-content-the-AI-needs-from-you.md) — real-content gate ahead of launch (products, photos, address, logo, …)
7. [`06-next-steps-vercel-and-supabase.md`](06-next-steps-vercel-and-supabase.md) — action checklist for Vercel + Supabase setup
8. [`07-apply-first-migration.md`](07-apply-first-migration.md) — apply the first Postgres migration (Path A: SQL Editor, 30s · Path B: CLI, one-time setup) — now done by AI directly
9. [`08-ci-and-github-secrets.md`](08-ci-and-github-secrets.md) — **NOW** — add three GitHub repo secrets so the `live` CI job can run

If anything in the AI's plan or progress is unclear, the answer is somewhere in [`claude/`](../claude/) — but the AI is the right party to ask.
