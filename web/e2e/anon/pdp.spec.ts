/**
 * Anonymous PDP (P3-T13–T16). Covers: simple product render, gallery
 * thumbnail switch (T14), variant selector resolves variants (T15),
 * unknown-slug 404, unpublished 404 without token.
 *
 * The preview-token round-trip (T13) is exercised by a focused integration
 * test (see __tests__/auth/preview-token.test.ts) rather than driven
 * through the UI — generating a signed token in a browser context isn't
 * how the real admin flow works, and the assertion is purely
 * server-side (RLS bypass + token verify).
 */
import { test, expect } from "@playwright/test";

test.describe("anonymous PDP", () => {
  test("simple product renders title, price, add-to-cart, related row", async ({ page }) => {
    await page.goto("/p/brass-diya-small");
    await expect(page.getByRole("heading", { level: 1, name: /brass diya \(small\)/i })).toBeVisible();
    await expect(page.getByText("₹250")).toBeVisible();
    await expect(page.getByRole("button", { name: /add to cart/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /you might also like/i })).toBeVisible();
  });

  test("variant-bearing product shows option chips and updates on selection", async ({ page }) => {
    await page.goto("/p/resin-coaster-set");

    // Default = Small / Teal, ₹950.
    await expect(page.getByText("₹950")).toBeVisible();

    // Pick Large → price updates to ₹1,300 (variant 03 / 04).
    await page.getByRole("button", { name: /^large$/i }).click();
    await expect(page.getByText(/₹1,300/)).toBeVisible();

    // Add-to-cart enabled (Large/Teal is in_stock).
    await expect(page.getByRole("button", { name: /add to cart/i })).toBeEnabled();

    // Pick Saffron → Large/Saffron is out_of_stock → add-to-cart disabled.
    await page.getByRole("button", { name: /^saffron$/i }).click();
    await expect(page.getByRole("button", { name: /add to cart/i })).toBeDisabled();
    await expect(page.getByText(/out of stock/i).first()).toBeVisible();
  });

  test("gallery thumbnail switches the main image", async ({ page }) => {
    await page.goto("/p/resin-coaster-set");
    const thumbs = page.getByRole("tab");
    await expect(thumbs).toHaveCount(2);
    const second = thumbs.nth(1);
    await second.click();
    await expect(second).toHaveAttribute("aria-selected", "true");
  });

  test("unknown slug returns 404", async ({ page }) => {
    const res = await page.goto("/p/this-product-does-not-exist");
    expect(res?.status()).toBe(404);
  });

  test("unpublished product without preview token returns 404", async ({ page }) => {
    const res = await page.goto("/p/unreviewed-brass-bell");
    expect(res?.status()).toBe(404);
  });
});
