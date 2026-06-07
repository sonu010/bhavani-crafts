/**
 * `getAllAppSettings` + downstream `getStorefrontSettings` behaviour
 * against a real local stack — the integration-level pin for the
 * footer/CTA/checkout cascade.
 *
 * `getStorefrontSettings` itself is `unstable_cache`-wrapped, so a
 * value flipped mid-test doesn't propagate (the tag flush is what
 * does that, and it requires Next's runtime context). These tests
 * therefore exercise `getAllAppSettings` (the underlying read) +
 * separately assert on the normaliser behaviour expected of the
 * `getStorefrontSettings` reader.
 *
 * Pins:
 *   1. Edited values round-trip through the public-RLS view.
 *   2. Garbage values in the DB don't break the public reader —
 *      malformed shipping is dropped, the storefront-reader's
 *      normaliser would fall back to the env/default.
 *   3. Soft-deleted keys (we don't soft-delete settings, but the
 *      schema would allow updating value to empty) round-trip.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { anon, srv } from "./_clients";
import {
  getAllAppSettings,
  upsertAppSetting,
} from "@/lib/db/app-settings";

const SNAPSHOT: Record<string, string> = {};

beforeAll(async () => {
  const { data } = await srv
    .from("app_settings")
    .select("key, value")
    .in("key", ["shop_name", "whatsapp_number", "instagram_url", "shipping_flat_inr"]);
  for (const r of data ?? []) {
    SNAPSHOT[r.key as string] = (r.value as string) ?? "";
  }
});

afterEach(async () => {
  for (const [key, value] of Object.entries(SNAPSHOT)) {
    await srv.from("app_settings").upsert({ key, value }, { onConflict: "key" });
  }
});

describe("getStorefrontSettings reader contract", () => {
  it("edited values round-trip through the anon-RLS read", async () => {
    await upsertAppSetting(srv, "shop_name", "Storefront Test Shop", null);
    await upsertAppSetting(srv, "whatsapp_number", "919876543210", null);
    await upsertAppSetting(srv, "shipping_flat_inr", "75", null);

    // Read via anon — same path the storefront reader uses.
    const fromAnon = await getAllAppSettings(anon);
    expect(fromAnon.shop_name).toBe("Storefront Test Shop");
    expect(fromAnon.whatsapp_number).toBe("919876543210");
    expect(fromAnon.shipping_flat_inr).toBe("75");
  });

  it("anon sees a fresh value within one round-trip (no read-your-write delay)", async () => {
    await upsertAppSetting(srv, "shop_name", "Fresh Read", null);
    const data = await getAllAppSettings(anon);
    expect(data.shop_name).toBe("Fresh Read");
  });

  it("an empty whatsapp_number is preserved as empty string (the reader normalises to '')", async () => {
    await upsertAppSetting(srv, "whatsapp_number", "", null);
    const data = await getAllAppSettings(anon);
    expect(data.whatsapp_number).toBe("");
  });

  it("a garbage shipping_flat_inr is still readable via getAllAppSettings (the storefront reader normalises away)", async () => {
    await upsertAppSetting(srv, "shipping_flat_inr", "FREE", null);
    const data = await getAllAppSettings(anon);
    // The k/v read returns the raw string; getStorefrontSettings'
    // normaliseShipping turns it into null → fallback to DEFAULT 50.
    expect(data.shipping_flat_inr).toBe("FREE");
  });

  it("DEFAULTS fill in when no row is present (handled in lib/db/app-settings.ts)", async () => {
    // Wipe the shop_name row (admin DELETE is allowed via srv).
    await srv.from("app_settings").delete().eq("key", "shop_name");
    const data = await getAllAppSettings(anon);
    expect(data.shop_name).toBe("Bhavani Crafts"); // DEFAULTS
  });
});
