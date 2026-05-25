#!/usr/bin/env node
/**
 * Purge `zzz-`-prefixed test fixtures across every table that
 * integration tests can touch. The `zzz-` prefix is the convention
 * used by makeTestProduct + every test's slug/sku generator
 * (`zzz-fix-…`, `zzz-coll-…`, `zzz-trash-…`, etc.) — see
 * `web/__tests__/db/_clients.ts`.
 *
 * Why this exists: tests' `afterAll` only deletes rows whose ids
 * the test successfully tracked. When a test fails mid-flight (or
 * was abandoned), the row leaks and surfaces in the admin UI.
 *
 * Order matters because of FK constraints: child rows first, then
 * the products that referenced them, then the categories /
 * attributes / tags that products referenced.
 *
 * Usage:
 *   node scripts/purge-test-fixtures.mjs           # dry-run; counts
 *   node scripts/purge-test-fixtures.mjs --apply   # actually deletes
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

const APPLY = process.argv.includes("--apply");

const c = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

async function countBy(table, column, prefix) {
  const { count, error } = await c
    .from(table)
    .select(column, { count: "exact", head: true })
    .like(column, `${prefix}%`);
  if (error) throw new Error(`count ${table}.${column}: ${error.message}`);
  return count ?? 0;
}

async function purgeBy(table, column, prefix) {
  if (!APPLY) return countBy(table, column, prefix);
  // Need ids for chunked delete (PostgREST .delete().like() works,
  // but chunking via .in() with the rows we fetched avoids hitting
  // statement_timeout on huge sets).
  const fetched = await c
    .from(table)
    .select("id, " + column)
    .like(column, `${prefix}%`)
    .limit(10_000);
  if (fetched.error) throw new Error(`fetch ${table}: ${fetched.error.message}`);
  const ids = (fetched.data ?? []).map((r) => r.id);
  if (ids.length === 0) return 0;
  const CHUNK = 200;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const del = await c.from(table).delete().in("id", slice);
    if (del.error) throw new Error(`delete ${table}: ${del.error.message}`);
  }
  return ids.length;
}

// Tests prefix SKUs with `ZZZ-` (uppercase per the SKU regex) and
// slugs / alts with `zzz-` (lowercase). Sweep both case variants.
const TARGETS = [
  // Child rows first (they CASCADE on parent delete, but explicit is
  // safer when the parent isn't deleted yet).
  { table: "product_variants", column: "sku", prefix: "ZZZ-" },
  { table: "product_images", column: "alt", prefix: "zzz-" },
  // Parents
  { table: "products", column: "slug", prefix: "zzz-" },
  { table: "products", column: "sku", prefix: "ZZZ-" },
  // Attribute defs + categories + tags (the rows the user spotted)
  { table: "attribute_definitions", column: "slug", prefix: "zzz-" },
  { table: "categories", column: "slug", prefix: "zzz-" },
  { table: "tags", column: "slug", prefix: "zzz-" },
];

console.log(
  APPLY ? "▶ Purging zzz- fixtures…" : "▶ Dry run (pass --apply to delete):",
);
console.log();

let total = 0;
for (const { table, column, prefix } of TARGETS) {
  try {
    const n = await purgeBy(table, column, prefix);
    const verb = APPLY ? "deleted" : "would delete";
    console.log(`  ${verb} ${String(n).padStart(5)}  ${table}.${column} LIKE '${prefix}%'`);
    total += n;
  } catch (err) {
    console.log(`  ERROR  ${table}.${column}:`, err.message);
  }
}

console.log();
console.log(APPLY ? `✔ Purged ${total} total rows.` : `Total: ${total} (run with --apply)`);
