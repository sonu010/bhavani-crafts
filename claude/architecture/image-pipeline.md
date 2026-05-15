# Image pipeline

Images make or break perceived performance. Every image follows the same pipeline from upload to render.

## Upload flow

```
admin selects file(s)
    │
    ▼
client validates: MIME (via file-type), size ≤ 5MB, dimensions ≤ 4000×4000
    │
    ▼
POST /api/admin/images/upload (route handler, multipart)
    │
    ▼
server validates AGAIN (don't trust the client):
  - MIME sniff
  - size + dimensions
  - strip EXIF (privacy + smaller payload)
    │
    ▼
sharp pipeline:
  - convert to WebP (q=82)
  - generate 4 sizes: thumb 200w, card 480w, detail 960w, hero 1600w
  - compute 8w blur placeholder → base64 → blur_data_url
    │
    ▼
upload to Supabase Storage bucket `product-images`:
  path: <product_id>/<uuid>-<size>.webp
    │
    ▼
INSERT product_images row with:
  url           = supabase.storage.from('product-images').getPublicUrl(<detail path>).data.publicUrl
  storage_path  = <detail path>
  alt           = empty (admin fills later or AI generates in P4-T04)
  width, height = detail dimensions
  blur_data_url = computed LQIP
  source        = 'admin_upload'
  license_status = 'unverified'  -- admin promotes to 'owned' in the editor
    │
    ▼
return image row to client → admin sees thumb immediately
```

## Render flow

In components, always use `next/image`:

```tsx
<Image
  src={img.url}
  alt={img.alt}
  width={img.width}
  height={img.height}
  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
  placeholder={img.blur_data_url ? 'blur' : 'empty'}
  blurDataURL={img.blur_data_url ?? undefined}
  loading={priority ? 'eager' : 'lazy'}
/>
```

Rules:
- Always provide explicit `width` + `height` to prevent CLS.
- Always provide `sizes` so Next picks the right candidate.
- Above-the-fold hero gets `priority`; everything else lazy-loads.
- The blur placeholder is < 1KB, generated at upload.

## Storage bucket policy

Bucket `product-images` is **public**. Access is controlled at the application layer (RLS on `product_images` requires `license_status IN ('owned','licensed','public_domain')` and parent product `is_published = true`). Unsuitable rows are never queried; their files exist in Storage but no public URL references them.

Bucket settings:
- Public: yes
- Max file size: 5 MB (server-side enforcement is the real check)
- Allowed MIME: `image/webp`, `image/jpeg`, `image/png`, `image/heic`, `image/heif`
- Path pattern: `<product_id>/<uuid>-<size>.webp`

## Image budgets

| Size key | Width | Target file size (WebP) |
|---|---|---|
| `thumb` | 200 | ≤ 8 KB |
| `card` | 480 | ≤ 30 KB |
| `detail` | 960 | ≤ 60 KB |
| `hero` | 1600 | ≤ 80 KB |

If sharp produces a file above the target, increase quality compression in 5-step decrements down to q=70 before giving up. Log a warning to `audit_logs` if a file ends up > target after compression.

## Hotlinking the Just Kraft CDN (dev only)

During seed:
- `product_images.url` = Just Kraft CDN URL
- `product_images.storage_path` = `null`
- `product_images.source` = `'justkraft_seed'`
- `product_images.license_status` = `'unverified'` (so RLS blocks them from public select)

This means seed images render in the admin (admin sees everything via authenticated role) but never on the storefront. The hotlinking is a development convenience; nothing serves them publicly.

Phase 4 (P4-T11) runs `scripts/migrate-images.mjs` which, for each image still pointing at the Just Kraft CDN that is associated with a product the owner wants to keep, downloads → re-processes via sharp → uploads to our Storage → updates `url` and `storage_path` and `source = 'owner_provided'`. Rows whose products the owner doesn't keep are simply not migrated.

## What we don't do (MVP)

- **No AI background removal** for product photos — deferred to Phase 5+. Photos go in as-shot.
- **No client-side image editing** (crop, rotate) — Phase 5+.
- **No DICOM, HEIC-on-Android quirks** support — heif/heic supported on upload via sharp; everything stored as WebP.
- **No CDN other than Vercel + Supabase Storage** — adequate for our scale.

## Failure modes to handle

- Network drop mid-upload → re-upload from scratch (no resumability in MVP; client retries). Document in CSV-import runbook that 4MB+ photos may need retry on flaky connections.
- Sharp pipeline crash on malformed image → catch, log to `audit_logs`, return user-friendly error, do not insert row.
- Storage quota exceeded → admin sees toast; the upload is rolled back (we never INSERT the row before the upload succeeds).
- Broken upstream URL on a seed row → nightly cron (P5-T06) HEAD-checks, marks `license_status = 'disputed'`, which immediately removes from public select.
