"use server";

import { updateTag } from "next/cache";
import { headers } from "next/headers";
import { requireAdminContext } from "@/lib/db/admin-context";
import {
  KNOWN_SETTINGS_KEYS,
  upsertAppSetting,
  type AppSettingsKey,
  type AppSettingsMap,
} from "@/lib/db/app-settings";
import { validateAppSettingValue } from "@/lib/db/app-settings-validators";

type SaveResult =
  | { ok: true }
  | { ok: false; error: string; field?: AppSettingsKey };

/**
 * Save all four settings in one shot. Each key is upserted via the
 * admin (RLS-bypassing) client; an `app_settings` cache tag is
 * revalidated at the end so storefront consumers see the new values
 * on their next render.
 *
 * Validates server-side:
 *   - shop_name non-empty, ≤ 80 chars
 *   - whatsapp_number digits-only with optional + prefix (matches the
 *     storefront whatsappHref() format expected by /lib/storefront/
 *     whatsapp.ts)
 *   - instagram_url empty OR https://… URL starting with the instagram
 *     domain
 *   - shipping_flat_inr integer ≥ 0
 *
 * Each input is also written to audit_logs so changes are reviewable
 * via /admin/activity.
 */
export async function saveAppSettings(
  patch: Partial<AppSettingsMap>,
): Promise<SaveResult> {
  const { admin, user } = await requireAdminContext();
  const h = await headers();
  const requestId =
    h.get("x-vercel-id") ?? h.get("x-request-id") ?? crypto.randomUUID();

  // Validate every supplied key before any write so we don't half-
  // apply a bad save.
  const sanitised: Partial<Record<AppSettingsKey, string>> = {};
  for (const key of KNOWN_SETTINGS_KEYS) {
    const raw = patch[key];
    if (typeof raw !== "string") continue;
    const v = raw.trim();
    const err = validateAppSettingValue(key, v);
    if (err) return { ok: false, error: err, field: key };
    sanitised[key] = v;
  }

  // Read the before-shape ONCE so the audit_logs row has the diff.
  const { data: beforeRows } = await admin
    .from("app_settings")
    .select("key, value")
    .in("key", Object.keys(sanitised));
  const before: Record<string, string> = {};
  for (const r of beforeRows ?? []) {
    before[r.key as string] = (r.value as string) ?? "";
  }

  // Write each key.
  for (const [key, value] of Object.entries(sanitised) as Array<
    [AppSettingsKey, string]
  >) {
    await upsertAppSetting(admin, key, value, user.id);
  }

  // Single audit row capturing the whole save.
  const { error: auditErr } = await admin.from("audit_logs").insert({
    actor_id: user.id,
    action: "settings.update",
    entity_type: "settings",
    entity_id: "00000000-0000-0000-0000-000000000000",
    before_json: before as never,
    after_json: sanitised as never,
    request_id: requestId,
  });
  if (auditErr) {
    throw new Error(`saveAppSettings audit insert: ${auditErr.message}`);
  }

  // Flush the storefront cache that reads app_settings.
  updateTag("app-settings");

  return { ok: true };
}

