#!/usr/bin/env node
/**
 * Time the exact PostgREST query listProductsAdmin runs, standalone
 * (no Next render, no React). If this is fast and the page is slow,
 * the cost is somewhere outside the query.
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

const SELECT = `
  id, sku, slug, name, base_price_inr, review_status, is_published,
  stock_status, created_at, updated_at,
  category:categories(id, slug, name),
  thumbnail:product_images(url, sort_order)
`;

async function time(label, fn) {
  // Warm-up (Node fetch DNS / TLS handshake).
  await fn().catch(() => undefined);
  const samples = [];
  for (let i = 0; i < 5; i++) {
    const t = Date.now();
    await fn();
    samples.push(Date.now() - t);
  }
  samples.sort((a, b) => a - b);
  const p50 = samples[2];
  const min = samples[0];
  const max = samples[4];
  console.log(`  p50=${p50}ms  min=${min}  max=${max}  [${label}]`);
}

console.log("\nquery shape matrix (5,804 rows match needs_review):\n");

await time("status only, full select (page shape)", async () => {
  const { data, error } = await srv
    .from("products")
    .select(SELECT)
    .is("deleted_at", null)
    .eq("review_status", "needs_review")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(26);
  if (error) throw error;
  return data;
});

await time("status only, no joins (id, slug, name only)", async () => {
  const { data, error } = await srv
    .from("products")
    .select("id, slug, name, review_status, is_published, created_at, updated_at")
    .is("deleted_at", null)
    .eq("review_status", "needs_review")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(26);
  if (error) throw error;
  return data;
});

await time("status only, +category join (no thumbnail)", async () => {
  const { data, error } = await srv
    .from("products")
    .select(
      "id, slug, name, review_status, is_published, created_at, updated_at, category:categories(id, slug, name)",
    )
    .is("deleted_at", null)
    .eq("review_status", "needs_review")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(26);
  if (error) throw error;
  return data;
});

await time("status only, +thumbnail join (no category)", async () => {
  const { data, error } = await srv
    .from("products")
    .select(
      "id, slug, name, review_status, is_published, created_at, updated_at, thumbnail:product_images(url, sort_order)",
    )
    .is("deleted_at", null)
    .eq("review_status", "needs_review")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(26);
  if (error) throw error;
  return data;
});

await time("status only, both joins (FULL page shape)", async () => {
  const { data, error } = await srv
    .from("products")
    .select(SELECT)
    .is("deleted_at", null)
    .eq("review_status", "needs_review")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(26);
  if (error) throw error;
  return data;
});

await time("status only, thumbnail with limit:1 (one image per product)", async () => {
  const { data, error } = await srv
    .from("products")
    .select(
      "id, slug, name, review_status, is_published, created_at, updated_at, category:categories(id, slug, name), thumbnail:product_images(url, sort_order).limit(1)",
    )
    .is("deleted_at", null)
    .eq("review_status", "needs_review")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(26);
  if (error) throw error;
  return data;
});
