/**
 * Behavior tests for the Edge proxy (web/src/proxy.ts).
 *
 * Scope: response shape for the unauthenticated path + the /design
 * production gate. The authenticated AAL1/AAL2 branches are exercised
 * end-to-end in manual smoke once P2-T01 (login) lands and a real cookie
 * exists to attach to the request.
 */
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { proxy } from "@/proxy";

function makeRequest(url: string) {
  return new NextRequest(new URL(url, "https://example.test"));
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("/design gate", () => {
  it("returns 404 with empty body in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const res = await proxy(makeRequest("/design"));
    expect(res.status).toBe(404);
    const body = await res.text();
    expect(body).toBe("");
  });

  it("returns 404 for nested /design/* paths in production too", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const res = await proxy(makeRequest("/design/components"));
    expect(res.status).toBe(404);
  });

  it("passes through in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const res = await proxy(makeRequest("/design"));
    // NextResponse.next() returns 200 with `x-middleware-next: 1` header.
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });
});

describe("/admin gate — anonymous", () => {
  it("redirects /admin to /login?next=/admin", async () => {
    const res = await proxy(makeRequest("/admin"));
    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toBeTruthy();
    const dest = new URL(location!);
    expect(dest.pathname).toBe("/login");
    expect(dest.searchParams.get("next")).toBe("/admin");
  });

  it("redirects deep admin paths to /login with the next param preserved", async () => {
    const res = await proxy(makeRequest("/admin/products/abc/edit"));
    const dest = new URL(res.headers.get("location")!);
    expect(dest.pathname).toBe("/login");
    expect(dest.searchParams.get("next")).toBe("/admin/products/abc/edit");
  });

  it("redirects /admin/2fa-setup to /login when anonymous (allow-list only applies after sign-in)", async () => {
    const res = await proxy(makeRequest("/admin/2fa-setup"));
    expect(res.status).toBe(307);
    const dest = new URL(res.headers.get("location")!);
    expect(dest.pathname).toBe("/login");
  });
});

describe("pass-through", () => {
  it("does not intercept paths outside the matchers", async () => {
    const res = await proxy(makeRequest("/"));
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("does not intercept storefront product pages", async () => {
    const res = await proxy(makeRequest("/p/resin-pour-cup"));
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });
});
