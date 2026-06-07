/**
 * Per-field validators for `app_settings` values, shared between:
 *   - the admin Settings save action (server-side gate before the
 *     upsert)
 *   - the unit tests that pin the validation rules
 *
 * Each validator takes a STRING (already trimmed) and returns:
 *   - null on success
 *   - a user-facing error message on failure
 *
 * Pure, no I/O, no imports beyond local types — safe to bundle on
 * either side of the runtime boundary.
 */
import type { AppSettingsKey } from "@/lib/db/app-settings";

export function validateAppSettingValue(
  key: AppSettingsKey,
  value: string,
): string | null {
  switch (key) {
    case "shop_name": {
      if (value.length === 0) return "Shop name can't be empty.";
      if (value.length > 80) return "Shop name must be 80 chars or fewer.";
      return null;
    }
    case "whatsapp_number": {
      if (value === "") return null; // optional
      if (!/^\+?[0-9]{7,15}$/.test(value)) {
        return "WhatsApp number must be digits only (7-15), with optional + prefix.";
      }
      return null;
    }
    case "instagram_url": {
      if (value === "") return null; // optional
      if (
        !/^https:\/\/(www\.)?instagram\.com\/[a-zA-Z0-9_.-]{1,40}\/?$/.test(
          value,
        )
      ) {
        return "Instagram URL must look like https://instagram.com/<handle>.";
      }
      return null;
    }
    case "shipping_flat_inr": {
      if (value === "") return "Shipping rate can't be empty.";
      const n = Number(value);
      if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
        return "Shipping rate must be a whole number ≥ 0.";
      }
      return null;
    }
    default: {
      const _exhaustive: never = key;
      return _exhaustive;
    }
  }
}
