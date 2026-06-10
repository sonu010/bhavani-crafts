import "server-only";
import * as Sentry from "@sentry/nextjs";

/**
 * ISR-resilience wrapper for cacheable storefront reads.
 *
 * The homepage and the storefront layout are statically prerendered at
 * build time, which executes their Supabase reads. If the DB is
 * unreachable at build (e.g. CI's static job uses a placeholder URL, or a
 * transient outage), the prerender — and therefore the whole build —
 * would otherwise hard-fail. For an ISR page that's the wrong failure
 * mode: it should render an empty shell and fill in on the next
 * revalidation once the DB is reachable.
 *
 * This is NOT a silent catch hiding a logic bug (cf. engineering-
 * principles "no fallback logic"): it's a deliberate, logged degradation
 * for an infra-availability condition on a cache-backed read. The warning
 * surfaces a genuine misconfiguration (wrong URL/keys) in build logs.
 *
 * Wrap AROUND the `unstable_cache(...)` call, not inside it, so a failed
 * read is never cached — the next request retries and caches real data.
 *
 * Sentry capture (P5-T05): we still swallow + render the fallback, but
 * the failure pings the operator so a flaky upstream doesn't quietly
 * keep us serving empty shells. Sentry no-ops cleanly when DSN unset.
 */
export async function readOrEmpty<T>(
  label: string,
  fn: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.warn(
      `[storefront] read "${label}" failed; rendering fallback (will recover on revalidate):`,
      err instanceof Error ? err.message : err,
    );
    Sentry.captureException(err, {
      tags: { source: "storefront-safe-read", key: label },
      level: "warning",
    });
    return fallback;
  }
}
