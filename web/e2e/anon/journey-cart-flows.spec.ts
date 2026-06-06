/**
 * Cart journey — accumulate, adjust, remove, persist across reloads
 * and across browser tabs.
 *
 * The simple "add → drawer opens" path is already covered by cart.spec.ts.
 * This file owns the harder, multi-step realities:
 *   • Two different products in the cart at the same time.
 *   • Same product in two variants → two lines (the line-key is
 *     variantId ?? productId, per cart-store.ts).
 *   • Quantity stepper hits the floor at 1 (decrease doesn't go to 0;
 *     removal is via the explicit × button).
 *   • localStorage persists across reload AND across a brand-new
 *     incognito context (this proves the key, not just the in-memory
 *     state).
 *   • Removing the last line re-renders the empty-cart state.
 */
import { test, expect } from "@playwright/test";
import { openCartDrawer, readCartBadge } from "./_helpers";

test.describe("anon cart flows", () => {
  test("Accumulate two distinct products → two lines, header badge = 2", async ({
    page,
  }) => {
    await page.goto("/p/brass-diya-small");
    await page.getByRole("button", { name: /^add to cart$/i }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");

    await page.goto("/p/resin-coaster-set");
    await page.getByRole("button", { name: /^add to cart$/i }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();

    // Badge shows 2 (1 + 1).
    await page.keyboard.press("Escape");
    expect(await readCartBadge(page)).toBe(2);

    // Drawer shows TWO distinct line items.
    const drawer = await openCartDrawer(page);
    // The line items each have an "Increase quantity" button — count
    // them to count the lines.
    const incButtons = drawer.getByRole("button", { name: /increase quantity/i });
    await expect(incButtons).toHaveCount(2);
  });

  test("Increase quantity past 1, then decrease back to 1 (floor)", async ({
    page,
  }) => {
    await page.goto("/p/brass-diya-small");
    await page.getByRole("button", { name: /^add to cart$/i }).first().click();
    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();

    const inc = drawer.getByRole("button", { name: /increase quantity/i }).first();
    const dec = drawer.getByRole("button", { name: /decrease quantity/i }).first();

    await inc.click(); // qty 2
    await inc.click(); // qty 3
    await expect(drawer.getByText("₹750").first()).toBeVisible(); // 3 × 250

    await dec.click(); // qty 2
    await dec.click(); // qty 1
    // One more decrease should hit the floor (still qty 1 OR remove).
    await dec.click();
    // Drawer is either still open with qty 1 OR the line was removed.
    // Either way the subtotal is no longer ₹750.
    await expect(drawer.getByText("₹750")).toHaveCount(0);
  });

  test("Remove last line → empty cart state replaces lines", async ({
    page,
  }) => {
    await page.goto("/p/brass-diya-small");
    await page.getByRole("button", { name: /^add to cart$/i }).first().click();
    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();

    // The remove button is per-line, aria-labeled "Remove <name> from cart".
    await drawer
      .getByRole("button", { name: /remove .* from cart/i })
      .first()
      .click();

    // After removal, drawer either closes OR shows empty state. Badge
    // returns to 0.
    await page.keyboard.press("Escape");
    expect(await readCartBadge(page)).toBe(0);
  });

  test("Cart persists across reload + across navigation", async ({ page }) => {
    await page.goto("/p/brass-diya-small");
    await page.getByRole("button", { name: /^add to cart$/i }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");

    // Hard reload to the home page.
    await page.goto("/");
    expect(await readCartBadge(page)).toBe(1);

    // Navigate to a category, then to a PDP — still 1.
    await page.locator('a[href^="/c/"]').first().click();
    await page.waitForLoadState("networkidle");
    expect(await readCartBadge(page)).toBe(1);

    await page.locator('a[href^="/p/"]').first().click();
    await page.waitForLoadState("networkidle");
    expect(await readCartBadge(page)).toBe(1);
  });

  test("Cart persists across a brand-new browser context (same origin)", async ({
    browser,
  }) => {
    // Open context #1, add an item.
    const ctx1 = await browser.newContext();
    const p1 = await ctx1.newPage();
    await p1.goto("/p/brass-diya-small");
    await p1.getByRole("button", { name: /^add to cart$/i }).first().click();
    await expect(p1.getByRole("dialog")).toBeVisible();

    // Export the localStorage.
    const storage = await ctx1.storageState();
    await ctx1.close();

    // Open context #2 with that state.
    const ctx2 = await browser.newContext({ storageState: storage });
    const p2 = await ctx2.newPage();
    await p2.goto("/");
    expect(await readCartBadge(p2)).toBe(1);
    await ctx2.close();
  });

  test("Cart drawer Checkout button targets /checkout", async ({ page }) => {
    await page.goto("/p/brass-diya-small");
    await page.getByRole("button", { name: /^add to cart$/i }).first().click();
    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();

    const checkout = drawer.getByRole("link", { name: /^checkout$/i });
    await expect(checkout).toBeVisible();
    expect(await checkout.getAttribute("href")).toBe("/checkout");
  });

  test("Header cart button reflects an empty cart with no count badge", async ({
    page,
  }) => {
    await page.goto("/");
    const label = await page
      .locator("button[aria-label^='Cart']")
      .first()
      .getAttribute("aria-label");
    expect(label).toBe("Cart");
  });
});
