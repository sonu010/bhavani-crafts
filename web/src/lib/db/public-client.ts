/**
 * Cookie-less anonymous Supabase client for CACHEABLE public reads.
 *
 * Why this exists separately from `createServerClient` (server.ts):
 * that one is cookie-bound (reads `cookies()`), which makes any
 * function that uses it dynamic — it can't live inside
 * `unstable_cache(...)`. Public catalog data (products, categories)
 * has no per-user dimension, so we read it with a plain anon client
 * that touches no request state, and wrap the read in
 * `unstable_cache({ tags })`. RLS still applies (anon → public-select
 * only); admin mutations flush via the matching tag.
 *
 * Use ONLY for public, cacheable reads. Anything that needs the user's
 * session (or must respect per-request auth) uses `createServerClient`.
 *
 * See claude/architecture/performance.md §"Storefront — cache".
 */
import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types.gen";

export function createPublicClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
