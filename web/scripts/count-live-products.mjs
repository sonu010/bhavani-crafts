#!/usr/bin/env node
/**
 * One-shot diagnostic: print live counts for the catalog tables.
 * Used to figure out what numbers to embed in claude/SESSION-RESUME.md +
 * claude/progress.md + claude/architecture/database-schema.md after a
 * reseed. Not part of the production code path.
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

async function countTable(table, extra) {
  let q = srv.from(table).select("*", { count: "exact", head: true });
  if (extra) q = extra(q);
  const { count, error } = await q;
  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? 0;
}

const [
  productsTotal,
  productsLive,
  productsPublished,
  categoriesTotal,
  categoriesLive,
  tagsLive,
  imagesLive,
  variantsLive,
] = await Promise.all([
  countTable("products"),
  countTable("products", (q) => q.is("deleted_at", null)),
  countTable("products", (q) => q.is("deleted_at", null).eq("is_published", true)),
  countTable("categories"),
  countTable("categories", (q) => q.is("deleted_at", null)),
  countTable("tags", (q) => q.is("deleted_at", null)),
  countTable("product_images", (q) => q.is("deleted_at", null)),
  countTable("product_variants", (q) => q.is("deleted_at", null)),
]);

console.log(
  JSON.stringify(
    {
      products_total: productsTotal,
      products_live: productsLive,
      products_published: productsPublished,
      categories_total: categoriesTotal,
      categories_live: categoriesLive,
      tags_live: tagsLive,
      product_images_live: imagesLive,
      product_variants_live: variantsLive,
    },
    null,
    2,
  ),
);
