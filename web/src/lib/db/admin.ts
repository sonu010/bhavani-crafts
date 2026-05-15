/**
 * Service-role Supabase client. BYPASSES RLS.
 *
 * Use ONLY from server code under app/admin/**, app/api/admin/**, or scripts/**.
 * The ESLint rule in eslint.config.mjs blocks imports from anywhere else.
 *
 * Every server action using this client must first call requireRole('admin')
 * (or stronger) so non-admins can't trigger admin-only writes.
 *
 * See claude/architecture/security.md §"Service-role key isolation".
 */
import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types.gen";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Service-role Supabase client missing env: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.",
    );
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
