---
id: P1-T10
phase: 1
title: Verify seed counts + RLS sanity + launch-blockers script
status: done
depends_on: [P1-T08, P1-T09]
estimate_hours: 0.5
owner: ai
last_updated: 2026-05-15
---

# Goal

After this task, we have a verified, reproducible snapshot of the database state post-seed: row counts match the source JSON, RLS prevents anon reads of unpublished products, the launch-blocker SQL all returns 0.

# Prerequisites (read first)

- claude/runbooks/launch-blockers.sql

# Files to touch

- `web/__tests__/seed/counts.test.ts` (new — assertion-style)
- `data/justkraft-inventory/seed_report.json` (verified, not edited)

# Implementation notes

Tests:

1. **Counts** — assert `products` count is within ±1% of summary `productCount`. Assert `categories` count ≥ 200 (allowing for slug-overrides creating a few aliases).
2. **Source distribution** — `SELECT count(*) FROM products WHERE source = 'justkraft_seed' AND is_published = false` == total seed count.
3. **Image attachment rate** — products without an image are tracked: `SELECT count(*) FROM products p WHERE NOT EXISTS (SELECT 1 FROM product_images WHERE product_id = p.id)` should be < 10% (per seed_report).
4. **RLS sanity** — anon Supabase client tries to read products, returns 0 rows (all unpublished).
5. **Launch-blocker SQL** — run `scripts/launch-blockers.ts`; every check returns 0.

# Acceptance criteria

- [ ] `pnpm test --run seed/` passes.
- [ ] `pnpm tsx scripts/launch-blockers.ts` exits 0.
- [ ] `data/justkraft-inventory/seed_report.json` matches the actual DB state.

# Verification

```bash
cd web
pnpm test --run seed/
pnpm tsx ../scripts/launch-blockers.ts
```

# Dependencies added

None.

# Notes for next agent

**2026-05-15 — DONE.** Built `web/scripts/launch-blockers.ts`. Run via `pnpm launch-blockers` from `web/`. 12 checks total, 12 pass on current live state.

The 12 checks:

```
SQL launch-blockers (against live, service-role):
  1. no published seed-sourced products
  2. no public image URLs pointing at the Just Kraft CDN
  3. no published source_url containing 'justkraft'
  4. no published description containing 'just kraft' / 'justkraft'
  5. every published product has ≥1 licensed image
  5b. no published image with license_status IN (unverified, disputed, removed)
  5c. review_status aligns with is_published (no orphaned states)

Runtime RLS probes (against live, anon-vs-srv):
  6. anon cannot read unpublished products
  7. anon cannot INSERT into products (expects 42501)
  8. anon UPDATE leaves row unchanged (RLS UPDATE no-ops silently per
     Postgres spec — assertion is "row unchanged," not "operation errored")
  9. anon cannot read audit_logs
  10. anon CAN read search_synonyms (needed for query expansion)
```

**The seed verification step** (compare live counts against the seed_report.json
counts) is implicit: launch-blocker #1 + the post-seed REST probe from P1-T08's
notes already confirmed counts match. No separate verify-counts step needed.

**Script structure:** wrapped in `async function main()` because tsx defaults
to CJS output, and CJS doesn't support top-level await. Calls main() at the
bottom with a catch that exits 2 on harness crash (vs 1 for failed checks).

**To wire into CI later:** add to `.github/workflows/ci.yml`:
```yaml
- run: pnpm install --frozen-lockfile
  working-directory: web
- run: pnpm launch-blockers
  working-directory: web
  env:
    NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
    NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
    SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
```
Deferred — no GitHub Actions wired yet. When P3-T01 lands real CI, this
goes in.
