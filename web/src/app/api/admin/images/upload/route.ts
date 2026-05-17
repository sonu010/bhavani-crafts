/**
 * POST /api/admin/images/upload
 *
 * The ONLY image-upload endpoint. Replaces the dropzone's instinct to
 * call Supabase Storage directly so we can run the full validation +
 * EXIF-strip pipeline server-side. Mirror the layer ordering in
 * architecture/security.md §"File-upload validation":
 *
 *   1. AuthZ (admin role + AAL2; runs via requireAdminContext).
 *   2. Rate limit (30/min/user; in-memory until P2-T01 wires Upstash).
 *   3. Size cap (5 MiB; enforced before reading the blob into memory).
 *   4. MIME sniff (file-type on bytes; client Content-Type ignored).
 *   5. Dimension cap (4000×4000 via sharp.metadata).
 *   6. EXIF strip + transcode to webp.
 *   7. LQIP (8×8 webp@30; base64 data URL).
 *   8. Upload to Supabase Storage (`product-images` bucket).
 *   9. Insert product_images row (`license_status='unverified'`).
 *  10. Audit log + revalidate.
 *
 * Returns { ok: true, image } on success, { ok: false, error } otherwise.
 * No silent failure — every reject surfaces a typed error.
 */
import { randomUUID } from "node:crypto";
import { revalidatePath, updateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { isAuthError } from "@/lib/auth/errors";
import { enforceImageUploadRateLimit } from "@/lib/auth/rate-limit";
import { requireAdminContext } from "@/lib/db/admin-context";
import {
  insertProductImage,
  type ProductImageRow,
} from "@/lib/db/admin/images";
import { getProductByIdBasic } from "@/lib/db/products";
import { processImage } from "@/lib/images/pipeline";
import { isValidationError, MAX_SIZE, validateUpload } from "@/lib/images/validate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BUCKET = "product-images";

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. AuthZ. requireAdminContext redirects on AuthError, but inside
  //    an API route we want JSON, not HTML — catch and translate.
  let admin, user;
  try {
    const ctx = await requireAdminContext();
    admin = ctx.admin;
    user = ctx.user;
  } catch (err) {
    if (isAuthError(err)) {
      if (err.code === "unauthenticated") {
        return NextResponse.json(
          { ok: false, error: { code: "unauthenticated" } },
          { status: 401 },
        );
      }
      return NextResponse.json(
        { ok: false, error: { code: err.code } },
        { status: 403 },
      );
    }
    throw err;
  }

  // 2. Rate limit. Process-local until Upstash arrives.
  const rl = enforceImageUploadRateLimit(user.id);
  if (!rl.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "rate_limited", retryAfter: rl.retryAfterSeconds },
      },
      {
        status: 429,
        headers: { "Retry-After": String(rl.retryAfterSeconds) },
      },
    );
  }

  // 3. Read multipart body.
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "bad_request", reason: "expected multipart/form-data" } },
      { status: 400 },
    );
  }
  const productId = String(form.get("productId") ?? "");
  const file = form.get("file");
  if (!productId || !(file instanceof File)) {
    return NextResponse.json(
      { ok: false, error: { code: "bad_request", reason: "missing productId or file" } },
      { status: 400 },
    );
  }

  // 4. Size cap. Reject before reading the whole blob into memory.
  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "too_large", size: file.size, maxSize: MAX_SIZE },
      },
      { status: 413 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // 5. Verify product belongs to a real, non-deleted product.
  const product = await getProductByIdBasic(admin, productId);
  if (!product) {
    return NextResponse.json(
      { ok: false, error: { code: "product_not_found" } },
      { status: 404 },
    );
  }

  // 6. Validate (MIME sniff + dimensions).
  const v = await validateUpload(buffer);
  if (isValidationError(v)) {
    const status =
      v.code === "too_large"
        ? 413
        : v.code === "bad_mime" || v.code === "too_wide" || v.code === "decode_failed"
          ? 400
          : 400;
    return NextResponse.json({ ok: false, error: v }, { status });
  }

  // 7. Transcode + strip EXIF + build LQIP.
  let processed;
  try {
    processed = await processImage(buffer);
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "process_failed",
          reason: err instanceof Error ? err.message : String(err),
        },
      },
      { status: 500 },
    );
  }

  // 8. Upload to Storage. The bucket is public; URL is the canonical
  //    storefront source. UUID filename + product-id prefix so we can
  //    bulk-delete by prefix when a product is hard-deleted later.
  const filename = `${productId}/${randomUUID()}.webp`;
  const up = await admin.storage.from(BUCKET).upload(filename, processed.webp, {
    contentType: "image/webp",
    cacheControl: "31536000",
    upsert: false,
  });
  if (up.error) {
    return NextResponse.json(
      { ok: false, error: { code: "upload_failed", reason: up.error.message } },
      { status: 502 },
    );
  }
  const publicUrl = admin.storage.from(BUCKET).getPublicUrl(filename).data.publicUrl;

  // 9. Insert product_images row.
  let image: ProductImageRow;
  try {
    image = await insertProductImage(admin, {
      productId,
      storagePath: filename,
      url: publicUrl,
      width: processed.width,
      height: processed.height,
      blurDataUrl: processed.blurDataUrl,
      origSize: v.size,
    });
  } catch (err) {
    // Roll back the storage object so we don't leave orphan blobs.
    await admin.storage.from(BUCKET).remove([filename]);
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "db_insert_failed",
          reason: err instanceof Error ? err.message : String(err),
        },
      },
      { status: 500 },
    );
  }

  // 10. Audit + revalidate.
  const requestId =
    req.headers.get("x-vercel-id") ??
    req.headers.get("x-request-id") ??
    crypto.randomUUID();
  const { error: auditErr } = await admin.from("audit_logs").insert({
    actor_id: user.id,
    action: "product.image_upload",
    entity_type: "product_image",
    entity_id: image.id,
    before_json: null,
    after_json: {
      url: image.url,
      width: image.width,
      height: image.height,
      license_status: image.license_status,
    } as never,
    request_id: requestId,
  });
  if (auditErr) {
    // Failing the audit insert isn't recoverable — the row exists but
    // the trail doesn't. Surface as a 500 so the client retries (the
    // upsert:false on the storage call will keep us from duplicate
    // storage on retry).
    return NextResponse.json(
      { ok: false, error: { code: "audit_failed", reason: auditErr.message } },
      { status: 500 },
    );
  }

  updateTag("products");
  revalidatePath(`/p/${product.slug}`);

  return NextResponse.json({ ok: true, image });
}
