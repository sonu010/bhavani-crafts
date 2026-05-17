/**
 * In-memory sliding-window rate limiter. Per-user, per-bucket.
 *
 * Used today by /api/admin/images/upload (30/min). When Upstash lands
 * in P2-T01 hardening this becomes a thin adapter — the Map is the
 * dev fallback. Process-local, so it doesn't survive restarts or
 * spread across regions; that's the explicit trade-off until Upstash
 * arrives.
 */
import "server-only";

type Bucket = number[]; // unix-ms timestamps within the window

const windows = new Map<string, Bucket>();

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export interface RateLimitPolicy {
  limit: number;
  windowMs: number;
  key: string;
}

export function enforce(policy: RateLimitPolicy): RateLimitResult {
  const now = Date.now();
  const cutoff = now - policy.windowMs;
  const arr = (windows.get(policy.key) ?? []).filter((t) => t > cutoff);
  if (arr.length >= policy.limit) {
    const oldest = arr[0];
    const retryAfterMs = Math.max(0, oldest + policy.windowMs - now);
    windows.set(policy.key, arr);
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
    };
  }
  arr.push(now);
  windows.set(policy.key, arr);
  return {
    ok: true,
    remaining: policy.limit - arr.length,
    retryAfterSeconds: 0,
  };
}

export function enforceImageUploadRateLimit(userId: string): RateLimitResult {
  return enforce({
    key: `img-upload:${userId}`,
    limit: 30,
    windowMs: 60_000,
  });
}

/** Test-only — reset all buckets. Not exported via index. */
export function __resetForTests(): void {
  windows.clear();
}
