/**
 * Unit tests for the sliding-window rate limiter.
 *
 * Process-local Map → use vi.useFakeTimers() to advance time without
 * sleeping the test runner.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  enforce,
  enforceImageUploadRateLimit,
  __resetForTests,
} from "@/lib/auth/rate-limit";

beforeEach(() => {
  vi.useFakeTimers();
  __resetForTests();
});

afterEach(() => {
  vi.useRealTimers();
  __resetForTests();
});

describe("enforce — generic limiter", () => {
  it("allows up to `limit` requests in the window", () => {
    for (let i = 0; i < 5; i++) {
      const r = enforce({ key: "k", limit: 5, windowMs: 60_000 });
      expect(r.ok).toBe(true);
      expect(r.remaining).toBe(4 - i);
    }
  });

  it("blocks the (limit+1)-th request and returns retry-after", () => {
    for (let i = 0; i < 3; i++) {
      enforce({ key: "k", limit: 3, windowMs: 60_000 });
    }
    const r = enforce({ key: "k", limit: 3, windowMs: 60_000 });
    expect(r.ok).toBe(false);
    expect(r.remaining).toBe(0);
    expect(r.retryAfterSeconds).toBeGreaterThan(0);
    expect(r.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("releases the slot after the window slides past", () => {
    for (let i = 0; i < 3; i++) {
      enforce({ key: "k", limit: 3, windowMs: 60_000 });
    }
    expect(enforce({ key: "k", limit: 3, windowMs: 60_000 }).ok).toBe(false);
    vi.advanceTimersByTime(61_000);
    expect(enforce({ key: "k", limit: 3, windowMs: 60_000 }).ok).toBe(true);
  });

  it("isolates buckets by key", () => {
    for (let i = 0; i < 3; i++) {
      enforce({ key: "alice", limit: 3, windowMs: 60_000 });
    }
    expect(enforce({ key: "alice", limit: 3, windowMs: 60_000 }).ok).toBe(false);
    expect(enforce({ key: "bob", limit: 3, windowMs: 60_000 }).ok).toBe(true);
  });
});

describe("enforceImageUploadRateLimit", () => {
  it("permits 30 uploads / minute, rejects the 31st", () => {
    const userId = "00000000-0000-0000-0000-000000000001";
    for (let i = 0; i < 30; i++) {
      expect(enforceImageUploadRateLimit(userId).ok).toBe(true);
    }
    const blocked = enforceImageUploadRateLimit(userId);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });
});
