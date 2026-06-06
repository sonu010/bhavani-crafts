import type { Metadata } from "next";
import { requireAdminContext } from "@/lib/db/admin-context";
import { AdminShell } from "./admin-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

/**
 * Top layout for the gated admin workspace. Everything inside the
 * `(shell)` route group requires:
 *   - role ≥ admin
 *   - AAL2 session (TOTP verified)
 *
 * Implementation goes through `requireAdminContext()` — the same helper
 * the pages inside this group use. Because `createServerClient`,
 * `getCurrentProfile`, and `requireAAL2` are all wrapped in React's
 * `cache()`, the layout's auth round-trips and the page's auth round-
 * trips dedupe within a single render pass. Saves ~500ms per nav.
 *
 * AuthError → redirect handling lives inside requireAdminContext (it
 * inspects `err.redirectTo` / `err.code === "forbidden"` and calls
 * Next's `redirect()` directly). That keeps the layout free of the
 * try/catch ladder that previously duplicated the page's mapping.
 */
export default async function GatedAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile } = await requireAdminContext();
  return (
    <AdminShell user={{ email: user.email ?? "", role: profile.role }}>
      {children}
    </AdminShell>
  );
}
