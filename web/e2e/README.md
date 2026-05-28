# E2E (Playwright) — admin critical flows

Browser automation that drives the real admin UI (login, product edit,
bulk actions, trash) and verifies the wiring the data-layer vitest
suites can't: that buttons call their actions and results render.

**Runs against a LOCAL Supabase stack — never production.** E2E mutates
catalog data through the UI; pointing it at the real project would
pollute it. The seed script refuses to run unless the Supabase URL is
local.

## One-time setup

```bash
cd web

# 1. Local Supabase (needs Docker running)
pnpm dlx supabase start          # boots local Postgres + Auth + Storage
pnpm dlx supabase db reset       # applies all migrations to the local DB

# 2. Point E2E at the local stack
cp e2e/.env.e2e.example e2e/.env.e2e
#   then paste the anon + service_role keys from:
pnpm dlx supabase status

# 3. Seed the TOTP test admin (creates e2e-admin@bhavani.test, role=owner)
pnpm e2e:seed

# 4. Install the browser (one-time, ~100MB)
pnpm exec playwright install chromium

# 5. (optional) seed a few products so the product-edit spec has a row
#    — either run the importer in the UI or insert a couple manually.
```

## Run

```bash
pnpm test:e2e              # headless, boots `pnpm dev` automatically
pnpm test:e2e --ui        # Playwright UI mode (watch + time-travel)
pnpm test:e2e --project=anon   # just the anonymous guard specs
```

## Layout

```
e2e/
  constants.ts        test-admin creds + file paths
  seed-admin.ts       ensures the TOTP admin (pnpm e2e:seed)
  auth.setup.ts       logs in via UI (password + TOTP), saves storageState
  anon/*.spec.ts      unauthenticated flows (auth guard, public pages)
  admin/*.spec.ts     authed flows (reuse the stored session)
  .auth/              gitignored — storageState + TOTP secret
  .env.e2e            gitignored — local stack keys
```

## Why local, not the cloud project

The data-layer vitest suites run against the shared cloud project and
clean up via the `zzz-` prefix because they're surgical (direct
function calls). E2E drives full UI flows that touch real catalog rows
and can leave junk on a failed run — so it gets its own disposable
local database. `supabase db reset` gives every run a clean slate.

## CI

A separate `e2e` job (see `.github/workflows/ci.yml`) boots the local
stack in the runner, seeds, installs chromium, and runs the suite. It
does not gate the `static` / `live` jobs.
