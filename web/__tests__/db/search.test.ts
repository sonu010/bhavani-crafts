import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { anon, makeTestProduct } from "./_clients";
import {
  buildTsquery,
  searchProducts,
  tokenize,
} from "@/lib/db/search";

let cleanup: () => Promise<void>;

beforeAll(async () => {
  const f = await makeTestProduct({
    slug: "zzz-search-resin-test",
    sku: "ZZZ-SEARCH-RESIN-TEST",
    name: "Resin epoxy clear casting kit",
    shortDescription: "12-piece clear casting resin set for jewellery",
  });
  cleanup = f.cleanup;
});

afterAll(async () => {
  await cleanup();
});

describe("tokenize", () => {
  test("lowercases, strips punctuation, collapses spaces", () => {
    expect(tokenize("Resin, Epoxy & 100ml!!  KIT")).toEqual([
      "resin",
      "epoxy",
      "100ml",
      "kit",
    ]);
  });

  test("empty input returns empty array", () => {
    expect(tokenize("")).toEqual([]);
    expect(tokenize("    ")).toEqual([]);
  });
});

describe("buildTsquery", () => {
  test("AND's tokens with no synonyms", () => {
    expect(buildTsquery(["resin", "kit"], new Map())).toBe("resin & kit");
  });

  test("expands tokens with synonyms; multi-word synonyms become AND'd phrases", () => {
    const syn = new Map<string, string[]>([
      ["resin", ["epoxy", "epoxy resin"]],
    ]);
    const q = buildTsquery(["resin", "clear"], syn);
    // Multi-word "epoxy resin" must be parenthesized as (epoxy & resin)
    // because Postgres tsquery rejects unjoined words in an OR group.
    expect(q).toBe("(resin | epoxy | (epoxy & resin)) & clear");
  });

  test("empty tokens → empty string", () => {
    expect(buildTsquery([], new Map())).toBe("");
  });
});

describe("searchProducts (anon, against live Supabase)", () => {
  test("empty query returns empty items", async () => {
    const r = await searchProducts(anon, "");
    expect(r.items).toEqual([]);
    expect(r.expanded).toBe("");
  });

  test("finds the resin test product via exact word", async () => {
    const r = await searchProducts(anon, "resin", { limit: 10 });
    expect(r.expanded).toContain("resin");
    // The seeded synonyms expand "resin" → ["epoxy", "epoxy resin"]
    expect(r.expanded).toContain("epoxy");
    const slugs = r.items.map((p) => p.slug);
    expect(slugs).toContain("zzz-search-resin-test");
  });

  test("multi-word query AND's tokens", async () => {
    const r = await searchProducts(anon, "resin clear", { limit: 10 });
    // The test product has BOTH "resin" and "clear" in its name/description
    const slugs = r.items.map((p) => p.slug);
    expect(slugs).toContain("zzz-search-resin-test");
  });

  test("nonsense query returns empty (no false positives)", async () => {
    const r = await searchProducts(anon, "xyzqwerasdf", { limit: 10 });
    expect(r.items).toEqual([]);
  });
});
