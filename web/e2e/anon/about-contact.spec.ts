/**
 * About + Contact pages — P5-T02.
 *
 * Structural smoke: both URLs are crawler-indexable, render the
 * expected h1, body content > 200 chars, present a back-link, and
 * appear in the sitemap. Copy review is out-of-band.
 *
 * Contact: visible WhatsApp + Maps link (when settings configured),
 * email mailto, copy-able address. Footer wires through to both.
 */
import { test, expect } from "@playwright/test";

test.describe("anonymous about + contact", () => {
  test("/about renders + canonical + title template", async ({ page }) => {
    const res = await page.goto("/about");
    expect(res?.status()).toBe(200);
    await expect(page.locator("main h1").first()).toBeVisible();
    await expect(page.locator("main h1").first()).toHaveText(
      /craft-supplies studio/i,
    );
    const body = (await page.locator("main").innerText()).trim();
    expect(body.length).toBeGreaterThan(200);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      /\/about$/,
    );
    await expect(page).toHaveTitle(/About — Bhavani Crafts/);
  });

  test("/contact renders + email mailto + address + maps + canonical", async ({ page }) => {
    const res = await page.goto("/contact");
    expect(res?.status()).toBe(200);

    await expect(page.locator("main h1").first()).toHaveText(/contact/i);

    const body = (await page.locator("main").innerText()).trim();
    expect(body.length).toBeGreaterThan(200);

    // Email mailto link present.
    await expect(page.locator('main a[href^="mailto:"]')).toBeVisible();

    // Address copy button — the CopyAddress component renders a <button>
    // with the address text.
    await expect(
      page.locator('main button[title="Click to copy"]'),
    ).toBeVisible();

    // Maps deep-link.
    await expect(
      page.locator('main a[href*="google.com/maps"]'),
    ).toBeVisible();

    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      /\/contact$/,
    );
    await expect(page).toHaveTitle(/Contact — Bhavani Crafts/);
  });

  test("sitemap lists both /about and /contact", async ({ request }) => {
    const res = await request.get("/sitemap.xml");
    expect(res.status()).toBe(200);
    const xml = await res.text();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs.some((u) => u.endsWith("/about"))).toBe(true);
    expect(locs.some((u) => u.endsWith("/contact"))).toBe(true);
  });

  test("footer links to /about and /contact from any storefront page", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('footer a[href="/about"]').first()).toBeVisible();
    await expect(
      page.locator('footer a[href="/contact"]').first(),
    ).toBeVisible();
  });

  test("back-link returns to home from each editorial page", async ({ page }) => {
    for (const path of ["/about", "/contact"]) {
      await page.goto(path);
      await expect(page.locator('main a[href="/"]').first()).toBeVisible();
    }
  });
});
