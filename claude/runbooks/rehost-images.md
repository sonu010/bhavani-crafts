# Runbook: Re-host scraped images to Supabase Storage (P4-T11)

**When to run:** Phase 4, before the real-content gate clears. Once for every product the owner intends to keep + publish.

**Why:** Seed image URLs point at Just Kraft's CDN. We never serve them publicly. Re-hosting downloads them, re-processes via sharp, uploads to our Storage, rewrites the row.

## Preconditions

- `web/.env.local` has `SUPABASE_SERVICE_ROLE_KEY` (server-only).
- `sharp` is installed (`pnpm add sharp` — already a dep from P0-T05).
- Network access to `djl2kq23xfhqi.cloudfront.net`.

## Scope

By default, rehost **only** images attached to products the owner intends to keep — typically `WHERE source = 'justkraft_seed' AND review_status = 'ready_to_publish'`. Pass `--all` to rehost everything, but only if disk + bandwidth are not a concern.

## Steps

```bash
cd web
pnpm tsx ../scripts/migrate-images.mjs --filter "review_status=ready_to_publish"
```

Or via a GitHub Action for the full ~20k-image migration:

```bash
gh workflow run rehost-images.yml -f filter="all"
```

## What the script does

For each `product_images` row where `storage_path IS NULL` and matching filter:

1. HEAD the source URL. If 404 → flag `license_status='disputed'`, log to `audit_logs`, skip.
2. GET the image.
3. Sharp pipeline:
   - Convert to WebP at q=82.
   - Generate 4 sizes: thumb 200w / card 480w / detail 960w / hero 1600w.
   - Compute 8w blur placeholder → base64.
4. Upload all 4 sizes to `product-images/<product_id>/<image_id>-<size>.webp`.
5. UPDATE `product_images`:
   - `url = <public URL of detail size>`
   - `storage_path = <detail path>`
   - `blur_data_url = <base64>`
   - `width`, `height` = detail dimensions
   - `source = 'owner_provided'` (owner is endorsing by keeping)
   - `license_status = 'unverified'` (owner explicitly promotes to `owned` in admin)
6. INSERT `audit_logs` row.

Chunked by 20 images per batch (see [background-jobs.md](../architecture/background-jobs.md)). Resumable via the `background_jobs.checkpoint` cursor — re-run is safe.

## Verification

```sql
-- All target rows should have storage_path set
SELECT count(*) FROM product_images pi
JOIN products p ON p.id = pi.product_id
WHERE p.review_status = 'ready_to_publish'
  AND pi.deleted_at IS NULL
  AND pi.storage_path IS NULL;
-- expected: 0

-- No URLs should still point at Just Kraft CDN among ready-to-publish products
SELECT count(*) FROM product_images pi
JOIN products p ON p.id = pi.product_id
WHERE p.review_status = 'ready_to_publish'
  AND pi.url ILIKE '%djl2kq23xfhqi.cloudfront.net%';
-- expected: 0
```

## After rehost

Owner must promote `license_status` from `unverified` → `owned` for each kept image in the admin UI before the parent product can be set `is_published = true` (RLS won't let unlicensed images through anyway, but the workflow surfaces this gate).

## Troubleshooting

- **Rate limited by Just Kraft CDN:** add a `pnpm tsx ../scripts/migrate-images.mjs --rate 5` to throttle to 5 req/s.
- **Storage quota exceeded:** Supabase free tier is 1 GB. WebP at our budget sizes gives ~120 KB/image average, so 1 GB holds ~8,000 images. Plan migration scope accordingly or upgrade.
- **Resume after crash:** re-run the same command. The script skips rows where `storage_path IS NOT NULL`.
