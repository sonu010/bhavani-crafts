import "server-only";

/**
 * Tiny perf-timing helper. Logs `[perf] <label> <ms>` to the server
 * console (dev terminal + Vercel function logs) when the request is
 * slow enough to matter.
 *
 * Usage:
 *   const t = perfStart("admin/products page");
 *   t.mark("auth");
 *   const ctx = await requireAdminContext();
 *   t.mark("queries");
 *   const [a, b, c] = await Promise.all([...]);
 *   t.end();
 *
 * Each `mark()` records the delta since the previous mark (or start).
 * `end()` prints the full table only if total ≥ THRESHOLD_MS; sub-
 * threshold requests stay quiet so we don't drown the log. Easy to
 * remove once everything is fast.
 */

const THRESHOLD_MS = 200;

export function perfStart(scope: string) {
  const start = Date.now();
  let prev = start;
  const marks: Array<{ label: string; ms: number }> = [];
  return {
    mark(label: string) {
      const now = Date.now();
      marks.push({ label, ms: now - prev });
      prev = now;
    },
    end() {
      const total = Date.now() - start;
      if (total < THRESHOLD_MS) return;
      const parts = marks.map((m) => `${m.label}=${m.ms}ms`).join("  ");
      console.log(`[perf] ${scope}  total=${total}ms  ${parts}`);
    },
  };
}
