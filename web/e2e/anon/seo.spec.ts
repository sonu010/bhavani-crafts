/**
 * SEO — sitemap, robots, canonical, OpenGraph (P3-T24).
 *
 *   /robots.txt   allows /, disallows /admin /auth /api /design
 *   /sitemap.xml  lists home + /search + every published product +
 *                 every non-deleted category, each with a lastmod
 *   PDP + category each emit a <link rel=canonical> and a full
 *                  og: tag set; the root title.template wraps
 *                  per-page titles as "X — Bhavani Crafts".
 */
import { test, expect } from "@playwright/test";

test.describe("anonymous SEO", () => {
  test("robots.txt allows storefront, disallows /admin /auth /api /design + points at sitemap", async ({
    request,
  }) => {
    const res = await request.get("/robots.txt");
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toMatch(/User-Agent:\s*\*/i);
    expect(body).toMatch(/Allow:\s*\//);
    expect(body).toMatch(/Disallow:\s*\/admin/);
    expect(body).toMatch(/Disallow:\s*\/auth/);
    expect(body).toMatch(/Disallow:\s*\/api/);
    expect(body).toMatch(/Disallow:\s*\/design/);
    expect(body).toMatch(/Sitemap:\s*https?:\/\/[^\s]+\/sitemap\.xml/);
  });

  test("sitemap.xml lists static + seeded product + category URLs", async ({
    request,
  }) => {
    const res = await request.get("/sitemap.xml");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toMatch(/xml/i);
    const xml = await res.text();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

    // Static + seeded.
    expect(locs.some((u) => u.endsWith("/"))).toBe(true);
    expect(locs.some((u) => u.endsWith("/search"))).toBe(true);
    expect(locs.some((u) => u.endsWith("/p/brass-diya-small"))).toBe(true);
    expect(locs.some((u) => u.endsWith("/p/resin-coaster-set"))).toBe(true);
    expect(locs.some((u) => u.endsWith("/c/pooja-items"))).toBe(true);
    expect(locs.some((u) => u.endsWith("/c/home-decor"))).toBe(true);

    // Every entry has a <lastmod>.
    const urlBlocks = xml.match(/<url>[\s\S]*?<\/url>/g) ?? [];
    expect(urlBlocks.length).toBeGreaterThan(0);
    for (const block of urlBlocks) {
      expect(block).toMatch(/<lastmod>[^<]+<\/lastmod>/);
    }

    // Unpublished + soft-deleted leakage check — seed has 3 needs_review
    // products. None of them must appear in the sitemap.
    expect(locs.some((u) => u.includes("/p/unreviewed-"))).toBe(false);
  });

  test("PDP emits canonical + complete OpenGraph tag set", async ({ page }) => {
    await page.goto("/p/brass-diya-small");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      /\/p\/brass-diya-small$/,
    );
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      "content",
      /brass diya/i,
    );
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
      "content",
      /\/p\/brass-diya-small$/,
    );
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      "content",
      /brass-diya-small/,
    );
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute(
      "content",
      "website",
    );
    // Title template applied.
    await expect(page).toHaveTitle(/Brass Diya \(Small\) — Bhavani Crafts/);
  });

  test("category emits canonical + OpenGraph", async ({ page }) => {
    await page.goto("/c/pooja-items");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      /\/c\/pooja-items$/,
    );
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      "content",
      /pooja items/i,
    );
    await expect(page).toHaveTitle(/Pooja Items — Bhavani Crafts/);
  });

  test("title template wraps the home + search pages correctly", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(
      /Bhavani Crafts — craft supplies in Hyderabad/,
    );

    await page.goto("/search");
    await expect(page).toHaveTitle(/Search — Bhavani Crafts/);
  });
});
