"use server";

import { createPublicClient } from "@/lib/db/public-client";

/**
 * Log a storefront search to `search_logs`.
 *
 * Anon-client write — gated by the `search_logs_public_insert` policy
 * added in migration 0014 (which enforces `user_id IS NULL` and a
 * length cap). Service-role is deliberately NOT used: search logging
 * is a public-write op, and the project's ESLint rule forbids
 * importing `@/lib/db/admin` outside the admin namespaces.
 *
 * Logging must NEVER break the page. Every failure path swallows the
 * error after a console warn so a transient DB write hiccup doesn't
 * propagate to the user. This is the producer for the admin
 * dashboard's "zero-result searches" widget — without these rows the
 * widget is always empty.
 */
export async function logSearch(query: string, resultCount: number): Promise<void> {
  const trimmed = query.trim();
  if (!trimmed) return;
  if (trimmed.length > 120) return; // matches the CHECK; over-length never logs
  try {
    const sb = createPublicClient();
    const { error } = await sb
      .from("search_logs")
      .insert({ query: trimmed, result_count: resultCount });
    if (error) {
      console.warn(`[search] logSearch insert failed: ${error.message}`);
    }
  } catch (err) {
    console.warn(
      "[search] logSearch threw (swallowed — logging must not break search):",
      err instanceof Error ? err.message : err,
    );
  }
}
