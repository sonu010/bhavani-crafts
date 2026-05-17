---
id: P2-T06
phase: 2
title: Admin dashboard (counts + widgets)
status: not_started
depends_on: [P2-T05]
estimate_hours: 2
owner: ai
last_updated: 2026-05-17
---

# Goal

After this task, `/admin` (replacing the placeholder shipped in P2-T05) renders a 2×3 grid of six diagnostic widgets, all visible above the fold on desktop. The widgets are: Catalog counts, Searches with 0 results (top-5), Mutations this week (top-5 action types), AI spend MTD (vs. budget bar), Broken images, Background jobs (current running). No revenue / customer / conversion widgets — MVP has no checkout, no accounts, no orders, and inventing those numbers would be lying.

# Prerequisites (read first)

- [claude/SESSION-RESUME.md](../../SESSION-RESUME.md) §"Admin dashboard at `/admin`" — the locked 2×3 grid, verbatim
- [claude/SESSION-RESUME.md](../../SESSION-RESUME.md) §"'Frequent customers' — explicitly rejected for MVP" — the rationale we cite when stakeholders ask "why no revenue widget?"
- [claude/architecture/database-schema.md](../../architecture/database-schema.md) §"audit_logs", §"search_logs", §"ai_generations", §"background_jobs", §"product_images"
- [claude/architecture/design-system.md](../../architecture/design-system.md) — card patterns, JetBrains Mono for numerics
- [P2-T04](P2-T04-middleware-admin-gate.md) — `requireRole` posture
- [P2-T05](P2-T05-admin-shell-layout.md) — the surrounding shell

# Files to touch

- `web/src/app/admin/page.tsx` (modified) — server component. Calls six parallel data-layer reads via `Promise.all`. Renders `<DashboardGrid>` with the results.
- `web/src/app/admin/_widgets/catalog-counts.tsx` (new)
- `web/src/app/admin/_widgets/zero-result-searches.tsx` (new)
- `web/src/app/admin/_widgets/mutations-this-week.tsx` (new)
- `web/src/app/admin/_widgets/ai-spend-mtd.tsx` (new)
- `web/src/app/admin/_widgets/broken-images.tsx` (new)
- `web/src/app/admin/_widgets/running-jobs.tsx` (new)
- `web/src/lib/db/admin/dashboard.ts` (new) — six exported functions: `getCatalogCounts(supabase)`, `getZeroResultSearches(supabase, sinceDays)`, `getMutationsThisWeek(supabase)`, `getAISpendMTD(supabase)`, `getBrokenImagesCount(supabase)`, `listRunningJobs(supabase)`. Service-role required for `audit_logs`, `search_logs`, `ai_generations`; pass `createAdminClient()` at the call site.
- `web/__tests__/db/admin/dashboard.test.ts` (new) — one integration test per function, asserting shape only (counts may be 0 in test DB).

# Implementation notes

**Widget layout — locked (verbatim from SESSION-RESUME):**

```
┌─Catalog─────────┐  ┌─Searches with 0 results─────┐
│ N total         │  │ "stencil 4x4"      12×       │
│ N published     │  │ "wax seal kit"      7×       │
│ N out of stock  │  │ "monsoon resin"     4×       │
│ N uncategorized │  └──────────────────────────────┘
└─────────────────┘
┌─Mutations this week─────────┐  ┌─AI spend MTD────┐
│ product.update     87        │  │ $3.42 / $20.00  │
│ product.create      5        │  │ ███             │
│ category.update     2        │  │  17%   ✓ ok     │
└──────────────────────────────┘  └─────────────────┘
┌─Broken images─────┐  ┌─Background jobs──────────┐
│ 0 disputed        │  │ csv_import  ●●●●●○  82%  │
└───────────────────┘  └──────────────────────────┘
```

**Diagnostic, not BI.** Each widget answers "is something wrong / what should I attend to today?". None measures business performance. Stakeholders asking for revenue widgets get pointed at [SESSION-RESUME §"'Frequent customers' — explicitly rejected for MVP"](../../SESSION-RESUME.md) — there is no checkout, no accounts, no orders. Revisit in Phase 5+ when those land.

**Data per widget:**

| Widget | Source | Query shape |
|---|---|---|
| Catalog counts | `products` | `count(*) filter (where ...)` for total / published / out_of_stock / uncategorized (category_id IS NULL) — single SQL with four counts |
| Zero-result searches | `search_logs` | `WHERE result_count = 0 AND created_at > now() - interval '14 days' GROUP BY query ORDER BY count DESC LIMIT 5` |
| Mutations this week | `audit_logs` | `WHERE created_at > date_trunc('week', now()) GROUP BY action ORDER BY count DESC LIMIT 5` |
| AI spend MTD | `ai_generations` | `sum(usd_cost) WHERE created_at > date_trunc('month', now())` — budget threshold hard-coded `20.00` (revisit when real AI lands in Phase 4) |
| Broken images | `product_images` | `WHERE license_status IN ('disputed','removed') AND deleted_at IS NULL` |
| Running jobs | `background_jobs` | `WHERE status IN ('queued','running') ORDER BY created_at DESC LIMIT 5` |

**Render strategy.** Server component. Each widget is its own React component but data fetches happen in `page.tsx` so we can `Promise.all` them. No client-side data fetching; admin is `force-dynamic` and each widget is essentially a cheap aggregate.

**Numerics in JetBrains Mono.** Per [design-system.md](../../architecture/design-system.md), all counts (`N total`, `$3.42`, `87`, `4×`) render in JetBrains Mono. Widget titles ("Catalog", "AI spend MTD") render in Manrope.

**Empty states.** Every widget gracefully handles zero data. Zero-result searches with no qualifying rows shows "No searches with zero results in the last 14 days" — full sentence, `stone-500` text. Don't hide the widget.

**Loading state.** Server component → no client loading state needed. If a query is slow, the whole page is slow; the response-time budget is < 500 ms total. Each query has a covering index from Phase 1; if any breaches budget, fix the index, don't add a spinner.

**Performance budget.** All six queries combined must complete in ≤ 200 ms p50 on Supabase. If `mutations-this-week` or `ai-spend-mtd` becomes slow at scale, materialize a daily rollup table; deferred until measured.

# Acceptance criteria

- [ ] `/admin` renders six widgets in a 2×3 grid on desktop, single column on mobile (<640px).
- [ ] Catalog widget shows total, published, out-of-stock, uncategorized counts. Numbers in JetBrains Mono.
- [ ] Zero-result searches widget shows top 5 queries with `result_count=0` in the last 14 days, sorted by occurrence.
- [ ] Mutations widget shows top 5 action types this week, sorted by count.
- [ ] AI spend widget shows `<USD spent> / $20.00` and a progress bar (`teal-800` fill, `husk-200` track). When at ≥ 80% of budget, bar tints `saffron-500`; at 100% tints `brick-600`.
- [ ] Broken images widget shows count of `license_status IN ('disputed','removed')`.
- [ ] Background jobs widget shows up to 5 running/queued jobs with progress.
- [ ] All six data functions in `lib/db/admin/dashboard.ts` follow DI Supabase pattern (`supabase` as first arg).
- [ ] Integration tests in `__tests__/db/admin/dashboard.test.ts` assert shape; pass against live DB.
- [ ] Lighthouse Performance ≥ 95 on this page (no client JS beyond the layout shell from P2-T05).
- [ ] `pnpm tsc --noEmit`, `pnpm lint`, `pnpm build` green.

# Verification

```bash
cd web
pnpm tsc --noEmit
pnpm lint
pnpm build
pnpm exec vitest run __tests__/db/admin/dashboard.test.ts

pnpm dev &
sleep 4
# Sign in as admin, visit /admin
# Each widget renders (some may show empty state on a fresh DB — acceptable)
# At 360px viewport, single-column stack
```

# Dependencies added

None.

# Notes for next agent

(empty)
