import "server-only";
import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/db/public-client";
import {
  getAllAppSettings,
  type AppSettingsMap,
} from "@/lib/db/app-settings";

/**
 * Storefront-side reader for owner-editable shop config.
 *
 * Single source of truth for everything the storefront renders from
 * the `app_settings` table (migration 0020): shop name, WhatsApp
 * number, Instagram URL, shipping flat rate. Cached with the
 * `app-settings` tag — the admin Settings page's save action calls
 * `updateTag('app-settings')`, so a save instantly flushes the cache.
 *
 * Fallback chain (in order):
 *   1. The value in `app_settings`.
 *   2. The corresponding env var (NEXT_PUBLIC_WHATSAPP_NUMBER /
 *      NEXT_PUBLIC_INSTAGRAM_URL). Lets a fresh deploy work before
 *      the owner has clicked through the Settings page.
 *   3. A safe default (empty / 50 for shipping).
 *
 * Returns a normalised, typed shape so consumers don't have to know
 * about either layer.
 */

export interface StorefrontSettings {
  shopName: string;
  /** Digits only, with country code (e.g. "919876543210"). Empty if unset. */
  whatsappNumber: string;
  /** Full https URL or empty. */
  instagramUrl: string;
  /** Whole rupees ≥ 0. */
  shippingFlatInr: number;
}

const DEFAULTS: StorefrontSettings = {
  shopName: "Bhavani Crafts",
  whatsappNumber: "",
  instagramUrl: "",
  shippingFlatInr: 50,
};

function normaliseWhatsapp(raw: string | undefined): string {
  return (raw ?? "").replace(/\D/g, "");
}

function normaliseInstagram(raw: string | undefined): string {
  const v = (raw ?? "").trim();
  if (!v) return "";
  return /^https:\/\//.test(v) ? v : "";
}

function normaliseShipping(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && Number.isInteger(n) && n >= 0 ? n : null;
}

const readSettings = unstable_cache(
  async (): Promise<StorefrontSettings> => {
    let db: AppSettingsMap | null = null;
    try {
      db = await getAllAppSettings(createPublicClient());
    } catch {
      // Anon-RLS or app_settings not yet migrated — fall through to
      // env/defaults. NEVER throw out of a setting read; the
      // storefront has to render even when settings are unreachable.
      db = null;
    }

    const envWhatsapp = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER;
    const envInstagram = process.env.NEXT_PUBLIC_INSTAGRAM_URL;

    const whatsapp =
      normaliseWhatsapp(db?.whatsapp_number) ||
      normaliseWhatsapp(envWhatsapp) ||
      DEFAULTS.whatsappNumber;

    const instagram =
      normaliseInstagram(db?.instagram_url) ||
      normaliseInstagram(envInstagram) ||
      DEFAULTS.instagramUrl;

    const shipping =
      normaliseShipping(db?.shipping_flat_inr) ?? DEFAULTS.shippingFlatInr;

    const shopName = (db?.shop_name?.trim() || DEFAULTS.shopName).slice(0, 80);

    return {
      shopName,
      whatsappNumber: whatsapp,
      instagramUrl: instagram,
      shippingFlatInr: shipping,
    };
  },
  ["storefront-settings"],
  { tags: ["app-settings"], revalidate: 600 },
);

export function getStorefrontSettings(): Promise<StorefrontSettings> {
  return readSettings();
}
