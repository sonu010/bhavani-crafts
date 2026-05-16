# Runbook: Seed the Postgres catalog from the Just Kraft scrape

**When to run:** After P1-T07 lands the schema + indexes. Re-run safely any time (idempotent).

**Estimated runtime:** 6–12 minutes against Supabase free-tier Postgres for the cleaned seed.

## Preconditions

- `web/supabase/migrations/` is up to date (`supabase db push` succeeded).
- `web/.env.local` contains `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (service-role needed because seeded rows bypass RLS — this is a one-time setup, not a runtime path).
- `data/justkraft-inventory/justkraft_products.json` (raw scrape, gitignored) is present.

## Steps

```bash
# from project root
node scripts/clean-justkraft-inventory.mjs

cd web
node scripts/seed-from-justkraft.mjs
```

The cleaner writes:

- `data/justkraft-inventory/justkraft_products.cleaned.json`
- `data/justkraft-inventory/justkraft_products.cleaned.csv`
- `data/justkraft-inventory/clean_report.json`

## What the script does

1. Cleans the raw scrape before seeding:
   - rejects generic site-title scrape failures
   - rejects rows without a numeric price
   - normalizes SKUs to `A-Z`, `0-9`, and `-`
   - dedupes by normalized SKU
2. Streams `justkraft_products.cleaned.json` row-by-row using `stream-json` (no full-file load).
3. For each unique `category_path[]`, upserts the chain into `categories` (parent_id links).
   - Rows without a category path stay under `Uncategorized` for manual review.
   - Slug-disambiguates ambiguous category names by prefixing the parent slug when needed.
4. Upserts `products` keyed on `sku`. Sets:
   - `is_published = false`
   - `review_status = 'needs_review'`
   - `source = 'justkraft_seed'`
   - `source_url = <product_url>`
5. Inserts `product_images` from `image_urls[]`. Sets:
   - `url = <Just Kraft CDN url>`
   - `storage_path = NULL`
   - `source = 'justkraft_seed'`
   - `license_status = 'unverified'`
6. Inserts `tags` and joins `product_tags`.
7. Inserts variant labels as `product_variants` placeholders (`is_default = true`, no price, no stock — for review).
8. Logs progress to stderr and writes `data/justkraft-inventory/seed_report.json` with counts + scrape_notes.

## Verification

```bash
# expect the cleaned seed product count
psql "$SUPABASE_DB_URL" -c "SELECT count(*) FROM products WHERE source = 'justkraft_seed';"

# expect ~255 distinct categories
psql "$SUPABASE_DB_URL" -c "SELECT count(*) FROM categories;"

# expect zero products with is_published = true from seed
psql "$SUPABASE_DB_URL" -c "SELECT count(*) FROM products WHERE source = 'justkraft_seed' AND is_published = true;"
```

Run the storefront locally: `pnpm dev`. Confirm `/` shows zero products (none are published). Confirm `/admin/products` (after Phase 2) shows the cleaned unpublished seed rows.

## If something goes wrong

- **Out of memory during parse:** the script must stream. Don't `fs.readFileSync` the JSON. If you see OOM, the script regressed.
- **Duplicate SKU error:** rerun `node scripts/clean-justkraft-inventory.mjs`. The seed script fails fast if the cleaned fixture still has duplicates.
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
