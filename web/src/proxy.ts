/**
 * Edge proxy — the FIRST line of the three-layer authz chain.
 *
 * Next 16 renamed `middleware.ts` to `proxy.ts`. See
 *   node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md
 *
 * Responsibilities (deliberately narrow):
 *
 *   1. /design  → 404 in production. Fixes the RSC payload leak logged
 *      in claude/blockers.md (#"/design RSC payload leak"). The dev gallery
 *      stays reachable when NODE_ENV !== "production".
 *
 *   2. /admin/* → require a session. Without one, redirect to /login with
 *      ?next=<path>. With one, gate on AAL: anything except the AAL1
 *      allow-list requires aal2. AAL1 sessions get redirected to either
 *      /admin/2fa-setup (no verified factor) or /auth/verify-2fa (factor
 *      exists, just needs a fresh challenge).
 *
 * We deliberately DO NOT check profiles.role here — that's the job of
 * requireRole() at the server-action layer. The proxy stays cheap and
 * stateless; role is enforced where the work happens.
 *
 * See claude/architecture/auth-and-roles.md §"Three layers of authorization"
 * and claude/architecture/security.md §"Three layers of authorization".
 */
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Paths inside /admin that AAL1 sessions must be able to reach so the
// user can complete MFA. Without this allow-list, the redirect at the
// bottom of the function loops the user back into /admin/2fa-setup
// forever.
const ADMIN_AAL1_ALLOWLIST = ["/admin/2fa-setup", "/admin/forbidden"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/design") && process.env.NODE_ENV === "production") {
    return new NextResponse(null, { status: 404 });
  }

  if (!pathname.startsWith("/admin")) {
    return NextResponse.next();
  }

  // Build a response we can mutate with cookies that @supabase/ssr may
  // write while refreshing the access token. The setAll callback writes
  // to BOTH the request (so any downstream proxy code sees the fresh
  // cookies) AND the response (so the browser persists them).
  let response = NextResponse.next({ request: req });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            req.cookies.set(name, value);
          }
          response = NextResponse.next({ request: req });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Verify the JWT LOCALLY via getClaims() instead of the network
  // getUser(). On a project with asymmetric signing keys this is a
  // WebCrypto signature check against the cached JWKS — no round-trip —
  // and it returns the `aal` claim the MFA gate needs, collapsing what
  // were TWO network calls (getUser + getAuthenticatorAssuranceLevel)
  // into one local op on the happy path. (On legacy symmetric keys it
  // falls back to a server call, i.e. no worse than getUser.)
  //
  // This is still the CHEAP gate — requireRole()/requireAAL2() in the
  // data layer stay authoritative: they call getUser() and re-check
  // role, so a revoked-but-not-yet-expired token still can't do work.
  // See auth-and-roles.md §"Three layers of authorization".
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  const claims = claimsData?.claims;

  if (claimsError || !claims?.sub) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // The user is signed in. Let AAL1-allowed paths through so the user
  // can complete enrollment / see why they were denied.
  const isAal1Allowed = ADMIN_AAL1_ALLOWLIST.some(
    (allowed) => pathname === allowed || pathname.startsWith(`${allowed}/`),
  );
  if (isAal1Allowed) {
    return response;
  }

  // AAL comes straight from the verified JWT claim — no extra network
  // call. (`aal` is a Supabase custom claim not in the base JwtPayload
  // type, hence the narrow cast.)
  const aal = (claims as { aal?: string }).aal;
  if (aal === "aal2") {
    return response;
  }

  // AAL1 outside the allow-list. Pick the right destination based on
  // whether the user has an enrolled factor. This branch only runs
  // during 2FA setup/verify (rare), so the listFactors() round-trip
  // here is acceptable.
  const { data: factorsData } = await supabase.auth.mfa.listFactors();
  const hasVerifiedTotp = factorsData?.totp?.some((f) => f.status === "verified") ?? false;

  const url = req.nextUrl.clone();
  url.pathname = hasVerifiedTotp ? "/auth/verify-2fa" : "/admin/2fa-setup";
  return NextResponse.redirect(url);
}

export const config = {
  // Run on the routes that need authn gating. /design is included so the
  // production-only 404 above gets a chance to run before anything is
  // rendered.
  matcher: ["/admin/:path*", "/design/:path*"],
};
