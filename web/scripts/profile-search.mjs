#!/usr/bin/env node
/**
 * Profile the admin search path against live Supabase. Used to identify
 * the slow clause before optimization.
 *
 * Usage:
 *   node scripts/profile-search.mjs            # uses default queries
 *   node scripts/profile-search.mjs resin      # one query
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

const srv = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const queries = process.argv.slice(2);
if (queries.length === 0) {
  queries.push("resin", "stencil", "wood", "paint", "wax");
}

async function time(label, fn) {
  const start = Date.now();
  const result = await fn();
  const ms = Date.now() - start;
  console.log(`  ${ms.toString().padStart(5)}ms  ${label}  →  ${result}`);
  return ms;
}

for (const q of queries) {
  console.log(`\n▶ q="${q}"`);

  await time("slug ILIKE", async () => {
    const r = await srv
      .from("products")
      .select("id", { count: "exact", head: true })
      .ilike("slug", `%${q}%`)
      .is("deleted_at", null);
    return `count=${r.count}`;
  });

  await time("sku ILIKE", async () => {
    const r = await srv
      .from("products")
      .select("id", { count: "exact", head: true })
      .ilike("sku", `%${q}%`)
      .is("deleted_at", null);
    return `count=${r.count}`;
  });

  await time("name ILIKE", async () => {
    const r = await srv
      .from("products")
      .select("id", { count: "exact", head: true })
      .ilike("name", `%${q}%`)
      .is("deleted_at", null);
    return `count=${r.count}`;
  });

  await time("FTS textSearch", async () => {
    const r = await srv
      .from("products")
      .select("id", { count: "exact", head: true })
      .textSearch("fts", q, { config: "english" })
      .is("deleted_at", null);
    return `count=${r.count}`;
  });

  await time("FULL listProductsAdmin shape", async () => {
    const r = await srv
      .from("products")
      .select(
        "id, sku, slug, name, base_price_inr, review_status, is_published, stock_status, created_at, updated_at, category:categories(id, slug, name), thumbnail:product_images(url, sort_order)",
      )
      .is("deleted_at", null)
      .or(`slug.ilike.*${q}*,sku.ilike.*${q}*,name.ilike.*${q}*`)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(26);
    return `rows=${r.data?.length ?? 0}`;
  });
}

console.log("\n--- chip count timings ---");
for (const status of ["needs_review", "ready_to_publish", "published", "draft", "archived"]) {
  await time(`count review_status=${status}`, async () => {
    const r = await srv
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("review_status", status)
      .is("deleted_at", null);
    return `count=${r.count}`;
  });
}
