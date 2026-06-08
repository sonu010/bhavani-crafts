---
id: P4-T11
phase: 5
title: Image rehost — JustKraft cloudfront → Supabase Storage
status: not_started
depends_on: [P5-T00, P4-T10]
estimate_hours: 4
owner: ai
last_updated: 2026-06-07
---

# Goal

Move every published-product image off the JustKraft cloudfront
domain (`djl2kq23xfhqi.cloudfront.net`) and onto our own Supabase
Storage bucket. After this task:

- `product_images.url` for every published product points at
  `https://<supabase-ref>.supabase.co/storage/v1/object/public/<bucket>/<path>`.
- The `StorefrontImage` wrapper's `unoptimized={true}` bypass for
  cloudfront is no longer needed at runtime (Supabase URLs go
  through Vercel's optimizer).
- Hot-link dependency removed → owner controls availability,
  caching, and license posture independently.

Rehomed from Phase 4 because no AI is involved — straight HTTP fetch
+ Storage upload + DB row update.

# Prerequisites (read first)

- `web/src/components/storefront/storefront-image.tsx` — the
  optimizer-bypass wrapper that becomes a thin pass-through after
  this task
- `web/next.config.ts` — `images.remotePatterns` allowlist; can drop
  the cloudfront entry once rehosting is done
- `claude/architecture/image-pipeline.md` (if exists; otherwise the
  inline notes in `lib/db/admin/images.ts`) — current upload
  pipeline (file-type sniff, EXIF strip, LQIP via sharp)

# Files to touch

- `web/scripts/rehost-cloudfront-images.mjs` (new) — the worker
  script. Pages through `product_images.url LIKE
  'https://djl2kq23xfhqi.cloudfront.net/%'`, fetches each, uploads to
  Supabase Storage, updates the row.
- `web/src/components/storefront/storefront-image.tsx` (modified, at
  the end) — once verified, shrink the `UNOPTIMIZED_HOSTS` set to
  empty (file stays as a thin pass-through in case other CDNs land
  later).
- `web/next.config.ts` (modified, at the end) — drop the cloudfront
  entry from `images.remotePatterns`.

# Implementation notes

- **Bucket choice:** `product-images` bucket, public-read, RLS-gated
  writes (admin-only via service-role). Existing
  `lib/db/admin/images.ts` upload pipeline can be reused with a
  wrapper to skip the file-type sniff (the JustKraft images are
  trusted at this point).
- **Idempotency:** the script writes a checkpoint file
  `scripts/.rehost-progress.json` so a crashed/interrupted run
  resumes from where it stopped. Same pattern as
  `.flip-publish-state.json`.
- **Concurrency:** 4 in-flight uploads. Supabase Storage rate-limits
  at 100 r/s; 4 concurrent gives us plenty of headroom.
- **Filename:** `products/<product_id>/<image_id>.<ext>` keeps the
  bucket layout predictable + makes per-product cleanup easy if a
  product gets hard-deleted.
- **Order:** rehost ONLY published-product images (filter by
  `EXISTS (select 1 from products p where p.id = product_images
  .product_id and p.is_published = true)`). Unpublished products'
  images can stay on cloudfront — owner will likely delete them in
  the real-content swap (P4-T10) anyway.
- **Dry-run flag** to count + sample without writing.
- **Audit:** log every rehosted image's old URL + new URL to a
  one-off table `image_rehost_runs(old_url, new_url, ran_at)` or to
  a JSON file so we can roll back if needed.
- **Storage size estimate:** 5,800 images × ~250 KB each ≈ 1.5 GB.
  Supabase free-tier has 1 GB storage; Pro has 100 GB. Confirm tier
  before running.

# Acceptance criteria

- [ ] All published-product images have URLs pointing at Supabase
      Storage (no cloudfront URLs remain on `is_published=true`
      products).
- [ ] Storefront PDP + category cards render those images via the
      Vercel optimizer (Network tab: `/_next/image?url=…supabase…`).
- [ ] `StorefrontImage` wrapper's `UNOPTIMIZED_HOSTS` set is empty
      OR keeps only hosts that still need bypass.
- [ ] `next.config.ts` `remotePatterns` no longer lists cloudfront.
- [ ] No broken images in the dashboard's Broken-images widget
      caused by the rehost.

# Verification

```bash
# Pre-flight: count cloudfront URLs that need rehost
node web/scripts/rehost-cloudfront-images.mjs --dry-run

# Run it
node web/scripts/rehost-cloudfront-images.mjs

# Verify
psql ... -c "select count(*) from product_images
  join products p on p.id=product_images.product_id
  where p.is_published=true
    and product_images.url like '%cloudfront.net%';"
# expect: 0
```

# Notes for next agent

(empty)
