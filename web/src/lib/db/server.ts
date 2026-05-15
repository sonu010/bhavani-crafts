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
import { cookies } from "next/headers";
import { createServerClient as createSupabaseServerClient } from "@supabase/ssr";
import type { Database } from "./types.gen";

export async function createServerClient() {
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
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Called from a Server Component — Next 16 disallows mutation here.
            // The middleware refresh path handles cookie persistence in that case.
          }
        },
      },
    },
  );
}
