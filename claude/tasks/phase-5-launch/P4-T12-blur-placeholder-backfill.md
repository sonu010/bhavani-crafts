---
id: P4-T12
phase: 5
title: Blur placeholder backfill
status: not_started
depends_on: [P4-T11]
estimate_hours: 1
owner: ai
last_updated: 2026-06-07
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

- [ ] After running, `select count(*) from product_images where
      blur_data_url is null and deleted_at is null` = 0 (or near it,
      with the residual being images that couldn't be fetched).
- [ ] PDP loads show a brief blur-up on first paint instead of a
      flash of husk-100.
- [ ] Storefront Lighthouse Perf doesn't regress.

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

(empty)
