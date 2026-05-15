/**
 * Browser-side Supabase client.
 *
 * Use in client components. Reads with anon key — RLS-restricted to public
 * select policies. Never bypasses RLS.
 *
 * See claude/architecture/auth-and-roles.md and security.md.
 */
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types.gen";

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
