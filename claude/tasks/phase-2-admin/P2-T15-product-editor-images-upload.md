---
id: P2-T15
phase: 2
title: Product editor — image upload
status: not_started
depends_on: [P2-T11]
estimate_hours: 4
owner: ai
last_updated: 2026-05-17
---

# Goal

After this task, the Images tab of the product editor accepts multiple image uploads (drag-drop + file picker), validates each file rigorously, strips EXIF, generates a LQIP blur-data-url, uploads to Supabase Storage, and inserts a `product_images` row with `license_status='unverified'` (owner verifies in a follow-up flow). Reorder lands in P2-T16. Every layer of file-upload security from [security.md §"File-upload validation"](../../architecture/security.md) is enforced.

# Prerequisites (read first)

- [claude/architecture/security.md](../../architecture/security.md) §"File-upload validation" — every rule below is locked there, verbatim
- [claude/architecture/database-schema.md](../../architecture/database-schema.md) §"product_images" — table shape, enums `image_source`, `license_status`
- [claude/architecture/security.md](../../architecture/security.md) §"Service-role key isolation" — `/api/admin/images/upload` is allowed to import `lib/db/admin.ts`
- [claude/architecture/security.md](../../architecture/security.md) §"Rate limits" — 30/min authenticated for image uploads
- [P2-T11](P2-T11-product-editor-basic-fields.md) — save action pattern; audit log shape

# Files to touch

- `web/src/app/admin/products/[id]/edit/_tabs/images.tsx` (modified) — client; renders dropzone + thumbnail grid + per-image actions
- `web/src/app/admin/products/[id]/edit/_images/dropzone.tsx` (new) — client; drag-drop + file picker; per-file upload progress
- `web/src/app/api/admin/images/upload/route.ts` (new) — POST handler. The ONLY image-upload endpoint. Server-side validation + sharp pipeline.
- `web/src/lib/images/validate.ts` (new) — `validateUpload(buffer): Promise<{ mime: string; width: number; height: number; size: number } | ValidationError>`
- `web/src/lib/images/pipeline.ts` (new) — `processImage(buffer, mime)`: strip EXIF via sharp, optionally re-encode to webp at quality 85, generate blur_data_url (base64 of 8×8 webp)
- `web/src/lib/db/admin/images.ts` (new) — `insertProductImage(supabase, productId, opts)`
- `web/src/lib/auth/rate-limit.ts` (modified — extends the one from P2-T01) — add `enforceImageUploadRateLimit(userId)`: 30/min sliding
- `web/__tests__/api/admin/images-upload.test.ts` (new)

# Implementation notes

**Server-side validation pipeline (in this order, fail-fast per engineering-principles):**

1. **AuthZ.** `requireRole(supabase, 'admin')` + `requireAAL2(supabase)`. Throws → 401 / 403 per middleware mapping.
2. **Rate limit.** `enforceImageUploadRateLimit(userId)`. On block → HTTP 429 + `Retry-After`.
3. **Size cap.** Reject if Content-Length > 5 × 1024 × 1024 (5 MB). HTTP 413.
4. **MIME sniff.** `import { fileTypeFromBuffer } from 'file-type';` — sniff the actual bytes; do not trust the client `Content-Type`. Allowed set: `image/webp`, `image/jpeg`, `image/png`, `image/heic`, `image/heif`. Anything else → HTTP 400 with clear message.
5. **Dimensions.** `await sharp(buffer).metadata()` → `{ width, height }`. Reject if either > 4000. HTTP 400.
6. **EXIF strip + transcode.** `sharp(buffer).rotate().withMetadata({ exif: {} }).webp({ quality: 85 })` → output buffer. Always re-encode to webp for storage normalization. `.rotate()` ensures the image is correctly oriented based on the original EXIF before we strip it.
7. **LQIP.** `sharp(originalBuffer).resize(8, 8, { fit: 'inside' }).webp({ quality: 30 })` → base64 data URL. ~200 bytes; safe to ship inline on the storefront.
8. **Upload to Supabase Storage.** Bucket: `product-images`. Path: `<productId>/<random-uuid>.webp`. Public bucket (storefront needs direct CDN URLs). Use the service-role client.
9. **Insert `product_images` row.** Columns: `product_id`, `storage_path`, `url` (public URL from storage), `width`, `height`, `sort_order` (next integer), `blur_data_url`, `source='admin_upload'`, `license_status='unverified'`. Owner verifies licensing in a separate flow before publish (launch-blockers script checks this — see [security.md](../../architecture/security.md) §"RLS attack test").
10. **Audit log.** `product.image_upload` with `entity_id = newImage.id`, `after_json = { url, width, height, license_status }`.
11. **Revalidate.** `revalidatePath('/p/' + slug)` + `revalidateTag('product:' + slug)`.

**Reject silently? No.** Per [security.md §"File-upload validation"](../../architecture/security.md) line 89: return 400 with a clear message so the admin can correct.

**Validation error shape.**

```ts
type ValidationError =
  | { code: "too_large"; size: number; maxSize: 5242880 }
  | { code: "bad_mime"; sniffed: string | null; allowed: string[] }
  | { code: "too_wide"; width: number; height: number; max: 4000 }
  | { code: "decode_failed"; reason: string };
```

The client renders each as inline text under the failed file's thumbnail.

**License status default.** Always `unverified` on upload. The launch-blockers check requires `license_status IN ('owned','licensed','public_domain')` before publish — so an unverified image blocks publish until the owner sets the right value (separate flow, not part of this task; surfaces as a warning in P2-T17's Publish tab).

**Storage path scheme.** `<productId>/<uuid>.webp`. Putting product UUID in the path lets us bulk-delete via prefix when a product is hard-deleted. UUID filename avoids collisions + makes URLs unguessable (a soft layer; storage is public, but obscurity helps with hotlinking abuse).

**Public bucket.** Yes — performance requires it (CDN, no signed URLs per request). Storage RLS still applies: only admin-role clients can INSERT/UPDATE/DELETE; anon clients can only SELECT.

**Concurrent upload limit.** Client-side: max 3 simultaneous uploads to avoid saturating the user's bandwidth + tripping rate limits. Queue the rest.

**No client-side resizing.** The server is the source of truth. Client-side preview shows the raw thumbnail; the server-stripped + webp-encoded version is what gets stored. Don't waste user CPU on operations the server will redo.

**HEIC/HEIF support.** `sharp` handles HEIC via libheif if compiled in. Vercel's runtime sharp includes libheif. Test path: upload a HEIC → server transcodes to webp → stored + displayed normally.

# Acceptance criteria

- [ ] Dropzone accepts drag-drop + file-picker; multi-file.
- [ ] Server rejects > 5 MB with 413.
- [ ] Server rejects non-image MIME with 400, even if Content-Type claims image (sniffed via `file-type`).
- [ ] Server rejects > 4000×4000 px with 400.
- [ ] Successful upload strips EXIF (verify via `exiftool` or `sharp.metadata` on the stored object — no EXIF tags present).
- [ ] Successful upload transcodes to webp.
- [ ] `product_images` row inserted with `license_status='unverified'`, correct `width`, `height`, `blur_data_url`.
- [ ] `audit_logs` has `product.image_upload` row.
- [ ] 31st upload from the same user in a minute returns 429 + `Retry-After`.
- [ ] Anonymous POST → 401. Viewer POST → 403.
- [ ] HEIC upload succeeds (transcoded server-side).
- [ ] `pnpm tsc --noEmit`, `pnpm lint`, `pnpm build` green. `pnpm exec vitest run __tests__/api/admin/images-upload.test.ts` green. `pnpm launch-blockers` still green.

# Verification

```bash
cd web
pnpm exec vitest run __tests__/api/admin/images-upload.test.ts
pnpm launch-blockers

pnpm dev &
sleep 4

# As admin, in the Images tab:
# 1. Drop a JPEG → uploads → thumbnail appears → product_images row inserted
# 2. Drop a 7 MB JPEG → 413 with clear message
# 3. Drop a renamed-PDF (`mv x.pdf y.jpg`) → 400 "bad_mime" because sniff says application/pdf
# 4. Drop a 5000×3000 image → 400 "too_wide"
# 5. Drop a HEIC → succeeds, stored as webp
# 6. Rapid 31 uploads → 31st returns 429

# Verify EXIF strip:
curl -s '<storage public url>' > /tmp/uploaded.webp
exiftool /tmp/uploaded.webp | grep -i 'exif\|gps' && echo "FAIL: EXIF leaked" || echo "PASS"
```

# Dependencies added

- `file-type` — MIME sniffing from buffer bytes (don't trust client Content-Type)
- `sharp` — already installed (image processing)

# Notes for next agent

(empty)
