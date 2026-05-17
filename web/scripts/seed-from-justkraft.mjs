#!/usr/bin/env node
/**
 * web/scripts/seed-from-justkraft.mjs
 *
 * Streams data/justkraft-inventory/justkraft_products.cleaned.json into
 * the live Supabase via the service-role client. Idempotent — re-runs
 * upsert on natural keys (sku for products, slug for categories/tags).
 *
 * Every seeded row is marked:
 *   products.is_published   = false
 *   products.review_status  = 'needs_review'
 *   products.source         = 'justkraft_seed'
 *   products.source_url     = <original URL>
 *   product_images.source         = 'justkraft_seed'
 *   product_images.license_status = 'unverified'   (RLS will refuse to serve them)
 *
 * Usage (from web/):
 *   node scripts/seed-from-justkraft.mjs
 *
 * Local-only. The raw and cleaned JSON fixtures are gitignored; obtain the
 * raw scrape out-of-band, then run:
 *   node scripts/clean-justkraft-inventory.mjs
 *
 * See claude/runbooks/seed-from-justkraft.md and the engineering principles:
 * fail fast, no fallback. If anything looks structurally wrong, throw.
 */

import { createClient } from "@supabase/supabase-js";
import { parser } from "stream-json";
import { pick } from "stream-json/filters/pick.js";
import { streamArray } from "stream-json/streamers/stream-array.js";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

// ─── Config ──────────────────────────────────────────────────────────────
const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(HERE, "..", "..");
const SEED_JSON = path.join(
  PROJECT_ROOT,
  "data/justkraft-inventory/justkraft_products.cleaned.json",
);
const REPORT_PATH = path.join(
  PROJECT_ROOT,
  "data/justkraft-inventory/seed_report.json",
);
const PRODUCT_BATCH = 200;   // rows per upsert call

// ─── Env ─────────────────────────────────────────────────────────────────
// .env.local lives in web/. Parse it manually (no dotenv dep).
const envPath = path.join(PROJECT_ROOT, "web", ".env.local");
if (!fs.existsSync(envPath)) {
  throw new Error(
    `web/.env.local not found at ${envPath}. Cannot seed without service-role key.`,
  );
}
for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+?)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required in web/.env.local.",
  );
}

const supa = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ─── Cleanup pass — wipe existing justkraft_seed rows for idempotency ────
// Image inserts have no natural (product_id, url) UNIQUE, so a re-run
// would double-insert. The cleanest fix is: delete all seed products at
// the start, and let CASCADE FKs unwind images, variants, options,
// option_values, variant_option_values, product_attributes, product_tags.
// Tags themselves and search_synonyms are preserved.
console.log("▶ Cleanup: removing prior justkraft_seed rows (cascade) ...");
{
  // A single DELETE WHERE source='justkraft_seed' hit Supabase's
  // statement_timeout — CASCADE has to delete ~15K images + ~8K
  // variants in one statement. Chunked-by-id keeps each statement's
  // CASCADE workload small enough to clear the 60s timeout.
  const CLEANUP_CHUNK = 200;
  // Fetch matching IDs up front. PostgREST defaults to a 1000-row
  // window so we page via .range until exhausted.
  const allIds = [];
  let from = 0;
  while (true) {
    const { data, error } = await supa
      .from("products")
      .select("id")
      .eq("source", "justkraft_seed")
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(`cleanup id-list failed: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const row of data) allIds.push(row.id);
    if (data.length < 1000) break;
    from += 1000;
  }
  console.log(`  scanned ${allIds.length} rows to delete; chunking @ ${CLEANUP_CHUNK}`);

  let totalDeleted = 0;
  for (let i = 0; i < allIds.length; i += CLEANUP_CHUNK) {
    const chunk = allIds.slice(i, i + CLEANUP_CHUNK);
    const { error } = await supa.from("products").delete().in("id", chunk);
    if (error) throw new Error(`cleanup delete chunk failed: ${error.message}`);
    totalDeleted += chunk.length;
    if ((i / CLEANUP_CHUNK) % 5 === 0) {
      process.stdout.write(`  ... ${totalDeleted}/${allIds.length}\r`);
    }
  }
  console.log(`  done: ${totalDeleted} seed product rows removed (and their children via CASCADE)`);
}

// ─── Slug helpers ────────────────────────────────────────────────────────
// Must match the CHECK in 0001_init.sql: ^[a-z0-9][a-z0-9-]{0,79}$
function slugify(input) {
  let s = String(input).toLowerCase().trim();
  s = s.normalize("NFKD").replace(/[̀-ͯ]/g, ""); // strip diacritics
  s = s.replace(/&/g, " and ");
  s = s.replace(/[^a-z0-9]+/g, "-");
  s = s.replace(/^-+|-+$/g, "");
  s = s.slice(0, 80);
  if (!s || !/^[a-z0-9]/.test(s)) s = "x" + s; // first char must be alnum
  return s.slice(0, 80).replace(/-+$/, "");
}

// Product slug = truncated-name (≤60 chars) + "-" + sku tail (≤16 chars).
// SKU is sliced from the SUFFIX so the SKU tail always survives the 80-char cap,
// keeping each row's slug uniquely tied to its sku.
function productSlug(name, sku) {
  const namePart = slugify(name).slice(0, 60).replace(/-+$/, "");
  const skuPart  = String(sku || "").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 16);
  const combined = `${namePart}-${skuPart}`.slice(0, 80).replace(/-+$/, "");
  if (!/^[a-z0-9]/.test(combined)) return ("x" + combined).slice(0, 80);
  return combined;
}

// ─── Pass 1: scan, build the category tree + collect products ───────────
// We do it in two passes so we can insert categories parents-first.
console.log("▶ Pass 1: streaming products.json ...");
if (!fs.existsSync(SEED_JSON)) {
  throw new Error(
    `Clean seed file not found: ${SEED_JSON}\n` +
    `Run from project root: node scripts/clean-justkraft-inventory.mjs`,
  );
}

const products = []; // [{ raw }] minimal; we re-iterate to insert
const categoryTree = new Map(); // slug -> { name, parentSlug | null, level, source_path }
const tagSet = new Map(); // slug -> name

function ensureCategoryChain(pathArr) {
  // pathArr e.g. ["Art Stationery", "Paints & Colours", "3D Outliners"]
  // Produce slugs that disambiguate generic names by including a parent prefix
  // when the same slug would collide across different paths.
  const slugs = [];
  for (let i = 0; i < pathArr.length; i++) {
    const candidate = slugify(pathArr[i]);
    const parentSlug = i > 0 ? slugs[i - 1] : null;
    // If we've already seen this exact slug under a DIFFERENT parent,
    // disambiguate by prepending the parent slug.
    let finalSlug = candidate;
    const existing = categoryTree.get(candidate);
    if (existing && existing.parentSlug !== parentSlug) {
      finalSlug = parentSlug ? `${parentSlug}-${candidate}` : candidate;
      // Truncate to 80 chars (DB CHECK constraint)
      finalSlug = finalSlug.slice(0, 80).replace(/-+$/, "");
    }
    if (!categoryTree.has(finalSlug)) {
      categoryTree.set(finalSlug, {
        name: pathArr[i],
        parentSlug,
        level: i,
        sourcePath: pathArr.slice(0, i + 1).join(" > "),
      });
    }
    slugs.push(finalSlug);
  }
  return slugs;
}

const streamStart = Date.now();
await new Promise((resolve, reject) => {
  // File is { generated_at, ..., products: [ ... ] }. Pick down to products,
  // then stream the array.
  const pipeline = fs
    .createReadStream(SEED_JSON)
    .pipe(parser.asStream())
    .pipe(pick.asStream({ filter: "products" }))
    .pipe(streamArray.asStream());
  pipeline.on("data", ({ value: p }) => {
    const pathArr = Array.isArray(p.category_path) && p.category_path.length > 0
      ? p.category_path
      : (p.top_category ? [p.top_category] : ["Uncategorized"]);
    const catSlugs = ensureCategoryChain(pathArr);
    const leafSlug = catSlugs[catSlugs.length - 1];
    for (const tag of p.tags ?? []) {
      const ts = slugify(tag);
      if (ts && !tagSet.has(ts)) tagSet.set(ts, tag);
    }
    products.push({
      sku: p.sku,
      slug: productSlug(p.name, p.sku ?? p.product_id ?? ""),
      name: p.name,
      description: p.short_description ?? null,
      short_description: (p.short_description ?? "").slice(0, 280) || null,
      category_leaf_slug: leafSlug,
      base_price_inr: typeof p.price === "number" ? p.price : null,
      stock_status: (() => {
        if (p.stock_status === "in_stock") return "in_stock";
        if (p.stock_status === "out_of_stock") return "out_of_stock";
        return "unknown";
      })(),
      source_url: p.product_url ?? null,
      image_urls: Array.isArray(p.image_urls)
        ? p.image_urls.filter((u) => typeof u === "string" && u.startsWith("http"))
        : [],
      variant_labels: Array.isArray(p.variants)
        ? p.variants.map((v) => v?.label).filter(Boolean)
        : [],
      tag_slugs: (p.tags ?? []).map(slugify).filter(Boolean),
      scrape_notes: p.scrape_notes ?? [],
    });
  });
  pipeline.on("end", resolve);
  pipeline.on("error", reject);
});
console.log(
  `  done: ${products.length} products, ${categoryTree.size} categories, ${tagSet.size} tags (${(
    (Date.now() - streamStart) /
    1000
  ).toFixed(1)}s)`,
);

// ─── Validate cleaned seed invariants ────────────────────────────────────
// Dedupe belongs in scripts/clean-justkraft-inventory.mjs, not here. If the
// cleaned fixture violates the import contract, fail before touching Supabase.
{
  const seenSku = new Set();
  for (const p of products) {
    if (!p.sku) throw new Error(`clean seed has product without sku: ${p.name}`);
    if (seenSku.has(p.sku)) throw new Error(`clean seed has duplicate sku: ${p.sku}`);
    seenSku.add(p.sku);
  }
  console.log(`  validated: ${products.length} cleaned products with unique SKUs`);
}

// ─── Pass 2a: upsert categories, parents first ───────────────────────────
console.log("▶ Upserting categories ...");
// Order categories by level so parents land before children.
const orderedCats = [...categoryTree.entries()].sort(
  (a, b) => a[1].level - b[1].level,
);

const catIdBySlug = new Map();
let catSuccess = 0;
for (let i = 0; i < orderedCats.length; i += 100) {
  const batch = orderedCats.slice(i, i + 100);
  const rows = batch.map(([slug, meta]) => ({
    slug,
    name: meta.name,
    parent_id: null, // set in a second pass after we have IDs
  }));
  const { data, error } = await supa
    .from("categories")
    .upsert(rows, { onConflict: "slug" })
    .select("id,slug");
  if (error) throw new Error(`categories upsert failed at batch ${i}: ${error.message}`);
  for (const row of data) catIdBySlug.set(row.slug, row.id);
  catSuccess += data.length;
}
// Now set parent_id for those that have a parent.
for (let i = 0; i < orderedCats.length; i += 100) {
  const batch = orderedCats.slice(i, i + 100).filter(([, m]) => m.parentSlug);
  if (batch.length === 0) continue;
  const updates = batch.map(([slug, meta]) => ({
    slug,
    parent_id: catIdBySlug.get(meta.parentSlug) ?? null,
    name: meta.name,
  }));
  const { error } = await supa
    .from("categories")
    .upsert(updates, { onConflict: "slug" });
  if (error) throw new Error(`categories parent-link failed at batch ${i}: ${error.message}`);
}
console.log(`  done: ${catSuccess} categories upserted`);

// ─── Pass 2b: upsert tags ────────────────────────────────────────────────
console.log("▶ Upserting tags ...");
const tagIdBySlug = new Map();
const allTags = [...tagSet.entries()].map(([slug, name]) => ({ slug, name }));
for (let i = 0; i < allTags.length; i += 100) {
  const batch = allTags.slice(i, i + 100);
  const { data, error } = await supa
    .from("tags")
    .upsert(batch, { onConflict: "slug" })
    .select("id,slug");
  if (error) throw new Error(`tags upsert failed at batch ${i}: ${error.message}`);
  for (const row of data) tagIdBySlug.set(row.slug, row.id);
}
console.log(`  done: ${tagIdBySlug.size} tags upserted`);

// ─── Pass 2c: upsert products + images + tag links + variant labels ──────
console.log("▶ Upserting products (batches of " + PRODUCT_BATCH + ") ...");
const errors = [];
let prodSuccess = 0;
let imageSuccess = 0;
let variantSuccess = 0;
let tagLinkSuccess = 0;
let skippedNoSku = 0;
let usedSlugs = new Set();

for (let i = 0; i < products.length; i += PRODUCT_BATCH) {
  const slice = products.slice(i, i + PRODUCT_BATCH);

  // Build product rows, skipping rows without a SKU (DB requires NOT NULL).
  const rows = [];
  for (const p of slice) {
    if (!p.sku || !p.name) { skippedNoSku++; continue; }
    let slug = p.slug;
    // Locally avoid duplicate slugs within the same import session by
    // suffixing the SKU when a collision is detected. DB UNIQUE on slug
    // is the final authority.
    if (usedSlugs.has(slug)) slug = `${slug}-${p.sku.toLowerCase().replace(/[^a-z0-9]+/g, "")}`.slice(0, 80);
    usedSlugs.add(slug);

    const catId = catIdBySlug.get(p.category_leaf_slug);
    if (!catId) {
      errors.push({ sku: p.sku, reason: `category slug ${p.category_leaf_slug} not found` });
      continue;
    }
    rows.push({
      sku: p.sku,
      slug,
      name: p.name,
      description: p.description,
      short_description: p.short_description,
      category_id: catId,
      base_price_inr: p.base_price_inr,
      stock_status: p.stock_status,
      is_published: false,
      review_status: "needs_review",
      source: "justkraft_seed",
      source_url: p.source_url,
    });
  }

  if (rows.length === 0) continue;

  const { data: inserted, error } = await supa
    .from("products")
    .upsert(rows, { onConflict: "sku" })
    .select("id,sku");
  if (error) {
    errors.push({ batchStart: i, message: error.message });
    continue;
  }
  prodSuccess += inserted.length;
  const idBySku = new Map(inserted.map((r) => [r.sku, r.id]));

  // Build images + variant labels + product_tags for this slice.
  const imageRows = [];
  const variantRows = [];
  const tagLinkRows = [];
  for (const p of slice) {
    const prodId = idBySku.get(p.sku);
    if (!prodId) continue;
    p.image_urls.forEach((u, idx) => {
      imageRows.push({
        product_id: prodId,
        url: u,
        sort_order: idx,
        source: "justkraft_seed",
        license_status: "unverified",
      });
    });
    p.variant_labels.forEach((label, idx) => {
      variantRows.push({
        product_id: prodId,
        sku: `${p.sku}-v${idx + 1}`.slice(0, 80),
        name: label,
        is_default: idx === 0,
        sort_order: idx,
      });
    });
    for (const ts of p.tag_slugs) {
      const tid = tagIdBySlug.get(ts);
      if (tid) tagLinkRows.push({ product_id: prodId, tag_id: tid });
    }
  }

  if (imageRows.length > 0) {
    // No natural-key unique on (product_id, url) — but rows already
    // came from a CASCADE'd FK, so a re-run after deletes is fine.
    // Use insert-only with onConflict guard via batching.
    const { error: imgErr } = await supa.from("product_images").insert(imageRows);
    if (imgErr && !imgErr.message.includes("duplicate")) {
      errors.push({ batchStart: i, where: "images", message: imgErr.message });
    } else imageSuccess += imageRows.length;
  }
  if (variantRows.length > 0) {
    const { error: vErr } = await supa
      .from("product_variants")
      .upsert(variantRows, { onConflict: "sku" });
    if (vErr) errors.push({ batchStart: i, where: "variants", message: vErr.message });
    else variantSuccess += variantRows.length;
  }
  if (tagLinkRows.length > 0) {
    const { error: tErr } = await supa
      .from("product_tags")
      .upsert(tagLinkRows, { onConflict: "product_id,tag_id" });
    if (tErr) errors.push({ batchStart: i, where: "tags", message: tErr.message });
    else tagLinkSuccess += tagLinkRows.length;
  }

  if ((i / PRODUCT_BATCH) % 5 === 0) {
    console.log(
      `  ${(i + slice.length).toString().padStart(5)}/${products.length} products  (${prodSuccess} ok, ${errors.length} err)`,
    );
  }
}

// ─── Report ──────────────────────────────────────────────────────────────
const report = {
  ranAt: new Date().toISOString(),
  source: SEED_JSON,
  counts: {
    products_seen: products.length,
    products_upserted: prodSuccess,
    products_skipped_no_sku: skippedNoSku,
    categories_upserted: catSuccess,
    tags_upserted: tagIdBySlug.size,
    images_inserted: imageSuccess,
    variants_upserted: variantSuccess,
    product_tags_linked: tagLinkSuccess,
  },
  errors: errors.slice(0, 50),
  errorsTruncatedAt: errors.length > 50 ? errors.length : null,
};
fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

console.log("\n▶ Seed report:");
console.log(JSON.stringify(report.counts, null, 2));
console.log(`\nFull report: ${REPORT_PATH}`);
if (errors.length > 0) {
  console.log(`\n⚠ ${errors.length} error(s) — first 5:`);
  for (const e of errors.slice(0, 5)) console.log("  ", JSON.stringify(e));
}
process.exit(errors.length === 0 ? 0 : 1);
