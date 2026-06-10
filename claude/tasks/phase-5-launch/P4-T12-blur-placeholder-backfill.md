---
id: P4-T12
phase: 5
title: Blur placeholder backfill
status: done
depends_on: [P4-T11]
estimate_hours: 1
owner: ai
last_updated: 2026-06-10
---

# Goal

Backfill `product_images.blur_data_url` for every published-product
image that doesn't have one. The storefront's `<Image
placeholder="blur" blurDataURL=…>` already reads this column on
PDPs + cards; rows without it fall back to `placeholder="empty"`
which shows a flash of the husk-100 background colour during load.

After this task the storefront has a soft blur-up on every image
instead of a flash of background colour.

Rehomed from Phase 4 because no AI is involved — `sharp`'s LQIP
generation is deterministic.

# Prerequisites (read first)

- `web/src/lib/db/admin/images.ts` — current upload pipeline already
  generates a blur via `sharp`. This task does the same for existing
  rows missing one.
- `claude/architecture/image-pipeline.md` (if it exists) — current
  blur format: 8×8 base64 webp data-URL, ~200 bytes per image
- `web/scripts/rehost-cloudfront-images.mjs` (P4-T11) — likely the
  right place to fold the backfill into; if T11 already wrote
  blurs while rehosting, this task may only need to cover legacy
  Supabase Storage rows.

# Files to touch

- `web/scripts/backfill-image-blurs.mjs` (new) — page through
  `product_images` where `blur_data_url IS NULL AND deleted_at IS
  NULL`, fetch each image, run `sharp` to generate an 8×8 LQIP,
  write back. Chunked + idempotent (re-running is a no-op).
- OR fold into `rehost-cloudfront-images.mjs` (P4-T11) so a single
  script does both passes. Decide based on whether the rehost has
  already run.

# Implementation notes

- **LQIP shape:** 8×8 webp, ~200 bytes base64. The PDP gallery uses
  this for the `<Image placeholder="blur">` Next prop.
- **Generation:**
  ```js
  const lqip = (await sharp(buf).resize(8, 8, { fit: "cover" })
    .webp({ quality: 50 }).toBuffer()).toString("base64");
  const blurDataUrl = `data:image/webp;base64,${lqip}`;
  ```
- **Concurrency:** 4 in-flight fetches + sharp transforms. Sharp is
  CPU-heavy; more concurrency saturates the runner without
  proportional speedup.
- **Idempotent:** filter `WHERE blur_data_url IS NULL` so re-running
  picks up only the remainder.
- **Failure mode:** sharp errors on malformed images (rare; usually
  the cloudfront fetch returned an HTML error page). Log + skip;
  let the broken-image cron (P5-T06) flag the row as `removed`
  later.

# Acceptance criteria

- [x] After running: 14,851 / 14,969 images have a blur (99.2%).
      Residual:
        - 113 removed/disputed (intentionally skipped — RLS-hidden)
        - 5 visible-but-missing (network errors during fetch;
          next run picks up where this one left off — idempotent
          by design)
- [x] **Storefront blur-up works**: `ProductCard` already reads
      `product.blurDataUrl` and switches `placeholder="blur"`. With
      blur populated, PDP gallery + storefront cards fade in from
      a 8×8 webp ~200-byte LQIP instead of flashing husk-100.
- [ ] Storefront Lighthouse Perf doesn't regress — DEFERRED to
      launch-day §5 (P5-T09 runbook). Blur-up is a UX improvement,
      not a Perf regression risk: the LQIP is data-URL inlined so
      no extra requests.

# Verification

```bash
# Dry-run
node web/scripts/backfill-image-blurs.mjs --dry-run

# Real
node web/scripts/backfill-image-blurs.mjs

# Verify
psql ... -c "select count(*) from product_images
  where blur_data_url is null and deleted_at is null;"
```

# Notes for next agent

- **Script**: `web/scripts/backfill-image-blurs.mjs`, wired as
  `pnpm backfill-image-blurs` (real run) +
  `pnpm backfill-image-blurs --dry-run --limit=N`.
- **Pipeline**: fetch URL → `sharp().resize(8,8).webp({quality:50})`
  → base64 → `data:image/webp;base64,...` (~180-220 bytes/row).
- **Concurrency 4**: sharp is CPU-heavy; more saturates the box.
  ~14 rows/s sustained over the full 14,801 rows.
- **Filter on read**: skips `license_status IN (removed, disputed)`
  so we don't waste CPU on rows that are RLS-hidden anyway.
- **Idempotent**: filter `WHERE blur_data_url IS NULL` means
  re-running picks up only the remainder. Re-run safe.
- **First full run (2026-06-10)**: 14,801 written, 5 skipped (network
  errors), 1078s total. Residual 5 will be picked up on the next
  rerun once their CDN endpoints recover.
- **No CI workflow** for this script — it's a one-time backfill
  (and the `unverified → owned` flip lifecycle of newly imported
  images is handled by the upload pipeline which already generates
  a blur during `images.ts` upload). Re-run only after a bulk
  import that bypassed the upload pipeline.
- **Storefront wiring** already in place: `product-card.tsx` uses
  `placeholder={product.blurDataUrl ? "blur" : "empty"}`. PDP
  gallery same pattern. No code change needed to start seeing the
  blur-up effect on every cached storefront page.
