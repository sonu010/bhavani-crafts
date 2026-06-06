/**
 * Anonymous category page (P3-T10–T12). Verifies the /c/[slug] surface
 * against supabase/seed.sql: descendant scoping, 404 on unknown slug,
 * and server-side price filtering.
 *
 * Seed shape used here:
 *   - pooja-items (parent) → diyas + incense-holders (children, hold the
 *     products) — so the parent page must show DESCENDANT products.
 *   - home-decor → Peacock Wall Hanging (₹1250) + Terracotta Vase (₹640).
 */
import { test, expect } from "@playwright/test";

test.describe("anonymous category page", () => {
  test("parent category shows products from its descendants", async ({ page }) => {
    await page.goto("/c/pooja-items");
    await expect(page.getByRole("heading", { name: /pooja items/i })).toBeVisible();
    // Products live in child categories (diyas / incense-holders).
    await expect(page.locator('a[href="/p/brass-diya-small"]')).toBeVisible();
    await expect(page.locator('a[href="/p/ceramic-incense-holder"]')).toBeVisible();
  });

  test("unknown slug returns 404", async ({ page }) => {
    const res = await page.goto("/c/this-category-does-not-exist");
    expect(res?.status()).toBe(404);
  });

  test("price filter narrows results server-side", async ({ page }) => {
    // Unfiltered: both home-decor products present.
    await page.goto("/c/home-decor");
    await expect(page.locator('a[href="/p/wall-hanging-peacock"]')).toBeVisible();
    await expect(page.locator('a[href="/p/terracotta-vase"]')).toBeVisible();

    // max=700 drops the ₹1250 peacock, keeps the ₹640 vase.
    await page.goto("/c/home-decor?max=700");
    await expect(page.locator('a[href="/p/terracotta-vase"]')).toBeVisible();
    await expect(page.locator('a[href="/p/wall-hanging-peacock"]')).toHaveCount(0);
  });
});
