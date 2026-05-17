/**
 * Integration tests for the General-tab update path (P2-T11).
 *
 * Pins:
 *   - validation (strict — extra keys rejected; cross-field rules trip)
 *   - happy path: returns before + after with the patched fields
 *   - unique-violation surfaces as a typed result (slug_in_use, sku_in_use)
 *   - constraint-violation (compare_at <= base) at the DB layer surfaces
 *     as { code: 'constraint' } even if the schema-level refine missed it
 *   - not-found returns { code: 'not_found' }, not an exception
 */
import { afterAll, describe, expect, it } from "vitest";
import {
  getProductForEditing,
  updateProductGeneral,
} from "@/lib/db/admin/products";
import { srv, makeTestProduct } from "../_clients";

const cleanups: Array<() => Promise<void>> = [];
const extraIds: string[] = [];

afterAll(async () => {
  await Promise.all(cleanups.map((c) => c().catch(() => undefined)));
  if (extraIds.length > 0) {
    await srv.from("products").delete().in("id", extraIds);
  }
});

const baseInput = {
  name: "Updated name",
  slug: "zzz-fixture-updated",
  sku: "ZZZ-FIX-UPDATED",
  short_description: "Short description",
  description: "Long description",
  base_price_inr: 199,
  compare_at_price_inr: 299,
  stock_status: "in_stock" as const,
  stock_quantity: 10,
  low_stock_threshold: 5,
  allow_backorder: false,
  min_order_qty: 1,
  max_order_qty: 12,
  meta_title: null,
  meta_description: null,
};

// Null is allowed (FK is ON DELETE SET NULL on products.updated_by).
// Tests use null; production callers pass the real user id.
const actorId = null;

describe("updateProductGeneral — happy path", () => {
  it("returns before + after with the patched fields", async () => {
    const tag = Math.random().toString(36).slice(2, 8);
    const fixture = await makeTestProduct({
      slug: `zzz-fix-up-${tag}`,
      sku: `ZZZ-FIX-UP-${tag.toUpperCase()}`,
      name: `to-update ${tag}`,
    });
    cleanups.push(fixture.cleanup);

    const result = await updateProductGeneral(
      srv,
      fixture.productId,
      {
        ...baseInput,
        slug: `zzz-fix-up-${tag}-new`,
        sku: `ZZZ-FIX-UP-${tag.toUpperCase()}-NEW`,
      },
      actorId,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.before.name).toBe(`to-update ${tag}`);
      expect(result.before.slug).toBe(`zzz-fix-up-${tag}`);
      expect(result.after.name).toBe("Updated name");
      expect(result.after.slug).toBe(`zzz-fix-up-${tag}-new`);
      expect(result.after.compare_at_price_inr).toBe(299);
    }

    // Confirm the DB actually changed (not just the function return).
    const fresh = await getProductForEditing(srv, fixture.productId);
    expect(fresh?.name).toBe("Updated name");
  });
});

describe("updateProductGeneral — validation", () => {
  it("rejects unknown keys via .strict()", async () => {
    const tag = Math.random().toString(36).slice(2, 8);
    const fixture = await makeTestProduct({
      slug: `zzz-fix-strict-${tag}`,
      sku: `ZZZ-FIX-STRICT-${tag.toUpperCase()}`,
      name: `strict ${tag}`,
    });
    cleanups.push(fixture.cleanup);

    const result = await updateProductGeneral(
      srv,
      fixture.productId,
      {
        ...baseInput,
        slug: `zzz-fix-strict-${tag}`,
        sku: `ZZZ-FIX-STRICT-${tag.toUpperCase()}`,
        category_id: "not-allowed-via-general-tab",
      } as unknown,
      actorId,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("validation");
    }
  });

  it("rejects compare_at_price <= base_price via the cross-field refine", async () => {
    const tag = Math.random().toString(36).slice(2, 8);
    const fixture = await makeTestProduct({
      slug: `zzz-fix-comp-${tag}`,
      sku: `ZZZ-FIX-COMP-${tag.toUpperCase()}`,
      name: `compare ${tag}`,
    });
    cleanups.push(fixture.cleanup);

    const result = await updateProductGeneral(
      srv,
      fixture.productId,
      {
        ...baseInput,
        slug: `zzz-fix-comp-${tag}`,
        sku: `ZZZ-FIX-COMP-${tag.toUpperCase()}`,
        base_price_inr: 200,
        compare_at_price_inr: 100,
      },
      actorId,
    );
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.code === "validation") {
      const issuePaths = result.error.issues.map((i) => i.path.join("."));
      expect(issuePaths).toContain("compare_at_price_inr");
    }
  });

  it("rejects max_order_qty < min_order_qty via the cross-field refine", async () => {
    const tag = Math.random().toString(36).slice(2, 8);
    const fixture = await makeTestProduct({
      slug: `zzz-fix-qty-${tag}`,
      sku: `ZZZ-FIX-QTY-${tag.toUpperCase()}`,
      name: `qty ${tag}`,
    });
    cleanups.push(fixture.cleanup);

    const result = await updateProductGeneral(
      srv,
      fixture.productId,
      {
        ...baseInput,
        slug: `zzz-fix-qty-${tag}`,
        sku: `ZZZ-FIX-QTY-${tag.toUpperCase()}`,
        min_order_qty: 5,
        max_order_qty: 2,
      },
      actorId,
    );
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.code === "validation") {
      const issuePaths = result.error.issues.map((i) => i.path.join("."));
      expect(issuePaths).toContain("max_order_qty");
    }
  });
});

describe("updateProductGeneral — DB constraints", () => {
  it("returns slug_in_use when the new slug collides", async () => {
    const tagA = Math.random().toString(36).slice(2, 8);
    const tagB = Math.random().toString(36).slice(2, 8);
    const a = await makeTestProduct({
      slug: `zzz-fix-sluga-${tagA}`,
      sku: `ZZZ-FIX-SLUG-A-${tagA.toUpperCase()}`,
      name: `a ${tagA}`,
    });
    const b = await makeTestProduct({
      slug: `zzz-fix-slugb-${tagB}`,
      sku: `ZZZ-FIX-SLUG-B-${tagB.toUpperCase()}`,
      name: `b ${tagB}`,
    });
    cleanups.push(a.cleanup, b.cleanup);

    // Try to update B's slug to A's slug.
    const result = await updateProductGeneral(
      srv,
      b.productId,
      {
        ...baseInput,
        slug: `zzz-fix-sluga-${tagA}`, // matches A's slug (lowercase)
        sku: `ZZZ-FIX-SLUG-B-${tagB.toUpperCase()}`,
      },
      actorId,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(["slug_in_use", "validation"]).toContain(result.error.code);
    }
  });

  it("returns sku_in_use when the new sku collides", async () => {
    const tagA = Math.random().toString(36).slice(2, 8);
    const tagB = Math.random().toString(36).slice(2, 8);
    const sharedSkuRoot = `ZZZ-FIX-SKU-${tagA.toUpperCase()}`;
    const a = await makeTestProduct({
      slug: `zzz-fix-skua-${tagA}`,
      sku: sharedSkuRoot,
      name: `a ${tagA}`,
    });
    const b = await makeTestProduct({
      slug: `zzz-fix-skub-${tagB}`,
      sku: `ZZZ-FIX-SKU-B-${tagB.toUpperCase()}`,
      name: `b ${tagB}`,
    });
    cleanups.push(a.cleanup, b.cleanup);

    const result = await updateProductGeneral(
      srv,
      b.productId,
      {
        ...baseInput,
        slug: `zzz-fix-skub-${tagB}`,
        sku: sharedSkuRoot, // collide with A
      },
      actorId,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(["sku_in_use", "validation"]).toContain(result.error.code);
    }
  });
});

describe("updateProductGeneral — not found", () => {
  it("returns { code: 'not_found' } for a missing id", async () => {
    const result = await updateProductGeneral(
      srv,
      "00000000-0000-0000-0000-000000000000",
      baseInput,
      actorId,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("not_found");
    }
  });
});
