import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE_URL = "https://justkraft.com";
const OUT_DIR = path.resolve("data/justkraft-inventory");
const PRODUCT_JSON = path.join(OUT_DIR, "justkraft_products.json");
const PRODUCT_CSV = path.join(OUT_DIR, "justkraft_products.csv");
const SUMMARY_JSON = path.join(OUT_DIR, "justkraft_summary.json");
const SUMMARY_CSV = path.join(OUT_DIR, "justkraft_category_summary.csv");
const CHECKPOINT_JSON = path.join(OUT_DIR, "justkraft_products.checkpoint.json");

const USER_AGENT = "BhavaniCraftsInventoryResearch/1.0";
const MAX_PRODUCTS = Number(process.env.JK_MAX_PRODUCTS || 0);
const CONCURRENCY = Math.max(1, Number(process.env.JK_CONCURRENCY || 2));
const REQUEST_DELAY_MS = Math.max(0, Number(process.env.JK_DELAY_MS || 150));
const FETCH_VARIANTS = process.env.JK_FETCH_VARIANTS !== "0";
const RETRY_FAILED = process.env.JK_RETRY_FAILED === "1";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class CookieJar {
  constructor() {
    this.cookies = new Map();
  }

  header() {
    return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  store(headers) {
    const setCookies = typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : splitSetCookie(headers.get("set-cookie"));

    for (const rawCookie of setCookies) {
      const firstPart = rawCookie.split(";")[0];
      const index = firstPart.indexOf("=");
      if (index > 0) {
        this.cookies.set(firstPart.slice(0, index), firstPart.slice(index + 1));
      }
    }
  }
}

function splitSetCookie(value) {
  if (!value) return [];
  return value.split(/,(?=\s*[^;,=\s]+=[^;,]+)/g);
}

async function fetchText(url, options = {}) {
  const { jar, retries = 3, label = url, ...fetchOptions } = options;
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const headers = {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml,application/json;q=0.9,*/*;q=0.8",
        ...fetchOptions.headers
      };

      if (jar?.header()) headers.Cookie = jar.header();

      const response = await fetch(url, {
        redirect: "follow",
        ...fetchOptions,
        headers
      });

      jar?.store(response.headers);

      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }

      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < retries) await sleep(500 * attempt);
    }
  }

  throw new Error(`Failed ${label}: ${lastError?.message || lastError}`);
}

function decodeEntities(value = "") {
  const named = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: "\"",
    rsquo: "'",
    lsquo: "'",
    rdquo: "\"",
    ldquo: "\"",
    ndash: "-",
    mdash: "-",
    times: "x"
  };

  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([a-f0-9]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (_, name) => named[name.toLowerCase()] ?? `&${name};`);
}

function stripTags(html = "") {
  return decodeEntities(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanText(value = "") {
  return decodeEntities(value)
    .replace(/\s+/g, " ")
    .trim();
}

function getAttr(tag, attr) {
  const match = tag.match(new RegExp(`${attr}\\s*=\\s*["']([^"']+)["']`, "i"));
  return match ? decodeEntities(match[1]).trim() : "";
}

function extractMeta(html, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, "i"));
  return match ? cleanText(match[1]) : "";
}

function extractFirst(html, regex) {
  const match = html.match(regex);
  return match ? cleanText(match[1]) : "";
}

function normalizeUrl(url) {
  if (!url) return "";
  try {
    const parsed = new URL(decodeEntities(url), BASE_URL);
    parsed.hash = "";
    parsed.search = "";
    return parsed.href;
  } catch {
    return "";
  }
}

function slugFromUrl(url) {
  const parsed = new URL(url);
  return parsed.pathname.split("/").filter(Boolean).pop() || "";
}

function parseSitemap(xml) {
  const urls = [];
  const locRegex = /<loc>\s*([^<]+?)\s*<\/loc>/gi;
  let match;
  while ((match = locRegex.exec(xml))) {
    urls.push(decodeEntities(match[1].trim()));
  }

  return {
    productUrls: [...new Set(urls.filter((url) => url.startsWith(`${BASE_URL}/product/`)))],
    categoryUrls: [...new Set(urls.filter((url) => url.startsWith(`${BASE_URL}/category/`) || url.startsWith(`${BASE_URL}/categoryproducts/`)))]
  };
}

function parseBreadcrumbs(html) {
  const list = html.match(/<ul[^>]+class=["'][^"']*axil-breadcrumb[^"']*["'][^>]*>([\s\S]*?)<\/ul>/i)?.[1] || "";
  const crumbs = [];
  const linkRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = linkRegex.exec(list))) {
    const href = normalizeUrl(match[1]);
    const label = stripTags(match[2]).replace(/\s+$/, "");
    if (!label || /^home$/i.test(label)) continue;
    if (href.includes("/category/") || href.includes("/categoryproducts/")) {
      crumbs.push({ label, url: href });
    }
  }

  return crumbs;
}

function parsePrice(html) {
  const priceBlock = html.match(/<span[^>]+class=["'][^"']*price-amount[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]
    || html.match(/<span[^>]+class=["'][^"']*current-price[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]
    || html.match(/price\s*:\s*([0-9.]+)/i)?.[1]
    || "";
  const text = stripTags(priceBlock);
  const number = text.match(/[0-9][0-9,]*(?:\.[0-9]+)?/)?.[0]?.replace(/,/g, "");
  return number ? Number(number) : null;
}

function parseImages(html) {
  const images = [];
  const imageRegex = /<(?:img|a)\b[^>]+(?:src|href)=["']([^"']*productimages[^"']*)["'][^>]*>/gi;
  let match;
  while ((match = imageRegex.exec(html))) {
    const url = normalizeUrl(match[1]);
    if (url && !images.includes(url)) images.push(url);
  }
  return images;
}

function parseDescription(html, metaDescription) {
  if (metaDescription) return metaDescription;
  const descriptionBlock = html.match(/<div[^>]+id=["']description["'][^>]*>([\s\S]*?)<\/div>\s*<div[^>]+class=["']tab-pane/i)?.[1]
    || html.match(/<div[^>]+class=["'][^"']*content-container[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]
    || "";
  const text = stripTags(descriptionBlock);
  return text.length > 280 ? `${text.slice(0, 277).trim()}...` : text;
}

function parseTags(html) {
  const tags = [];
  const tagRegex = /<a[^>]+class=["'][^"']*jk-tags-text[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = tagRegex.exec(html))) {
    const tag = stripTags(match[1]);
    if (tag && !tags.includes(tag)) tags.push(tag);
  }
  return tags;
}

function parseVariants(html) {
  const variants = [];

  const optionRegex = /<option\b([^>]*)>([\s\S]*?)<\/option>/gi;
  let option;
  while ((option = optionRegex.exec(html))) {
    const url = normalizeUrl(getAttr(option[1], "value"));
    const label = stripTags(option[2]);
    if (url && label && !/^select/i.test(label)) {
      variants.push({ label, url });
    }
  }

  const productLinkRegex = /<a\b([^>]*href=["'][^"']*\/product\/[^"']+["'][^>]*)>([\s\S]*?)<\/a>/gi;
  let link;
  while ((link = productLinkRegex.exec(html))) {
    const url = normalizeUrl(getAttr(link[1], "href"));
    const label = stripTags(link[2]);
    if (url && label && !variants.some((variant) => variant.url === url && variant.label === label)) {
      variants.push({ label, url });
    }
  }

  return variants;
}

function parseProductPage(html, url) {
  const metaDescription = extractMeta(html, "description") || extractMeta(html, "og:description");
  const title = extractFirst(html, /<h1[^>]+class=["'][^"']*product-title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i)
    || extractMeta(html, "og:title");
  const sku = extractFirst(html, /SKU:\s*<b[^>]*>([\s\S]*?)<\/b>/i)
    || slugFromUrl(url).split("-").pop()?.toUpperCase()
    || "";
  const productId = html.match(/addtocart\(['"]?(\d+)['"]?\)/i)?.[1]
    || html.match(/productid['"]?\s*:\s*['"]?(\d+)['"]?/i)?.[1]
    || "";
  const price = parsePrice(html);
  const stockStatus = /Notify Me|Out of Stock|jk-out-stock/i.test(html)
    ? "out_of_stock"
    : /Add to Cart/i.test(html)
      ? "in_stock"
      : "unknown";
  const images = parseImages(html);
  const breadcrumbs = parseBreadcrumbs(html);
  const categoryPath = breadcrumbs.map((crumb) => crumb.label);
  const category = categoryPath.length ? categoryPath[categoryPath.length - 1] : "Uncategorized";
  const topCategory = categoryPath.length ? categoryPath[0] : "Uncategorized";
  const token = extractFirst(html, /<meta[^>]+name=["']_token["'][^>]+content=["']([^"']+)["']/i);

  return {
    product_id: productId,
    sku,
    name: title,
    category,
    top_category: topCategory,
    category_path: categoryPath,
    price,
    currency: price == null ? "" : "INR",
    stock_status: stockStatus,
    product_url: normalizeUrl(url),
    image_url: images[0] || extractMeta(html, "og:image"),
    image_urls: images,
    short_description: parseDescription(html, metaDescription),
    variants: [],
    tags: parseTags(html),
    source: "justkraft_sitemap_product_page",
    scrape_notes: [],
    csrf_token_found: Boolean(token),
    _csrf_token: token
  };
}

function inferTopCategory(product, fallbackCategory) {
  const text = [
    product.name,
    product.short_description,
    fallbackCategory,
    ...(product.tags || [])
  ].join(" ").toLowerCase();

  if (/resin|epoxy|silicone mould|silicone mold|pigment|dried flower|pressed flower|coaster mould|agate mould/.test(text)) {
    return "Resin Art Supplies";
  }
  if (/wood|mdf|laser cut|wooden|tray|box/.test(text)) {
    return "Wood Craft";
  }
  if (/paint|colour|color|brush|canvas|sketch|marker|outliner|medium|gesso|varnish|palette/.test(text)) {
    return "Art Stationery";
  }
  if (/stationery|paper|journal|notebook|office|pen|pencil|file|folder|stapler|clip/.test(text)) {
    return "Stationery";
  }
  if (/bead|pearl|jewellery|jewelry|mirror|lippan|kundan|stone|charm|chain|ribbon|flower|feather/.test(text)) {
    return "Decorative Accessories";
  }
  if (/yarn|crochet|sewing|candle|clay|slime|miniature|model|diy|kit|tool/.test(text)) {
    return "DIY";
  }

  return "Uncategorized";
}

function applyCategoryFallback(product) {
  if (product.category && product.category !== "Uncategorized") {
    return product;
  }

  const fallbackCategory = product.tags?.find(Boolean);
  if (!fallbackCategory) {
    return product;
  }

  const topCategory = inferTopCategory(product, fallbackCategory);
  const scrapeNotes = new Set(product.scrape_notes || []);
  scrapeNotes.add("category_inferred_from_tags");

  return {
    ...product,
    category: fallbackCategory,
    top_category: topCategory,
    category_path: topCategory === "Uncategorized" ? [fallbackCategory] : [topCategory, fallbackCategory],
    scrape_notes: [...scrapeNotes]
  };
}

async function fetchVariants(product, jar) {
  if (!FETCH_VARIANTS || !product.product_id || !product._csrf_token) return [];

  const body = new URLSearchParams({
    _token: product._csrf_token,
    productid: product.product_id
  });

  const html = await fetchText(`${BASE_URL}/product-variants-ajax`, {
    jar,
    label: `variants ${product.product_id}`,
    method: "POST",
    headers: {
      "X-Requested-With": "XMLHttpRequest",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "Accept": "text/html, */*; q=0.01",
      "Referer": product.product_url
    },
    body
  });

  if (!html || /CSRF token mismatch/i.test(html)) return [];
  return parseVariants(html);
}

async function scrapeProduct(url) {
  const jar = new CookieJar();
  const html = await fetchText(url, { jar, label: url });
  const product = parseProductPage(html, url);

  if (!product.name) {
    throw new Error("not_a_product_page_or_redirect");
  }

  try {
    product.variants = await fetchVariants(product, jar);
  } catch (error) {
    product.scrape_notes.push(`variants_fetch_failed: ${error.message}`);
  }

  delete product._csrf_token;
  delete product.csrf_token_found;

  if (!product.name) product.scrape_notes.push("missing_name");
  if (!product.sku) product.scrape_notes.push("missing_sku");
  if (product.price == null) product.scrape_notes.push("missing_price");
  if (!product.short_description) product.scrape_notes.push("missing_description");
  if (!product.image_url) product.scrape_notes.push("missing_image");

  return product;
}

async function loadCheckpoint() {
  try {
    const text = await readFile(CHECKPOINT_JSON, "utf8");
    const parsed = JSON.parse(text);
    return new Map(parsed.products.map((product) => [product.product_url, product]));
  } catch {
    return new Map();
  }
}

async function saveCheckpoint(productsMap) {
  const products = [...productsMap.values()].sort((a, b) => a.product_url.localeCompare(b.product_url));
  await writeFile(CHECKPOINT_JSON, JSON.stringify({ saved_at: new Date().toISOString(), products }, null, 2));
}

function isFailedCheckpointProduct(product) {
  return (product?.scrape_notes || []).some((note) => note.startsWith("product_fetch_failed"));
}

async function runPool(items, worker, onProgress) {
  let index = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      await worker(items[currentIndex], currentIndex);
      onProgress?.(currentIndex + 1, items.length);
      if (REQUEST_DELAY_MS) await sleep(REQUEST_DELAY_MS);
    }
  });

  await Promise.all(workers);
}

function buildInventory(products, sitemapInfo, robotsTxt) {
  const categorySummaryMap = new Map();
  const topCategorySummaryMap = new Map();
  const productsByCategory = {};

  for (const product of products) {
    const category = product.category || "Uncategorized";
    const topCategory = product.top_category || "Uncategorized";

    categorySummaryMap.set(category, (categorySummaryMap.get(category) || 0) + 1);
    topCategorySummaryMap.set(topCategory, (topCategorySummaryMap.get(topCategory) || 0) + 1);
    if (!productsByCategory[category]) productsByCategory[category] = [];
    productsByCategory[category].push(product);
  }

  const category_summary = [...categorySummaryMap.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));

  const top_category_summary = [...topCategorySummaryMap.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));

  const stock_summary = products.reduce((acc, product) => {
    acc[product.stock_status] = (acc[product.stock_status] || 0) + 1;
    return acc;
  }, {});

  return {
    generated_at: new Date().toISOString(),
    source_domain: BASE_URL,
    robots_txt: robotsTxt,
    scrape_method: "Parsed public sitemap product URLs, then fetched public product detail pages. Variants were requested via the same public product page AJAX endpoint when possible.",
    sitemap_product_url_count: sitemapInfo.productUrls.length,
    sitemap_category_url_count: sitemapInfo.categoryUrls.length,
    product_count: products.length,
    stock_summary,
    top_category_summary,
    category_summary,
    products_by_category: Object.fromEntries(
      Object.entries(productsByCategory).sort(([a], [b]) => a.localeCompare(b))
    ),
    products
  };
}

function toCsv(rows) {
  const headers = [
    "product_id",
    "sku",
    "name",
    "category",
    "top_category",
    "category_path",
    "price",
    "currency",
    "stock_status",
    "product_url",
    "image_url",
    "short_description",
    "variants",
    "tags",
    "scrape_notes"
  ];

  const quote = (value) => {
    const text = Array.isArray(value) ? value.join(" > ") : value == null ? "" : String(value);
    return `"${text.replace(/"/g, "\"\"")}"`;
  };

  const lines = [headers.map(quote).join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => {
      if (header === "variants") {
        return quote((row.variants || []).map((variant) => variant.label || variant.url).join(" | "));
      }
      if (header === "tags" || header === "scrape_notes") return quote(row[header] || []);
      return quote(row[header]);
    }).join(","));
  }

  return `${lines.join("\n")}\n`;
}

function summaryToCsv(summary) {
  const lines = ['"category","count"'];
  for (const row of summary.category_summary) {
    lines.push(`"${row.category.replace(/"/g, "\"\"")}","${row.count}"`);
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  console.log("Fetching robots.txt");
  const robotsTxt = await fetchText(`${BASE_URL}/robots.txt`, { label: "robots.txt" });
  console.log(robotsTxt.trim());

  console.log("Fetching sitemap.xml");
  const sitemapXml = await fetchText(`${BASE_URL}/sitemap.xml`, { label: "sitemap.xml" });
  const sitemapInfo = parseSitemap(sitemapXml);
  const productUrls = sitemapInfo.productUrls.slice(0, MAX_PRODUCTS || undefined);

  console.log(`Sitemap product URLs: ${sitemapInfo.productUrls.length}`);
  if (MAX_PRODUCTS) console.log(`JK_MAX_PRODUCTS active: scraping first ${productUrls.length}`);
  console.log(`Concurrency: ${CONCURRENCY}; delay: ${REQUEST_DELAY_MS}ms; variants: ${FETCH_VARIANTS}; retry failed: ${RETRY_FAILED}`);

  const productsMap = await loadCheckpoint();
  let completed = productsMap.size;
  let failed = 0;
  let lastCheckpoint = Date.now();
  const pendingUrls = productUrls.filter((url) => {
    const existing = productsMap.get(url);
    return !existing || (RETRY_FAILED && isFailedCheckpointProduct(existing));
  });
  console.log(`Checkpoint products: ${completed}; pending: ${pendingUrls.length}`);

  await runPool(pendingUrls, async (url) => {
    try {
      const product = await scrapeProduct(url);
      productsMap.set(product.product_url || url, product);
      completed += 1;
    } catch (error) {
      failed += 1;
      productsMap.set(url, {
        product_id: "",
        sku: "",
        name: "",
        category: "Uncategorized",
        top_category: "Uncategorized",
        category_path: [],
        price: null,
        currency: "",
        stock_status: "unknown",
        product_url: url,
        image_url: "",
        image_urls: [],
        short_description: "",
        variants: [],
        tags: [],
        source: "justkraft_sitemap_product_page",
        scrape_notes: [`product_fetch_failed: ${error.message}`]
      });
      completed += 1;
    }

    if (Date.now() - lastCheckpoint > 15000) {
      await saveCheckpoint(productsMap);
      lastCheckpoint = Date.now();
    }
  }, (done, total) => {
    if (done % 25 === 0 || done === total) {
      console.log(`Progress: ${done}/${total} pending processed; total saved ${productsMap.size}; failed ${failed}`);
    }
  });

  await saveCheckpoint(productsMap);

  const products = [...productsMap.values()]
    .filter((product) => product.product_url?.startsWith(`${BASE_URL}/product/`))
    .map(applyCategoryFallback)
    .sort((a, b) => {
      const categoryCompare = (a.category || "").localeCompare(b.category || "");
      return categoryCompare || (a.name || "").localeCompare(b.name || "");
    });

  const inventory = buildInventory(products, sitemapInfo, robotsTxt.trim());
  const summary = {
    generated_at: inventory.generated_at,
    product_count: inventory.product_count,
    sitemap_product_url_count: inventory.sitemap_product_url_count,
    failed_product_count: products.filter((product) => product.scrape_notes?.some((note) => note.startsWith("product_fetch_failed"))).length,
    missing_price_count: products.filter((product) => product.price == null).length,
    missing_description_count: products.filter((product) => !product.short_description).length,
    stock_summary: inventory.stock_summary,
    top_category_summary: inventory.top_category_summary,
    category_summary: inventory.category_summary
  };

  await writeFile(PRODUCT_JSON, JSON.stringify(inventory, null, 2));
  await writeFile(PRODUCT_CSV, toCsv(products));
  await writeFile(SUMMARY_JSON, JSON.stringify(summary, null, 2));
  await writeFile(SUMMARY_CSV, summaryToCsv(inventory));

  console.log(`Wrote ${PRODUCT_JSON}`);
  console.log(`Wrote ${PRODUCT_CSV}`);
  console.log(`Wrote ${SUMMARY_JSON}`);
  console.log(`Wrote ${SUMMARY_CSV}`);
  console.log(`Products: ${products.length}; failed: ${summary.failed_product_count}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
