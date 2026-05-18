/**
 * Unit tests for preview-token signing + verification.
 *
 * The module reads PREVIEW_TOKEN_SECRET at call time, so tests can
 * override it temporarily.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  signPreviewToken,
  verifyPreviewToken,
} from "@/lib/auth/preview-token";

const SECRET = "test-secret-not-real-please-rotate-before-deploy";
const PRODUCT_ID = "11111111-1111-1111-1111-111111111111";

let originalSecret: string | undefined;

beforeEach(() => {
  originalSecret = process.env.PREVIEW_TOKEN_SECRET;
  process.env.PREVIEW_TOKEN_SECRET = SECRET;
  vi.useFakeTimers();
});

afterEach(() => {
  process.env.PREVIEW_TOKEN_SECRET = originalSecret;
  vi.useRealTimers();
});

describe("signPreviewToken + verifyPreviewToken", () => {
  it("round-trips a valid token", async () => {
    const token = await signPreviewToken(PRODUCT_ID);
    const payload = await verifyPreviewToken(token, PRODUCT_ID);
    expect(payload).not.toBeNull();
    expect(payload?.productId).toBe(PRODUCT_ID);
  });

  it("rejects a token for a different product", async () => {
    const token = await signPreviewToken(PRODUCT_ID);
    const payload = await verifyPreviewToken(
      token,
      "22222222-2222-2222-2222-222222222222",
    );
    expect(payload).toBeNull();
  });

  it("rejects tampered tokens", async () => {
    const token = await signPreviewToken(PRODUCT_ID);
    const tampered = token.slice(0, -2) + "AA";
    const payload = await verifyPreviewToken(tampered, PRODUCT_ID);
    expect(payload).toBeNull();
  });

  it("rejects tokens older than 15 minutes", async () => {
    const token = await signPreviewToken(PRODUCT_ID);
    // Advance past 15 minutes
    vi.advanceTimersByTime(16 * 60 * 1000);
    const payload = await verifyPreviewToken(token, PRODUCT_ID);
    expect(payload).toBeNull();
  });

  it("throws when secret is unset", async () => {
    delete process.env.PREVIEW_TOKEN_SECRET;
    await expect(signPreviewToken(PRODUCT_ID)).rejects.toThrow(
      /PREVIEW_TOKEN_SECRET/,
    );
  });
});
