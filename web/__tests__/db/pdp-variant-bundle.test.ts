/**
 * Integration tests for `getPdpVariantBundle` — the function that
 * assembles the option/value/variant graph the PDP variant selector
 * renders.
 *
 * Untested until now. A regression in this read silently breaks every
 * variant PDP on the storefront (the selector renders empty + the
 * add-to-cart button gets the wrong SKU).
 *
 * Pins:
 *   1. A product with no options returns `{ options: [], variants: [] }`.
 *   2. A product with options returns them in sort_order ASC, name ASC.
 *   3. Option values are returned per option, sort_order ASC, value ASC.
 *   4. Variants come back with their option-value membership populated.
 *   5. Soft-deleted variants are filtered out.
 *   6. is_default is preserved from the DB.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anon, srv } from "./_clients";
import { getPdpVariantBundle } from "@/lib/db/products";

const TAG = `zzz-vbundle-${Date.now()}`;
let catId: string;
let plainProductId: string;
let variantProductId: string;
let sizeOptionId: string;
let colorOptionId: string;
let sizeSmallValueId: string;
let sizeLargeValueId: string;
let colorTealValueId: string;
let colorAmberValueId: string;
let defaultVariantId: string;
let secondVariantId: string;
let deletedVariantId: string;

beforeAll(async () => {
  // Seed category + two products.
  const { data: cat } = await srv
    .from("categories")
    .insert({ slug: `${TAG}-cat`, name: `${TAG} cat` })
    .select("id")
    .single();
  catId = cat!.id as string;

  const { data: prods } = await srv
    .from("products")
    .insert([
      {
        sku: `${TAG.toUpperCase()}-PLAIN`,
        slug: `${TAG}-plain`,
        name: `${TAG} plain`,
        base_price_inr: 100,
        stock_status: "in_stock" as const,
        category_id: catId,
        is_published: true,
        review_status: "published" as const,
        source: "manual" as const,
      },
      {
        sku: `${TAG.toUpperCase()}-VARIANT`,
        slug: `${TAG}-variant`,
        name: `${TAG} with-variants`,
        base_price_inr: 100,
        stock_status: "in_stock" as const,
        category_id: catId,
        is_published: true,
        review_status: "published" as const,
        source: "manual" as const,
      },
    ])
    .select("id, slug");
  plainProductId = (prods ?? []).find((p) => (p.slug as string).endsWith("-plain"))!.id as string;
  variantProductId = (prods ?? []).find((p) => (p.slug as string).endsWith("-variant"))!.id as string;

  // Options for variantProduct: Size (sort 0) + Color (sort 1).
  const { data: opts } = await srv
    .from("product_options")
    .insert([
      { product_id: variantProductId, name: "Size", sort_order: 0 },
      { product_id: variantProductId, name: "Color", sort_order: 1 },
    ])
    .select("id, name");
  sizeOptionId = (opts ?? []).find((o) => o.name === "Size")!.id as string;
  colorOptionId = (opts ?? []).find((o) => o.name === "Color")!.id as string;

  // Values:
  //   Size: Small (sort 0) + Large (sort 1)
  //   Color: Teal (sort 0) + Amber (sort 1)
  const { data: values } = await srv
    .from("product_option_values")
    .insert([
      { option_id: sizeOptionId, value: "Small", sort_order: 0 },
      { option_id: sizeOptionId, value: "Large", sort_order: 1 },
      { option_id: colorOptionId, value: "Teal", sort_order: 0 },
      { option_id: colorOptionId, value: "Amber", sort_order: 1 },
    ])
    .select("id, value, option_id");
  sizeSmallValueId = (values ?? []).find((v) => v.value === "Small" && v.option_id === sizeOptionId)!.id as string;
  sizeLargeValueId = (values ?? []).find((v) => v.value === "Large")!.id as string;
  colorTealValueId = (values ?? []).find((v) => v.value === "Teal")!.id as string;
  colorAmberValueId = (values ?? []).find((v) => v.value === "Amber")!.id as string;

  // Variants:
  //   Small/Teal — default
  //   Large/Amber — second
  //   Small/Amber — soft-deleted (should be filtered out)
  const { data: variants } = await srv
    .from("product_variants")
    .insert([
      {
        product_id: variantProductId,
        sku: `${TAG.toUpperCase()}-V-ST`,
        name: "Small / Teal",
        price_inr: 100,
        stock_status: "in_stock" as const,
        is_default: true,
        sort_order: 0,
      },
      {
        product_id: variantProductId,
        sku: `${TAG.toUpperCase()}-V-LA`,
        name: "Large / Amber",
        price_inr: 150,
        stock_status: "in_stock" as const,
        is_default: false,
        sort_order: 1,
      },
      {
        product_id: variantProductId,
        sku: `${TAG.toUpperCase()}-V-SA`,
        name: "Small / Amber (deleted)",
        price_inr: 100,
        stock_status: "in_stock" as const,
        is_default: false,
        sort_order: 2,
        deleted_at: new Date().toISOString(),
      },
    ])
    .select("id, sku");
  defaultVariantId = (variants ?? []).find((v) => (v.sku as string).endsWith("-ST"))!.id as string;
  secondVariantId = (variants ?? []).find((v) => (v.sku as string).endsWith("-LA"))!.id as string;
  deletedVariantId = (variants ?? []).find((v) => (v.sku as string).endsWith("-SA"))!.id as string;

  // Link variants to their option values.
  await srv.from("variant_option_values").insert([
    { variant_id: defaultVariantId, option_value_id: sizeSmallValueId },
    { variant_id: defaultVariantId, option_value_id: colorTealValueId },
    { variant_id: secondVariantId, option_value_id: sizeLargeValueId },
    { variant_id: secondVariantId, option_value_id: colorAmberValueId },
    { variant_id: deletedVariantId, option_value_id: sizeSmallValueId },
    { variant_id: deletedVariantId, option_value_id: colorAmberValueId },
  ]);
}, 60_000);

afterAll(async () => {
  await srv
    .from("products")
    .delete()
    .in("id", [plainProductId, variantProductId]);
  await srv.from("categories").delete().eq("id", catId);
}, 60_000);

describe("getPdpVariantBundle", () => {
  it("returns empty options + variants for a product with no options", async () => {
    const bundle = await getPdpVariantBundle(anon, plainProductId);
    expect(bundle.options).toEqual([]);
    expect(bundle.variants).toEqual([]);
  });

  it("returns options sorted by sort_order ASC, then name ASC", async () => {
    const bundle = await getPdpVariantBundle(anon, variantProductId);
    const names = bundle.options.map((o) => o.name);
    expect(names).toEqual(["Size", "Color"]); // sort_order 0, 1
  });

  it("returns each option's values sorted by sort_order ASC, value ASC", async () => {
    const bundle = await getPdpVariantBundle(anon, variantProductId);
    const size = bundle.options.find((o) => o.name === "Size")!;
    const color = bundle.options.find((o) => o.name === "Color")!;
    expect(size.values.map((v) => v.value)).toEqual(["Small", "Large"]);
    expect(color.values.map((v) => v.value)).toEqual(["Teal", "Amber"]);
  });

  it("returns variants with their option_value_ids populated", async () => {
    const bundle = await getPdpVariantBundle(anon, variantProductId);
    const defaultVar = bundle.variants.find((v) => v.id === defaultVariantId)!;
    expect(defaultVar).toBeDefined();
    expect(defaultVar.sku).toBe(`${TAG.toUpperCase()}-V-ST`);
    expect(defaultVar.is_default).toBe(true);
    expect(new Set(defaultVar.option_value_ids)).toEqual(
      new Set([sizeSmallValueId, colorTealValueId]),
    );
  });

  it("filters out soft-deleted variants", async () => {
    const bundle = await getPdpVariantBundle(anon, variantProductId);
    const ids = bundle.variants.map((v) => v.id);
    expect(ids).toContain(defaultVariantId);
    expect(ids).toContain(secondVariantId);
    expect(ids).not.toContain(deletedVariantId);
  });

  it("preserves is_default flag from the DB (matters for selector init)", async () => {
    const bundle = await getPdpVariantBundle(anon, variantProductId);
    const defaults = bundle.variants.filter((v) => v.is_default);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].id).toBe(defaultVariantId);
  });

  it("variant price_inr carries through (drives selector's per-variant price update)", async () => {
    const bundle = await getPdpVariantBundle(anon, variantProductId);
    const defaultVar = bundle.variants.find((v) => v.id === defaultVariantId)!;
    const secondVar = bundle.variants.find((v) => v.id === secondVariantId)!;
    expect(defaultVar.price_inr).toBe(100);
    expect(secondVar.price_inr).toBe(150);
  });
});
