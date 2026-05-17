-- 0009_products_status_counts_rpc.sql — single-roundtrip chip counts
--
-- rollback:
--   DROP FUNCTION IF EXISTS public.products_status_counts();
--
-- What this migration contains:
--   1 RPC      products_status_counts() → setof (review_status, count)
--   Smoke      asserts the function exists and returns sane rows
--
-- ─── Why ─────────────────────────────────────────────────────────────────
--
-- The admin products page chip header (StatusChips) used to issue five
-- parallel count-only queries, one per review_status value. Each
-- round-trip pays the ~250ms Supabase network floor; serially they
-- AND'd into ~270ms (slowest wins in Promise.all). This RPC computes
-- all five counts in one statement, one network round-trip.
--
-- SECURITY INVOKER (default) so RLS applies. Admins see all rows (per
-- catalog admin policies); anon sees only published+non-deleted (per
-- products_public_select). The function is exposed via PostgREST so
-- callers reach it via supabase.rpc('products_status_counts').


CREATE OR REPLACE FUNCTION public.products_status_counts()
RETURNS TABLE(review_status review_status, count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT products.review_status, count(*)::bigint
  FROM public.products
  WHERE products.deleted_at IS NULL
  GROUP BY products.review_status
$$;


-- ╭──────────────────────────────────────────────────────────────╮
-- │ Smoke — function exists + returns sane shape                 │
-- ╰──────────────────────────────────────────────────────────────╯
DO $$
DECLARE
  found int;
BEGIN
  SELECT count(*) INTO found
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'products_status_counts';
  IF found <> 1 THEN
    RAISE EXCEPTION 'Smoke FAIL: products_status_counts() missing (found %)', found;
  END IF;

  -- Returning shape sanity (rows valid even when table is empty).
  PERFORM count(*) FROM public.products_status_counts();
END $$;
