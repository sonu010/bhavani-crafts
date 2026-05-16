# ADR-010 — pglite pre-push validation + dependency-injected Supabase client

**Status:** Accepted · **Date:** 2026-05-16 · **Authors:** Owner + Claude

## Context

Two related concerns surfaced during Phase 1 schema work and the subsequent data-layer build:

1. **Where do we run migrations to verify them before pushing to live Supabase?** Two failed `supabase db push` runs against live during P1-T01 (function-ordering bug, then smoke-data slug regex) cost the owner real friction. We needed a way to apply migrations locally first.
2. **How do data-layer functions accept a Supabase client?** Options ranged from a magic global, to a React context, to passing a client at every call site.

These two pieces interact: a local validator that also runs the application's query functions needs the functions to be callable with an arbitrary client.

## Decision

### 1. pglite for pre-push migration validation

`web/scripts/validate-migrations.mjs` applies every `web/supabase/migrations/*.sql` in order against an embedded Postgres 17 (`@electric-sql/pglite`, WASM) before any `supabase db push`. Available as `pnpm validate:migrations` (~6s).

The validator:
- Stubs `auth.users` and `auth.uid()` so RLS policies that reference them parse.
- Pre-loads `pg_trgm` from pglite's contrib bundle so trigram operator classes work.
- Strips `CREATE EXTENSION` lines (Supabase manages those at the platform level).
- Smoke blocks inside each migration assert the migration's own constraints (see `architecture/testing-and-ci.md` §"Smoke blocks").

### 2. Dependency-injected Supabase client

Every function in `web/src/lib/db/*.ts` takes `SupabaseClient<Database>` as its first argument. No magic global, no provider, no per-environment branching inside the function.

```ts
export async function listProducts(supabase: SC, opts: ListProductsOpts): Promise<...>
```

The caller passes whatever client is appropriate for the context: cookie-authed server client (server components / actions), service-role client (admin actions / scripts), or plain anon client (tests).

## Consequences

**Positive:**
- Two failed live pushes in P1-T01 set the bar. After landing the validator and re-validating before each subsequent migration (0002 through 0007), zero pushes to live have failed.
- The DI pattern lets the same `listProducts` function be exercised from a server component, a server action, a CLI script, an integration test, and a CI runner — without code changes.
- Integration tests (`web/__tests__/db/*.test.ts`) are honest. They create real fixtures via service-role, run the data-layer function via an anon client, and assert both the data shape AND the RLS posture in the same test.
- Test fixtures cleanly separated: `zzz-`-prefixed slugs sort last in any UI and are trivially queryable for cleanup.

**Negative:**
- pglite can't simulate real Supabase roles (anon vs authenticated vs service_role). RLS policy correctness still needs a runtime check against the live DB. We have that — `pnpm launch-blockers` runs 5 RLS attack probes against the real anon role.
- pglite adds ~50 MB of WASM to `node_modules`. Acceptable; it's a devDependency.
- Every caller now needs to remember to pass the right client. With three clients (browser, server, admin) and a lint rule on `admin.ts` imports, this stays manageable. The pattern is documented in `architecture/testing-and-ci.md`.

**Two-tier verification model that emerges from these decisions:**

| Layer | Tool | Scope | When |
|---|---|---|---|
| Migration syntax + smoke | `pnpm validate:migrations` (pglite) | Local | Before every `supabase db push` |
| Application + RLS correctness | `vitest run` + `pnpm launch-blockers` | Live Supabase | Pre-merge in CI's `live` job |

The first catches almost everything. The second catches the things pglite can't.

## Alternatives considered

- **Docker Postgres locally** — heavier, slower (15s+ startup), more dependencies. pglite is one npm package and starts in under a second.
- **Supabase local stack** — full-featured but a 1+ GB Docker image and many minutes of init. Overkill for validating SQL.
- **Skip local validation, just trust live** — what we tried for the first two pushes. Cost: two failed runs visible to the owner.
- **Global Supabase client** — pollutes module state, breaks SSR per-request authz, makes testing harder. Rejected.
- **React context for Supabase client** — works for client components only. Server components, server actions, scripts, and tests would need their own paths. DI is the simplest pattern that works in all five contexts.

## Revisit triggers

- If pglite stops tracking new Postgres versions, or its pg_trgm contrib falls behind, switch to Docker Postgres for the validator.
- If we ever introduce request-scoped state (per-request feature flags, request IDs in logs) that pollutes the call signature with too many parameters, consider AsyncLocalStorage. Don't pre-empt.
