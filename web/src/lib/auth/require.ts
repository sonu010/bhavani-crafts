/**
 * Server-side authz helpers. The "real gate" in the three-layer authz
 * chain (proxy filters, requireRole gates, RLS backs up).
 *
 * DI pattern (ADR-010): every helper takes the SupabaseClient as its
 * first arg. The caller decides which client to pass (cookie-bound
 * server, service-role, test fixture).
 *
 * See claude/architecture/auth-and-roles.md §"Three layers of authorization".
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types.gen";
import {
  ForbiddenError,
  MFANotVerifiedError,
  UnauthenticatedError,
} from "./errors";
import { roleSatisfies, type ProfileRole } from "./role-hierarchy";

type SC = SupabaseClient<Database>;

export type CurrentProfile = {
  user: { id: string; email?: string | null };
  profile: {
    id: string;
    role: ProfileRole;
    full_name: string | null;
  };
};

/**
 * Fetch the current request's user + their profile row.
 *
 * Throws UnauthenticatedError if no session, ForbiddenError if the user
 * exists in auth.users but has no matching profiles row (which shouldn't
 * happen — the on_auth_user_created trigger is supposed to keep them in
 * sync — but we fail closed if it does).
 */
export async function getCurrentProfile(supabase: SC): Promise<CurrentProfile> {
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    throw new UnauthenticatedError(userErr?.message ?? "no session");
  }

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("id, role, full_name")
    .eq("id", user.id)
    .single();

  if (profileErr || !profile) {
    throw new ForbiddenError(`profile not found for user ${user.id}`);
  }

  return {
    user: { id: user.id, email: user.email ?? null },
    profile,
  };
}

/**
 * First line of every admin server action:
 *
 *   const supabase = await createServerClient();
 *   await requireRole(supabase, "admin");
 *
 * Returns the profile so callers can use the user.id / full_name without a
 * second round-trip.
 */
export async function requireRole(
  supabase: SC,
  required: ProfileRole,
): Promise<CurrentProfile> {
  const cp = await getCurrentProfile(supabase);
  if (!roleSatisfies(cp.profile.role, required)) {
    throw new ForbiddenError(
      `requireRole failed: required=${required}, actual=${cp.profile.role}`,
    );
  }
  return cp;
}

/**
 * Assert the current session is AAL2 (TOTP-verified). Use on actions that
 * mutate catalog state — keeps a stolen password-only session from doing
 * damage if 2FA gets bypassed somehow.
 *
 * Does not throw for users who lack any MFA factor — that case routes
 * through the proxy redirect to /admin/2fa-setup before reaching this
 * function. By the time you call requireAAL2, you're past enrollment.
 */
export async function requireAAL2(supabase: SC): Promise<void> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) {
    throw new UnauthenticatedError(error.message);
  }
  if (data?.currentLevel !== "aal2") {
    throw new MFANotVerifiedError(
      `current AAL is ${data?.currentLevel ?? "unknown"}, need aal2`,
    );
  }
}
