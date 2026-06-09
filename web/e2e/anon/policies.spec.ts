/**
 * Legal pages — privacy / terms / shipping / returns (P5-T01).
 *
 * Razorpay due-diligence (and consumer-law obligation) requires that
 * these four pages exist, are reachable to anonymous visitors, are
 * indexable, and load real content (not 404 placeholders). This spec
 * is intentionally simple and structural — copy review happens
 * outside CI.
 *
 *   • each URL returns 200 + has a visible <h1>
 *   • body content > 200 chars (sanity floor against a placeholder)
 *   • canonical link present and matches the URL
 *   • title template wraps as "X — Bhavani Crafts"
 *   • included in /sitemap.xml (so crawlers + Razorpay find them)
 *   • not blocked by /robots.txt
 *   • inter-policy links resolve (terms → shipping/returns/privacy)
 */
import { test, expect } from "@playwright/test";

const POLICY_PAGES = [
  { path: "/policies/privacy", heading: /privacy/i, titleRe: /Privacy policy — Bhavani Crafts/ },
  { path: "/policies/terms", heading: /terms/i, titleRe: /Terms & conditions — Bhavani Crafts/ },
  { path: "/policies/shipping", heading: /shipping/i, titleRe: /Shipping policy — Bhavani Crafts/ },
  { path: "/policies/returns", heading: /returns/i, titleRe: /Returns .* refunds — Bhavani Crafts/ },
] as const;

test.describe("anonymous legal pages", () => {
  for (const { path, heading, titleRe } of POLICY_PAGES) {
    test(`${path} renders content + metadata`, async ({ page }) => {
      const res = await page.goto(path);
      expect(res?.status()).toBe(200);

      await expect(page.locator("main h1").first()).toBeVisible();
      await expect(page.locator("main h1").first()).toHaveText(heading);

      const bodyText = (await page.locator("main").innerText()).trim();
      expect(bodyText.length).toBeGreaterThan(200);

      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        "href",
        new RegExp(`${path.replace("/", "\\/")}$`),
      );

      await expect(page).toHaveTitle(titleRe);
    });
  }

  test("sitemap lists every policy URL", async ({ request }) => {
    const res = await request.get("/sitemap.xml");
    expect(res.status()).toBe(200);
    const xml = await res.text();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

    for (const { path } of POLICY_PAGES) {
      expect(locs.some((u) => u.endsWith(path))).toBe(true);
    }
  });

  test("robots.txt does NOT disallow /policies", async ({ request }) => {
    const res = await request.get("/robots.txt");
    expect(res.status()).toBe(200);
    const body = await res.text();
    // Spelled out negatively — if a future broad rule blocks /policies
    // we want this to fail loudly. Razorpay can't verify what they
    // can't crawl.
    expect(body).not.toMatch(/Disallow:\s*\/policies/);
  });

  test("terms page cross-links to the other three policies", async ({ page }) => {
    await page.goto("/policies/terms");
    const main = page.locator("main");
    await expect(main.locator('a[href="/policies/privacy"]')).toBeVisible();
    await expect(main.locator('a[href="/policies/shipping"]')).toBeVisible();
    await expect(main.locator('a[href="/policies/returns"]')).toBeVisible();
  });

  test("each policy has a back-link to the home page", async ({ page }) => {
    for (const { path } of POLICY_PAGES) {
      await page.goto(path);
      const back = page.locator('main a[href="/"]').first();
      await expect(back).toBeVisible();
    }
  });
});
