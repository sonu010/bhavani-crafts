/**
 * Image processing pipeline. Runs AFTER validateUpload has confirmed
 * the buffer is a valid, in-bounds image.
 *
 *   - `.rotate()` first applies the EXIF orientation, then we strip
 *     EXIF on the way out — so the final file is upright AND has no
 *     metadata trail (camera model, geotag, time).
 *   - Always re-encode to webp@85 for storage uniformity. Lets us
 *     drop format-conditional rendering later.
 *   - LQIP: 8×8 webp@30, base64 data URL. ~200 bytes; safe to ship
 *     inline in the page response.
 */
import "server-only";
import sharp from "sharp";

export type ProcessedImage = {
  webp: Buffer;
  width: number;
  height: number;
  blurDataUrl: string;
};

const WEBP_QUALITY = 85;
const LQIP_QUALITY = 30;
const LQIP_SIZE = 8;

export async function processImage(buffer: Buffer): Promise<ProcessedImage> {
  // `.rotate()` with no argument applies the EXIF orientation, then
  // sharp's default behavior (no `.withMetadata()`) strips ALL metadata
  // from output — EXIF, IPTC, XMP. The image is upright AND clean.
  const upright = sharp(buffer).rotate();
  const [{ data: webp, info }, blurBuf] = await Promise.all([
    upright
      .clone()
      .webp({ quality: WEBP_QUALITY })
      .toBuffer({ resolveWithObject: true }),
    upright
      .clone()
      .resize(LQIP_SIZE, LQIP_SIZE, { fit: "inside" })
      .webp({ quality: LQIP_QUALITY })
      .toBuffer(),
  ]);

  return {
    webp,
    width: info.width,
    height: info.height,
    blurDataUrl: `data:image/webp;base64,${blurBuf.toString("base64")}`,
  };
}
