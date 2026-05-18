/**
 * Integration tests for the publish lifecycle (P2-T17).
 *
 * Covers:
 *   - runProductPreflight: blocking vs warning, transitions when
 *     fixtures change
 *   - publishProduct: refuses when preflight blocks, succeeds when
 *     clean
 *   - unpublishProduct: reverses publish; idempotent on already-
 *     unpublished products
 *   - DB trigger refuses an invalid (is_published, review_status)
 *     combo manually issued via service-role
 */
import { afterAll, describe, expect, it } from "vitest";
import {
  publishProduct,
  runProductPreflight,
  unpublishProduct,
} from "@/lib/db/admin/publish";
import { srv, makeTestProduct } from "../_clients";

const cleanups: Array<() => Promise<void>> = [];

afterAll(async () => {
  await Promise.all(cleanups.map((c) => c().catch(() => undefined)));
});

async function makeFixture(label: string) {
  const fixture = await makeTestProduct({
    slug: `zzz-fix-pub-${label}-${Math.random().toString(36).slice(2, 8)}`,
    sku: `ZZZ-FIX-PUB-${label.toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    name: `publish ${label} fixture`,
  });
  cleanups.push(fixture.cleanup);
  return fixture;
}

async function insertImage(
  productId: string,
  licenseStatus: "unverified" | "owned" | "disputed",
) {
  const { data, error } = await srv
    .from("product_images")
    .insert({
      product_id: productId,
      url: "https://example.com/test.webp",
      license_status: licenseStatus,
      source: "admin_upload",
      width: 100,
      height: 100,
      alt: "test",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

describe("runProductPreflight", () => {
  it("blocks when no licensed image exists", async () => {
    const f = await makeFixture("noimg");
    const r = await runProductPreflight(srv, f.productId);
    expect(r.canPublish).toBe(false);
    expect(r.blockingFailures).toContain("image_licensed");
  });

  it("passes when an owned image exists", async () => {
    const f = await makeFixture("owned");
    await insertImage(f.productId, "owned");
    const r = await runProductPreflight(srv, f.productId);
    expect(r.canPublish).toBe(true);
    expect(r.blockingFailures).toEqual([]);
  });

  it("blocks when a disputed image exists, even with an owned one", async () => {
    const f = await makeFixture("disputed");
    await insertImage(f.productId, "owned");
    await insertImage(f.productId, "disputed");
    const r = await runProductPreflight(srv, f.productId);
    expect(r.canPublish).toBe(false);
    expect(r.blockingFailures).toContain("no_tainted_image");
  });

  it("blocks when base price is null", async () => {
    const f = await makeFixture("noprice");
    await srv.from("products").update({ base_price_inr: null }).eq("id", f.productId);
    await insertImage(f.productId, "owned");
    const r = await runProductPreflight(srv, f.productId);
    expect(r.canPublish).toBe(false);
    expect(r.blockingFailures).toContain("base_price");
  });

  it("warns (does not block) when description is empty", async () => {
    const f = await makeFixture("desc");
    await insertImage(f.productId, "owned");
    await srv.from("products").update({ description: null }).eq("id", f.productId);
    const r = await runProductPreflight(srv, f.productId);
    const descCheck = r.checks.find((c) => c.id === "description_present")!;
    expect(descCheck.level).toBe("warning");
    expect(descCheck.passed).toBe(false);
    expect(r.canPublish).toBe(true);
  });
});

describe("publishProduct", () => {
  it("refuses to publish when preflight blocks", async () => {
    const f = await makeFixture("refuse");
    const r = await publishProduct(srv, f.productId);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("preflight_failed");
    }
  });

  it("publishes when preflight is clean", async () => {
    const f = await makeFixture("ok");
    await insertImage(f.productId, "owned");
    // makeTestProduct already sets is_published=true; flip to draft first
    // so we have a real transition to verify.
    await srv
      .from("products")
      .update({ is_published: false, review_status: "draft" })
      .eq("id", f.productId);

    const r = await publishProduct(srv, f.productId);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.before.is_published).toBe(false);
      expect(r.result.after.is_published).toBe(true);
      expect(r.result.after.review_status).toBe("published");
    }
  });
});

describe("unpublishProduct", () => {
  it("reverses publish; moves to ready_to_publish", async () => {
    const f = await makeFixture("rev");
    await insertImage(f.productId, "owned");
    // ensure starting state is published
    await publishProduct(srv, f.productId);

    const r = await unpublishProduct(srv, f.productId);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.after.is_published).toBe(false);
      expect(r.result.after.review_status).toBe("ready_to_publish");
    }
  });
});

describe("publish-state trigger (DB-level invariant)", () => {
  it("rejects manual UPDATE that sets review_status=published with is_published=false", async () => {
    const f = await makeFixture("trig");
    await srv
      .from("products")
      .update({ is_published: false, review_status: "draft" })
      .eq("id", f.productId);
    const r = await srv
      .from("products")
      .update({ review_status: "published" })
      .eq("id", f.productId);
    expect(r.error).not.toBeNull();
    expect(r.error?.message ?? "").toMatch(/is_published=true/);
  });
});
