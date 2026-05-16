# Build progress

Last updated: 2026-05-16

## Counts

- ✅ Done: **22** (Phase 0: 11/11 · Phase 1: 11/11)
- 🟡 In progress: 0
- 🚧 Blocked: 0
- ⏸️ Deferred: 1 (P0-T03 — cart store port; pulled at P3-T21)
- ⬜ Not started: 73

## Phase 1 — complete

All migrations applied, data layer typed + tested, launch-blockers passing, schema doc verified against live.

```
0001_init.sql                    profiles, categories, products + 4 enums
0002_attributes.sql              attribute_definitions, product_attributes + 1 enum, 7 seeded
0003_variants_images_tags.sql    images (license-tracked), options/values, variants, tags + 2 enums
0004_ops_tables.sql              audit_logs, jobs, imports, ai_generations + 4 enums + publish-state trigger
0005_search.sql                  products.fts + GIN/trigram + search_synonyms (7 seeded) + search_logs
0006_rls.sql                     RLS on all 20 tables; 33 policies; child-parent EXISTS pattern
0007_indexes_views.sql           9 catalog indexes + category_with_descendants recursive view

Live schema: 11 enums · 20 tables · 43 indexes · 36 functions
Seed data:   7,780 products · 362 categories · 458 tags · 14,964 images · 8,181 variants
All seeded: is_published=false, source='justkraft_seed', RLS-blocked from anon
```

## What's runnable today

| Command | Effect |
|---|---|
| `pnpm dev` (from web/) | Local dev server on :3000. `/`, `/api/health`, `/design` all live. |
| `pnpm build` | Production build. Catches issues that don't show in dev. |
| `pnpm validate:migrations` | Re-applies all 7 migrations through pglite (Postgres 17 WASM). 6s. |
| `pnpm launch-blockers` | 12 checks against live: seed leakage, license sanity, RLS attack probes. Deploy gate. |
| `./node_modules/.bin/vitest run __tests__/db/` | 21 integration tests of the data layer against live. ~10s. |
| `node scripts/dump-live-schema.mjs` | Refresh the verified-live-state appendix in database-schema.md. |
| `node scripts/seed-from-justkraft.mjs` | Wipe-and-reseed the 7,780-product Just Kraft dev catalog. ~30s. |

## Live deployments

- **Production**: https://bhavani-crafts.vercel.app/ — still serving the legacy prototype from `origin/main`. Untouched.
- **Preview**: https://bhavani-crafts-6cg92t4ki-sonu010s-projects.vercel.app/ — `rebuild-v2`, Phase 0 placeholder + `/api/health` + `/design` (dev-only).

## Awaiting owner action

(none — Phase 1 work is owner-unblocked from here)

The **real-content gate** (`user/05`) opens up later, between Phase 3 and Phase 4 polish. No action needed yet.

## Next 3 to work

1. **P2-T00** — Expand Phase 2 task files (the stubs created in P0-T01 are frontmatter-only; this entry task fleshes them out with lessons learned from Phase 1).
2. **P2-T01** — Supabase Auth (email + password) wiring.
3. **P2-T02** — `profiles` table + sign-up trigger (already present from 0001+0006; this task wires the admin promote flow + auth.uid() helpers).

## Notes log (most recent first)

- 2026-05-16 — **Phase 1 closed.** P1-T10 (launch-blockers script, 12/12 pass) + P1-T11 (schema doc verified appendix, no drift). Ready for Phase 2.
- 2026-05-16 — **P1-T09 done.** Data layer + Zod + 21 integration tests on live.
- 2026-05-15 — **P1-T08 done.** 7,780 products seeded on live; RLS-blocked from anon.
- 2026-05-15 — **P1-T06 + P1-T07 done.** RLS lockdown + recursive view.
- 2026-05-15 — **Engineering principles adopted.** Audit-fix corrected 3 violations.
- 2026-05-15 — **P1-T05 applied.** AI runs `db push` itself from here.
- 2026-05-15 — **Vercel preview verified end-to-end.**
- 2026-05-15 — **Option B applied.** Git relocated to project root.
- 2026-05-15 — **Supabase project linked** (`lyycugadkxjtevmugqol`).
- 2026-05-15 — Plan v2.1 approved.
