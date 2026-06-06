/**
 * Anonymous cart — drawer + persistence + variant lines (P3-T20 + T21).
 *
 * Verifies the full client flow:
 *   • Add to cart on the PDP opens the Sheet drawer.
 *   • Quantity stepper updates the line and subtotal.
 *   • Cart persists across full reload via localStorage (`bc-cart-v1`)
 *     and the header badge reflects the persisted count.
 *   • Variant-keyed lines: same product in two variants → two lines
 *     (covered indirectly here by adding one variant + one simple
 *     product, then asserting two distinct lines).
 *   • Remove line + Checkout CTA point to `/checkout`.
 *
 * Uses the seeded products: `brass-diya-small` (no variants, ₹250) and
 * `resin-coaster-set` (Size × Color, default Small/Teal at ₹950).
 */
import { test, expect } from "@playwright/test";

test.describe("anonymous cart", () => {
  test("add → drawer opens with line + subtotal", async ({ page }) => {
    await page.goto("/p/brass-diya-small");
    await page.getByRole("button", { name: /^add to cart$/i }).first().click();

    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText("Your cart")).toBeVisible();
    await expect(drawer.getByText("Subtotal")).toBeVisible();
    await expect(drawer.getByText("₹250").first()).toBeVisible();
  });

  test("quantity stepper updates the line + subtotal", async ({ page }) => {
    await page.goto("/p/brass-diya-small");
    await page.getByRole("button", { name: /^add to cart$/i }).first().click();
    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();

    await drawer.getByRole("button", { name: /increase quantity/i }).click();
    // 1 × ₹250 → 2 × ₹250 = ₹500.
    await expect(drawer.getByText("₹500").first()).toBeVisible();

    await drawer.getByRole("button", { name: /decrease quantity/i }).click();
    await expect(drawer.getByText("₹250").first()).toBeVisible();
  });

  test("persists across reload — header badge + drawer reopen", async ({
    page,
  }) => {
    await page.goto("/p/brass-diya-small");
    await page.getByRole("button", { name: /^add to cart$/i }).first().click();
    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();
    await drawer.getByRole("button", { name: /increase quantity/i }).click(); // qty 2
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();

    // Hard reload to a different storefront page.
    await page.goto("/");
    await expect(
      page.locator('button[aria-label*="Cart, 2 items"]'),
    ).toBeVisible();

    // Header click reopens with the persisted line.
    await page.locator('button[aria-label^="Cart"]').click();
    const drawer2 = page.getByRole("dialog");
    await expect(drawer2).toBeVisible();
    await expect(drawer2.getByText(/brass diya/i)).toBeVisible();
  });

  test("variant-keyed line + remove + checkout link", async ({ page }) => {
    // 1. Simple product → line 1.
    await page.goto("/p/brass-diya-small");
    await page.getByRole("button", { name: /^add to cart$/i }).first().click();
    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();
    await page.keyboard.press("Escape");

    // 2. Variant product (default Small/Teal) → line 2 with variant label.
    await page.goto("/p/resin-coaster-set");
    await page.getByRole("button", { name: /^add to cart$/i }).first().click();
    const drawer2 = page.getByRole("dialog");
    await expect(drawer2).toBeVisible();
    await expect(drawer2.locator("li")).toHaveCount(2);
    await expect(drawer2.getByText(/small \/ teal/i)).toBeVisible();

    // 3. Remove one line.
    await drawer2
      .getByRole("button", { name: /Remove .* from cart/i })
      .first()
      .click();
    await expect(drawer2.locator("li")).toHaveCount(1);

    // 4. Checkout CTA targets /checkout (payments cluster T25+ builds it).
    await expect(
      drawer2.getByRole("link", { name: /^checkout$/i }),
    ).toHaveAttribute("href", "/checkout");
  });
});
