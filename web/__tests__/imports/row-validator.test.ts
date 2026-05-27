/**
 * Unit tests for the CSV row classifier (T23). The classifier is the
 * load-bearing piece that decides create/update/skip/error per row,
 * given pre-fetched reference maps.
 */
import { describe, expect, it } from "vitest";
import {
  classifyRow,
  type ValidatorRefs,
  type ExistingProduct,
} from "@/lib/imports/row-validator";

function refs(extra?: Partial<ValidatorRefs>): ValidatorRefs {
  return {
    categoryBySlug: extra?.categoryBySlug ?? new Map(),
    tagBySlug: extra?.tagBySlug ?? new Map(),
    productBySku: extra?.productBySku ?? new Map(),
  };
}

const baseRow = {
  sku: "TEST-001",
  slug: "test-001",
  name: "Test",
  short_description: "",
  description: "",
  base_price_inr: "100",
  compare_at_price_inr: "",
  stock_status: "in_stock",
  stock_quantity: "",
  category_slug: "",
  tags: "",
};

describe("classifyRow — validation", () => {
  it("rejects rows without an sku", () => {
    const r = classifyRow({ ...baseRow, sku: "" }, refs());
    expect(r.action).toBe("error");
    expect(r.error_message).toContain("validation");
  });

  it("rejects malformed sku", () => {
    const r = classifyRow({ ...baseRow, sku: "bad sku!" }, refs());
    expect(r.action).toBe("error");
  });

  it("rejects rows without a base_price_inr", () => {
    const r = classifyRow({ ...baseRow, base_price_inr: "" }, refs());
    expect(r.action).toBe("error");
  });

  it("rejects rows with non-numeric base_price_inr", () => {
    const r = classifyRow({ ...baseRow, base_price_inr: "free" }, refs());
    expect(r.action).toBe("error");
  });
});

describe("classifyRow — references", () => {
  it("rejects unknown category slug", () => {
    const r = classifyRow(
      { ...baseRow, category_slug: "misc" },
      refs({ categoryBySlug: new Map([["other", "cat-id"]]) }),
    );
    expect(r.action).toBe("error");
    expect(r.error_message).toContain("unknown_category");
  });

  it("rejects unknown tags", () => {
    const r = classifyRow(
      { ...baseRow, tags: "good, bad" },
      refs({ tagBySlug: new Map([["good", "good-id"]]) }),
    );
    expect(r.action).toBe("error");
    expect(r.error_message).toContain("unknown_tags");
  });
});

describe("classifyRow — create / update / skip", () => {
  it("classifies a new sku as create", () => {
    const r = classifyRow(baseRow, refs());
    expect(r.action).toBe("create");
    expect(r.error_message).toBeNull();
  });

  it("classifies a no-op match as skip", () => {
    const existing: ExistingProduct = {
      id: "p1",
      slug: "test-001",
      name: "Test",
      short_description: null,
      description: null,
      base_price_inr: 100,
      compare_at_price_inr: null,
      stock_status: "in_stock",
      stock_quantity: null,
      category_id: null,
    };
    const r = classifyRow(
      baseRow,
      refs({ productBySku: new Map([["TEST-001", existing]]) }),
    );
    expect(r.action).toBe("skip");
  });

  it("classifies a different name as update", () => {
    const existing: ExistingProduct = {
      id: "p1",
      slug: "test-001",
      name: "Old name",
      short_description: null,
      description: null,
      base_price_inr: 100,
      compare_at_price_inr: null,
      stock_status: "in_stock",
      stock_quantity: null,
      category_id: null,
    };
    const r = classifyRow(
      baseRow,
      refs({ productBySku: new Map([["TEST-001", existing]]) }),
    );
    expect(r.action).toBe("update");
  });

  it("auto-derives slug from name when slug column is empty", () => {
    const r = classifyRow({ ...baseRow, slug: "" }, refs());
    expect(r.action).toBe("create");
    const norm = (r.raw_json._normalized as Record<string, unknown>).slug;
    expect(norm).toBe("test");
  });

  it("packs resolved category id + tag ids into _normalized / _tag_ids", () => {
    const r = classifyRow(
      { ...baseRow, category_slug: "boxes", tags: "wood, paper" },
      refs({
        categoryBySlug: new Map([["boxes", "cat-id"]]),
        tagBySlug: new Map([
          ["wood", "tag-w"],
          ["paper", "tag-p"],
        ]),
      }),
    );
    expect(r.action).toBe("create");
    const norm = r.raw_json._normalized as Record<string, unknown>;
    expect(norm.category_id).toBe("cat-id");
    expect(r.raw_json._tag_ids).toEqual(["tag-w", "tag-p"]);
  });
});
