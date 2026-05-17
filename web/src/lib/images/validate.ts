/**
 * Server-side image upload validation.
 *
 * The contract here matches architecture/security.md §"File-upload
 * validation" line-by-line:
 *   - Size cap 5 MiB
 *   - MIME sniffed from buffer bytes (not Content-Type header)
 *   - Allowed: webp, jpeg, png, heic, heif
 *   - Dimensions ≤ 4000 × 4000
 *
 * Validation runs BEFORE any sharp transcode so a malicious upload
 * that crashes sharp is gated by the cheap MIME sniff first. Decode
 * failures (sharp can't parse despite a valid MIME) are surfaced as
 * `decode_failed`.
 */
import "server-only";
import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";

export const MAX_SIZE = 5 * 1024 * 1024;
export const MAX_DIMENSION = 4000;
export const ALLOWED_MIME = [
  "image/webp",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
] as const;

export type AllowedMime = (typeof ALLOWED_MIME)[number];

export type ValidationError =
  | { code: "too_large"; size: number; maxSize: typeof MAX_SIZE }
  | { code: "bad_mime"; sniffed: string | null; allowed: readonly string[] }
  | { code: "too_wide"; width: number; height: number; max: typeof MAX_DIMENSION }
  | { code: "decode_failed"; reason: string };

export type ValidationOk = {
  mime: AllowedMime;
  width: number;
  height: number;
  size: number;
};

export async function validateUpload(
  buffer: Buffer,
): Promise<ValidationOk | ValidationError> {
  if (buffer.byteLength > MAX_SIZE) {
    return { code: "too_large", size: buffer.byteLength, maxSize: MAX_SIZE };
  }

  // 1. MIME sniff. Header is not authoritative.
  const sniffed = await fileTypeFromBuffer(buffer);
  if (!sniffed || !(ALLOWED_MIME as readonly string[]).includes(sniffed.mime)) {
    return {
      code: "bad_mime",
      sniffed: sniffed?.mime ?? null,
      allowed: ALLOWED_MIME,
    };
  }
  const mime = sniffed.mime as AllowedMime;

  // 2. Decode + dimensions via sharp. Wrap so any libheif / libjpeg
  // error surfaces as decode_failed instead of an unhandled exception.
  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(buffer).metadata();
  } catch (err) {
    return {
      code: "decode_failed",
      reason: err instanceof Error ? err.message : String(err),
    };
  }
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (!width || !height) {
    return { code: "decode_failed", reason: "missing dimensions" };
  }
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    return { code: "too_wide", width, height, max: MAX_DIMENSION };
  }

  return { mime, width, height, size: buffer.byteLength };
}

export function isValidationError(
  r: ValidationOk | ValidationError,
): r is ValidationError {
  return "code" in r;
}
