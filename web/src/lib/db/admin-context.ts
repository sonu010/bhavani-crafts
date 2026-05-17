/**
 * Server-side admin context — gates the service-role client behind
 * requireRole + requireAAL2.
 *
 * **Why this exists.** Next 16 renders layouts and pages in parallel
 * (see node_modules/next/dist/docs/01-app/02-guides/data/06-fetching-
 * data.md §"Sequential and parallel data fetching"). A layout that
 * does `requireRole` does NOT block the page's data fetches — they race.
 * If the page calls `createAdminClient()` and runs a service-role
 * query, that query fires against the DB even if the layout's redirect
 * eventually wins. The page's output is discarded but the read already
 * happened.
 *
 * Fix: every admin page/action awaits this helper BEFORE any DB call.
 * The helper:
 *   1. Constructs the cookie-bound client.
 *   2. Asserts AAL2 + role >= admin (throws on failure).
 *   3. Hands back the service-role admin client + the resolved profile.
 *
 * The (shell)/layout.tsx still calls requireRole — that's belt + braces.
 * The data-access boundary is the load-bearing one.
 *
 * See claude/architecture/security.md §"Three layers of authorization"
 * (this helper is layer 2; proxy.ts is layer 1; RLS is layer 3).
 */
import "server-only";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/db/admin";
import { createServerClient } from "@/lib/db/server";
import { isAuthError } from "@/lib/auth/errors";
import {
  requireAAL2,
  requireRole,
  type CurrentProfile,
} from "@/lib/auth/require";
import type { Database } from "@/lib/db/types.gen";
import type { ProfileRole } from "@/lib/auth/role-hierarchy";

export interface AdminContext {
  /** Service-role client. BYPASSES RLS. Use for catalog reads/writes. */
  admin: SupabaseClient<Database>;
  /** Cookie-bound anon client. Use for follow-on auth ops (signOut). */
  supabase: SupabaseClient<Database>;
  /** The signed-in user + their profile. */
  user: CurrentProfile["user"];
  profile: CurrentProfile["profile"];
}

/**
 * Gate. Throws AuthError on failure (caught by the global error boundary).
 *
 * The required role defaults to "admin"; pass "owner" for owner-only
 * routes (none yet, but the contract is there for when team-settings
 * lands).
 */
export async function requireAdminContext(
  requiredRole: ProfileRole = "admin",
): Promise<AdminContext> {
  const supabase = await createServerClient();

  // AuthErrors carry a redirectTo for the destinations the proxy normally
  // handles (no session → /login, AAL1 → /admin/2fa-setup or /auth/verify-2fa).
  // ForbiddenError has redirectTo=null and goes to /admin/forbidden via the
  // global error boundary.
  try {
    await requireAAL2(supabase);
    const { user, profile } = await requireRole(supabase, requiredRole);
    const admin = createAdminClient();
    return { admin, supabase, user, profile };
  } catch (err) {
    if (isAuthError(err)) {
      if (err.code === "forbidden") {
        redirect("/admin/forbidden");
      }
      if (err.redirectTo) {
        redirect(err.redirectTo);
      }
    }
    throw err;
  }
}
