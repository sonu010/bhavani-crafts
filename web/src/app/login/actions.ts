"use server";

/**
 * Sign-in server action.
 *
 * 10-layer defense (SESSION-RESUME §"Admin login"):
 *   ✓ 1. Supabase email + password
 *   ✓ 2. Generic error string — never branches on "user exists / wrong password"
 *   ✗ 3. Rate limit — DEFERRED (needs Upstash credentials)
 *   ✗ 4. hCaptcha — DEFERRED (needs hCaptcha credentials)
 *   ✓ 5. TOTP enforcement — handled in proxy.ts + /admin/2fa-setup + /auth/verify-2fa
 *   ✓ 6. HttpOnly/Secure/SameSite=Lax cookies — wired via @supabase/ssr
 *   ✓ 7. CSP frame-ancestors 'none' — next.config.ts
 *   ✓ 8. X-Robots-Tag noindex — next.config.ts (added with this task)
 *   ✓ 9. Zero storefront links — verified by grep in CI
 *   ✓ 10. audit_logs on every attempt — via recordAuthAttempt
 *
 * Layers 3 + 4 are flagged in the task notes and ship as a follow-up
 * hardening commit once the owner provisions the Upstash + hCaptcha
 * accounts. Until then we rely on Supabase's platform-default rate limit.
 */
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ANONYMOUS_AUTH_ENTITY_ID, recordAuthAttempt } from "@/lib/auth/audit";
import { createAdminClient } from "@/lib/db/admin";
import { createServerClient } from "@/lib/db/server";

const GENERIC_ERROR = "Invalid email or password.";
const MIN_FAILURE_DURATION_MS = 200;

export async function signInAction(
  formData: FormData,
): Promise<{ error: string } | void> {
  const start = Date.now();

  const emailRaw = formData.get("email");
  const passwordRaw = formData.get("password");
  const nextRaw = formData.get("next");

  if (typeof emailRaw !== "string" || typeof passwordRaw !== "string") {
    return { error: GENERIC_ERROR };
  }
  const email = emailRaw.trim().toLowerCase();
  const password = passwordRaw;
  if (!email || !password) {
    return { error: GENERIC_ERROR };
  }

  // Only honor `next` when it's a same-site absolute path. Anything else
  // is a redirect open-target and gets discarded silently.
  const next =
    typeof nextRaw === "string" && nextRaw.startsWith("/") && !nextRaw.startsWith("//")
      ? nextRaw
      : "/admin";

  const supabase = await createServerClient();
  const admin = createAdminClient();
  const h = await headers();
  const requestId =
    h.get("x-vercel-id") ?? h.get("x-request-id") ?? crypto.randomUUID();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = h.get("user-agent") ?? null;

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    await recordAuthAttempt(admin, {
      actorId: null,
      action: "auth.signin_failed",
      // entity_id is uuid NOT NULL; use the anonymous sentinel and stash
      // the attempted email in after_json for brute-force forensics. RLS
      // keeps audit_logs admin-only so the email isn't a public leak.
      entityId: ANONYMOUS_AUTH_ENTITY_ID,
      afterJson: {
        ip,
        user_agent: userAgent,
        attempted_email: email,
        reason: error?.code ?? "unknown",
      },
      requestId,
    });

    // Constant minimum delay masks the timing difference between
    // "user not found" and "user exists, password wrong". Keep it
    // constant (no jitter) so the slowest legitimate failure sets the bar.
    const elapsed = Date.now() - start;
    if (elapsed < MIN_FAILURE_DURATION_MS) {
      await new Promise((r) => setTimeout(r, MIN_FAILURE_DURATION_MS - elapsed));
    }

    return { error: GENERIC_ERROR };
  }

  await recordAuthAttempt(admin, {
    actorId: data.user.id,
    action: "auth.signin",
    entityId: data.user.id,
    afterJson: {
      ip,
      user_agent: userAgent,
      mfa_level: data.session ? "aal1" : null,
    },
    requestId,
  });

  // Route the AAL1 session DIRECTLY to its MFA step. We deliberately do
  // NOT redirect to `next` / `/admin` and let the proxy bounce: that
  // bounce would happen during the client-side (soft) navigation this
  // Server Action's redirect() triggers, and Next then renders the proxy's
  // target (/auth/verify-2fa) at the OLD url (/admin) with a dead form
  // action — so the 2FA code submit silently never fires and the user is
  // stuck (caught by the e2e login flow). Redirecting straight to the
  // final destination avoids the bounce entirely. The proxy still gates
  // /admin for every other entry point (deep links, expired AAL2, etc.).
  const { data: factorsData } = await supabase.auth.mfa.listFactors();
  const hasVerifiedTotp =
    factorsData?.totp?.some((f) => f.status === "verified") ?? false;

  redirect(
    hasVerifiedTotp
      ? `/auth/verify-2fa?next=${encodeURIComponent(next)}`
      : "/admin/2fa-setup",
  );
}
