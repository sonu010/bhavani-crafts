/**
 * Integration test for getProductByIdBasic — the lean shape the admin
 * editor shell reads on render. Pins three contracts:
 *   - returns the basic shape for an existing row
 *   - returns null for a missing id (no throw)
 *   - excludes soft-deleted rows (Trash view in P2-T28 is the only
 *     surface that should see them)
 */
import { afterAll, describe, expect, it } from "vitest";
import { getProductByIdBasic } from "@/lib/db/products";
import { srv, makeTestProduct } from "./_clients";

const cleanups: Array<() => Promise<void>> = [];
const extraProductIds: string[] = [];

afterAll(async () => {
  await Promise.all(cleanups.map((c) => c().catch(() => undefined)));
  if (extraProductIds.length > 0) {
    await srv.from("products").delete().in("id", extraProductIds);
  }
});

describe("getProductByIdBasic", () => {
  it("returns the basic row shape for an existing product", async () => {
    const tag = Math.random().toString(36).slice(2, 8);
    const fixture = await makeTestProduct({
      slug: `zzz-fixture-byid-${tag}`,
      sku: `ZZZ-FIX-BYID-${tag}`,
      name: `byId fixture ${tag}`,
      shortDescription: "shell editor fetch",
    });
    cleanups.push(fixture.cleanup);

    const row = await getProductByIdBasic(srv, fixture.productId);
    expect(row).not.toBeNull();
    expect(row).toMatchObject({
      id: fixture.productId,
      slug: `zzz-fixture-byid-${tag}`,
      sku: `ZZZ-FIX-BYID-${tag}`,
      name: `byId fixture ${tag}`,
      short_description: "shell editor fetch",
      review_status: "published",
      is_published: true,
    });
    expect(typeof row?.created_at).toBe("string");
    expect(typeof row?.updated_at).toBe("string");
  });

  it("returns null for an id that doesn't match anything", async () => {
    const row = await getProductByIdBasic(
      srv,
      "00000000-0000-0000-0000-000000000000",
    );
    expect(row).toBeNull();
  });

  it("excludes soft-deleted rows", async () => {
    // Create a fresh fixture, soft-delete it, then assert byId returns null.
    const tag = Math.random().toString(36).slice(2, 8);
    const fixture = await makeTestProduct({
      slug: `zzz-fixture-soft-${tag}`,
      sku: `ZZZ-FIX-SOFT-${tag}`,
      name: `byId soft fixture ${tag}`,
    });
    cleanups.push(fixture.cleanup);

    const before = await getProductByIdBasic(srv, fixture.productId);
    expect(before).not.toBeNull();

    const { error: softErr } = await srv
      .from("products")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", fixture.productId);
    expect(softErr).toBeNull();

    const after = await getProductByIdBasic(srv, fixture.productId);
    expect(after).toBeNull();
  });

  it("throws on a malformed uuid (fail-fast — caller should validate)", async () => {
    await expect(
      getProductByIdBasic(srv, "not-a-uuid"),
    ).rejects.toThrow(/getProductByIdBasic|invalid input/i);
  });
});
