import { requireAdminContext } from "@/lib/db/admin-context";
import { getAllAppSettings } from "@/lib/db/app-settings";
import { SettingsForm } from "./settings-form";

/**
 * /admin/settings — owner-editable shop config. Replaces the previous
 * 404 that the nav linked to.
 *
 * Four settings at MVP, all stored in `app_settings` (k/v, migration
 * 0020):
 *   - shop_name
 *   - whatsapp_number
 *   - instagram_url
 *   - shipping_flat_inr
 *
 * The first three feed the storefront footer + bulk-enquiry CTA;
 * shipping_flat_inr is read by the checkout server action. All four
 * are anon-SELECT-allowed (matching the public-allowlist policy in
 * 0020), so the storefront reads them directly via the public client.
 *
 * No env-var migration yet — the storefront still reads from the env
 * fallback if a setting is empty. That'll get a follow-up commit once
 * the owner picks a default value for each.
 */

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Settings",
  robots: { index: false, follow: false },
};

export default async function AdminSettingsPage() {
  const { supabase } = await requireAdminContext();
  const settings = await getAllAppSettings(supabase);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-bark-900">
          Settings
        </h1>
        <p className="text-sm text-stone-500">
          Shop configuration. Saved values appear on the storefront
          immediately after revalidation.
        </p>
      </header>

      <SettingsForm initial={settings} />
    </div>
  );
}
