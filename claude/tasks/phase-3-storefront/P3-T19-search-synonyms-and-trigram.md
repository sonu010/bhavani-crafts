---
id: P3-T19
phase: 3
title: Search — synonyms + trigram polish
status: done
depends_on: [P3-T18]
estimate_hours: 2
owner: ai
last_updated: 2026-05-29
---

# Goal

Search quality pass: confirm synonym expansion ("colour"→"color",
"mould"→"mold", "epoxy"↔"resin") and trigram typo tolerance behave on
real queries, seed the baseline `search_synonyms` rows, and tune the
trigram threshold so near-miss typos match without flooding noise.

# Prerequisites (read first)

- claude/architecture/search.md §"Synonym table", §"Trigram threshold
  — known issue"
- `web/src/lib/db/search.ts` — `fetchSynonyms`, `buildTsquery`
- `web/supabase/migrations/0005_search.sql` — `search_synonyms`,
  trigram indexes

# Files to touch

- `web/supabase/migrations/<NNNN>_seed_search_synonyms.sql` (new, if
  baseline synonyms aren't already seeded) — INSERT the craft-domain
  synonym set; idempotent (ON CONFLICT DO NOTHING) + smoke block.
- `web/src/lib/db/search.ts` (modified, if tuning needed) — adjust the
  trigram similarity threshold.
- `web/__tests__/db/search-synonyms.test.ts` (modified/extend) — assert
  the expansions resolve.

# Implementation notes

- **Check what 0005 already seeded.** If the synonym table is empty,
  add a seed migration with the craft set (resin/epoxy, colour/color,
  mould/mold, glitter, stencil, etc.). Validate via pglite first.
- **Trigram threshold:** search.md flags a known tuning issue — too
  low floods irrelevant matches, too high misses real typos. Test
  with "rezin", "stencle", "gliter" and pick a threshold (likely
  ~0.3) via `set_limit()` or in the query.
- This is mostly a quality/verification task on top of T18's plumbing;
  keep changes minimal + test-backed.

# Acceptance criteria

- [ ] Baseline craft synonyms present (seeded + smoke-tested).
- [ ] "colour"→color, "mould"→mold, "epoxy"↔resin return the same
      result set as their canonical term.
- [ ] "rezin" / "stencle" still match via trigram at the chosen
      threshold.
- [ ] `pnpm validate:migrations` green (if migration added);
      synonym tests green.
- [ ] tsc + lint + build green.

# Verification

```bash
cd web
pnpm validate:migrations
pnpm exec vitest run __tests__/db/search-synonyms.test.ts
pnpm dev
# /search?q=colour and /search?q=color → same results
# /search?q=rezin → resin results
```

# Dependencies added

(none)

# Notes for next agent

  - **Verification-only.** All 7 craft-domain synonyms (acrylic, colour,
    glitter, gsm, mdf, mould, resin) are already seeded by P1-T05; the
    14 vitest specs in `__tests__/db/search-synonyms.test.ts` +
    `search.test.ts` all green. No new migration needed.
  - **Trigram threshold parked.** `architecture/search.md` §"Trigram
    threshold — known issue" documents that long product names dilute
    the similarity score (e.g. similarity('Resin epoxy 100ml clear
    casting kit', 'rezin') = 0.079, far below the 0.3 default). The
    storefront search currently falls back to FTS-only when synonyms
    don't help. Fix is per-word trigram tokenization (or `pg_trgm`'s
    `strict_word_similarity`) — bigger lift than the spec warranted,
    flagged for a Phase-4 quality pass.
