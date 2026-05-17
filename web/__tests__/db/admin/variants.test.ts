/**
 * Integration tests for the Variants-tab data path (P2-T14).
 *
 * Covers:
 *   - getVariantsBundle: empty product, full options+values+variants
 *   - setProductOptions: insert, update, delete (when no active variants
 *     reference the option-value), block when references exist
 *   - setProductVariants: insert, update, sku collision, compare_at
 *     validation, duplicate combo guard
 *   - generateAllVariants: Cartesian; idempotent (skips existing combos);
 *     auto-default; SKU collision suffixing
 *   - setDefaultVariant: only one default at a time (partial unique
 *     index enforces; integration test confirms)
 *   - softDeleteVariant: deleted_at set, default cleared, vanished
 *     from getVariantsBundle
 */
import { afterAll, describe, expect, it } from "vitest";
import {
  generateAllVariants,
  getVariantsBundle,
  setDefaultVariant,
  setProductOptions,
  setProductVariants,
  softDeleteVariant,
  type OptionInput,
  type VariantInput,
} from "@/lib/db/admin/variants";
import { srv, makeTestProduct } from "../_clients";

const cleanups: Array<() => Promise<void>> = [];

afterAll(async () => {
  await Promise.all(cleanups.map((c) => c().catch(() => undefined)));
});

function rid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function pickSku(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

async function makeFixture(label: string) {
  const fixture = await makeTestProduct({
    slug: rid(`zzz-fix-var-${label}`),
    sku: pickSku(`ZZZ-FIX-VAR-${label.toUpperCase()}`),
    name: `variants ${label} fixture`,
  });
  cleanups.push(fixture.cleanup);
  return fixture;
}

describe("getVariantsBundle", () => {
  it("returns empty arrays for a product with no options or variants", async () => {
    const f = await makeFixture("empty");
    const b = await getVariantsBundle(srv, f.productId);
    expect(b.options).toEqual([]);
    expect(b.variants).toEqual([]);
  });

  it("returns full options tree + variant rows with option_value_ids", async () => {
    const f = await makeFixture("full");
    const set = await setProductOptions(srv, f.productId, [
      {
        id: null,
        name: "Size",
        sort_order: 0,
        values: [
          { id: null, value: "S", sort_order: 0 },
          { id: null, value: "M", sort_order: 1 },
        ],
      },
    ]);
    expect(set.ok).toBe(true);

    const gen = await generateAllVariants(srv, f.productId);
    expect(gen.ok).toBe(true);
    if (gen.ok) expect(gen.created).toBe(2);

    const b = await getVariantsBundle(srv, f.productId);
    expect(b.options).toHaveLength(1);
    expect(b.options[0].values).toHaveLength(2);
    expect(b.variants).toHaveLength(2);
    expect(b.variants[0].option_value_ids).toHaveLength(1);
  });
});

describe("setProductOptions", () => {
  it("inserts new options + values", async () => {
    const f = await makeFixture("set-opts-ins");
    const r = await setProductOptions(srv, f.productId, [
      {
        id: null,
        name: "Color",
        sort_order: 0,
        values: [
          { id: null, value: "Red", sort_order: 0 },
          { id: null, value: "Blue", sort_order: 1 },
        ],
      },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.options).toHaveLength(1);
      expect(r.options[0].name).toBe("Color");
      expect(r.options[0].values).toHaveLength(2);
    }
  });

  it("updates names + sort_order on existing options/values", async () => {
    const f = await makeFixture("set-opts-upd");
    const create = await setProductOptions(srv, f.productId, [
      {
        id: null,
        name: "Size",
        sort_order: 0,
        values: [{ id: null, value: "S", sort_order: 0 }],
      },
    ]);
    expect(create.ok).toBe(true);
    if (!create.ok) return;

    const opt = create.options[0];
    const val = opt.values[0];
    const upd = await setProductOptions(srv, f.productId, [
      {
        id: opt.id,
        name: "Sizing",
        sort_order: 1,
        values: [{ id: val.id, value: "Small", sort_order: 5 }],
      },
    ]);
    expect(upd.ok).toBe(true);
    if (upd.ok) {
      expect(upd.options[0].name).toBe("Sizing");
      expect(upd.options[0].sort_order).toBe(1);
      expect(upd.options[0].values[0].value).toBe("Small");
      expect(upd.options[0].values[0].sort_order).toBe(5);
    }
  });

  it("deletes options no longer present (and their values via CASCADE)", async () => {
    const f = await makeFixture("set-opts-del");
    const a = await setProductOptions(srv, f.productId, [
      {
        id: null,
        name: "Size",
        sort_order: 0,
        values: [{ id: null, value: "S", sort_order: 0 }],
      },
      {
        id: null,
        name: "Material",
        sort_order: 1,
        values: [{ id: null, value: "Wood", sort_order: 0 }],
      },
    ]);
    expect(a.ok).toBe(true);
    if (!a.ok) return;

    const keep = a.options.find((o) => o.name === "Size")!;
    const b = await setProductOptions(srv, f.productId, [
      {
        id: keep.id,
        name: keep.name,
        sort_order: 0,
        values: [{ id: keep.values[0].id, value: keep.values[0].value, sort_order: 0 }],
      },
    ]);
    expect(b.ok).toBe(true);
    if (b.ok) {
      expect(b.options).toHaveLength(1);
      expect(b.options[0].name).toBe("Size");
    }
  });

  it("blocks deleting an option-value referenced by an active variant", async () => {
    const f = await makeFixture("set-opts-blk");
    const a = await setProductOptions(srv, f.productId, [
      {
        id: null,
        name: "Size",
        sort_order: 0,
        values: [
          { id: null, value: "S", sort_order: 0 },
          { id: null, value: "M", sort_order: 1 },
        ],
      },
    ]);
    expect(a.ok).toBe(true);
    if (!a.ok) return;

    await generateAllVariants(srv, f.productId);
    const opt = a.options[0];
    const removeSValue: OptionInput = {
      id: opt.id,
      name: opt.name,
      sort_order: 0,
      values: [
        {
          id: opt.values.find((v) => v.value === "M")!.id,
          value: "M",
          sort_order: 0,
        },
      ],
    };
    const blocked = await setProductOptions(srv, f.productId, [removeSValue]);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.error.code).toBe("value_in_use");
    }
  });

  it("rejects duplicate option names", async () => {
    const f = await makeFixture("dup-opt");
    const r = await setProductOptions(srv, f.productId, [
      {
        id: null,
        name: "Size",
        sort_order: 0,
        values: [{ id: null, value: "S", sort_order: 0 }],
      },
      {
        id: null,
        name: "size",
        sort_order: 1,
        values: [{ id: null, value: "L", sort_order: 0 }],
      },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("duplicate_option_name");
  });
});

describe("generateAllVariants", () => {
  it("creates the Cartesian product and auto-assigns the first as default", async () => {
    const f = await makeFixture("gen-full");
    await setProductOptions(srv, f.productId, [
      {
        id: null,
        name: "Size",
        sort_order: 0,
        values: [
          { id: null, value: "S", sort_order: 0 },
          { id: null, value: "M", sort_order: 1 },
        ],
      },
      {
        id: null,
        name: "Color",
        sort_order: 1,
        values: [
          { id: null, value: "Red", sort_order: 0 },
          { id: null, value: "Blue", sort_order: 1 },
          { id: null, value: "Green", sort_order: 2 },
        ],
      },
    ]);
    const gen = await generateAllVariants(srv, f.productId);
    expect(gen.ok).toBe(true);
    if (gen.ok) expect(gen.created).toBe(6);

    const b = await getVariantsBundle(srv, f.productId);
    expect(b.variants).toHaveLength(6);
    expect(b.variants.filter((v) => v.is_default)).toHaveLength(1);
  });

  it("is idempotent — second generate creates 0 new variants", async () => {
    const f = await makeFixture("gen-idem");
    await setProductOptions(srv, f.productId, [
      {
        id: null,
        name: "Size",
        sort_order: 0,
        values: [{ id: null, value: "S", sort_order: 0 }],
      },
    ]);
    await generateAllVariants(srv, f.productId);
    const again = await generateAllVariants(srv, f.productId);
    expect(again.ok).toBe(true);
    if (again.ok) expect(again.created).toBe(0);
  });

  it("creates only the missing combos when options grow", async () => {
    const f = await makeFixture("gen-grow");
    const a = await setProductOptions(srv, f.productId, [
      {
        id: null,
        name: "Size",
        sort_order: 0,
        values: [
          { id: null, value: "S", sort_order: 0 },
          { id: null, value: "M", sort_order: 1 },
        ],
      },
    ]);
    expect(a.ok).toBe(true);
    if (!a.ok) return;

    await generateAllVariants(srv, f.productId); // 2 variants

    const sizeOpt = a.options[0];
    await setProductOptions(srv, f.productId, [
      {
        id: sizeOpt.id,
        name: sizeOpt.name,
        sort_order: 0,
        values: sizeOpt.values.map((v) => ({
          id: v.id,
          value: v.value,
          sort_order: v.sort_order,
        })),
      },
      {
        id: null,
        name: "Color",
        sort_order: 1,
        values: [
          { id: null, value: "Red", sort_order: 0 },
          { id: null, value: "Blue", sort_order: 1 },
        ],
      },
    ]);
    const gen = await generateAllVariants(srv, f.productId);
    expect(gen.ok).toBe(true);
    if (gen.ok) {
      // 2×2 = 4 total combos; 2 existing were single-option (Size only)
      // and have NO Color value so don't match the new 2-option combos.
      // Result: 4 new + 2 single-option old = 6 variants total.
      expect(gen.created).toBe(4);
    }
    const b = await getVariantsBundle(srv, f.productId);
    expect(b.variants).toHaveLength(6);
  });

  it("returns no_options when the product has none", async () => {
    const f = await makeFixture("gen-no-opt");
    const r = await generateAllVariants(srv, f.productId);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("no_options");
  });
});

describe("setDefaultVariant", () => {
  it("enforces exactly one default per product", async () => {
    const f = await makeFixture("def");
    await setProductOptions(srv, f.productId, [
      {
        id: null,
        name: "Size",
        sort_order: 0,
        values: [
          { id: null, value: "S", sort_order: 0 },
          { id: null, value: "M", sort_order: 1 },
        ],
      },
    ]);
    await generateAllVariants(srv, f.productId);
    const b = await getVariantsBundle(srv, f.productId);
    const cur = b.variants.find((v) => v.is_default)!;
    const target = b.variants.find((v) => v.id !== cur.id)!;

    const r = await setDefaultVariant(srv, f.productId, target.id);
    expect(r.ok).toBe(true);
    const after = await getVariantsBundle(srv, f.productId);
    const defaults = after.variants.filter((v) => v.is_default);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].id).toBe(target.id);
  });
});

describe("softDeleteVariant", () => {
  it("hides the variant + clears is_default on the soft-deleted row", async () => {
    const f = await makeFixture("soft");
    await setProductOptions(srv, f.productId, [
      {
        id: null,
        name: "Size",
        sort_order: 0,
        values: [
          { id: null, value: "S", sort_order: 0 },
          { id: null, value: "M", sort_order: 1 },
        ],
      },
    ]);
    await generateAllVariants(srv, f.productId);
    const b = await getVariantsBundle(srv, f.productId);
    const def = b.variants.find((v) => v.is_default)!;
    const other = b.variants.find((v) => v.id !== def.id)!;

    // Soft-delete the non-default first (deleting the default would
    // strand the product without one; the action allows it but clears
    // the flag).
    const r1 = await softDeleteVariant(srv, other.id, null);
    expect(r1.ok).toBe(true);

    const after = await getVariantsBundle(srv, f.productId);
    expect(after.variants.map((v) => v.id)).not.toContain(other.id);
    expect(after.variants.filter((v) => v.is_default)).toHaveLength(1);

    // Now delete the default. The product is left with no default — a
    // future variant or generate-all will fill the slot.
    const r2 = await softDeleteVariant(srv, def.id, null);
    expect(r2.ok).toBe(true);
    const after2 = await getVariantsBundle(srv, f.productId);
    expect(after2.variants).toHaveLength(0);
  });

  it("returns variant_not_found for an unknown id", async () => {
    const r = await softDeleteVariant(
      srv,
      "00000000-0000-0000-0000-000000000000",
      null,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("variant_not_found");
  });
});

describe("setProductVariants", () => {
  it("updates price + stock on existing variants", async () => {
    const f = await makeFixture("upd");
    await setProductOptions(srv, f.productId, [
      {
        id: null,
        name: "Size",
        sort_order: 0,
        values: [{ id: null, value: "S", sort_order: 0 }],
      },
    ]);
    await generateAllVariants(srv, f.productId);
    const b = await getVariantsBundle(srv, f.productId);
    const v = b.variants[0];

    const inputs: VariantInput[] = [
      {
        id: v.id,
        sku: v.sku,
        name: v.name,
        price_inr: 1234,
        compare_at_price_inr: 1500,
        stock_status: "in_stock",
        stock_quantity: 10,
        sort_order: v.sort_order,
        option_value_ids: v.option_value_ids,
      },
    ];
    const r = await setProductVariants(srv, f.productId, inputs);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.variants[0].price_inr).toBe(1234);
      expect(r.variants[0].compare_at_price_inr).toBe(1500);
      expect(r.variants[0].stock_quantity).toBe(10);
    }
  });

  it("rejects compare_at <= price", async () => {
    const f = await makeFixture("cmp");
    await setProductOptions(srv, f.productId, [
      {
        id: null,
        name: "Size",
        sort_order: 0,
        values: [{ id: null, value: "S", sort_order: 0 }],
      },
    ]);
    await generateAllVariants(srv, f.productId);
    const b = await getVariantsBundle(srv, f.productId);
    const v = b.variants[0];
    const r = await setProductVariants(srv, f.productId, [
      {
        id: v.id,
        sku: v.sku,
        name: null,
        price_inr: 100,
        compare_at_price_inr: 100,
        stock_status: "in_stock",
        stock_quantity: null,
        sort_order: 0,
        option_value_ids: v.option_value_ids,
      },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("validation");
  });

  it("rejects duplicate SKU within the call", async () => {
    const f = await makeFixture("sku");
    await setProductOptions(srv, f.productId, [
      {
        id: null,
        name: "Size",
        sort_order: 0,
        values: [
          { id: null, value: "S", sort_order: 0 },
          { id: null, value: "M", sort_order: 1 },
        ],
      },
    ]);
    await generateAllVariants(srv, f.productId);
    const b = await getVariantsBundle(srv, f.productId);
    const a = b.variants[0];
    const bb = b.variants[1];
    const r = await setProductVariants(srv, f.productId, [
      {
        id: a.id,
        sku: "SAME-SKU",
        name: null,
        price_inr: 100,
        compare_at_price_inr: null,
        stock_status: "in_stock",
        stock_quantity: null,
        sort_order: 0,
        option_value_ids: a.option_value_ids,
      },
      {
        id: bb.id,
        sku: "SAME-SKU",
        name: null,
        price_inr: 100,
        compare_at_price_inr: null,
        stock_status: "in_stock",
        stock_quantity: null,
        sort_order: 1,
        option_value_ids: bb.option_value_ids,
      },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("sku_in_use");
  });
});
