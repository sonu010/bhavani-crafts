/**
 * Unit tests for the image-upload validator.
 *
 * Generates fixture images on the fly via sharp so we don't carry
 * binary blobs in the repo.
 */
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  validateUpload,
  isValidationError,
  MAX_SIZE,
  MAX_DIMENSION,
} from "@/lib/images/validate";

async function makeJpeg(width: number, height: number): Promise<Buffer> {
  return await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 240, g: 240, b: 200 },
    },
  })
    .jpeg({ quality: 70 })
    .toBuffer();
}

async function makePng(width: number, height: number): Promise<Buffer> {
  return await sharp({
    create: { width, height, channels: 3, background: "#ccc" },
  })
    .png()
    .toBuffer();
}

describe("validateUpload", () => {
  it("accepts a small JPEG", async () => {
    const buf = await makeJpeg(800, 600);
    const r = await validateUpload(buf);
    expect(isValidationError(r)).toBe(false);
    if (!isValidationError(r)) {
      expect(r.mime).toBe("image/jpeg");
      expect(r.width).toBe(800);
      expect(r.height).toBe(600);
    }
  });

  it("accepts a small PNG", async () => {
    const buf = await makePng(640, 480);
    const r = await validateUpload(buf);
    expect(isValidationError(r)).toBe(false);
    if (!isValidationError(r)) {
      expect(r.mime).toBe("image/png");
    }
  });

  it("rejects non-image bytes as bad_mime", async () => {
    const buf = Buffer.from("This is plain text, not an image");
    const r = await validateUpload(buf);
    expect(isValidationError(r)).toBe(true);
    if (isValidationError(r)) {
      expect(r.code).toBe("bad_mime");
    }
  });

  it("rejects a PDF claiming to be a JPEG", async () => {
    // Minimal PDF header — file-type sniffs application/pdf.
    const buf = Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "binary");
    const r = await validateUpload(buf);
    expect(isValidationError(r)).toBe(true);
    if (isValidationError(r) && r.code === "bad_mime") {
      expect(r.sniffed).toBe("application/pdf");
    }
  });

  it("rejects images > MAX_DIMENSION", async () => {
    const buf = await makeJpeg(MAX_DIMENSION + 100, 1000);
    const r = await validateUpload(buf);
    expect(isValidationError(r)).toBe(true);
    if (isValidationError(r) && r.code === "too_wide") {
      expect(r.width).toBe(MAX_DIMENSION + 100);
    }
  }, 20_000);

  it("rejects buffers > MAX_SIZE", async () => {
    // Pure zeros — well over the 5 MiB cap.
    const buf = Buffer.alloc(MAX_SIZE + 1);
    const r = await validateUpload(buf);
    expect(isValidationError(r)).toBe(true);
    if (isValidationError(r)) {
      expect(r.code).toBe("too_large");
    }
  });
});
