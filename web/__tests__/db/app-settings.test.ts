/**
 * Tests for `getAllAppSettings` + `upsertAppSetting` (lib/db/app-settings.ts).
 *
 * Pins:
 *   1. The DEFAULTS object covers missing rows (anon-friendly fallback).
 *   2. The k/v read returns the seeded values from 0020.
 *   3. Upsert overwrites + the next read sees the new value.
 *   4. The key-format CHECK constraint rejects bad keys at the DB.
 */
import { afterEach, describe, expect, it } from "vitest";
import { srv } from "./_clients";
import {
  KNOWN_SETTINGS_KEYS,
  getAllAppSettings,
  upsertAppSetting,
} from "@/lib/db/app-settings";

const TAG = `zzz-settings-${Date.now()}`;
const SNAPSHOT: Record<string, string> = {};

// Snapshot the seeded values before each mutation test, restore after.
async function snapshotSettings() {
  const { data } = await srv
    .from("app_settings")
    .select("key, value")
    .in("key", [...KNOWN_SETTINGS_KEYS]);
  for (const r of data ?? []) {
    SNAPSHOT[r.key as string] = (r.value as string) ?? "";
  }
}

async function restoreSettings() {
  for (const [key, value] of Object.entries(SNAPSHOT)) {
    await srv
      .from("app_settings")
      .upsert({ key, value }, { onConflict: "key" });
  }
}

afterEach(async () => {
  if (Object.keys(SNAPSHOT).length > 0) {
    await restoreSettings();
    for (const k of Object.keys(SNAPSHOT)) delete SNAPSHOT[k];
  }
});

describe("app_settings", () => {
  it("getAllAppSettings returns the seeded shop_name", async () => {
    const s = await getAllAppSettings(srv);
    expect(s.shop_name).toBe("Bhavani Crafts");
  });

  it("getAllAppSettings includes every KNOWN_SETTINGS_KEY", async () => {
    const s = await getAllAppSettings(srv);
    for (const key of KNOWN_SETTINGS_KEYS) {
      expect(s).toHaveProperty(key);
      expect(typeof s[key]).toBe("string");
    }
  });

  it("upsertAppSetting updates the value + getAllAppSettings reads it back", async () => {
    await snapshotSettings();
    await upsertAppSetting(srv, "shop_name", `${TAG} Test Shop`, null);
    const s = await getAllAppSettings(srv);
    expect(s.shop_name).toBe(`${TAG} Test Shop`);
  });

  it("upsertAppSetting handles repeated calls on the same key (idempotent)", async () => {
    await snapshotSettings();
    await upsertAppSetting(srv, "shipping_flat_inr", "75", null);
    await upsertAppSetting(srv, "shipping_flat_inr", "75", null);
    await upsertAppSetting(srv, "shipping_flat_inr", "75", null);
    const s = await getAllAppSettings(srv);
    expect(s.shipping_flat_inr).toBe("75");
  });

  it("DB rejects keys that don't match the [a-z][a-z0-9_]+ pattern", async () => {
    const { error } = await srv
      .from("app_settings")
      .insert({ key: "BAD-KEY", value: "x" });
    expect(error).not.toBeNull();
    // 23514 = check_violation
    expect(error?.code).toBe("23514");
  });
});
