# Runbook: Seed the Postgres catalog from the Just Kraft scrape

**When to run:** After P1-T07 lands the schema + indexes. Re-run safely any time (idempotent).

**Estimated runtime:** 6–12 minutes against Supabase free-tier Postgres for 8,509 products.

## Preconditions

- `web/supabase/migrations/` is up to date (`supabase db push` succeeded).
- `web/.env.local` contains `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (service-role needed because seeded rows bypass RLS — this is a one-time setup, not a runtime path).
- `data/justkraft-inventory/justkraft_products.json` (22 MB) is present.

## Steps

```bash
# from project root
cd web
pnpm tsx ../scripts/seed-from-justkraft.mjs
```

## What the script does

1. Streams `justkraft_products.json` row-by-row using `stream-json` (no full-file load).
2. For each unique `category_path[]`, upserts the chain into `categories` (parent_id links).
   - Normalizes "Uncategorized" into a top-level "Other" category.
   - Slug-disambiguates ambiguous names via `scripts/category-slug-overrides.json` (e.g. `moulds` under different parents become `resin-moulds`, `chocolate-moulds`).
3. Upserts `products` keyed on `sku`. Sets:
   - `is_published = false`
   - `review_status = 'needs_review'`
   - `source = 'justkraft_seed'`
   - `source_url = <product_url>`
4. Inserts `product_images` from `image_urls[]`. Sets:
   - `url = <Just Kraft CDN url>`
   - `storage_path = NULL`
   - `source = 'justkraft_seed'`
   - `license_status = 'unverified'`
5. Inserts `tags` and joins `product_tags`.
6. Inserts variant labels as `product_variants` placeholders (`is_default = true`, no price, no stock — for review).
7. Logs progress to stderr and writes `data/justkraft-inventory/seed_report.json` with counts + scrape_notes.

## Verification

```bash
# expect ~8509 products
psql "$SUPABASE_DB_URL" -c "SELECT count(*) FROM products WHERE source = 'justkraft_seed';"

# expect ~255 distinct categories
psql "$SUPABASE_DB_URL" -c "SELECT count(*) FROM categories;"

# expect zero products with is_published = true from seed
psql "$SUPABASE_DB_URL" -c "SELECT count(*) FROM products WHERE source = 'justkraft_seed' AND is_published = true;"
```

Run the storefront locally: `pnpm dev`. Confirm `/` shows zero products (none are published). Confirm `/admin/products` (after Phase 2) shows 8,509 unpublished rows.

## If something goes wrong

- **Out of memory during parse:** the script must stream. Don't `fs.readFileSync` the JSON. If you see OOM, the script regressed.
- **Duplicate SKU error:** the upsert key is `sku`. If a duplicate slips through, log + skip the row.
- **Slug collision:** the script appends a short hash if `slug` already exists. Verify via `seed_report.json`.
- **Image URL 404 at seed time:** that's fine — we're storing the URL, not fetching the image. Broken-image cron (P5-T06) catches stale URLs nightly.

## Cleanup (post-launch)

Once owner content has replaced the seed, run:

```sql
-- Soft-delete all remaining seeded products
UPDATE products
SET deleted_at = now(),
    deleted_by = '<owner_profile_id>'
WHERE source = 'justkraft_seed'
  AND is_published = false
  AND deleted_at IS NULL;
```

Then `/admin/trash` shows them for the 30-day grace period before hard-delete.
