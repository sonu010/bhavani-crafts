#!/usr/bin/env node
/**
 * Clean the raw Just Kraft scrape into the canonical seed fixture.
 *
 * Raw scrape rows are not trusted. The scraper captured thousands of product
 * pages whose HTML fell back to the site title, producing noisy rows like:
 *   name = "JustKraft: Your Ultimate Craft Supplies Store Online"
 *   sku  = "1", "A", "04", ...
 *   price = null
 *
 * This script removes those failed rows, normalizes IDs/SKUs/text, dedupes by
 * normalized SKU, and writes a smaller fixture consumed by seed-from-justkraft.
 */

import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(HERE, "..");
const DATA_DIR = path.join(PROJECT_ROOT, "data", "justkraft-inventory");

const RAW_JSON = path.join(DATA_DIR, "justkraft_products.json");
const CLEAN_JSON = path.join(DATA_DIR, "justkraft_products.cleaned.json");
const CLEAN_CSV = path.join(DATA_DIR, "justkraft_products.cleaned.csv");
const REPORT_JSON = path.join(DATA_DIR, "clean_report.json");

const GENERIC_TITLE = "justkraft: your ultimate craft supplies store online";
const SKU_RE = /^[A-Z0-9][A-Z0-9-]{1,79}$/;
let mojibakeRepairCount = 0;

function fail(message) {
  throw new Error(message);
}

function cleanText(value) {
  let text = String(value ?? "");
  if (/[ÃÂâ][\u0080-\u00bfA-Za-z]/.test(text)) {
    const repaired = Buffer.from(text, "latin1").toString("utf8");
    if (!repaired.includes("\uFFFD")) {
      text = repaired;
      mojibakeRepairCount++;
    }
  }
  return text
    .normalize("NFKC")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t\r\n]+/g, " ")
    .trim()
    .replace(/\s+(\| JustKraft|- JustKraft)$/i, "")
    .trim();
}

function normalizeSku(value) {
  let sku = cleanText(value).toUpperCase();
  sku = sku.replace(/[–—−]/g, "-");
  sku = sku.replace(/[.\s_/\\]+/g, "");
  sku = sku.replace(/[^A-Z0-9-]+/g, "");
  sku = sku.replace(/-+/g, "-").replace(/^-|-$/g, "");
  return sku.slice(0, 80).replace(/-+$/g, "");
}

function cleanUrl(value) {
  const text = cleanText(value);
  if (!text) return null;
  try {
    const parsed = new URL(text);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function cleanPrice(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return value;
}

function cleanStockStatus(value) {
  if (value === "in_stock" || value === "out_of_stock") return value;
  return "unknown";
}

function cleanCategoryPath(product) {
  const rawPath = Array.isArray(product.category_path)
    ? product.category_path.map(cleanText).filter(Boolean)
    : [];
  if (rawPath.length > 0) return rawPath;

  const category = cleanText(product.category);
  if (category && category.toLowerCase() !== "uncategorized") return [category];

  return ["Uncategorized"];
}

function uniqueStrings(values) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const cleaned = cleanText(value);
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
  }
  return out;
}

function cleanImageUrls(product) {
  const values = [
    product.image_url,
    ...(Array.isArray(product.image_urls) ? product.image_urls : []),
  ];
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const cleaned = cleanUrl(value);
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
  }
  return out;
}

function cleanVariants(product) {
  if (!Array.isArray(product.variants)) return [];
  const seen = new Set();
  const out = [];
  for (const variant of product.variants) {
    const label = cleanText(variant?.label);
    const variantUrl = cleanUrl(variant?.url);
    const key = variantUrl ?? label;
    if (!label || !key || seen.has(key)) continue;
    seen.add(key);
    out.push({ label, url: variantUrl });
  }
  return out;
}

function qualityScore(product) {
  let score = 0;
  if (product.image_urls.length > 0) score += 10;
  if (product.category_path[0] !== "Uncategorized") score += 5;
  if (product.short_description) score += 3;
  if (product.variants.length > 0) score += 2;
  if (product.tags.length > 0) score += 1;
  return score;
}

function csvEscape(value) {
  const text = Array.isArray(value) ? value.join(" > ") : String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function writeCsv(products) {
  const columns = [
    "product_id",
    "sku",
    "source_sku",
    "name",
    "top_category",
    "category",
    "category_path",
    "price",
    "currency",
    "stock_status",
    "image_count",
    "variant_count",
    "tags",
    "product_url",
  ];

  const lines = [columns.join(",")];
  for (const product of products) {
    lines.push(
      columns
        .map((column) => {
          if (column === "category_path") return csvEscape(product.category_path);
          if (column === "image_count") return product.image_urls.length;
          if (column === "variant_count") return product.variants.length;
          if (column === "tags") return csvEscape(product.tags.join("|"));
          return csvEscape(product[column]);
        })
        .join(","),
    );
  }
  fs.writeFileSync(CLEAN_CSV, lines.join("\n") + "\n");
}

function cleanProduct(raw) {
  const name = cleanText(raw.name);
  if (!name) return { rejected: "missing_name" };
  if (name.toLowerCase() === GENERIC_TITLE) return { rejected: "generic_scrape_title" };

  const price = cleanPrice(raw.price);
  if (price === null) return { rejected: "missing_or_invalid_price" };

  const productUrl = cleanUrl(raw.product_url);
  if (!productUrl) return { rejected: "missing_or_invalid_product_url" };

  const sku = normalizeSku(raw.sku);
  if (!SKU_RE.test(sku)) return { rejected: "missing_or_invalid_sku" };

  const productId = cleanText(raw.product_id);
  const categoryPath = cleanCategoryPath(raw);
  const tags = uniqueStrings(Array.isArray(raw.tags) ? raw.tags : []);
  const imageUrls = cleanImageUrls(raw);
  const variants = cleanVariants(raw);
  const scrapeNotes = uniqueStrings(Array.isArray(raw.scrape_notes) ? raw.scrape_notes : []);
  const shortDescription = cleanText(raw.short_description);

  if (sku !== cleanText(raw.sku)) {
    scrapeNotes.push(`sku_normalized_from:${cleanText(raw.sku)}`);
  }

  return {
    product: {
      product_id: productId,
      sku,
      source_sku: cleanText(raw.sku),
      name,
      category: cleanText(raw.category) || categoryPath[categoryPath.length - 1],
      top_category: cleanText(raw.top_category) || categoryPath[0],
      category_path: categoryPath,
      price,
      currency: cleanText(raw.currency) || "INR",
      stock_status: cleanStockStatus(raw.stock_status),
      product_url: productUrl,
      image_url: imageUrls[0] ?? null,
      image_urls: imageUrls,
      short_description: shortDescription || null,
      variants,
      tags,
      source: cleanText(raw.source) || "justkraft_sitemap_product_page",
      scrape_notes: uniqueStrings(scrapeNotes),
    },
  };
}

if (!fs.existsSync(RAW_JSON)) {
  fail(`Raw scrape not found: ${RAW_JSON}`);
}

const rawRoot = JSON.parse(fs.readFileSync(RAW_JSON, "utf8"));
if (!Array.isArray(rawRoot.products)) {
  fail(`${RAW_JSON} must contain a top-level products array.`);
}

const rejected = new Map();
const duplicateSkuRows = [];
const sourceUrlSeen = new Set();
const duplicateSourceUrls = [];
const bySku = new Map();
let sourceSkuChanged = 0;

for (const raw of rawRoot.products) {
  const result = cleanProduct(raw);
  if (result.rejected) {
    rejected.set(result.rejected, (rejected.get(result.rejected) ?? 0) + 1);
    continue;
  }

  const product = result.product;
  if (product.sku !== product.source_sku) sourceSkuChanged++;

  if (sourceUrlSeen.has(product.product_url)) {
    duplicateSourceUrls.push(product.product_url);
    continue;
  }
  sourceUrlSeen.add(product.product_url);

  const existing = bySku.get(product.sku);
  if (!existing) {
    bySku.set(product.sku, product);
    continue;
  }

  duplicateSkuRows.push({
    sku: product.sku,
    kept: existing.product_url,
    removed: product.product_url,
  });

  if (qualityScore(product) > qualityScore(existing)) {
    bySku.set(product.sku, product);
  }
}

const products = [...bySku.values()].sort((a, b) => a.sku.localeCompare(b.sku));

const invalidSku = products.find((product) => !SKU_RE.test(product.sku));
if (invalidSku) fail(`Clean output produced invalid SKU: ${invalidSku.sku}`);

const duplicateCheck = new Set();
for (const product of products) {
  if (duplicateCheck.has(product.sku)) fail(`Clean output produced duplicate SKU: ${product.sku}`);
  duplicateCheck.add(product.sku);
}

const topCategories = new Map();
const categories = new Map();
let imageCount = 0;
let variantCount = 0;
for (const product of products) {
  topCategories.set(product.top_category, (topCategories.get(product.top_category) ?? 0) + 1);
  for (const category of product.category_path) {
    categories.set(category, (categories.get(category) ?? 0) + 1);
  }
  imageCount += product.image_urls.length;
  variantCount += product.variants.length;
}

const report = {
  generated_at: new Date().toISOString(),
  input: path.relative(PROJECT_ROOT, RAW_JSON),
  outputs: {
    json: path.relative(PROJECT_ROOT, CLEAN_JSON),
    csv: path.relative(PROJECT_ROOT, CLEAN_CSV),
  },
  counts: {
    raw_products: rawRoot.products.length,
    rejected_products: [...rejected.values()].reduce((sum, count) => sum + count, 0),
    cleaned_products: products.length,
    duplicate_sku_rows_collapsed: duplicateSkuRows.length,
    duplicate_source_urls_collapsed: duplicateSourceUrls.length,
    skus_normalized: sourceSkuChanged,
    text_mojibake_repairs: mojibakeRepairCount,
    categories: categories.size,
    top_categories: topCategories.size,
    images: imageCount,
    variants: variantCount,
  },
  rejected: Object.fromEntries([...rejected.entries()].sort()),
  top_categories: Object.fromEntries([...topCategories.entries()].sort((a, b) => b[1] - a[1])),
  duplicate_sku_rows_sample: duplicateSkuRows.slice(0, 25),
};

const cleanRoot = {
  generated_at: report.generated_at,
  source_domain: rawRoot.source_domain ?? "https://justkraft.com",
  scrape_method: rawRoot.scrape_method ?? "justkraft_sitemap_product_page",
  raw_product_count: rawRoot.products.length,
  product_count: products.length,
  cleaning: {
    rules: [
      "reject generic site-title rows",
      "reject rows without numeric price",
      "normalize SKU to A-Z, 0-9, hyphen",
      "dedupe by normalized SKU",
      "preserve source product URL and product_id for traceability",
    ],
    report: path.relative(PROJECT_ROOT, REPORT_JSON),
  },
  products,
};

fs.writeFileSync(CLEAN_JSON, JSON.stringify(cleanRoot, null, 2) + "\n");
writeCsv(products);
fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2) + "\n");

console.log("Cleaned Just Kraft seed");
console.log(JSON.stringify(report.counts, null, 2));
console.log(`JSON: ${path.relative(PROJECT_ROOT, CLEAN_JSON)}`);
console.log(`CSV:  ${path.relative(PROJECT_ROOT, CLEAN_CSV)}`);
console.log(`Report: ${path.relative(PROJECT_ROOT, REPORT_JSON)}`);
