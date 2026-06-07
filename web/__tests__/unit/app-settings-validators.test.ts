/**
 * Unit tests for `validateAppSettingValue` (lib/db/app-settings-validators.ts).
 *
 * Each known key has its own validation rules. These tests pin the
 * exact accept/reject lines so a future "tidy-up" can't quietly let
 * past values that the storefront downstream is going to crash on
 * (e.g. an instagram_url that isn't HTTPS, a non-numeric shipping
 * rate).
 *
 * Pure logic, no I/O.
 */
import { describe, expect, it } from "vitest";
import { validateAppSettingValue } from "@/lib/db/app-settings-validators";

describe("validateAppSettingValue — shop_name", () => {
  it("accepts a normal value", () => {
    expect(validateAppSettingValue("shop_name", "Bhavani Crafts")).toBeNull();
  });

  it("rejects empty", () => {
    expect(validateAppSettingValue("shop_name", "")).toMatch(/empty/i);
  });

  it("accepts exactly 80 chars (boundary)", () => {
    expect(validateAppSettingValue("shop_name", "x".repeat(80))).toBeNull();
  });

  it("rejects 81 chars (boundary)", () => {
    expect(validateAppSettingValue("shop_name", "x".repeat(81))).toMatch(
      /80/,
    );
  });
});

describe("validateAppSettingValue — whatsapp_number", () => {
  it("accepts empty (the field is optional)", () => {
    expect(validateAppSettingValue("whatsapp_number", "")).toBeNull();
  });

  it("accepts a digits-only Indian number", () => {
    expect(
      validateAppSettingValue("whatsapp_number", "919876543210"),
    ).toBeNull();
  });

  it("accepts a + prefix", () => {
    expect(
      validateAppSettingValue("whatsapp_number", "+919876543210"),
    ).toBeNull();
  });

  it("rejects spaces (validator runs AFTER the action's trim, so spaces inside aren't allowed)", () => {
    expect(
      validateAppSettingValue("whatsapp_number", "+91 9876543210"),
    ).toMatch(/digits/i);
  });

  it("rejects letters", () => {
    expect(validateAppSettingValue("whatsapp_number", "phone-me")).toMatch(
      /digits/i,
    );
  });

  it("rejects too-short (6 digits)", () => {
    expect(validateAppSettingValue("whatsapp_number", "123456")).toMatch(
      /digits/i,
    );
  });

  it("rejects too-long (16 digits)", () => {
    expect(
      validateAppSettingValue("whatsapp_number", "1234567890123456"),
    ).toMatch(/digits/i);
  });
});

describe("validateAppSettingValue — instagram_url", () => {
  it("accepts empty (optional)", () => {
    expect(validateAppSettingValue("instagram_url", "")).toBeNull();
  });

  it("accepts a canonical Instagram URL", () => {
    expect(
      validateAppSettingValue(
        "instagram_url",
        "https://instagram.com/bhavanicrafts",
      ),
    ).toBeNull();
  });

  it("accepts the www. variant", () => {
    expect(
      validateAppSettingValue(
        "instagram_url",
        "https://www.instagram.com/bhavanicrafts",
      ),
    ).toBeNull();
  });

  it("accepts a trailing slash", () => {
    expect(
      validateAppSettingValue(
        "instagram_url",
        "https://instagram.com/bhavanicrafts/",
      ),
    ).toBeNull();
  });

  it("rejects http:// (must be https)", () => {
    expect(
      validateAppSettingValue(
        "instagram_url",
        "http://instagram.com/bhavanicrafts",
      ),
    ).toMatch(/instagram/i);
  });

  it("rejects non-Instagram hosts", () => {
    expect(
      validateAppSettingValue(
        "instagram_url",
        "https://twitter.com/bhavanicrafts",
      ),
    ).toMatch(/instagram/i);
  });

  it("rejects an empty handle", () => {
    expect(
      validateAppSettingValue("instagram_url", "https://instagram.com/"),
    ).toMatch(/instagram/i);
  });
});

describe("validateAppSettingValue — shipping_flat_inr", () => {
  it("accepts 0 (free shipping)", () => {
    expect(validateAppSettingValue("shipping_flat_inr", "0")).toBeNull();
  });

  it("accepts a positive whole number", () => {
    expect(validateAppSettingValue("shipping_flat_inr", "50")).toBeNull();
    expect(validateAppSettingValue("shipping_flat_inr", "150")).toBeNull();
  });

  it("rejects empty", () => {
    expect(validateAppSettingValue("shipping_flat_inr", "")).toMatch(/empty/i);
  });

  it("rejects non-numeric input", () => {
    expect(validateAppSettingValue("shipping_flat_inr", "free")).toMatch(
      /number/i,
    );
  });

  it("rejects a decimal", () => {
    expect(validateAppSettingValue("shipping_flat_inr", "49.99")).toMatch(
      /whole/i,
    );
  });

  it("rejects a negative", () => {
    expect(validateAppSettingValue("shipping_flat_inr", "-10")).toMatch(
      /≥ 0/,
    );
  });
});
