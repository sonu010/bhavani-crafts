-- 0011_drop_redundant_default_variant_idx.sql — drop redundant default-variant index
--
-- rollback:
--   CREATE UNIQUE INDEX product_variants_one_default_idx
--     ON public.product_variants (product_id)
--     WHERE is_default = true AND deleted_at IS NULL;
--
-- What this migration contains:
--   1 DROP INDEX for product_variants_one_default_idx (added by 0010)
--   Smoke block asserts the redundant index is gone AND the original
--   constraint from 0003 still trips on duplicate defaults
--
-- ─── Why ─────────────────────────────────────────────────────────────────
--
-- 0010 added product_variants_one_default_idx as a partial unique on
-- (product_id) WHERE is_default = true AND deleted_at IS NULL.
-- That exact constraint was already created in 0003 as
-- product_variants_one_default_per_product_idx with identical
-- definition. Postgres allowed both to coexist (different names) but
-- it wastes disk + adds write amplification on every variant UPDATE.
--
-- This migration drops the duplicate and confirms via the smoke block
-- that the original 0003 index is still doing its job. 0010 should
-- not be reverted independently — keep its file as the historical
-- record of the mistake.

DROP INDEX IF EXISTS public.product_variants_one_default_idx;


-- ╭──────────────────────────────────────────────────────────────╮
-- │ Smoke — duplicate index dropped; 0003 constraint still trips │
-- ╰──────────────────────────────────────────────────────────────╯
DO $$
DECLARE
  dup_found   int;
  orig_found  int;
  prod_id     uuid;
  cat_id      uuid;
  caught_dup  boolean := false;
BEGIN
  -- 1. Duplicate gone.
  SELECT count(*) INTO dup_found
  FROM pg_indexes
  WHERE schemaname = 'public' AND indexname = 'product_variants_one_default_idx';
  IF dup_found <> 0 THEN
    RAISE EXCEPTION 'Smoke FAIL: product_variants_one_default_idx still present (found %)', dup_found;
  END IF;

  -- 2. Original from 0003 still present.
  SELECT count(*) INTO orig_found
  FROM pg_indexes
  WHERE schemaname = 'public' AND indexname = 'product_variants_one_default_per_product_idx';
  IF orig_found <> 1 THEN
    RAISE EXCEPTION 'Smoke FAIL: product_variants_one_default_per_product_idx missing (found %)', orig_found;
  END IF;

  -- 3. Constraint still trips on duplicate default for the same product.
  INSERT INTO public.categories (slug, name)
    VALUES ('zzz-defvar-smoke-cat-11', 'Default-variant smoke 0011')
    RETURNING id INTO cat_id;

  INSERT INTO public.products (sku, slug, name, stock_status, category_id, review_status, source)
    VALUES ('zzz-defvar-smoke-11', 'zzz-defvar-smoke-11', 'Smoke 11', 'unknown', cat_id, 'draft', 'manual')
    RETURNING id INTO prod_id;

  INSERT INTO public.product_variants (product_id, sku, is_default)
    VALUES (prod_id, 'zzz-defvar-smoke-11-v1', true);

  BEGIN
    INSERT INTO public.product_variants (product_id, sku, is_default)
      VALUES (prod_id, 'zzz-defvar-smoke-11-v2', true);
  EXCEPTION
    WHEN unique_violation THEN
      caught_dup := true;
  END;
  IF NOT caught_dup THEN
    RAISE EXCEPTION 'Smoke FAIL: a second is_default=true should still raise unique_violation after dropping duplicate';
  END IF;

  -- Cleanup
  DELETE FROM public.products WHERE id = prod_id;
  DELETE FROM public.categories WHERE id = cat_id;
END $$;
