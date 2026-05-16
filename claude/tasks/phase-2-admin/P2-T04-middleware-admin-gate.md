---
id: P2-T04
phase: 2
title: Middleware admin gate + requireRole helper
status: not_started
depends_on: [P2-T02]
estimate_hours: 2
owner: ai
last_updated: 2026-05-16
---

# Goal

After this task, every request to `/admin/*` passes through three layers of authorization (Edge middleware → server-side `requireRole` → Postgres RLS) and the `/design` RSC payload leak documented in `blockers.md` is fixed by the same middleware. Anonymous users land on `/login`; authenticated viewers get 403; authenticated owners without AAL2 are redirected to `/admin/2fa-setup` or `/auth/verify-2fa`. The `requireRole(supabase, role)` helper is exported from `web/src/lib/auth/require.ts` and used as the first line of every admin server action.

# Prerequisites (read first)

- [claude/architecture/auth-and-roles.md](../../architecture/auth-and-roles.md) §"Three layers of authorization" + §"TOTP 2FA (owner)"
- [claude/architecture/security.md](../../architecture/security.md) §"Three layers of authorization"
- [claude/decisions/ADR-010-pglite-and-di-supabase.md](../../decisions/ADR-010-pglite-and-di-supabase.md) — DI Supabase client (`requireRole(supabase, role)`, never a global)
- [claude/blockers.md](../../blockers.md) §"`/design` RSC payload leak" — fixed by this middleware
- [`web/src/lib/db/server.ts`](../../../web/src/lib/db/server.ts) — `createServerClient()` reads cookies; reuse, don't duplicate
- [Next.js 16 middleware docs](https://nextjs.org/docs/app/building-your-application/routing/middleware) — bundled at `node_modules/next/dist/docs/`; read first per `AGENTS.md` (Next 16 has breaking changes from training-data Next)

# Files to touch

- `web/src/middleware.ts` (new) — Edge middleware. Matchers: `/admin/:path*`, `/auth/:path*`, `/design/:path*`. Reads session cookie via `@supabase/ssr` createServerClient, branches per matcher.
- `web/src/lib/auth/require.ts` (new) — `requireRole(supabase, role)`, `requireAAL2(supabase)`, `getCurrentProfile(supabase)`. Throw `AuthError` subclasses; do not swallow.
- `web/src/lib/auth/errors.ts` (new) — `class AuthError extends Error`, `UnauthenticatedError`, `ForbiddenError`, `MFANotEnrolledError`, `MFANotVerifiedError`. Each carries a `status` (401, 403, 403, 403) and a `redirectTo` (`/login`, null, `/admin/2fa-setup`, `/auth/verify-2fa`) — middleware uses these to decide the response shape.
- `web/src/lib/auth/role-hierarchy.ts` (new) — `roleSatisfies(actual: ProfileRole, required: ProfileRole): boolean`. `owner` ≥ `admin` ≥ `editor` ≥ `viewer`. Pure function; no Supabase access.
- `web/src/app/(dev)/layout.tsx` (modified) — remove the `NODE_ENV === 'production'` guard; middleware handles it now. Add a comment noting the redundant guard was removed.
- `web/src/middleware.ts` matchers config — exclude `_next`, static assets, favicon, `/api/health`, `/api/admin/csrf` (when it lands).
- `web/__tests__/auth/require-role.test.ts` (new) — unit tests for `roleSatisfies` (8 cases: all role × role combos) + integration tests for `requireRole` against live Supabase.
- `web/__tests__/auth/middleware-behavior.test.ts` (new) — Playwright-style fetch tests (or supertest equivalent) that hit `/admin`, `/admin/products`, `/design`, `/auth/verify-2fa` with different cookie states and assert redirects/403/200.

# Implementation notes

**Three-layer authorization — locked. Every layer required.** From [architecture/security.md](../../architecture/security.md) §"Three layers of authorization":

1. **Edge middleware** — cheap filter. Redirects unauthenticated `/admin/*` to `/login`. Does NOT make authorization decisions about role.
2. **Server-side `requireRole`** — the real gate. Reads cookie, fetches profile, checks role + AAL. Throws on failure. **First line of every admin server action.**
3. **Postgres RLS** — last line of defense. Even if (2) is bypassed (e.g., a future bug), RLS blocks anon/viewer writes.

Do not consolidate (1) into (2). Middleware runs on every request and short-circuits before any server component renders, saving DB calls. `requireRole` runs only inside server actions where we need the strong gate.

**Middleware shape:**

```ts
// web/src/middleware.ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. /design — production-only block. Fixes blockers.md RSC payload leak.
  if (pathname.startsWith("/design") && process.env.NODE_ENV === "production") {
    return new NextResponse(null, { status: 404 });
  }

  // 2. /admin/* — require session cookie. Role + AAL2 checks happen in
  //    requireRole at the server-action layer.
  if (pathname.startsWith("/admin")) {
    const res = NextResponse.next();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { /* @supabase/ssr cookie adapter — see Next 16 docs */ } },
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }

    // AAL2 gate — pull from session, not from a separate query.
    const { data: { session } } = await supabase.auth.getSession();
    if (session && session.user.app_metadata?.aal !== "aal2") {
      // Check whether they have a verified factor. If yes → /auth/verify-2fa,
      // if no → /admin/2fa-setup. The profile.role gate ("does this user
      // *need* aal2?") happens in requireAAL2 server-side — middleware
      // applies aal2 universally on /admin/* to avoid an extra DB hit.
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const url = req.nextUrl.clone();
      url.pathname = factors?.totp?.some(f => f.status === "verified")
        ? "/auth/verify-2fa"
        : "/admin/2fa-setup";
      return NextResponse.redirect(url);
    }

    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/auth/:path*",
    "/design/:path*",
    // Exclude _next, static assets, public APIs
    "/((?!_next/static|_next/image|favicon.ico|api/health).*)",
  ],
};
```

**`requireRole` helper shape:**

```ts
// web/src/lib/auth/require.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types.gen";
import { ForbiddenError, UnauthenticatedError } from "./errors";
import { roleSatisfies } from "./role-hierarchy";

type SC = SupabaseClient<Database>;
type ProfileRole = Database["public"]["Enums"]["profile_role"];

export async function getCurrentProfile(supabase: SC) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new UnauthenticatedError();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, role, full_name")
    .eq("id", user.id)
    .single();
  if (error || !profile) throw new ForbiddenError("profile-missing");
  return { user, profile };
}

export async function requireRole(supabase: SC, required: ProfileRole) {
  const { user, profile } = await getCurrentProfile(supabase);
  if (!roleSatisfies(profile.role, required)) {
    throw new ForbiddenError(`required=${required}, actual=${profile.role}`);
  }
  return { user, profile };
}

export async function requireAAL2(supabase: SC) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new UnauthenticatedError();
  if (session.user.app_metadata?.aal !== "aal2") {
    throw new MFANotVerifiedError();
  }
}
```

Every admin server action starts with:

```ts
"use server";
export async function updateProduct(id: string, patch: ProductPatch) {
  const supabase = await createServerClient();
  await requireRole(supabase, "admin");
  await requireAAL2(supabase); // only when the route requires aal2 — most /admin/* routes do
  // ... safe to proceed
}
```

**Role hierarchy.** `owner > admin > editor > viewer`. `requireRole(s, 'admin')` accepts owner or admin. `requireRole(s, 'viewer')` accepts anyone authenticated. The function is total — no third-party "or this role" combinator; if you need that, you wrote the wrong check.

**Error → response mapping (in middleware + global error boundary):**

| Error | HTTP | Behavior |
|---|---|---|
| `UnauthenticatedError` | 302 | Redirect to `/login?next=<current>` |
| `ForbiddenError` | 403 | Render `/admin/forbidden` (server component) or JSON `{ error: 'forbidden' }` on API routes |
| `MFANotEnrolledError` | 302 | Redirect to `/admin/2fa-setup` |
| `MFANotVerifiedError` | 302 | Redirect to `/auth/verify-2fa` |

Server actions throw — they don't return error payloads. The Next.js error boundary in `app/admin/error.tsx` catches and maps.

**`/design` fix.** Today `/design` is gated only by `app/(dev)/layout.tsx`'s NODE_ENV check, which returns 404 but the RSC payload still serializes the children. Moving the gate into middleware short-circuits before any rendering. Remove the layout-level guard in the same change. Verify the fix:

```bash
curl -s https://<prod-host>/design | head -c 200
# Before: contains palette swatches in the RSC payload
# After: empty body (404 from middleware)
```

**Cookie reads in middleware.** Use `@supabase/ssr`'s `createServerClient` (not `createBrowserClient` or `createMiddlewareClient` from the deprecated helpers package). Wire the cookie adapter per Next 16 middleware docs — the API differs from older Next versions. Read `node_modules/next/dist/docs/` before writing the adapter; do not trust training-data memory.

**Don't query the database for the role inside middleware.** Two reasons: (a) it adds a DB hit to every navigation; (b) the role decision belongs at the action layer where we have transactional context. Middleware only checks "is there a session cookie?" and "is the AAL high enough?" — both readable from the JWT.

**Performance budget.** Middleware must run in ≤ 30 ms p50 on Vercel Edge. Avoid: extra `fetch` calls, JSON parsing more than once, anything that would push p99 over 100 ms. The only network call permitted is `supabase.auth.getUser()` + `getSession()` (both hit Supabase's GoTrue, which is fast).

# Acceptance criteria

- [ ] Anonymous GET `/admin` → 302 `Location: /login?next=/admin`.
- [ ] Anonymous GET `/admin/products` → 302 `Location: /login?next=/admin/products`.
- [ ] Authenticated AAL1 user GET `/admin` → 302 to `/admin/2fa-setup` (no verified factor) or `/auth/verify-2fa` (has factor).
- [ ] Authenticated AAL2 viewer GET `/admin/products` → 200 page renders shell, then `requireRole(supabase, 'admin')` throws `ForbiddenError` → renders `/admin/forbidden`.
- [ ] Authenticated AAL2 admin GET `/admin/products` → 200.
- [ ] GET `/design` in production → 404 with empty body (no RSC payload). In dev → 200 with gallery.
- [ ] `roleSatisfies` unit tests cover all 16 role × required combinations.
- [ ] `requireRole` integration tests against live Supabase pass.
- [ ] Middleware p50 ≤ 30 ms on Vercel (check Vercel Analytics after deploy).
- [ ] `pnpm tsc --noEmit`, `pnpm lint`, `pnpm build` green. `pnpm launch-blockers` still green (the existing RLS attack tests should be unaffected).

# Verification

```bash
cd web
pnpm tsc --noEmit
pnpm lint
pnpm build
pnpm exec vitest run __tests__/auth/

# Live middleware behavior:
pnpm dev &
sleep 4
curl -sI http://localhost:3000/admin                  # → 302 /login
curl -sI http://localhost:3000/admin/products         # → 302 /login
NODE_ENV=production pnpm build && pnpm start &
sleep 4
curl -sI http://localhost:3000/design                 # → 404, empty body
curl -s  http://localhost:3000/design | wc -c         # → 0 (or near-0; no leaked RSC payload)

# After deploy to Vercel preview:
curl -sI https://<preview-url>/admin                  # → 302 /login
curl -s  https://<preview-url>/design | wc -c         # → 0
```

# Dependencies added

None — `@supabase/ssr` is already installed.

# Notes for next agent

(empty)
