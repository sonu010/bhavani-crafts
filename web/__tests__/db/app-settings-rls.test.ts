/**
 * RLS posture for `app_settings` (migration 0020).
 *
 * The storefront's `getStorefrontSettings()` calls
 * `getAllAppSettings(createPublicClient())` — i.e. anon. If a future
 * commit accidentally drops a key from the public-allowlist policy,
 * or widens it past the documented set, this suite catches it.
 *
 * Pins:
 *   1. Anon CAN SELECT every key in PUBLIC_SETTINGS_KEYS.
 *   2. Anon CANNOT INSERT or UPDATE (only admin via service-role).
 *   3. Inserting a non-public key + reading via anon returns no row
 *      for that key.
 */
import { afterEach, describe, expect, it } from "vitest";
import { anon, srv } from "./_clients";
import {
  KNOWN_SETTINGS_KEYS,
  PUBLIC_SETTINGS_KEYS,
} from "@/lib/db/app-settings";

afterEach(async () => {
  await srv.from("app_settings").delete().like("key", "zzz_%");
});

describe("app_settings — anon RLS posture", () => {
  it("anon CAN SELECT every public-allowlisted key", async () => {
    const { data, error } = await anon
      .from("app_settings")
      .select("key, value")
      .in("key", PUBLIC_SETTINGS_KEYS);
    expect(error).toBeNull();
    const keys = (data ?? []).map((r) => r.key as string);
    // Every public key from the seed is visible.
    for (const k of PUBLIC_SETTINGS_KEYS) {
      expect(keys).toContain(k);
    }
  });

  it("anon CANNOT INSERT a new setting (RLS denies)", async () => {
    const { error } = await anon
      .from("app_settings")
      .insert({ key: "zzz_anon_insert", value: "should-fail" });
    expect(error).not.toBeNull();
    // Either an RLS violation or a permission denied — both fine.
    expect(error?.message ?? "").toMatch(/row-level security|policy|permission/i);
  });

  it("anon CANNOT UPDATE an existing setting", async () => {
    // Snapshot the seeded shop_name so we can restore.
    const { data: before } = await srv
      .from("app_settings")
      .select("value")
      .eq("key", "shop_name")
      .single();
    const original = (before?.value as string) ?? "";

    // anon attempt should be silently rejected (the row stays
    // untouched). Supabase JS returns null error + 0 rows updated
    // when RLS doesn't match a row, OR a 42501 if the policy
    // forbids the operation altogether. Either way the value
    // must not change.
    await anon
      .from("app_settings")
      .update({ value: "ANON-WROTE-THIS" })
      .eq("key", "shop_name");

    const { data: after } = await srv
      .from("app_settings")
      .select("value")
      .eq("key", "shop_name")
      .single();
    expect(after!.value).toBe(original);
  });

  it("a key outside the public-allowlist is NOT anon-readable, but admin sees it", async () => {
    // Seed a non-allowlisted key via srv.
    await srv
      .from("app_settings")
      .insert({ key: "zzz_private_key", value: "secret-value" });

    const { data: anonView } = await anon
      .from("app_settings")
      .select("key, value")
      .eq("key", "zzz_private_key");
    expect(anonView ?? []).toEqual([]);

    const { data: srvView } = await srv
      .from("app_settings")
      .select("value")
      .eq("key", "zzz_private_key")
      .single();
    expect(srvView!.value).toBe("secret-value");
  });

  it("KNOWN_SETTINGS_KEYS and PUBLIC_SETTINGS_KEYS are in sync at MVP", async () => {
    // Today every known key is public. If that ever diverges we want
    // a deliberate test break, not a silent drift.
    expect(new Set(PUBLIC_SETTINGS_KEYS)).toEqual(
      new Set(KNOWN_SETTINGS_KEYS),
    );
  });
});
