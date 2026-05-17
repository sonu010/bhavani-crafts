/**
 * Server-side Supabase client (cookie-authed).
 *
 * Use in server components, server actions, and route handlers when you
 * want the request's auth context. Anonymous if no session cookie present;
 * RLS still applies (anon → public-select only).
 *
 * Next 16: `cookies()` is async. Always `await createServerClient()`.
 *
 * See claude/architecture/auth-and-roles.md and security.md.
 */
import { cache } from "react";
import { cookies } from "next/headers";
import { createServerClient as createSupabaseServerClient } from "@supabase/ssr";
import type { Database } from "./types.gen";

/**
 * Wrapped in React's `cache()`: every server-side caller within a single
 * request renders gets the SAME client instance. Without this, the
 * (shell) layout and the route page each constructed their own cookie-
 * bound client, then each ran its own getUser() round-trip. Sharing the
 * client lets `getAuthUser`/`getCurrentProfile` (also cached below)
 * actually dedupe their network calls.
 *
 * `cache()` keys on argument identity; no args → one instance per
 * request lifecycle.
 */
export const createServerClient = cache(async () => {
  const cookieStore = await cookies();
  return createSupabaseServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          // Structurally required, NOT a defensive fallback (see
          // claude/architecture/engineering-principles.md §"No fallback logic"
          // — exception 2). Next 16 disallows cookie mutation from a Server
          // Component, and there is no API to detect Server-Component-vs-
          // Server-Action context before the call. The try/catch is the
          // documented @supabase/ssr pattern. Refresh-token persistence is
          // handled by the auth middleware (when wired in P2-T04), so a
          // dropped write from a Server Component is recovered on the next
          // request, not silently lost.
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            /* see comment above */
          }
        },
      },
    },
  );
});
