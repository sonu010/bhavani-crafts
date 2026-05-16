# Testing and CI

How we verify changes before they reach production. Every layer has one purpose; no overlap.

## The verification stack

```
┌─────────────────────────────────────────────────────────────────┐
│  pnpm tsc --noEmit          Strict TS over src/ + relevant tests │
│  pnpm lint                  ESLint over src/                     │
│  pnpm validate:migrations   All .sql against pglite Postgres 17  │
│  pnpm build                 Real Next build (same as Vercel)     │
│  pnpm exec vitest run       Integration tests vs live Supabase   │
│  pnpm launch-blockers       Deploy gate: SQL + RLS attack probes │
└─────────────────────────────────────────────────────────────────┘
       │                                                           │
       │  Run pre-commit by hand for now (Husky hook is P2-T01)   │
       ▼                                                           │
   GitHub Actions: .github/workflows/ci.yml                        │
       │                                                           │
       ├─ static  (every push + PR, no secrets)                    │
       │   lint · tsc · validate:migrations · build                │
       │                                                           │
       └─ live    (rebuild-v2 + PRs targeting it, gated on secrets)│
           vitest · launch-blockers                                │
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

### Vitest integration tests

`web/__tests__/db/*.test.ts` runs against live Supabase using the same DI pattern. Each test:
1. Creates fixtures via a service-role client (`makeTestProduct` helper).
2. Runs the function-under-test via an anon client (RLS-respecting).
3. Asserts both the data shape AND the security posture (e.g. unpublished rows invisible).
4. Cleans up the fixture in `afterAll`.

The `__tests__/db/_clients.ts` exports both clients. Mixing roles in the same assertion is forbidden.

**Fixture naming convention:** all transient test rows use slugs prefixed `zzz-` so they sort last in any UI and a stale fixture is trivially queryable for cleanup.

### Launch-blockers script (`pnpm launch-blockers`)

`web/scripts/launch-blockers.ts` is the deploy gate. 12 checks total:

- **7 SQL checks** — all "expected count = 0" against live: no published seed leakage, no public Just Kraft CDN URLs, no unlicensed published images, review-status alignment.
- **5 runtime RLS probes** — anon client cannot read unpublished products, cannot read audit_logs, cannot mutate anything; UPDATE no-ops silently (Postgres RLS spec) so the assertion is "row name unchanged" not "operation errored."

Exits 0 on green, 1 on any failed check, 2 on harness crash. Wired into CI's `live` job. The 7 SQL checks mirror `claude/runbooks/launch-blockers.sql`.

### `next build` typecheck scope

Next runs `tsc --noEmit` over everything in `tsconfig.json`'s `include`. CLI scripts and integration tests are NOT part of the deployed bundle, so excluding them from the build's typecheck is correct.

Current `tsconfig.json` exclusions: `node_modules`, `scripts/**`, `__tests__/**`, `vitest.config.ts`, `vitest.setup.ts`.

These dev-tooling files retain their own typecheck paths:
- `scripts/*.ts` → `tsx` (transpile mode) when run directly
- `__tests__/*.test.ts` → vitest's own resolver
- Both can be checked explicitly with `tsc --noEmit -p tsconfig.scripts.json` once a separate config exists (deferred — `tsx`'s loose check has caught nothing in practice)

Why this matters: a stale CLI script type error caused Vercel commit `cdb0999` to fail. Once the build's tsc scope was narrowed to just the application, the failure mode went away — CLI tools are CLI tools, not app code.

## CI workflow (`.github/workflows/ci.yml`)

Two jobs. Both run on every push + PR; `live` is conditionally skipped.

### `static` (no secrets needed)

| Step | Command | Catches |
|---|---|---|
| Install | `pnpm install --frozen-lockfile` | lockfile drift |
| Lint | `pnpm lint` | style + unused vars + ternary-as-statement + ESLint rules |
| Typecheck | `pnpm exec tsc --noEmit` | type errors in `src/` |
| Validate migrations | `pnpm validate:migrations` | migration drift / syntax / smoke failures |
| Build | `pnpm build` | full Vercel-equivalent build (production bundle) |

Build needs `NEXT_PUBLIC_SUPABASE_URL` for `next.config.ts`'s fail-fast. If secret unset, uses a placeholder URL — the build never calls Supabase, only parses the hostname for `images.remotePatterns`.

### `live` (requires three repo secrets)

Runs only on pushes to `rebuild-v2` and PRs targeting it. Auto-skips with a warning if `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, or `SUPABASE_SERVICE_ROLE_KEY` aren't set on the repo.

| Step | Command | Catches |
|---|---|---|
| Write `.env.local` | (inline) | secrets → file |
| Integration tests | `pnpm exec vitest run __tests__/db/` | data-layer regressions against live |
| Launch-blockers | `pnpm launch-blockers` | seed leakage, RLS regressions |

Test fixtures (slugs prefixed `zzz-`) are cleaned up by each suite's `afterAll`. If a run aborts mid-test, residue is trivially queryable; the launch-blockers script doesn't flag it (different prefix from seed) but a `SELECT * FROM products WHERE slug LIKE 'zzz-%'` after a crash will show it.

## What CI does NOT do (yet)

- **Husky pre-commit hooks.** Local-only safety net. Deferred to P2-T01.
- **Lighthouse CI.** Storefront-perf gate. Lands in P3-T23.
- **Playwright E2E.** End-to-end browser flows. Lands in P3-T22.
- **`size-limit` bundle budget.** Lands when storefront pages exist (Phase 3).
- **Sentry source-map upload.** Lands in P5-T05.
- **Dependabot.** Recommend enabling on the repo via GitHub UI; no workflow code needed.

## When CI breaks

- **`static` red, `live` green or skipped** → application code or migration. Click the failed step. Reproduce locally with the same command.
- **`live` red, `static` green** → data-layer regression or a launch-blocker condition was violated. Most likely:
  - A new published product was added without a licensed image (launch-blocker #5)
  - A seed row was promoted to `is_published=true` without scrubbing `source='justkraft_seed'` (launch-blocker #1)
  - RLS policy was modified and an attack probe regressed
- **Both red** → secret rotation broke the live job, OR the workflow YAML has a syntax error.

The workflow file's YAML is verified locally on each commit by piping through `pnpm dlx js-yaml`. If it parses there, it parses on GitHub.

## What you run locally before pushing

Everything Phase 1-onward, ordered fast → slow:

```bash
cd web
pnpm tsc --noEmit            # ~3s
pnpm lint                    # ~3s
pnpm validate:migrations     # ~6s   (pglite)
pnpm exec vitest run __tests__/db/   # ~10s  (live)
pnpm launch-blockers         # ~10s  (live)
pnpm build                   # ~30s  (full)
```

In practice, the first four are sufficient for most changes. `pnpm build` is only needed when you've changed `next.config.ts`, added a new dep that affects bundling, or changed something the type system can't catch (e.g. a server-component vs client-component boundary).
