/**
 * Unit tests for the CSV parser. Header normalisation + BOM
 * tolerance + empty-row drop are load-bearing.
 */
import { describe, expect, it } from "vitest";
import { parseCsv } from "@/lib/imports/csv-parser";

describe("parseCsv", () => {
  it("normalises headers (trim, lowercase)", () => {
    const { headers } = parseCsv("SKU, NAME ,BASE_PRICE_INR\nA,B,100\n");
    expect(headers).toEqual(["sku", "name", "base_price_inr"]);
  });

  it("strips UTF-8 BOM", () => {
    const { headers } = parseCsv("﻿sku,name,base_price_inr\nA,B,100");
    expect(headers).toEqual(["sku", "name", "base_price_inr"]);
  });

  it("drops blank rows", () => {
    const { rows } = parseCsv("sku,name,base_price_inr\nA,B,100\n,,\nC,D,50");
    expect(rows.length).toBe(2);
    expect(rows[0].sku).toBe("A");
    expect(rows[1].sku).toBe("C");
  });

  it("returns empty rows array for header-only CSVs", () => {
    const { rows } = parseCsv("sku,name,base_price_inr\n");
    expect(rows).toHaveLength(0);
  });
});
