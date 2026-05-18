/**
 * Client-importable constants for product_images.
 *
 * Lives outside the `server-only` boundary of admin/images.ts so the
 * editor's dialogs can show a license-status dropdown without pulling
 * the server-side data-layer into the client bundle.
 */
import type { Database } from "@/lib/db/types.gen";

export type LicenseStatus = Database["public"]["Enums"]["license_status"];

export const LICENSE_STATUSES: LicenseStatus[] = [
  "unverified",
  "owned",
  "licensed",
  "public_domain",
  "disputed",
  "removed",
];
