/**
 * Buffered CSV parser. Uses papaparse synchronously over a string;
 * good enough for the 20 MB MVP cap (~50K rows worst case) without
 * the worker-thread plumbing. Streaming is a follow-up if we ever
 * push past that.
 *
 * Returns headers + parsed rows in CSV order. Trims whitespace on
 * cell values. Empty trailing rows are dropped.
 */
import "server-only";
import Papa from "papaparse";

export interface ParsedCsv {
  headers: string[];
  rows: Array<Record<string, string>>;
  /** Parser-level warnings (e.g. unmatched quotes). */
  warnings: string[];
}

export function parseCsv(text: string): ParsedCsv {
  // Strip UTF-8 BOM if present so column headers parse cleanly.
  const cleaned = text.replace(/^﻿/, "");
  const result = Papa.parse<Record<string, string>>(cleaned, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().toLowerCase(),
    transform: (v) => (typeof v === "string" ? v.trim() : v),
  });
  const headers = (result.meta.fields ?? []).map((h) => h.trim().toLowerCase());
  const rows: Array<Record<string, string>> = [];
  for (const r of result.data) {
    if (!r || typeof r !== "object") continue;
    // Skip rows where every cell is empty.
    const hasAny = Object.values(r).some((v) => (v ?? "").trim() !== "");
    if (!hasAny) continue;
    rows.push(r as Record<string, string>);
  }
  const warnings = result.errors.slice(0, 20).map((e) => `${e.code}: ${e.message}`);
  return { headers, rows, warnings };
}
