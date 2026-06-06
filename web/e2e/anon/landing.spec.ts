/**
 * Anonymous landing-page render (P3-T02 – T09). Proves the editorial
 * homepage actually composes its sections with seeded data — not just
 * that `/` returns 200 (covered by auth-guard.spec.ts).
 *
 * Depends on supabase/seed.sql: featured products (hero + weekly
 * collection), top categories (Atlas), and the workshop-kits category
 * (kits row). If the seed changes, update these assertions.
 */
import { test, expect } from "@playwright/test";

test.describe("anonymous landing", () => {
  test("renders the hero, Atlas, and footer with seeded content", async ({
    page,
  }) => {
    await page.goto("/");

    // Hero: headline + primary CTA.
    await expect(
      page.getByRole("heading", { level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /browse the catalog/i }),
    ).toBeVisible();

    // Atlas: section heading + at least one category tile linking to /c/.
    await expect(
      page.getByRole("heading", { name: /the atlas/i }),
    ).toBeVisible();
    await expect(page.locator('a[href^="/c/"]').first()).toBeVisible();

    // A product card somewhere on the page links to a PDP.
    await expect(page.locator('a[href^="/p/"]').first()).toBeVisible();

    // Footer is present (rendered by the storefront layout).
    await expect(page.getByRole("contentinfo")).toBeVisible();
  });

  test("workshop-kits and weekly-collection sections render", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: /workshop kits/i }),
    ).toBeVisible();
    await expect(page.getByText(/this week:/i)).toBeVisible();
  });
});
