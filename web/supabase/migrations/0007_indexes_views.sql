-- 0007_indexes_views.sql — catalog indexes + category_with_descendants view
--
-- rollback:
--   DROP VIEW IF EXISTS public.category_with_descendants;
--   DROP INDEX IF EXISTS
--     products_slug_idx,
--     products_category_idx,
--     products_published_at_idx,
--     products_base_price_idx,
--     products_stock_status_idx,
--     product_images_sort_idx,
--     product_variants_product_idx,
--     categories_parent_idx,
--     product_attributes_text_idx,
--     product_attributes_number_idx;
--
-- What this migration contains:
--   10 indexes        targeting storefront read paths and category tree queries
--   1 recursive view  category_with_descendants — every (ancestor, descendant) pair
--   Smoke block       seeds a 3-deep category tree, checks descendants count,
--                     verifies indexes are present
--
-- products.slug already has a UNIQUE constraint (= an index). The slug
-- index below is redundant only if Postgres picks the UNIQUE one for
-- equality lookups — it does, so we drop the explicit one. Same for sku.
--
-- See claude/architecture/database-schema.md §"Indexes" and §"Views"


-- ╭──────────────────────────────────────────────────────────────╮
-- │ 1. Storefront read-path indexes                              │
-- ╰──────────────────────────────────────────────────────────────╯

-- Category-page query lead: products WHERE category_id = ? AND deleted_at IS NULL
CREATE INDEX products_category_idx
  ON public.products (category_id)
  WHERE deleted_at IS NULL;

-- Homepage / "new arrivals" / admin recent-edits sort
CREATE INDEX products_published_at_idx
  ON public.products (is_published, created_at DESC);

-- Price filter on category pages — partial because we only filter the
-- public catalog by price (admins see everything regardless of price).
CREATE INDEX products_base_price_idx
  ON public.products (base_price_inr)
  WHERE is_published = true AND deleted_at IS NULL;

-- "Out of stock" / "low stock" filters in admin + storefront
CREATE INDEX products_stock_status_idx
  ON public.products (stock_status);


-- ╭──────────────────────────────────────────────────────────────╮
-- │ 2. Child-table indexes for join/ordering performance         │
-- ╰──────────────────────────────────────────────────────────────╯

-- Used by gallery render (product page) — sort_order DESCending for first image
CREATE INDEX product_images_sort_idx
  ON public.product_images (product_id, sort_order)
  WHERE deleted_at IS NULL;

CREATE INDEX product_variants_product_idx
  ON public.product_variants (product_id)
  WHERE deleted_at IS NULL;

-- Category tree traversal lookup
CREATE INDEX categories_parent_idx
  ON public.categories (parent_id)
  WHERE deleted_at IS NULL;


-- ╭──────────────────────────────────────────────────────────────╮
-- │ 3. Facet filter indexes on product_attributes                │
-- ╰──────────────────────────────────────────────────────────────╯
-- Faceted filtering query shape:
--   SELECT product_id FROM product_attributes
--   WHERE attribute_id = ? AND value_number BETWEEN ? AND ?
-- Index leads on attribute_id, then includes the value column.

CREATE INDEX product_attributes_text_idx
  ON public.product_attributes (attribute_id, value_text);

CREATE INDEX product_attributes_number_idx
  ON public.product_attributes (attribute_id, value_number);


-- ╭──────────────────────────────────────────────────────────────╮
-- │ 4. category_with_descendants — recursive view                │
-- ╰──────────────────────────────────────────────────────────────╯
-- Returns every (ancestor_id, descendant_id) pair in the category tree.
-- A category is also its own descendant (the base case), which makes
-- "products under category X" queries trivial:
--
--   WHERE category_id IN (
--     SELECT descendant_id FROM category_with_descendants
--     WHERE ancestor_id = $top_category_id
--   )
--
-- Excludes soft-deleted categories. If a category is undeleted later,
-- the view reflects it immediately (no rebuild needed — it's a regular
-- view, not a materialized view).
CREATE OR REPLACE VIEW public.category_with_descendants AS
WITH RECURSIVE tree AS (
  SELECT id AS ancestor_id, id AS descendant_id
  FROM public.categories
  WHERE deleted_at IS NULL

  UNION ALL

  SELECT t.ancestor_id, c.id
  FROM tree t
  JOIN public.categories c ON c.parent_id = t.descendant_id
  WHERE c.deleted_at IS NULL
)
SELECT * FROM tree;

COMMENT ON VIEW public.category_with_descendants
  IS 'Every (ancestor, descendant) pair in the category tree. Used for "products under category X" queries on category pages.';


-- ╭──────────────────────────────────────────────────────────────╮
-- │ 5. Smoke: assert indexes + verify view returns expected rows │
-- ╰──────────────────────────────────────────────────────────────╯
DO $$
DECLARE
  expected_indexes CONSTANT text[] := ARRAY[
    'products_category_idx',
    'products_published_at_idx',
    'products_base_price_idx',
    'products_stock_status_idx',
    'product_images_sort_idx',
    'product_variants_product_idx',
    'categories_parent_idx',
    'product_attributes_text_idx',
    'product_attributes_number_idx'
  ];
  ix text;
  found int;
  root_id  uuid;
  mid_id   uuid;
  leaf_id  uuid;
BEGIN
  -- (a) Every expected index exists
  FOREACH ix IN ARRAY expected_indexes LOOP
    SELECT count(*) INTO found
    FROM pg_indexes WHERE schemaname = 'public' AND indexname = ix;
    IF found <> 1 THEN
      RAISE EXCEPTION 'Smoke FAIL: index % missing (found %)', ix, found;
    END IF;
  END LOOP;

  -- (b) Build a 3-deep category tree, walk it via the view
  INSERT INTO public.categories (slug, name) VALUES ('zzz-tree-root', 'Tree root') RETURNING id INTO root_id;
  INSERT INTO public.categories (slug, name, parent_id) VALUES ('zzz-tree-mid', 'Tree mid', root_id) RETURNING id INTO mid_id;
  INSERT INTO public.categories (slug, name, parent_id) VALUES ('zzz-tree-leaf', 'Tree leaf', mid_id) RETURNING id INTO leaf_id;

  -- Root has 3 descendants: itself, mid, leaf
  SELECT count(*) INTO found FROM public.category_with_descendants WHERE ancestor_id = root_id;
  IF found <> 3 THEN
    RAISE EXCEPTION 'Smoke FAIL: root should have 3 descendants (self+mid+leaf), got %', found;
  END IF;

  -- Mid has 2 descendants: itself, leaf
  SELECT count(*) INTO found FROM public.category_with_descendants WHERE ancestor_id = mid_id;
  IF found <> 2 THEN
    RAISE EXCEPTION 'Smoke FAIL: mid should have 2 descendants, got %', found;
  END IF;

  -- Leaf has 1: itself
  SELECT count(*) INTO found FROM public.category_with_descendants WHERE ancestor_id = leaf_id;
  IF found <> 1 THEN
    RAISE EXCEPTION 'Smoke FAIL: leaf should have 1 descendant (itself), got %', found;
  END IF;

  -- (c) Soft-delete mid; root should now have only 2 descendants
  UPDATE public.categories SET deleted_at = now() WHERE id = mid_id;
  SELECT count(*) INTO found FROM public.category_with_descendants WHERE ancestor_id = root_id;
  IF found <> 1 THEN
    -- root + leaf are still non-deleted but the tree breaks at mid, so leaf
    -- is no longer reachable from root → root has only root.
    RAISE EXCEPTION 'Smoke FAIL: after soft-deleting mid, root should have 1 descendant, got %', found;
  END IF;

  -- Cleanup
  DELETE FROM public.categories WHERE id IN (leaf_id, mid_id, root_id);
END $$;
