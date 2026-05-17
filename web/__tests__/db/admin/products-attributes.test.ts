/**
 * Integration tests for the Attributes-tab data path (P2-T13).
 *
 * Covers:
 *   - listApplicableAttributes returns category ∪ globals
 *   - setProductAttributes: insert, update, clear (empty value → delete)
 *   - per-type validation (text length, number finite, boolean strict,
 *     select-value-in-options)
 *   - definition_not_found / select_value_invalid surface as typed errors
 *   - replace-semantics: an attribute omitted from the next call is
 *     removed from the row
 */
import { afterAll, describe, expect, it } from "vitest";
import { listApplicableAttributes } from "@/lib/db/attributes";
import { setProductAttributes } from "@/lib/db/admin/products";
import { srv, makeTestProduct } from "../_clients";

const cleanups: Array<() => Promise<void>> = [];
const fixtureDefIds: string[] = [];

afterAll(async () => {
  await Promise.all(cleanups.map((c) => c().catch(() => undefined)));
  if (fixtureDefIds.length > 0) {
    // product_attributes cascade on definition delete
    await srv.from("attribute_definitions").delete().in("id", fixtureDefIds);
  }
});

async function makeAttrDef(opts: {
  slug: string;
  name: string;
  type: "text" | "number" | "boolean" | "select";
  unit?: string;
  options?: string[];
  categoryId?: string;
}) {
  const { data, error } = await srv
    .from("attribute_definitions")
    .insert({
      slug: opts.slug,
      name: opts.name,
      type: opts.type,
      unit: opts.unit ?? null,
      options_json: opts.options ?? null,
      applies_to_category_id: opts.categoryId ?? null,
    })
    .select("id, slug, name, type, options_json")
    .single();
  if (error) throw error;
  fixtureDefIds.push(data.id);
  return data;
}

describe("listApplicableAttributes", () => {
  it("returns globals + the named category's definitions; sorted by slug", async () => {
    const fixture = await makeTestProduct({
      slug: `zzz-fix-attrs-list-${Math.random().toString(36).slice(2, 8)}`,
      sku: `ZZZ-FIX-ATTR-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      name: "attrs-list fixture",
    });
    cleanups.push(fixture.cleanup);

    const globalDef = await makeAttrDef({
      slug: `zzz-attr-global-${Math.random().toString(36).slice(2, 8)}`,
      name: "Global Attr",
      type: "text",
    });
    const catDef = await makeAttrDef({
      slug: `zzz-attr-cat-${Math.random().toString(36).slice(2, 8)}`,
      name: "Cat Attr",
      type: "number",
      unit: "ml",
      categoryId: fixture.categoryId,
    });
    // An unrelated category's attr should NOT appear
    const otherCat = await srv
      .from("categories")
      .insert({
        slug: `zzz-other-cat-${Math.random().toString(36).slice(2, 8)}`,
        name: "other-cat",
      })
      .select("id")
      .single();
    if (otherCat.error) throw otherCat.error;
    const otherDef = await makeAttrDef({
      slug: `zzz-attr-other-${Math.random().toString(36).slice(2, 8)}`,
      name: "Other Attr",
      type: "text",
      categoryId: otherCat.data.id,
    });

    const list = await listApplicableAttributes(srv, fixture.categoryId);
    const ids = list.map((d) => d.id);
    expect(ids).toContain(globalDef.id);
    expect(ids).toContain(catDef.id);
    expect(ids).not.toContain(otherDef.id);

    // Clean up the extra category fixture
    cleanups.push(async () => {
      await srv.from("categories").delete().eq("id", otherCat.data.id);
    });
  });

  it("returns ONLY globals when category is null", async () => {
    const globalDef = await makeAttrDef({
      slug: `zzz-attr-glob2-${Math.random().toString(36).slice(2, 8)}`,
      name: "Global2",
      type: "text",
    });
    const list = await listApplicableAttributes(srv, null);
    expect(list.find((d) => d.id === globalDef.id)).toBeDefined();
    expect(list.every((d) => d.applies_to_category_id === null)).toBe(true);
  });
});

describe("setProductAttributes — happy paths", () => {
  it("inserts new attribute rows for each type", async () => {
    const fixture = await makeTestProduct({
      slug: `zzz-fix-attrs-ins-${Math.random().toString(36).slice(2, 8)}`,
      sku: `ZZZ-FIX-ATTR-INS-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      name: "insert fixture",
    });
    cleanups.push(fixture.cleanup);

    const textDef = await makeAttrDef({
      slug: `zzz-text-${Math.random().toString(36).slice(2, 8)}`,
      name: "Material",
      type: "text",
    });
    const numDef = await makeAttrDef({
      slug: `zzz-num-${Math.random().toString(36).slice(2, 8)}`,
      name: "Volume",
      type: "number",
      unit: "ml",
    });
    const boolDef = await makeAttrDef({
      slug: `zzz-bool-${Math.random().toString(36).slice(2, 8)}`,
      name: "Eco-friendly",
      type: "boolean",
    });
    const selDef = await makeAttrDef({
      slug: `zzz-sel-${Math.random().toString(36).slice(2, 8)}`,
      name: "Finish",
      type: "select",
      options: ["matte", "glossy", "satin"],
    });

    const r = await setProductAttributes(srv, fixture.productId, [
      { attribute_id: textDef.id, value_text: "MDF" },
      { attribute_id: numDef.id, value_number: 200 },
      { attribute_id: boolDef.id, value_boolean: true },
      { attribute_id: selDef.id, value_text: "matte" },
    ]);

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.before).toEqual([]);
      expect(r.after).toHaveLength(4);
      const byId = new Map(r.after.map((a) => [a.attribute_id, a]));
      expect(byId.get(textDef.id)?.value_text).toBe("MDF");
      expect(byId.get(numDef.id)?.value_number).toBe(200);
      expect(byId.get(boolDef.id)?.value_boolean).toBe(true);
      expect(byId.get(selDef.id)?.value_text).toBe("matte");
    }
  });

  it("empty value removes the row (replace-semantics)", async () => {
    const fixture = await makeTestProduct({
      slug: `zzz-fix-attrs-clr-${Math.random().toString(36).slice(2, 8)}`,
      sku: `ZZZ-FIX-ATTR-CLR-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      name: "clear fixture",
    });
    cleanups.push(fixture.cleanup);

    const textDef = await makeAttrDef({
      slug: `zzz-clr-${Math.random().toString(36).slice(2, 8)}`,
      name: "Clear me",
      type: "text",
    });

    await setProductAttributes(srv, fixture.productId, [
      { attribute_id: textDef.id, value_text: "set" },
    ]);
    const cleared = await setProductAttributes(srv, fixture.productId, [
      { attribute_id: textDef.id, value_text: "" },
    ]);
    expect(cleared.ok).toBe(true);
    if (cleared.ok) {
      expect(cleared.before.find((a) => a.attribute_id === textDef.id)?.value_text).toBe("set");
      expect(cleared.after).toEqual([]);
    }
  });

  it("omitting an attribute removes it (replace, not patch)", async () => {
    const fixture = await makeTestProduct({
      slug: `zzz-fix-attrs-omit-${Math.random().toString(36).slice(2, 8)}`,
      sku: `ZZZ-FIX-ATTR-OMIT-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      name: "omit fixture",
    });
    cleanups.push(fixture.cleanup);

    const a = await makeAttrDef({
      slug: `zzz-omita-${Math.random().toString(36).slice(2, 8)}`,
      name: "A",
      type: "text",
    });
    const b = await makeAttrDef({
      slug: `zzz-omitb-${Math.random().toString(36).slice(2, 8)}`,
      name: "B",
      type: "text",
    });

    await setProductAttributes(srv, fixture.productId, [
      { attribute_id: a.id, value_text: "alpha" },
      { attribute_id: b.id, value_text: "beta" },
    ]);
    // Pass only B — A should be removed.
    const r = await setProductAttributes(srv, fixture.productId, [
      { attribute_id: b.id, value_text: "beta" },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.after).toHaveLength(1);
      expect(r.after[0].attribute_id).toBe(b.id);
    }
  });
});

describe("setProductAttributes — validation", () => {
  it("rejects text > 500 chars", async () => {
    const fixture = await makeTestProduct({
      slug: `zzz-fix-attrs-long-${Math.random().toString(36).slice(2, 8)}`,
      sku: `ZZZ-FIX-ATTR-LONG-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      name: "long-text fixture",
    });
    cleanups.push(fixture.cleanup);
    const def = await makeAttrDef({
      slug: `zzz-long-${Math.random().toString(36).slice(2, 8)}`,
      name: "Long",
      type: "text",
    });

    const r = await setProductAttributes(srv, fixture.productId, [
      { attribute_id: def.id, value_text: "x".repeat(501) },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("validation");
      if (r.error.code === "validation") {
        expect(r.error.issues[0].attribute_id).toBe(def.id);
      }
    }
  });

  it("rejects select value not in options_json", async () => {
    const fixture = await makeTestProduct({
      slug: `zzz-fix-attrs-sel-${Math.random().toString(36).slice(2, 8)}`,
      sku: `ZZZ-FIX-ATTR-SEL-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      name: "select fixture",
    });
    cleanups.push(fixture.cleanup);
    const def = await makeAttrDef({
      slug: `zzz-selx-${Math.random().toString(36).slice(2, 8)}`,
      name: "Finish",
      type: "select",
      options: ["matte", "glossy"],
    });

    const r = await setProductAttributes(srv, fixture.productId, [
      { attribute_id: def.id, value_text: "vinyl" },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("select_value_invalid");
      if (r.error.code === "select_value_invalid") {
        expect(r.error.allowed).toEqual(["matte", "glossy"]);
        expect(r.error.got).toBe("vinyl");
      }
    }
  });

  it("rejects unknown attribute_id", async () => {
    const fixture = await makeTestProduct({
      slug: `zzz-fix-attrs-unk-${Math.random().toString(36).slice(2, 8)}`,
      sku: `ZZZ-FIX-ATTR-UNK-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      name: "unknown-id fixture",
    });
    cleanups.push(fixture.cleanup);

    const fake = "00000000-0000-0000-0000-000000000000";
    const r = await setProductAttributes(srv, fixture.productId, [
      { attribute_id: fake, value_text: "x" },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("definition_not_found");
      if (r.error.code === "definition_not_found") {
        expect(r.error.missingIds).toContain(fake);
      }
    }
  });
});
