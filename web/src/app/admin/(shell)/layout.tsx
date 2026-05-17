import type { Metadata } from "next";
import { requireAAL2, requireRole } from "@/lib/auth/require";
import { isAuthError } from "@/lib/auth/errors";
import { createServerClient } from "@/lib/db/server";
import { redirect } from "next/navigation";
import { AdminShell } from "./admin-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin — Bhavani Crafts",
  robots: { index: false, follow: false },
};

/**
 * Top layout for the gated admin workspace. Everything inside the
 * `(shell)` route group requires:
 *   - role ≥ admin (the storefront has no concept of editor/viewer-only
 *     pages yet; we keep the bar at admin for MVP)
 *   - AAL2 session (TOTP verified)
 *
 * Failures bounce to /admin/forbidden (or /login if no session). Both
 * targets are SIBLINGS of `(shell)`, so they don't recursively re-hit
 * this layout's checks.
 */
export default async function GatedAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerClient();

  try {
    await requireAAL2(supabase);
  } catch (err) {
    // The proxy normally catches AAL1 before we get here, but the layout
    // is the backstop for cases where the proxy was bypassed or the
    // session became AAL1 mid-flight (forced re-auth, factor unenroll).
    if (isAuthError(err) && err.redirectTo) {
      redirect(err.redirectTo);
    }
    throw err;
  }

  let user: { email: string; role: string };
  try {
    const { user: u, profile } = await requireRole(supabase, "admin");
    user = { email: u.email ?? "", role: profile.role };
  } catch (err) {
    if (isAuthError(err) && err.code === "forbidden") {
      redirect("/admin/forbidden");
    }
    if (isAuthError(err) && err.redirectTo) {
      redirect(err.redirectTo);
    }
    throw err;
  }

  return <AdminShell user={user}>{children}</AdminShell>;
}
