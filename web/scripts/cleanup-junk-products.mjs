#!/usr/bin/env node
/**
 * Catalog cleanup — two safe sweeps + one report.
 *
 * 1. **Soft-delete unfinished drafts.** "Untitled product" rows with
 *    DRAFT-* SKUs — the new-product flow leaves these orphaned if
 *    the owner abandons the form. 4 of them today.
 *
 * 2. **Resolve case/whitespace drift dupes.** A handful of products
 *    differ only in casing (e.g. "flower" vs "Flower"). Keep the
 *    title-cased copy, soft-delete the other.
 *
 * 3. **Report only — same-name-different-SKU groups.** These are
 *    almost certainly product VARIANTS the JustKraft scrape didn't
 *    fold (LMT-5G / LMT-8G / LMT-15G). Acting on them
 *    automatically would drop distinct SKUs/prices, so the script
 *    only lists them — the owner picks which to consolidate via
 *    the variants editor.
 *
 * Usage:
 *   node scripts/cleanup-junk-products.mjs           # dry-run
 *   node scripts/cleanup-junk-products.mjs --apply   # delete
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
for (const line of readFileSync(path.join(here, "..", ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+?)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const c = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const APPLY = process.argv.includes("--apply");

async function fetchAll() {
  const out = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await c
      .from("products")
      .select("id, name, slug, sku, source, category_id")
      .is("deleted_at", null)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if ((data ?? []).length < PAGE) break;
  }
  return out;
}

function softDelete(ids, why) {
  if (ids.length === 0) return Promise.resolve();
  if (!APPLY) return Promise.resolve();
  return c
    .from("products")
    .update({ deleted_at: new Date().toISOString() })
    .in("id", ids);
}

const rows = await fetchAll();
console.log(`Loaded ${rows.length} live products.\n`);

// ── 1. Drafts ────────────────────────────────────────────────────────
const drafts = rows.filter(
  (r) =>
    r.name?.trim().toLowerCase() === "untitled product" &&
    r.sku?.startsWith("DRAFT-"),
);
console.log(`[1] Unfinished drafts: ${drafts.length}`);
for (const r of drafts) console.log(`     ${r.sku}  (${r.slug})`);
if (drafts.length > 0) {
  const res = await softDelete(drafts.map((r) => r.id));
  if (res?.error) console.log("     ERROR:", res.error.message);
  else if (APPLY) console.log(`     soft-deleted ${drafts.length}.`);
}
console.log();

// ── 2. Case-drift dupes ──────────────────────────────────────────────
const byNorm = new Map();
for (const r of rows) {
  if (drafts.find((d) => d.id === r.id)) continue;
  const k = (r.name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!byNorm.has(k)) byNorm.set(k, []);
  byNorm.get(k).push(r);
}
const driftGroups = [...byNorm.values()].filter((arr) => {
  if (arr.length < 2) return false;
  const exact = new Set(arr.map((r) => r.name));
  return exact.size > 1; // multiple casings of the same normalised name
});
console.log(`[2] Case/whitespace-drift duplicate groups: ${driftGroups.length}`);
const driftToDelete = [];
for (const group of driftGroups) {
  // Keep the row whose name uses the most uppercase letters (best
  // title-case). Tiebreak: earliest sku alphabetically.
  const ranked = [...group].sort((a, b) => {
    const upA = (a.name ?? "").replace(/[^A-Z]/g, "").length;
    const upB = (b.name ?? "").replace(/[^A-Z]/g, "").length;
    if (upA !== upB) return upB - upA;
    return (a.sku ?? "").localeCompare(b.sku ?? "");
  });
  const [keep, ...drop] = ranked;
  console.log(`     keep   "${keep.name}"  (${keep.sku})`);
  for (const r of drop) {
    console.log(`     drop   "${r.name}"  (${r.sku})`);
    driftToDelete.push(r.id);
  }
}
if (driftToDelete.length > 0) {
  const res = await softDelete(driftToDelete);
  if (res?.error) console.log("     ERROR:", res.error.message);
  else if (APPLY) console.log(`     soft-deleted ${driftToDelete.length}.`);
}
console.log();

// ── 3. Variant-collision report (read-only) ──────────────────────────
const byNameInCat = new Map();
for (const r of rows) {
  if (drafts.find((d) => d.id === r.id)) continue;
  if (driftToDelete.includes(r.id)) continue;
  const k = `${(r.name ?? "").trim().toLowerCase().replace(/\s+/g, " ")}|${r.category_id ?? "_null_"}`;
  if (!byNameInCat.has(k)) byNameInCat.set(k, []);
  byNameInCat.get(k).push(r);
}
const variantGroups = [...byNameInCat.values()].filter((arr) => arr.length > 1);
const totalVariantRows = variantGroups.reduce((a, x) => a + x.length, 0);
console.log(
  `[3] Same-name groups in same category (likely variants, NOT auto-deleted): ${variantGroups.length} groups, ${totalVariantRows} rows`,
);
console.log(
  "     ➜ Review via /admin/products?search=<name> and consolidate using",
);
console.log("       the Variants tab on the kept product. Soft-delete the rest.");
console.log();
console.log(APPLY ? "✔ Done." : "(dry-run — re-run with --apply)");
