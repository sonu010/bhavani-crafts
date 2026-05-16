# 📋 CI on GitHub Actions — what runs and what you need to set

A workflow at `.github/workflows/ci.yml` runs on every push + PR. Two jobs:

| Job | Runs on | Needs secrets? | Does what |
|---|---|---|---|
| `static` | every push + PR | no | lint, typecheck, build, validate the 7 migrations through pglite |
| `live` | `rebuild-v2` branch and PRs targeting it | yes | data-layer integration tests + 12 launch-blocker checks against live Supabase |

The `static` job runs anywhere with no setup. The `live` job is gated — it auto-skips with a friendly warning if secrets aren't configured, so it doesn't block PRs from contributors without DB access.

---

## What you need to do

**One-time setup** — add three repo-level secrets so the `live` job can run:

1. Open https://github.com/sonu010/bhavani-crafts/settings/secrets/actions
2. Click **New repository secret** and add each of these:

   | Secret name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://lyycugadkxjtevmugqol.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the `anon public` JWT from Supabase Project Settings → API |
   | `SUPABASE_SERVICE_ROLE_KEY` | the `service_role` JWT from the same page |

   These are the same values that live in your `web/.env.local`.

3. After adding all three: the next push to `rebuild-v2` runs both `static` and `live` jobs. The `live` step writes them to a temporary `.env.local` inside the runner and runs vitest + launch-blockers against your real Supabase project. Test fixtures are cleaned up after each test, so nothing persists.

**Important — don't paste secrets in commit messages, PR descriptions, or chat.** Once they're in GitHub Secrets they're encrypted at rest and never logged.

---

## What you'll see in the GitHub UI

After the next push:

- **Actions tab** shows the workflow run with two job badges (`static`, `live`).
- A red ❌ on either job blocks the PR (when branch protection is set up — see "Recommended next" below).
- Click into a job to see the step-by-step output.

If you haven't added the secrets yet:
- `static` runs green.
- `live` runs but every step shows `[skipped]` with a one-line warning explaining why.

---

## Recommended next (not blocking)

When you're ready to enforce the gates:

1. **Branch protection on `main`** (whenever main becomes the rebuild target):
   - GitHub → Settings → Branches → Add rule
   - Branch name pattern: `main`
   - Require status checks: select `static / lint · typecheck · build · pglite migrations` and `live / vitest · launch-blockers (live Supabase)`
   - Require PR before merging
   - This means no one can push directly to main and no PR merges with a red CI.

2. **`pnpm-lock.yaml` enforcement** — already on. The workflow uses `--frozen-lockfile`. Any dependency change must update the lockfile, which is committed.

---

## When CI breaks

- **Static job red**: usually a TypeScript error, ESLint error, broken migration, or build failure. Click the failed step, read the log, fix locally with `pnpm tsc --noEmit && pnpm lint && pnpm build && pnpm validate:migrations`, commit.
- **Live job red, others green**: usually a launch-blocker check failed (something in the DB drifted), or a vitest assertion. Click the failed step.
- **Both red**: a secret got rotated or the workflow YAML has a syntax error.

If the workflow file itself fails to parse, GitHub shows it at the workflow's top-level. Fix the YAML and push again.
