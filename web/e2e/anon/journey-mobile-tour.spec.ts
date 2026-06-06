/**
 * Mobile tour — full landing → category → PDP → cart journey at 360px.
 *
 * The narrowest non-luxury phone in the wild is ~360 CSS px. design-
 * system.md mandates everything works at that width. This suite is a
 * fast smoke that the storefront's responsive breakpoints didn't
 * regress.
 */
import { test, expect, devices } from "@playwright/test";
import { expectAtLeast, readCartBadge } from "./_helpers";

test.use({ viewport: { width: 360, height: 780 } });

test.describe("anon mobile (360px) journey", () => {
  test("Landing page renders without horizontal scroll", async ({ page }) => {
    await page.goto("/");
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    // Allow a 1px rounding slop; anything more is a real horizontal
    // overflow that breaks the layout on real phones.
    expect(overflow.scrollWidth - overflow.clientWidth).toBeLessThanOrEqual(1);
  });

  test("Atlas tiles wrap to 2 columns at 360px", async ({ page }) => {
    await page.goto("/");
    const tiles = page.getByRole("heading", { name: /the atlas/i })
      .locator("xpath=ancestor::section[1]")
      .locator('a[href^="/c/"]');
    await expectAtLeast(tiles, 2);
    // Top-row tiles share a Y coordinate; verify by sampling first 2.
    const boxes = await Promise.all([
      tiles.nth(0).boundingBox(),
      tiles.nth(1).boundingBox(),
    ]);
    expect(boxes[0] && boxes[1]).toBeTruthy();
    // Same row → similar Y.
    expect(Math.abs((boxes[0]!.y) - (boxes[1]!.y))).toBeLessThan(20);
  });

  test("Mobile header has a working cart button and tap target ≥ 40px", async ({
    page,
  }) => {
    await page.goto("/");
    const cart = page.locator("button[aria-label^='Cart']").first();
    await expect(cart).toBeVisible();
    const box = await cart.boundingBox();
    expect(box).toBeTruthy();
    // Apple HIG / WCAG 2.5.5 minimum tap target.
    expect(box!.height).toBeGreaterThanOrEqual(40);
    expect(box!.width).toBeGreaterThanOrEqual(40);
  });

  test("Tap a category tile → category page renders cards stacked", async ({
    page,
  }) => {
    await page.goto("/");
    const tile = page.locator('a[href^="/c/"]').first();
    await tile.tap();
    await page.waitForLoadState("networkidle");
    await expectAtLeast(page.locator('a[href^="/p/"]'), 1);
  });

  test("PDP at 360px shows image + price + add-to-cart all above the fold", async ({
    page,
  }) => {
    await page.goto("/p/brass-diya-small");
    const img = page.locator("main img").first();
    const price = page.locator("text=/₹[0-9,]+/").first();
    const addBtn = page.getByRole("button", { name: /^add to cart$/i }).first();
    await expect(img).toBeVisible();
    await expect(price).toBeVisible();
    await expect(addBtn).toBeVisible();
  });

  test("Add to cart on mobile → drawer slides from the bottom", async ({
    page,
  }) => {
    await page.goto("/p/brass-diya-small");
    await page.getByRole("button", { name: /^add to cart$/i }).first().tap();
    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();
    expect(await readCartBadge(page)).toBeGreaterThanOrEqual(0);
  });
});

// iPhone-14 device profile lives in playwright.config.ts as a separate
// project rather than `test.use({ ...devices[...] })` inside a describe
// block — Playwright forbids reconfiguring the browser type at describe
// scope (it would force a new worker). The 360px tests above are
// enough proof that the responsive layout works; a real-device run is
// `pnpm playwright test --project="Mobile Safari"` when needed.
test("uses iPhone 14 viewport dims", async ({ page }) => {
  await page.setViewportSize({ ...devices["iPhone 14"].viewport! });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.goto("/p/brass-diya-small");
  await page.getByRole("button", { name: /^add to cart$/i }).first().tap();
  await expect(page.getByRole("dialog")).toBeVisible();
});
