# ADR-004 — Postgres FTS + pg_trgm for MVP search, no external search service

**Status:** Accepted · **Date:** 2026-05-15

## Context

We need search over 8,509 → ~50k products with typo tolerance, synonym expansion, and reasonable relevance. Options:

- **A:** Postgres full-text search (`tsvector`) + `pg_trgm` for typo tolerance + `search_synonyms` table.
- **B:** Meilisearch (self-hosted or Meilisearch Cloud).
- **C:** Typesense, Algolia, OpenSearch, or similar.

## Decision

**A — Postgres FTS + pg_trgm + synonyms table.**

## Consequences

**Positive:**
- No additional service, dashboard, secret, or bill.
- Indexes live in the same DB as the data; no sync layer to break.
- p95 query time ≤ 80 ms is achievable at our scale per [performance budget](../architecture/search.md).
- `search_logs` lives in the same DB — easy to power "queries with 0 results" admin widget.

**Negative:**
- Relevance is worse than purpose-built engines for fuzzy/multi-language queries — acceptable for English + occasional Hindi-Romanization in Indian craft vocabulary.
- No built-in autocomplete (we don't need it at MVP).
- Scaling past ~100k products may require a denormalized listing table or move to (B).

## Revisit trigger

Move to Meilisearch (or Typesense) when **two** of these are true:
1. Catalog exceeds 100k products.
2. p95 search query time consistently exceeds 200 ms despite index tuning.
3. Admin complaints about relevance / typo tolerance reach a count of 10+ in `audit_logs`.
