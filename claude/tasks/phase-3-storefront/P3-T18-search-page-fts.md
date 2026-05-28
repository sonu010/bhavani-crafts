---
id: P3-T18
phase: 3
title: Search page (FTS)
status: not_started
depends_on: [P3-T01]
estimate_hours: 3
owner: ai
last_updated: 2026-05-18
---

# Goal

`/search?q=...` runs Postgres full-text search over the catalog and
renders results as a `<ProductCard>` grid, with an empty/zero-result
state. Every query (and its result count) is logged to `search_logs`
so the admin dashboard's zero-result widget has data.

# Prerequisites (read first)

- claude/architecture/search.md §"Query pipeline"
- `web/src/lib/db/search.ts` — `searchProducts` (FTS + synonyms +
  trigram already implemented)
- `web/supabase/migrations/0005_search.sql` — `search_logs` table
- P2-T06 — dashboard zero-result widget consumes `search_logs`
- P3-T01 — `<ProductCard>` + header search trigger

# Files to touch

- `web/src/app/(storefront)/search/page.tsx` (new) — server component;
  reads `?q=`, calls `searchProducts`, renders results.
- `web/src/app/(storefront)/site-header.tsx` (modified) — wire the
  search trigger to navigate to `/search?q=` (or open an inline
  command box).
- `web/src/lib/db/search.ts` (modified) — add `logSearch(supabase,
  { query, resultCount })` writing `search_logs`, OR call an insert
  from the page. Keep the write non-blocking (don't fail the page if
  the log insert errors).

# Implementation notes

- **`searchProducts` is done** — pass `q`, get `{ query, expanded,
  items }`. The page renders `items` via `<ProductCardGrid>`.
- **Log every search** (including zero-result) to `search_logs`
  (`query`, `result_count`, `created_at`). This is the PRODUCER for
  the dashboard widget — without it the widget is always empty. Insert
  via the anon cookie client if RLS allows, else a tiny server action;
  swallow insert errors (logging must never break search).
- **Debounce** if you build an inline as-you-type box; otherwise a
  submit-to-`/search?q=` flow is simpler and SSR-friendly. Prefer the
  URL-driven page (shareable, server-rendered) for MVP.
- **Empty state:** "No results for '<q>'. Try fewer words." Show the
  `expanded` query subtly for transparency (optional).
- **Min query length:** ignore < 2 chars (matches `tokenize`).

# Acceptance criteria

- [ ] `/search?q=resin` returns FTS matches as a card grid.
- [ ] Typo ("rezin") still matches via the existing trigram fallback.
- [ ] Every query writes a `search_logs` row with the result count;
      zero-result queries are logged too.
- [ ] Log-insert failure does not break the page.
- [ ] Empty state renders for no results.
- [ ] No horizontal scroll at 360px.
- [ ] tsc + lint + build green.

# Verification

```bash
cd web && pnpm dev
# /search?q=resin → results; /search?q=zxqw → empty state
# Admin dashboard → zero-result widget shows the zxqw query
```

# Dependencies added

(none)

# Notes for next agent

(empty)
