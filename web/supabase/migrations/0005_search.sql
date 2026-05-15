-- 0005_search.sql — full-text search + trigram + synonyms + search_logs
--
-- rollback:
--   DROP INDEX IF EXISTS products_sku_trgm_idx, products_name_trgm_idx, products_fts_idx;
--   ALTER TABLE public.products DROP COLUMN IF EXISTS fts;
--   DROP TABLE IF EXISTS public.search_logs, public.search_synonyms CASCADE;
--
-- What this migration contains:
--   1 generated column   products.fts (tsvector, STORED)
--   3 GIN indexes        products_fts_idx, products_name_trgm_idx, products_sku_trgm_idx
--   2 tables             search_synonyms, search_logs
--   Seed                 7 craft-specific synonym groups
--   Smoke block          FTS round-trip + trigram fuzzy match
--
-- See claude/architecture/search.md
--     claude/decisions/ADR-004-postgres-fts-no-meilisearch.md


-- ╭──────────────────────────────────────────────────────────────╮
-- │ 1. products.fts — generated tsvector, indexed                │
-- ╰──────────────────────────────────────────────────────────────╯
-- STORED (not VIRTUAL) so the GIN index can be built on it. The vector
-- includes name + short_description + description so a query like
-- "resin epoxy 100ml" hits all three.
ALTER TABLE public.products
  ADD COLUMN fts tsvector
  GENERATED ALWAYS AS (
    to_tsvector(
      'english',
      coalesce(name, '') || ' ' ||
      coalesce(short_description, '') || ' ' ||
      coalesce(description, '')
    )
  ) STORED;

COMMENT ON COLUMN public.products.fts
  IS 'Generated tsvector for full-text search. Indexed by products_fts_idx.';


-- ╭──────────────────────────────────────────────────────────────╮
-- │ 2. GIN indexes                                               │
-- ╰──────────────────────────────────────────────────────────────╯
CREATE INDEX products_fts_idx        ON public.products USING GIN (fts);
CREATE INDEX products_name_trgm_idx  ON public.products USING GIN (name gin_trgm_ops);
CREATE INDEX products_sku_trgm_idx   ON public.products USING GIN (sku  gin_trgm_ops);


-- ╭──────────────────────────────────────────────────────────────╮
-- │ 3. search_synonyms                                           │
-- ╰──────────────────────────────────────────────────────────────╯
-- term → expanded synonyms array. Lookup is exact on `term` (lowercased
-- by the caller). The search expander in lib/search/expand.ts substitutes
-- or augments the user's query before hitting the DB.
CREATE TABLE public.search_synonyms (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term        text NOT NULL UNIQUE
                CHECK (term = lower(term) AND length(term) BETWEEN 2 AND 40),
  synonyms    text[] NOT NULL DEFAULT '{}'::text[]
                CHECK (cardinality(synonyms) > 0),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER search_synonyms_set_updated_at
  BEFORE UPDATE ON public.search_synonyms
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.search_synonyms
  IS 'Term → synonyms[] for query expansion. Term must be lowercase. Grown via P4-T09 mining.';


-- ╭──────────────────────────────────────────────────────────────╮
-- │ 4. search_logs                                               │
-- ╰──────────────────────────────────────────────────────────────╯
-- Every user query + the result count. Powers the "Searches with 0
-- results" admin widget and feeds P4-T09 synonym mining.
CREATE TABLE public.search_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query         text NOT NULL CHECK (length(query) BETWEEN 1 AND 200),
  result_count  int NOT NULL CHECK (result_count >= 0),
  user_id       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.search_logs
  IS 'One row per search request. Insert is async (waitUntil) so it does not block the response.';


-- ╭──────────────────────────────────────────────────────────────╮
-- │ 5. Seed: common craft-supply synonyms                        │
-- ╰──────────────────────────────────────────────────────────────╯
INSERT INTO public.search_synonyms (term, synonyms) VALUES
  ('mould',   ARRAY['mold', 'molds', 'moulds']),
  ('colour',  ARRAY['color', 'colors', 'colours']),
  ('resin',   ARRAY['epoxy', 'epoxy resin']),
  ('mdf',     ARRAY['wood', 'mdf board', 'mdf cutout']),
  ('glitter', ARRAY['sparkle', 'shimmer']),
  ('acrylic', ARRAY['acrylic paint']),
  ('gsm',     ARRAY['grammage'])
ON CONFLICT (term) DO NOTHING;


-- ╭──────────────────────────────────────────────────────────────╮
-- │ 6. Smoke: FTS round-trip + trigram fuzzy match               │
-- ╰──────────────────────────────────────────────────────────────╯
DO $$
DECLARE
  cat_id     uuid;
  prod_id    uuid;
  fts_hits   int;
  trgm_hits  int;
BEGIN
  INSERT INTO public.categories (slug, name)
  VALUES ('zzz-search-smoke-cat', 'Search smoke (transient)')
  RETURNING id INTO cat_id;

  INSERT INTO public.products (sku, slug, name, description, category_id)
  VALUES (
    'ZZZ-SEARCH-SMOKE',
    'zzz-search-smoke-prod',
    'Resin epoxy 100ml clear casting kit',
    'A clear casting resin kit, 100ml, for jewellery and small art.',
    cat_id
  )
  RETURNING id INTO prod_id;

  -- (a) FTS hit on "resin"
  SELECT count(*)::int INTO fts_hits
  FROM public.products
  WHERE fts @@ plainto_tsquery('english', 'resin')
    AND id = prod_id;
  IF fts_hits <> 1 THEN
    RAISE EXCEPTION 'Smoke FAIL: FTS missed exact-word match (hits=%)', fts_hits;
  END IF;

  -- (b) FTS hit on multi-word query
  SELECT count(*)::int INTO fts_hits
  FROM public.products
  WHERE fts @@ plainto_tsquery('english', 'clear casting')
    AND id = prod_id;
  IF fts_hits <> 1 THEN
    RAISE EXCEPTION 'Smoke FAIL: FTS missed multi-word match (hits=%)', fts_hits;
  END IF;

  -- (c) Trigram similarity is reachable through the function.
  -- This smoke proves pg_trgm is installed and similarity() is callable.
  -- It is NOT a typo-quality test: similarity('Resin epoxy 100ml clear
  -- casting kit', 'rezin') = 0.079 (measured), well below the default
  -- pg_trgm.similarity_threshold of 0.3. Production search must tune
  -- threshold per-query — see architecture/search.md §"Trigram threshold".
  SELECT count(*)::int INTO trgm_hits
  FROM public.products
  WHERE similarity(name, 'rezin') > 0
    AND id = prod_id;
  IF trgm_hits <> 1 THEN
    RAISE EXCEPTION 'Smoke FAIL: trigram unreachable (hits=%, expected 1)', trgm_hits;
  END IF;

  -- (d) search_logs accepts a row
  INSERT INTO public.search_logs (query, result_count) VALUES ('resin', 1);

  -- (e) search_synonyms rejects uppercase term
  BEGIN
    INSERT INTO public.search_synonyms (term, synonyms) VALUES ('MOULD', ARRAY['mold']);
    RAISE EXCEPTION 'Smoke FAIL: uppercase term should have been rejected';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- (f) search_synonyms rejects empty array
  BEGIN
    INSERT INTO public.search_synonyms (term, synonyms) VALUES ('zzz-empty', ARRAY[]::text[]);
    RAISE EXCEPTION 'Smoke FAIL: empty synonyms array should have been rejected';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- Cleanup
  DELETE FROM public.products WHERE id = prod_id;
  DELETE FROM public.categories WHERE id = cat_id;
  DELETE FROM public.search_logs WHERE query = 'resin' AND result_count = 1;

  IF EXISTS (SELECT 1 FROM public.products WHERE id = prod_id) THEN
    RAISE EXCEPTION 'Smoke cleanup left residue';
  END IF;
END $$;
