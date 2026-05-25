-- 0013_tag_product_counts_rpc.sql — fast tag/attribute count rollups.
--
-- rollback:
--   DROP FUNCTION IF EXISTS public.tag_product_counts();
--   DROP FUNCTION IF EXISTS public.attribute_value_counts();
--
-- What this migration contains:
--   2 SQL functions — each returns (id, count) for one of the
--   /admin admin-page rollup needs.
--   Smoke block asserts both functions are present and callable.
--
-- ─── Why ─────────────────────────────────────────────────────────────────
--
-- /admin/tags was pulling every `product_tags` row (~8K) in 1000-row
-- chunks just to tally by tag_id in JS. With PostgREST's default
-- response cap that was 8 round-trips per page load, ~3s total. A
-- server-side aggregation is a single index-scan; round-trip drops
-- to one short request.
--
-- Same pattern applies to /admin/attributes which counts
-- `product_attributes` per definition. Same fix shape.
--
-- Both functions are STABLE + SECURITY INVOKER so RLS still applies.

CREATE OR REPLACE FUNCTION public.tag_product_counts()
RETURNS TABLE (tag_id uuid, product_count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT tag_id, count(*)::bigint AS product_count
  FROM public.product_tags
  GROUP BY tag_id;
$$;

COMMENT ON FUNCTION public.tag_product_counts
  IS 'Tag → product_tags row count. Used by /admin/tags to skip the chunked-pagination scan.';


CREATE OR REPLACE FUNCTION public.attribute_value_counts()
RETURNS TABLE (attribute_id uuid, value_count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT attribute_id, count(*)::bigint AS value_count
  FROM public.product_attributes
  GROUP BY attribute_id;
$$;

COMMENT ON FUNCTION public.attribute_value_counts
  IS 'Attribute → product_attributes row count. Used by /admin/attributes to skip the chunked-pagination scan.';


-- ╭──────────────────────────────────────────────────────────────╮
-- │ Smoke — functions exist + return zero or more rows           │
-- ╰──────────────────────────────────────────────────────────────╯
DO $$
BEGIN
  PERFORM 1 FROM public.tag_product_counts() LIMIT 1;
  PERFORM 1 FROM public.attribute_value_counts() LIMIT 1;
END $$;
