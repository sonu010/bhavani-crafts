-- 0010_default_variant_constraint.sql — exactly one default variant per product
--
-- rollback:
--   DROP INDEX IF EXISTS product_variants_one_default_idx;
--
-- What this migration contains:
--   1 partial UNIQUE index pinning the "exactly one default variant per
--   product" invariant the editor relies on
--   Smoke block asserts the index exists + demonstrates the constraint
--
-- ─── Why ─────────────────────────────────────────────────────────────────
--
-- product_variants.is_default is a boolean per row with no schema-level
-- check that exactly one variant per product can be default. The editor
-- (P2-T14 setDefaultVariant action) enforces it in two UPDATEs inside a
-- transaction, but a concurrent write could leave the table with two
-- defaults for the same product.
--
-- A partial unique index (UNIQUE on product_id WHERE is_default = true
-- AND deleted_at IS NULL) makes the database the source of truth. Soft-
-- deleted rows don't count toward the constraint, so restoring a row
-- from Trash works as long as the current default is moved off first.

CREATE UNIQUE INDEX product_variants_one_default_idx
  ON public.product_variants (product_id)
  WHERE is_default = true AND deleted_at IS NULL;


-- ╭──────────────────────────────────────────────────────────────╮
-- │ Smoke — index exists; constraint trips when expected         │
-- ╰──────────────────────────────────────────────────────────────╯
DO $$
DECLARE
  found       int;
  prod_id     uuid;
  cat_id      uuid;
  v1_id       uuid;
  caught_dup  boolean := false;
BEGIN
  -- 1. Index exists.
  SELECT count(*) INTO found
  FROM pg_indexes
  WHERE schemaname = 'public' AND indexname = 'product_variants_one_default_idx';
  IF found <> 1 THEN
    RAISE EXCEPTION 'Smoke FAIL: product_variants_one_default_idx missing (found %)', found;
  END IF;

  -- 2. Constraint trips on duplicate default for the same product.
  INSERT INTO public.categories (slug, name)
    VALUES ('zzz-defvar-smoke-cat', 'Default-variant smoke')
    RETURNING id INTO cat_id;

  INSERT INTO public.products (sku, slug, name, stock_status, category_id, review_status, source)
    VALUES ('zzz-defvar-smoke', 'zzz-defvar-smoke', 'Smoke', 'unknown', cat_id, 'draft', 'manual')
    RETURNING id INTO prod_id;

  INSERT INTO public.product_variants (product_id, sku, is_default)
    VALUES (prod_id, 'zzz-defvar-smoke-v1', true)
    RETURNING id INTO v1_id;

  BEGIN
    -- Second is_default=true for the same product should trip the index.
    INSERT INTO public.product_variants (product_id, sku, is_default)
      VALUES (prod_id, 'zzz-defvar-smoke-v2', true);
  EXCEPTION
    WHEN unique_violation THEN
      caught_dup := true;
  END;
  IF NOT caught_dup THEN
    RAISE EXCEPTION 'Smoke FAIL: a second is_default=true should have raised unique_violation';
  END IF;

  -- 3. Soft-deleting the current default frees the slot for a new one.
  UPDATE public.product_variants SET deleted_at = now() WHERE id = v1_id;
  INSERT INTO public.product_variants (product_id, sku, is_default)
    VALUES (prod_id, 'zzz-defvar-smoke-v3', true);

  -- Cleanup: CASCADE through products → variants → variant_option_values.
  DELETE FROM public.products WHERE id = prod_id;
  DELETE FROM public.categories WHERE id = cat_id;
END $$;
