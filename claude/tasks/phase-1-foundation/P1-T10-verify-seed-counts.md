---
id: P1-T10
phase: 1
title: Verify seed counts + RLS sanity
status: not_started
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

(filled in when status → done)
