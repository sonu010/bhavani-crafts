-- launch-blockers.sql
--
-- Every query below must return zero rows before a production deploy.
-- Used by:
--   1. P1-T06 (RLS attack test) — runs after the schema lands.
--   2. P5-T08 (RLS attack test, full) — runs as a deploy gate before go-live.
--   3. CI on every PR via `scripts/launch-blockers.ts`.
--
-- If any query returns > 0, the deploy is blocked until the offending rows
-- are unpublished, soft-deleted, or rewritten.

\set ON_ERROR_STOP on

-- 1) No published row may still carry the Just Kraft seed source.
SELECT count(*) AS leaked_published_seed
FROM products
WHERE is_published = true
  AND deleted_at IS NULL
  AND source = 'justkraft_seed';
-- expected: 0

-- 2) No public image URL may still point at the Just Kraft CDN.
SELECT count(*) AS leaked_seed_image_urls
FROM product_images pi
JOIN products p ON p.id = pi.product_id
WHERE p.is_published = true
  AND p.deleted_at IS NULL
  AND pi.deleted_at IS NULL
  AND (
    pi.url ILIKE '%djl2kq23xfhqi.cloudfront.net%'
    OR pi.url ILIKE '%justkraft%'
  );
-- expected: 0

-- 3) No published product may have a Just Kraft source_url still attached.
SELECT count(*) AS leaked_source_urls
FROM products
WHERE is_published = true
  AND deleted_at IS NULL
  AND source_url ILIKE '%justkraft%';
-- expected: 0

-- 4) No published product description may contain "Just Kraft" or "JustKraft" verbatim.
SELECT count(*) AS leaked_descriptions
FROM products
WHERE is_published = true
  AND deleted_at IS NULL
  AND (
    description ILIKE '%just kraft%'
    OR description ILIKE '%justkraft%'
    OR short_description ILIKE '%just kraft%'
    OR short_description ILIKE '%justkraft%'
  );
-- expected: 0

-- 5) Every published product must have at least one image with a clean license.
SELECT count(*) AS published_without_licensed_image
FROM products p
WHERE p.is_published = true
  AND p.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM product_images pi
    WHERE pi.product_id = p.id
      AND pi.deleted_at IS NULL
      AND pi.license_status IN ('owned', 'licensed', 'public_domain')
  );
-- expected: 0

-- 5b) No published image may carry an unverified, disputed, or removed license.
SELECT count(*) AS leaked_unlicensed_images
FROM product_images pi
JOIN products p ON p.id = pi.product_id
WHERE p.is_published = true
  AND p.deleted_at IS NULL
  AND pi.deleted_at IS NULL
  AND pi.license_status IN ('unverified', 'disputed', 'removed');
-- expected: 0

-- 5c) review_status must align with is_published.
SELECT count(*) AS workflow_status_mismatch
FROM products
WHERE deleted_at IS NULL
  AND (
    (review_status = 'published' AND is_published = false)
    OR (review_status = 'archived' AND is_published = true)
  );
-- expected: 0 (trigger should prevent, but verify)

-- 6) RLS sanity (anon role): cannot read unpublished products.
--    This is run via the JS harness in scripts/launch-blockers.ts, not psql.
--    Pseudo:
--      const anon = createClient(URL, ANON_KEY);
--      const { data, count } = await anon.from('products')
--        .select('id', { count: 'exact', head: true })
--        .eq('is_published', false);
--      assert(count === 0, 'RLS leak: unpublished products visible to anon');

-- 7) RLS sanity (anon role): cannot read child rows of unpublished or soft-deleted parents.
--    Same harness; runs against product_images, product_variants, product_attributes,
--    product_tags, product_option_values, variant_option_values.

-- 8) RLS sanity (anon role): cannot insert/update/delete on any catalog table.
--    Same harness; attempts INSERT INTO products → expect error.
