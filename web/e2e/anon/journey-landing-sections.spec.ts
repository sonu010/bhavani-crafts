/**
 * Landing page — every section renders content (not just a heading).
 *
 * Born from a real production bug: `landing-atlas` threw
 *   `getPrimaryImages failed: TypeError: fetch failed`
 * because PostgREST's `.in()` URL exceeded Supabase's proxy URL-length
 * limit when the catalog grew to 5800 products. readOrEmpty caught the
 * throw and the section rendered with ZERO tiles. The existing
 * `landing.spec.ts` checked for the `<h2>The Atlas</h2>` heading and
 * passed — because the heading is unconditional and the bug only
 * stripped the tiles.
 *
 * Each test here asserts the section's CONTENT (tile/card counts,
 * images, links to real PDPs/categories), so a future readOrEmpty
 * fallback cannot pass silently.
 *
 * Also installs a console-error watcher (attachFallbackWatcher) that
 * fails the test if Next emits the `[storefront] read "<key>" failed`
 * warning during render.
 */
import { test, expect } from "@playwright/test";
import {
  attachFallbackWatcher,
  expectAtLeast,
  expectCardsHaveImages,
} from "./_helpers";

test.describe("anon landing — every section renders content", () => {
  test("Hero renders with headline + image + a real CTA href", async ({ page }) => {
    const fallbacks = attachFallbackWatcher(page);
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // The hero ships at least one image-element (split-hero left or
    // right pane). An SSR fallback would have stripped it.
    await expectAtLeast(
      page.locator("section img, section [style*=background-image]").first().locator("xpath=ancestor-or-self::*"),
      1,
      "hero should render at least one image element",
    );
    // Primary CTA points at /search or a real route, not "#".
    const cta = page.getByRole("link", { name: /browse the catalog/i });
    await expect(cta).toBeVisible();
    const href = await cta.getAttribute("href");
    expect(href).toBeTruthy();
    expect(href).not.toBe("#");

    expect(fallbacks()).toEqual([]);
  });

  test("Caption strip displays the marketing tagline", async ({ page }) => {
    await page.goto("/");
    // The caption strip is the second section after the hero. Its copy
    // is rendered server-side and shouldn't be empty.
    const strip = page.locator("section").nth(1);
    const text = (await strip.textContent())?.trim() ?? "";
    expect(text.length).toBeGreaterThan(20);
  });

  test("Atlas renders a non-empty grid of category tiles with images and links", async ({
    page,
  }) => {
    const fallbacks = attachFallbackWatcher(page);
    await page.goto("/");

    // Heading anchors the section; tiles prove it has data.
    const heading = page.getByRole("heading", { name: /the atlas/i });
    await expect(heading).toBeVisible();

    // Each tile is an <li><a href="/c/..."> inside the Atlas section.
    const atlasSection = heading.locator("xpath=ancestor::section[1]");
    const tiles = atlasSection.locator('a[href^="/c/"]');
    await expectAtLeast(tiles, 1, "Atlas should render at least one tile");

    // Every tile that resolved should have an image inside it (the
    // category image OR the descendant-product fallback image). The
    // landing-atlas bug stripped these images.
    const tileCount = await tiles.count();
    expect(tileCount).toBeGreaterThan(0);
    for (let i = 0; i < tileCount; i++) {
      const tile = tiles.nth(i);
      // Either an <img> OR a styled <div> with a background image.
      const hasImg = (await tile.locator("img").count()) > 0;
      expect(hasImg).toBe(true);
    }

    expect(fallbacks()).toEqual([]);
  });

  test("Weekly Collection renders a product card row with images", async ({
    page,
  }) => {
    const fallbacks = attachFallbackWatcher(page);
    await page.goto("/");

    const heading = page.getByText(/this week:/i).first();
    await expect(heading).toBeVisible();
    const section = heading.locator("xpath=ancestor::section[1]");
    const cards = section.locator('a[href^="/p/"]');
    await expectCardsHaveImages(cards, 1);

    expect(fallbacks()).toEqual([]);
  });

  test("Kits row renders cards linking to PDPs", async ({ page }) => {
    const fallbacks = attachFallbackWatcher(page);
    await page.goto("/");

    const heading = page.getByRole("heading", { name: /workshop kits/i });
    await expect(heading).toBeVisible();
    const section = heading.locator("xpath=ancestor::section[1]");
    const cards = section.locator('a[href^="/p/"]');
    await expectAtLeast(cards, 1, "kits row should render at least one kit card");

    expect(fallbacks()).toEqual([]);
  });

  test("Bulk enquiry + Visit sections show real CTAs", async ({ page }) => {
    await page.goto("/");
    // Bulk-enquiry section uses a <p> pull-quote, not an <h>. The
    // copy is "Doing a class of 40? We deliver to your school." Match
    // a stable fragment of it.
    await expect(page.getByText(/we deliver to your school/i)).toBeVisible();
    // Visit section: a real Hyderabad street address.
    await expect(page.getByText(/hyderabad/i).first()).toBeVisible();
  });

  test("Footer renders the four utility link groups", async ({ page }) => {
    await page.goto("/");
    const footer = page.getByRole("contentinfo");
    await expect(footer).toBeVisible();
    // The footer has at least 4 <a> links (Shop, About, Help, Legal
    // columns). Empty footer would be its own SSR failure.
    await expectAtLeast(footer.locator("a"), 4, "footer should have ≥4 links");
  });

  test("Landing page has zero broken images and zero pageerrors", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    page.on("response", (res) => {
      if (res.url().includes("/_next/image") && res.status() >= 500) {
        errors.push(`image 5xx: ${res.url()}`);
      }
    });

    await page.goto("/", { waitUntil: "networkidle" });
    expect(errors).toEqual([]);
  });
});
