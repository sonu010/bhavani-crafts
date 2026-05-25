/**
 * Integration tests for attribute_definitions admin (P2-T22).
 */
import { afterAll, describe, expect, it } from "vitest";
import {
  createAttributeDefinition,
  deleteAttributeDefinition,
  getAttributeDefinitionForEditing,
  listAttributeDefinitionsAdmin,
  updateAttributeDefinition,
} from "@/lib/db/admin/attribute-defs";
import { purgeZzzFixtures, srv } from "../_clients";

const defIds: string[] = [];
const catIds: string[] = [];
const prodIds: string[] = [];

afterAll(async () => {
  if (defIds.length > 0) {
    await srv.from("attribute_definitions").delete().in("id", defIds);
  }
  if (prodIds.length > 0) {
    await srv.from("products").delete().in("id", prodIds);
  }
  if (catIds.length > 0) {
    await srv.from("categories").delete().in("id", catIds);
  }
  // Belt + braces: drop any `zzz-` row this suite (or a prior crashed
  // run) leaked. Idempotent.
  await purgeZzzFixtures();
});

function rid() {
  return Math.random().toString(36).slice(2, 10);
}

function baseInput(name: string) {
  return {
    name,
    slug: `zzz-fix-def-${rid()}`,
    type: "text" as const,
    unit: null,
    applies_to_category_id: null,
    options_json: null,
    is_filterable: true,
    sort_order: 0,
  };
}

async function makeCategory() {
  const { data, error } = await srv
    .from("categories")
    .insert({ slug: `zzz-defcat-${rid()}`, name: "defcat" })
    .select("id")
    .single();
  if (error) throw error;
  catIds.push(data.id);
  return data.id;
}

async function makeProduct(categoryId: string) {
  const { data, error } = await srv
    .from("products")
    .insert({
      sku: `ZZZ-DEF-${rid().toUpperCase()}`,
      slug: `zzz-def-prod-${rid()}`,
      name: "def fixture",
      base_price_inr: 100,
      stock_status: "unknown",
      category_id: categoryId,
      review_status: "draft",
      source: "manual",
    })
    .select("id")
    .single();
  if (error) throw error;
  prodIds.push(data.id);
  return data.id;
}

describe("createAttributeDefinition", () => {
  it("creates a text attribute", async () => {
    const r = await createAttributeDefinition(srv, baseInput("zzz text-attr"));
    expect(r.ok).toBe(true);
    if (r.ok) defIds.push(r.id);
  });

  it("creates a select attribute with options", async () => {
    const r = await createAttributeDefinition(srv, {
      ...baseInput("zzz select-attr"),
      type: "select",
      options_json: ["matte", "glossy", "satin"],
    });
    expect(r.ok).toBe(true);
    if (r.ok) defIds.push(r.id);
  });

  it("rejects select with no options", async () => {
    const r = await createAttributeDefinition(srv, {
      ...baseInput("zzz select-empty"),
      type: "select",
      options_json: null,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("validation");
  });

  it("rejects duplicate options within select", async () => {
    const r = await createAttributeDefinition(srv, {
      ...baseInput("zzz select-dup"),
      type: "select",
      options_json: ["matte", "Matte"],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("validation");
  });

  it("rejects options_json on non-select type", async () => {
    const r = await createAttributeDefinition(srv, {
      ...baseInput("zzz number-with-opts"),
      type: "number",
      options_json: ["foo"],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("validation");
  });

  it("rejects collision on slug", async () => {
    const slug = `zzz-coll-${rid()}`;
    const a = await createAttributeDefinition(srv, {
      ...baseInput("zzz a"),
      slug,
    });
    expect(a.ok).toBe(true);
    if (a.ok) defIds.push(a.id);
    const b = await createAttributeDefinition(srv, {
      ...baseInput("zzz b"),
      slug,
    });
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.error.code).toBe("slug_in_use");
  });

  it("rejects unknown category", async () => {
    const r = await createAttributeDefinition(srv, {
      ...baseInput("zzz unknown-cat"),
      applies_to_category_id: "00000000-0000-0000-0000-000000000000",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("category_not_found");
  });
});

describe("updateAttributeDefinition", () => {
  it("updates name + sort_order", async () => {
    const a = await createAttributeDefinition(srv, baseInput("zzz upd"));
    if (!a.ok) throw new Error("setup");
    defIds.push(a.id);
    const cur = await getAttributeDefinitionForEditing(srv, a.id);
    // The schema is .strict(); strip the id before spreading.
    const { id: _idIgnored, ...rest } = cur!;
    void _idIgnored;
    const r = await updateAttributeDefinition(srv, a.id, {
      ...rest,
      name: "zzz updated",
      sort_order: 5,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.after.name).toBe("zzz updated");
      expect(r.after.sort_order).toBe(5);
    }
  });

  it("blocks type change when product_attributes exist", async () => {
    const cat = await makeCategory();
    const prod = await makeProduct(cat);
    const a = await createAttributeDefinition(srv, {
      ...baseInput("zzz type-locked"),
      type: "text",
    });
    if (!a.ok) throw new Error("setup");
    defIds.push(a.id);

    // Attach a value
    const ins = await srv
      .from("product_attributes")
      .insert({
        product_id: prod,
        attribute_id: a.id,
        value_text: "x",
        value_number: null,
        value_boolean: null,
      });
    expect(ins.error).toBeNull();

    const cur = await getAttributeDefinitionForEditing(srv, a.id);
    const { id: _idIgnored2, ...rest } = cur!;
    void _idIgnored2;
    const r = await updateAttributeDefinition(srv, a.id, {
      ...rest,
      type: "number",
      // Pass the constraint: number type must not carry options_json,
      // which we already null.
    });
    expect(r.ok).toBe(false);
    if (!r.ok && r.error.code === "type_change_blocked") {
      expect(r.error.productValueCount).toBe(1);
    }
  });
});

describe("deleteAttributeDefinition", () => {
  it("deletes a definition with no references", async () => {
    const a = await createAttributeDefinition(srv, baseInput("zzz del"));
    if (!a.ok) throw new Error("setup");
    // Don't push to defIds — the test deletes it.
    const r = await deleteAttributeDefinition(srv, a.id);
    expect(r.ok).toBe(true);
  });

  it("refuses when product_attributes reference the definition", async () => {
    const cat = await makeCategory();
    const prod = await makeProduct(cat);
    const a = await createAttributeDefinition(srv, baseInput("zzz del-blocked"));
    if (!a.ok) throw new Error("setup");
    defIds.push(a.id);

    await srv.from("product_attributes").insert({
      product_id: prod,
      attribute_id: a.id,
      value_text: "y",
      value_number: null,
      value_boolean: null,
    });

    const r = await deleteAttributeDefinition(srv, a.id);
    expect(r.ok).toBe(false);
    if (!r.ok && r.error.code === "in_use") {
      expect(r.error.productValueCount).toBe(1);
    }
  });

  it("returns not_found for unknown id", async () => {
    const r = await deleteAttributeDefinition(
      srv,
      "00000000-0000-0000-0000-000000000000",
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("not_found");
  });
});

describe("listAttributeDefinitionsAdmin", () => {
  it("returns definitions with product_value_count", async () => {
    const list = await listAttributeDefinitionsAdmin(srv);
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((d) => typeof d.product_value_count === "number")).toBe(true);
  });
});
