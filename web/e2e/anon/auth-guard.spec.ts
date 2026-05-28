/**
 * Anonymous auth-guard flows — no stored session.
 *
 * Verifies the three-layer authz chain's first layer (proxy.ts): an
 * unauthenticated visitor to /admin is bounced to /login with a
 * ?next= back-pointer, and the storefront stays open.
 */
import { test, expect } from "@playwright/test";

test.describe("anonymous access", () => {
  test("hitting /admin redirects to /login with ?next", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin|\/login\?next=\/admin/);
  });

  test("a deep admin route also redirects to /login", async ({ page }) => {
    await page.goto("/admin/products");
    await expect(page).toHaveURL(/\/login/);
  });

  test("the storefront homepage is publicly reachable", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
    // The brand wordmark in the header proves the storefront layout
    // rendered without an auth wall.
    await expect(
      page.getByRole("link", { name: /bhavani/i }).first(),
    ).toBeVisible();
  });
});
