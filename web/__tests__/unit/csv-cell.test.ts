/**
 * Unit tests for the RFC-4180 CSV cell escaping used by the orders
 * export route (and any other CSV writer that may land later). The
 * cell-escape rule is the single source of correctness for the whole
 * export — a bug here corrupts every accountant's import.
 *
 * No DB, no fixtures, no async — pure string in/out.
 */
import { describe, expect, it } from "vitest";
import { csvCell, csvRow } from "@/lib/utils/csv";

describe("csvCell — RFC 4180 escaping", () => {
  it("plain values are emitted as-is", () => {
    expect(csvCell("hello")).toBe("hello");
    expect(csvCell(42)).toBe("42");
    expect(csvCell(0)).toBe("0");
    expect(csvCell(false)).toBe("false");
  });

  it("null + undefined become empty strings (not the literal 'null')", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("commas trigger quoting", () => {
    expect(csvCell("a, b")).toBe('"a, b"');
    expect(csvCell("Hyderabad, TG, 500001")).toBe('"Hyderabad, TG, 500001"');
  });

  it("double-quotes inside a value are doubled + the value is quoted", () => {
    expect(csvCell('she said "hi"')).toBe('"she said ""hi"""');
  });

  it("newlines + carriage returns trigger quoting", () => {
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
    expect(csvCell("line1\r\nline2")).toBe('"line1\r\nline2"');
  });

  it("a value with all three of comma + quote + newline is fully escaped", () => {
    expect(csvCell('a,b "c" \nd')).toBe('"a,b ""c"" \nd"');
  });

  it("csvRow joins with bare commas + applies cell escaping per column", () => {
    expect(csvRow(["a", "b", "c"])).toBe("a,b,c");
    expect(csvRow(["a", "b, c", null, 'q"q'])).toBe('a,"b, c",,"q""q"');
  });

  it("an item-summary cell ('2 × SKU-A; 1 × SKU-B') round-trips", () => {
    // The export uses "; " between items + " × " for qty (real chars
    // in our output). Confirm none of them trigger spurious quoting.
    expect(csvCell("2 × ZZZ-A; 1 × ZZZ-B")).toBe("2 × ZZZ-A; 1 × ZZZ-B");
  });
});
