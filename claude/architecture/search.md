# Search

MVP search uses Postgres FTS + `pg_trgm` for typo tolerance + a `search_synonyms` table for craft-specific term expansion. No external search service. See [ADR-004](../decisions/ADR-004-postgres-fts-no-meilisearch.md).

## Capabilities (MVP)

- Exact match on `sku` (case-insensitive)
- Word match on `name` + `description` via tsvector
- Typo tolerance ("rezin" → "resin") via trigram similarity
- Synonym expansion ("colour" → "color", "mould" → "mold", "epoxy" ↔ "resin") via `search_synonyms`
- Sort by relevance; secondary tiebreakers: trigram similarity, recency
- Empty-result suggestion: when 0 results, log the query to `search_logs`, return "no results" UI with related categories

## Query pipeline

```
1. user types "rezin moulds 50ml"
2. trim, lowercase, strip non-alphanumeric except spaces and hyphens
3. expand: look up each token in search_synonyms; replace or augment with synonyms
   "rezin"   → ["rezin", "resin"]
   "moulds"  → ["moulds", "molds"]
   "50ml"    → ["50ml"]
4. exact-SKU shortcut: if the original query (uppercased, trimmed) matches a SKU, return that product first
5. Postgres query:
   SELECT ...,
     ts_rank(fts, plainto_tsquery('english', $expanded)) AS rank,
     similarity(name, $original) AS trgm_score
   FROM products
   WHERE deleted_at IS NULL
     AND is_published = true
     AND (
       fts @@ plainto_tsquery('english', $expanded)
       OR name % $original   -- trigram fallback
       OR sku ILIKE $1 || '%'
     )
   ORDER BY (rank * 0.7 + trgm_score * 0.3) DESC, created_at DESC
   LIMIT 24
6. write a search_logs row with the original query and result_count
```

The `fts` column on `products` is a generated column:

```sql
ALTER TABLE products ADD COLUMN fts tsvector GENERATED ALWAYS AS (
  to_tsvector('english',
    coalesce(name, '') || ' ' ||
    coalesce(short_description, '') || ' ' ||
    coalesce(description, '')
  )
) STORED;

CREATE INDEX products_fts_idx ON products USING GIN (fts);
CREATE INDEX products_name_trgm_idx ON products USING GIN (name gin_trgm_ops);
CREATE INDEX products_sku_trgm_idx  ON products USING GIN (sku gin_trgm_ops);
```

## Synonym table

```sql
search_synonyms (
  id       uuid pk,
  term     text not null unique,
  synonyms text[] not null default '{}',
  created_at, updated_at
)
```

Seeded by P1-T05 with a small craft-specific list:

```
mould    → mold, mold, molds, moulds
colour   → color, colors, colours
resin    → epoxy, epoxy resin
mdf      → wood, mdf board, mdf cutout
glitter  → sparkle, shimmer
beads    → charms (only if context calls for it — verify by hand)
acrylic  → acrylic paint
gsm      → grammage
```

The list grows organically via the **synonym mining** feature in Phase 4 (P4-T09): a job reads `search_logs` for queries with `result_count = 0`, asks Claude Haiku for likely synonym candidates, and stores them as `proposed` rows for admin to accept.

## What we do NOT do in MVP

- No external search service (Meilisearch, Typesense, Algolia, OpenSearch). Re-evaluate at > 100k products. See [ADR-004](../decisions/ADR-004-postgres-fts-no-meilisearch.md).
- No autocomplete / type-ahead suggestions. Add when query volume warrants it.
- No personalization. No "trending searches."
- No filter-after-search composability (the search results page is its own thing; filters live on category pages). Acceptable for MVP given craft-supply browsing patterns.

## Trigram threshold — known issue

Measured values from pglite (Postgres 17 + pg_trgm):

| name (in DB)                               | query   | `similarity()` |
|---|---|---|
| `Resin`                                    | `rezin` | 0.333 |
| `Resin epoxy`                              | `resi`  | 0.308 |
| `Resin epoxy 100ml clear casting kit`      | `rezin` | **0.079** |

The default `pg_trgm.similarity_threshold` is **0.3**. The `%` operator uses that threshold. Long product names dilute the similarity score because trigrams from unrelated words (epoxy, 100ml, casting, kit) reduce the match ratio.

**This means the WHERE clause in the production query above (`name % $original`) will MISS typos against long-named products with default settings.** This is a real correctness issue, not just an MVP polish item.

Options when we implement the search query handler:

1. **Lower threshold per query** — `SELECT set_limit(0.15)` in the same transaction before the search. Easy, but tunes globally per session.
2. **Use `similarity()` directly with a per-query threshold** — `WHERE similarity(name, $original) >= 0.15`. Explicit, but loses the GIN-index acceleration that `%` provides.
3. **Tokenize the query and OR each word** — for each word in the user query, run `name % $word`. Hits long names because we compare per-word. Adds query complexity but is the right shape.
4. **Move to a search engine** (Meilisearch, Typesense) — overkill at MVP; per ADR-004 we revisit at > 100k products.

**Decision deferred** to when we build the search query handler in Phase 3 (P3-T18/T19). Recommended first attempt: option 3 (tokenize + OR), with a SELECT performance test against seed data; fall back to option 2 if option 3's plan is bad.

## Performance budget

- p95 FTS query time: ≤ 80 ms (enforced in CI via a perf test against seed data).
- Result page TTFB: ≤ 500 ms cold edge, ≤ 200 ms warm.
- The `search_logs` insert is async (`waitUntil(...)`) so it doesn't block the response.

## Implementation files

- `web/src/lib/search/expand.ts` — synonym expansion
- `web/src/lib/db/search.ts` — typed Supabase query
- `web/src/app/search/page.tsx` — server component
- `web/src/components/search/SearchInput.tsx` — debounced input in navbar
