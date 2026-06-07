import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types.gen";

type SC = SupabaseClient<Database>;

/**
 * Owner-editable shop configuration (table created in migration 0020).
 *
 * The known keys are TS-enumerated here so:
 *   - the admin Settings page can render an editor row per key
 *   - storefront consumers (footer, checkout) can read by typed key
 *   - typos at compile time, not runtime
 *
 * Adding a new key:
 *   1. Add it to KNOWN_KEYS below.
 *   2. Seed it in 0020 (or a follow-up migration) so the row exists.
 *   3. If anon needs to read it, add to the public-allowlist policy
 *      in 0020 (or follow-up). Don't widen casually — anon SELECT
 *      is the storefront's whole API surface for these.
 */
export const KNOWN_SETTINGS_KEYS = [
  "shop_name",
  "whatsapp_number",
  "instagram_url",
  "shipping_flat_inr",
] as const;

export type AppSettingsKey = (typeof KNOWN_SETTINGS_KEYS)[number];

/** Public-allowlisted keys — match the RLS policy in 0020. */
export const PUBLIC_SETTINGS_KEYS: AppSettingsKey[] = [
  "shop_name",
  "whatsapp_number",
  "instagram_url",
  "shipping_flat_inr",
];

export interface AppSettingsMap {
  shop_name: string;
  whatsapp_number: string;
  instagram_url: string;
  shipping_flat_inr: string;
}

const DEFAULTS: AppSettingsMap = {
  shop_name: "Bhavani Crafts",
  whatsapp_number: "",
  instagram_url: "",
  shipping_flat_inr: "50",
};

/** Read every known key in one shot. Missing rows fall back to DEFAULTS. */
export async function getAllAppSettings(supabase: SC): Promise<AppSettingsMap> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", [...KNOWN_SETTINGS_KEYS]);
  if (error) throw new Error(`getAllAppSettings: ${error.message}`);
  const map: AppSettingsMap = { ...DEFAULTS };
  for (const row of data ?? []) {
    const key = row.key as AppSettingsKey;
    if ((KNOWN_SETTINGS_KEYS as readonly string[]).includes(key)) {
      map[key] = (row.value as string) ?? "";
    }
  }
  return map;
}

/** Upsert a single setting. Called from the Settings save action. */
export async function upsertAppSetting(
  supabase: SC,
  key: AppSettingsKey,
  value: string,
  actorId: string | null,
): Promise<void> {
  const { error } = await supabase.from("app_settings").upsert(
    {
      key,
      value,
      updated_by: actorId,
    },
    { onConflict: "key" },
  );
  if (error) throw new Error(`upsertAppSetting(${key}): ${error.message}`);
}
