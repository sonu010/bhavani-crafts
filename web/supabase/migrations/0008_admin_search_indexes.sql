-- 0008_admin_search_indexes.sql — fill in the search indexes 0005 / 0007 missed
--
-- rollback:
--   DROP INDEX IF EXISTS
--     products_slug_trgm_idx,
--     products_review_status_idx;
--
-- What this migration contains:
--   1 trigram GIN index on products.slug (admin search ILIKE %q% path)
--   1 partial b-tree on products.review_status (chip-count queries)
--   Smoke block asserts both indexes exist
--
-- ─── Why ─────────────────────────────────────────────────────────────────
--
-- 0005_search.sql added trigram GIN on `name` and `sku` but NOT `slug`.
-- The admin product search (lib/db/admin/products.ts) does:
--
--     fts @@ tsquery OR slug ILIKE '%q%' OR sku ILIKE '%q%'
--
-- The slug ILIKE was the slow path — full table scan on every search.
-- For broad terms (e.g. "resin") this pushed the combined query to
-- > 1s p50 against live (5,804 rows). Profiling in
-- scripts/profile-search.mjs surfaced it.
--
-- The admin chip header (StatusChips) issues five parallel
-- `count(*) WHERE review_status = ?` queries. Without an index on
-- review_status they're full scans. They were under network-latency
-- floor so the symptom was less visible; the partial-on-deleted_at
-- index keeps them fast as the catalog grows.
--
-- See claude/architecture/database-schema.md §"Indexes"


-- ╭──────────────────────────────────────────────────────────────╮
-- │ 1. Trigram GIN on slug for admin ILIKE search                │
-- ╰──────────────────────────────────────────────────────────────╯
-- Postgres uses the trigram index for ILIKE %q% when the pattern has
-- ≥ 3 chars of literal content. The admin search box is debounced and
-- enforces no minimum, but searches under 3 chars fall back to seq scan
-- (and return many rows anyway).
CREATE INDEX products_slug_trgm_idx
  ON public.products USING GIN (slug gin_trgm_ops);


-- ╭──────────────────────────────────────────────────────────────╮
-- │ 2. review_status for chip-count queries                      │
-- ╰──────────────────────────────────────────────────────────────╯
-- Partial: only non-soft-deleted rows ever contribute to chip counts.
CREATE INDEX products_review_status_idx
  ON public.products (review_status)
  WHERE deleted_at IS NULL;


-- ╭──────────────────────────────────────────────────────────────╮
-- │ 3. Smoke — assert both indexes exist                         │
-- ╰──────────────────────────────────────────────────────────────╯
DO $$
DECLARE
  expected_indexes text[] := ARRAY[
    'products_slug_trgm_idx',
    'products_review_status_idx'
  ];
  ix text;
  found int;
BEGIN
  FOREACH ix IN ARRAY expected_indexes LOOP
    SELECT count(*) INTO found
    FROM pg_indexes WHERE schemaname = 'public' AND indexname = ix;
    IF found <> 1 THEN
      RAISE EXCEPTION 'Smoke FAIL: index % missing (found %)', ix, found;
    END IF;
  END LOOP;
END $$;
