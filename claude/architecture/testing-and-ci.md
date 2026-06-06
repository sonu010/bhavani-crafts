# Testing and CI

How we verify changes before they reach production. Every layer has one purpose; no overlap.

## The verification stack

```
┌─────────────────────────────────────────────────────────────────┐
│  pnpm tsc --noEmit          Strict TS over src/ + relevant tests │
│  pnpm lint                  ESLint over src/                     │
│  pnpm validate:migrations   All .sql against pglite Postgres 17  │
│  pnpm build                 Real Next build (same as Vercel)     │
│  pnpm test:setup            Boot LOCAL Supabase + migrate + seed │
│  pnpm test                  Integration tests vs LOCAL stack     │
│  pnpm launch-blockers       Deploy gate: SQL + RLS attack probes │
│  pnpm test:e2e              Playwright vs LOCAL prod build       │
└─────────────────────────────────────────────────────────────────┘
       │                                                           │
       │  Run pre-commit by hand for now (Husky hook is P2-T01)   │
       ▼                                                           │
   GitHub Actions: .github/workflows/ci.yml                        │
       │                                                           │
       ├─ static       (every push + PR, no secrets)               │
       │   lint · tsc · validate:migrations · build                │
       ├─ integration  (local Supabase, no secrets)                │
       │   vitest · launch-blockers                                │
       └─ e2e          (local Supabase, no secrets)                │
           Playwright (login · 2FA · admin flows)                  │
                                                                    │
   .github/workflows/backup.yml — nightly READ-ONLY prod snapshot  │
```

## Patterns

### Dependency-injected Supabase client

**Locked.** Every function that queries the database takes a `SupabaseClient<Database>` as its first argument. No magic global. No context provider. See [ADR-010](../decisions/ADR-010-pglite-and-di-supabase.md).

```ts
// lib/db/products.ts
export async function listProducts(
  supabase: SupabaseClient<Database>,
  opts: ListProductsOpts,
): Promise<ListProductsResult> { … }
```

Why: the same function works from:
- **Server components** — `const supabase = await createServerClient()` (cookie-authed; RLS public-only)
- **Server actions** — same
- **Admin server actions** — `const supabase = createAdminClient()` (service-role; bypasses RLS)
- **Scripts** — service-role with no session
- **Tests** — anon or service-role, directly constructed via `createClient(url, key)`

No global state. No conditional imports. Every call site declares which role it's using.

Phase 2 admin code follows the same pattern. Mutation server actions look like:

```ts
"use server";
export async function deleteProduct(id: string) {
  const supabase = await createServerClient();
  await requireRole(supabase, "admin");
  const admin = createAdminClient();  // bypass RLS for the actual write
  await admin.from("products").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  revalidateTag("products");
}
```

### pglite for pre-push migration validation

**Locked.** Every change to `web/supabase/migrations/*.sql` runs through `pnpm validate:migrations` before push. The script applies the full chain against embedded Postgres 17 (`@electric-sql/pglite`) and asserts via each migration's smoke block. See [ADR-010](../decisions/ADR-010-pglite-and-di-supabase.md).

Catches at validate time:
- Syntax errors (commas, parens, end-of-block markers)
- Forward references (function bodies referencing tables that don't exist yet)
- CHECK constraint violations in smoke data (e.g. slug regex)
- Function-language-vs-table-existence mismatches

**Doesn't catch:** RLS policy correctness (pglite doesn't simulate real auth roles), Supabase-specific extensions or auth schema specifics, real-data quirks. Those land on a live integration test instead.

The validator stubs `auth.users` + `auth.uid()` so RLS policies that reference them parse. It pre-loads `pg_trgm` from the pglite contrib bundle so trigram operator classes work. It strips `CREATE EXTENSION` lines (Supabase manages those).

### Smoke blocks inside migrations

Every migration ends with a `DO $$ ... $$` block that:
1. Inserts the rows the migration's constraints are supposed to govern.
2. Tries operations that should fail and wraps them in `EXCEPTION WHEN ... THEN NULL` to verify the rejection.
3. Deletes the test rows.
4. `RAISE EXCEPTION` if cleanup leaves residue.

This is in the migration itself, not the validator, so it runs in every environment (pglite, live). If a migration applies successfully, it has proven its own correctness. Documented examples in 0001 (slug regex), 0002 (attribute value-type trigger), 0004 (publish-state invariants), 0005 (FTS round-trip + trigram reachability), 0006 (policy presence assertions), 0007 (recursive view + soft-delete behavior).

### The test environment (local Supabase — NOT production)

**All fixture-creating suites run against a disposable LOCAL Supabase
stack, never the live project.** This is a hard prod-data-safety contract:
the vitest suites INSERT/DELETE rows (`makeTestProduct`, `purgeZzzFixtures`,
the global `afterAll`) and a stray slug or DELETE against prod could damage
real catalog data.

Bring the environment up once (Docker required):

```bash
cd web
pnpm test:setup     # supabase start && supabase db reset && write-test-env.mjs
pnpm test           # vitest against the local stack
```

- `scripts/write-test-env.mjs` reads `supabase status -o env` and writes
  `web/.env.test` (vitest) + `web/e2e/.env.e2e` (Playwright) — no manual
  key-pasting. Re-run via `pnpm db:reset:test` after a schema change.
- `supabase/seed.sql` is applied by every `db reset`: 4 categories, 5
  published + 3 `needs_review` products, images (`license_status='owned'`
  so launch-blockers pass), tags. Deterministic, non-`zzz-` so the fixture
  purge leaves it intact. NOT shipped to prod (`db push` is migrations only).
- `config.toml [auth.mfa.totp]` is enabled locally (mirrors prod) so the
  MFA tests + the E2E admin seed can enroll/verify a factor.

**Guardrail.** `vitest.setup.ts` loads `.env.test` (falling back to
`.env.local` only to produce a precise error) and then **hard-refuses any
non-local Supabase URL** unless `ALLOW_NONLOCAL_TEST_DB=1` is set.
`__tests__/db/_clients.ts` re-asserts the same before building the
service-role client (defense in depth). A typo can no longer point the
destructive suites at production.

### Vitest integration tests

`web/__tests__/**/*.test.ts` runs against the local stack using the DI pattern. Each test:
1. Creates fixtures via a service-role client (`makeTestProduct` helper).
2. Runs the function-under-test via an anon client (RLS-respecting).
3. Asserts both the data shape AND the security posture (e.g. unpublished rows invisible).
4. Cleans up the fixture in `afterAll`.

The `__tests__/db/_clients.ts` exports both clients. Mixing roles in the same assertion is forbidden.

**Fixture naming convention:** all transient test rows use slugs prefixed `zzz-` so they sort last in any UI and a stale fixture is trivially queryable for cleanup. A global `afterAll` in `vitest.setup.ts` purges any `zzz-` residue per file.

### Launch-blockers script (`pnpm launch-blockers`)

`web/scripts/launch-blockers.ts` is the deploy gate. 12 checks total:

- **7 SQL checks** — all "expected count = 0" against live: no published seed leakage, no public Just Kraft CDN URLs, no unlicensed published images, review-status alignment.
- **5 runtime RLS probes** — anon client cannot read unpublished products, cannot read audit_logs, cannot mutate anything; UPDATE no-ops silently (Postgres RLS spec) so the assertion is "row name unchanged" not "operation errored."

Exits 0 on green, 1 on any failed check, 2 on harness crash. It reads its target from `process.env` (falling back to `.env.local`), so CI runs it against the **local** stack (the RLS probes create + delete `zzz-` fixtures — we don't want those on prod). For an actual production deploy, run it against prod by hand. The 7 SQL checks mirror `claude/runbooks/launch-blockers.sql`.

### `next build` typecheck scope

Next runs `tsc --noEmit` over everything in `tsconfig.json`'s `include`. CLI scripts and integration tests are NOT part of the deployed bundle, so excluding them from the build's typecheck is correct.

Current `tsconfig.json` exclusions: `node_modules`, `scripts/**`, `__tests__/**`, `vitest.config.ts`, `vitest.setup.ts`.

These dev-tooling files retain their own typecheck paths:
- `scripts/*.ts` → `tsx` (transpile mode) when run directly
- `__tests__/*.test.ts` → vitest's own resolver
- Both can be checked explicitly with `tsc --noEmit -p tsconfig.scripts.json` once a separate config exists (deferred — `tsx`'s loose check has caught nothing in practice)

Why this matters: a stale CLI script type error caused Vercel commit `cdb0999` to fail. Once the build's tsc scope was narrowed to just the application, the failure mode went away — CLI tools are CLI tools, not app code.

## CI workflow (`.github/workflows/ci.yml`)

Three jobs, all on every push + PR, **none touching production**. No
fixture-creating test runs against the live project anymore (the old
`live` job that did was removed — it wrote `zzz-` rows to prod on every
push).

### `static` (no secrets needed)

| Step | Command | Catches |
|---|---|---|
| Install | `pnpm install --frozen-lockfile` | lockfile drift |
| Lint | `pnpm lint` | style + unused vars + ESLint rules |
| Typecheck | `pnpm exec tsc --noEmit` | type errors in `src/` |
| Validate migrations | `pnpm validate:migrations` | migration drift / syntax / smoke failures |
| Build | `pnpm build` | full Vercel-equivalent build (placeholder Supabase URL) |

### `integration` (local Supabase, no secrets)

`needs: static`. Boots a local stack in the runner and runs the
destructive suites against it:

| Step | Command |
|---|---|
| Start stack | `supabase start` (via `supabase/setup-cli`) |
| Migrations + seed | `supabase db reset` |
| Write env | `node scripts/write-test-env.mjs && cp .env.test .env.local` |
| Integration tests | `pnpm test` (all `__tests__/`) |
| Launch-blockers | `pnpm launch-blockers` (against local) |

### `e2e` (local Supabase, no secrets)

`needs: static`. Boots a local stack, seeds the TOTP admin, installs
chromium, and runs Playwright against a **production build** of the app
(`pnpm build && pnpm start` via the `webServer`). Uploads the Playwright
report as an artifact on failure.

### Production is touched only by the nightly backup

`.github/workflows/backup.yml` runs `pnpm backup:live` on a daily cron
(and on-demand) — a **read-only** JSON snapshot of the catalog uploaded as
a 90-day artifact. Gated on the three Supabase secrets; skips if unset.
See `claude/runbooks/backup-and-restore.md`.

## What CI does NOT do (yet)

- **Husky pre-commit hooks.** Local-only safety net. Deferred to P2-T01.
- **Lighthouse CI.** Storefront-perf gate. Lands in P3-T23.
- **`size-limit` bundle budget.** Lands when storefront pages exist (Phase 3).
- **Sentry source-map upload.** Lands in P5-T05.
- **Dependabot.** Recommend enabling on the repo via GitHub UI; no workflow code needed.

## When CI breaks

- **`static` red** → application code or migration. Click the failed step. Reproduce locally with the same command.
- **`integration` red, `static` green** → data-layer regression or a launch-blocker condition violated. Reproduce locally: `pnpm test:setup && pnpm test && pnpm launch-blockers`. Most likely a published product without a licensed image (launch-blocker #5), or an RLS policy change that regressed an attack probe.
- **`e2e` red** → a UI flow broke (download the `playwright-report` artifact). Reproduce: `pnpm test:e2e:setup && pnpm test:e2e`. Common causes: a soft-nav `waitForURL(...,{load})` hang, or a loose text matcher (see `e2e/README.md` gotchas).
- **A job can't boot the stack** → `supabase start` failed in the runner (Docker/image pull). Re-run; if persistent, pin the `supabase/setup-cli` version.

The workflow file's YAML is verified locally on each commit by piping through `pnpm dlx js-yaml`. If it parses there, it parses on GitHub.

## What you run locally before pushing

Everything Phase 1-onward, ordered fast → slow (Docker must be running for
the local-stack steps):

```bash
cd web
pnpm tsc --noEmit            # ~3s
pnpm lint                    # ~3s
pnpm validate:migrations     # ~6s   (pglite)
pnpm test:setup              # ~40s  (once per session — boots local stack + seed + env)
pnpm test                    # ~12s  (vitest vs LOCAL stack)
pnpm launch-blockers         # ~10s  (point at local: `set -a; . ./e2e/.env.e2e; set +a`)
pnpm build                   # ~30s  (full)
pnpm test:e2e                # ~2min (Playwright vs local prod build; run before auth/admin changes)
```

`pnpm test:setup` is a one-time-per-session bring-up; after that `pnpm
test` is fast. The first four are sufficient for most changes. Run
`pnpm test:e2e` when you touch auth, the admin shell, or any
server-action-backed form. `pnpm build` is only needed for `next.config.ts`,
dependency, or client/server-boundary changes.
