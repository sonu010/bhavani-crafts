# Build progress

Last updated: 2026-05-16

## Counts

- ✅ Done: **23** (Phase 0: 11/11 · Phase 1: 11/11 · Phase 1.5 CI)
- 🟡 In progress: 0
- 🚧 Blocked: 0
- ⏸️ Deferred: 1 (P0-T03 — cart store; pulled at P3-T21 directly from `origin/main`)
- ⬜ Not started: 72

## Phase 0 + 1 + 1.5 — complete

### Phase 1 schema (live Supabase project `lyycugadkxjtevmugqol`)

```
0001_init.sql                    profiles, categories, products + 4 enums
0002_attributes.sql              attribute_definitions, product_attributes + 1 enum, 7 seeded
0003_variants_images_tags.sql    images (license-tracked), options/values, variants, tags + 2 enums
0004_ops_tables.sql              audit_logs, jobs, imports, ai_generations + 4 enums + publish-state trigger
0005_search.sql                  products.fts + GIN/trigram + search_synonyms (7 seeded) + search_logs
0006_rls.sql                     RLS on all 20 tables; 33 policies; child-parent EXISTS pattern
0007_indexes_views.sql           9 catalog indexes + category_with_descendants recursive view

Live schema: 11 enums · 20 tables · 43 indexes · 36 functions

Catalog (cleaned-fixture, source-of-truth target):
             5,804 products · 353 categories · 14,969 images · 7,802 variants
Live now (pre-cleaner; reseed pending — see follow-ups):
             7,780 products · 362 categories · 14,964 images · 8,181 variants · 458 tags
             All is_published=false, source='justkraft_seed', RLS-blocked from anon
```

### Phase 1.5 — Continuous Integration

- `.github/workflows/ci.yml` — `static` (always) + `live` (gated on secrets). Green on `f1b58e0`, `445d21e`.
- `pnpm validate:migrations` — pglite Postgres 17 validator. ~6s.
- `pnpm launch-blockers` — 12 checks (7 SQL + 5 RLS attack probes). Deploy gate.
- See [architecture/testing-and-ci.md](architecture/testing-and-ci.md) + [ADR-010](decisions/ADR-010-pglite-and-di-supabase.md).

## What runs locally today

| Command (from `web/`) | Purpose | Time |
|---|---|---|
| `pnpm dev` | Local dev server on :3000 | instant |
| `pnpm build` | Production build (same as Vercel) | ~30s |
| `pnpm lint` | ESLint over `src/` | ~3s |
| `pnpm exec tsc --noEmit` | Strict typecheck | ~3s |
| `pnpm validate:migrations` | All 7 migrations through pglite | ~6s |
| `pnpm launch-blockers` | 12 deploy-gate checks against live | ~12s |
| `pnpm exec vitest run __tests__/db/` | 21 data-layer integration tests vs live | ~10s |
| `node scripts/seed-from-justkraft.mjs` | Wipe + re-seed Just Kraft dev catalog | ~30s |
| `node scripts/dump-live-schema.mjs` | Refresh schema-doc appendix | ~10s |

## Live deployments

- **Production**: https://bhavani-crafts.vercel.app/ — legacy prototype from `origin/main`. Untouched.
- **Preview**: https://bhavani-crafts-6cg92t4ki-sonu010s-projects.vercel.app/ — `rebuild-v2`. `/` Phase-0 placeholder · `/api/health` returns `{"ok":true}` · `/design` returns 404 in production (dev-only).

## Commit history at Phase 1 + 1.5 close

```
445d21e  chore: clear lint warnings + fix broken test assertion
f1b58e0  P1.5: GitHub Actions CI (static + live-Supabase gated)
0d9d5d9  fix(build): inline srvCount helper + exclude dev tooling from build typecheck
cdb0999  P1-T10 + P1-T11: launch-blockers script + verified schema doc — Phase 1 closes
518ffee  P1-T09: typed data layer + 21 integration tests, all green
601ad6f  P0-T10 done (Vercel verified) + P1-T08 done (7,780 products seeded on live)
f8ebe8e  P1-T06 + P1-T07: RLS lockdown + catalog indexes + recursive view
2c0d2a6  P1-T03/T04 done + P1-T05 applied: FTS + trigram + synonyms + search_logs
4c1acab  Adopt engineering principles; audit-fix 3 violations
a408e0f  P1-T02 done + P1-T03 + P1-T04: variants/images/tags + ops tables
e518018  P1-T01 done + P1-T02: attributes migration + pglite validator harness
136ab02  P1-T01: fix smoke-block slugs to comply with the check constraint they're testing
035d028  P1-T01: fix is_admin() ordering — must follow profiles table CREATE
268a50c  P1-T01: migration 0001_init.sql — core tables (profiles, categories, products)
289f813  P0-T11: security headers + image remotePatterns + Phase 0 wrap-up
c369523  P0-T06 + P0-T07 + P0-T08 + P0-T09: shadcn primitives, design system, Supabase clients
e40a3d8  P0-T02 + P0-T04: archive legacy prototype, scaffold fresh Next.js 16 app
838c7a3  Option B layout: move git to project root, rebuild-v2 initial commit
```

## Awaiting owner action

- **GitHub Actions secrets** (optional, non-blocking): three values from `web/.env.local` to enable the `live` CI job. See [`user/08`](../user/08-ci-and-github-secrets.md). Without them, `static` runs and `live` auto-skips with a warning.

## Non-blocking follow-ups

- **Re-seed live with the cleaned fixture.** A new `scripts/clean-justkraft-inventory.mjs` rejects 2,701 scrape-failure rows, normalizes 44 SKUs, repairs 16 mojibake names, dedupes 4 duplicates → **5,804 cleaned products** in `data/justkraft-inventory/justkraft_products.cleaned.json`. Live still has the **7,780 pre-cleaner products** from 2026-05-15. The seed script (`web/scripts/seed-from-justkraft.mjs`) is already pointed at the cleaned fixture; one `node scripts/seed-from-justkraft.mjs` from `web/` will wipe-and-reseed. Not urgent — all rows are unpublished + RLS-blocked, so the discrepancy doesn't affect the storefront. Schedule before P3 storefront work begins.

## Next 3 to work (Phase 2)

1. **P2-T00** — Expand Phase 2 task stubs with lessons learned from Phase 1 (DI Supabase client pattern, pglite-test-before-push, fixture cleanup convention, tsconfig exclude pattern).
2. **P2-T01** — Supabase Auth (email + password) — login page + middleware.
3. **P2-T02** — `requireRole(supabase, role)` helper + a runbook for promoting the owner profile.

## Notes log (most recent first)

- 2026-05-16 — **Doc audit + cold-start hygiene.** Added `architecture/testing-and-ci.md` and `ADR-010` to capture the DI-Supabase-client + pglite patterns durably. Fixed P0-T03 status drift (`not_started` → `deferred`). Refreshed engineering-principles audit log.
- 2026-05-16 — **CI live.** GitHub Actions workflow runs lint + tsc + validate:migrations + build on every push; vitest + launch-blockers on `rebuild-v2`. Two consecutive green runs.
- 2026-05-16 — **First Vercel build failure caught a hidden test bug.** `expect(p.base_price_inr).toBeNull;` was missing parens — never ran. CI annotations surfaced it.
- 2026-05-16 — **Phase 1 closed.** P1-T10 (launch-blockers, 12/12) + P1-T11 (schema doc verified appendix).
- 2026-05-16 — **P1-T09 done.** Data layer + Zod + 21 integration tests on live.
- 2026-05-15 — **P1-T08 done.** 7,780 products seeded on live; RLS-blocked from anon.
- 2026-05-15 — **P1-T06 + P1-T07 done.** RLS lockdown + recursive view.
- 2026-05-15 — **Engineering principles adopted.** Audit-fix corrected 3 violations.
- 2026-05-15 — **P1-T05 applied.** AI runs `db push` itself from here.
- 2026-05-15 — **Vercel preview verified end-to-end.**
- 2026-05-15 — **Option B applied.** Git relocated to project root.
- 2026-05-15 — **Supabase project linked** (`lyycugadkxjtevmugqol`).
- 2026-05-15 — Plan v2.1 approved.
