/**
 * Admin critical flow — product editing through the real UI.
 *
 * Uses the stored admin session (auth.setup.ts). Proves the wiring the
 * data-layer tests can't: the list renders, a row navigates to the
 * editor, the General-tab form saves, and the change persists on
 * reload. This is the "does the button actually call the action +
 * does the result render" coverage.
 *
 * NOTE: these specs assume a seeded local catalog. The local
 * `supabase db reset` applies migrations but NOT the justkraft seed;
 * a small product seed (or the importer) must populate at least one
 * product for the edit flow. See e2e/README.md.
 */
import { test, expect } from "@playwright/test";

test.describe("admin products", () => {
  test("products list renders with the default needs_review filter", async ({
    page,
  }) => {
    await page.goto("/admin/products");
    await expect(
      page.getByRole("heading", { name: /products/i }),
    ).toBeVisible();
    // Status chips header is part of the list shell.
    await expect(page.getByText(/needs review/i).first()).toBeVisible();
  });

  test("editing a product's name saves and persists", async ({ page }) => {
    await page.goto("/admin/products");

    // Open the first product row. Clicking a Next <Link> is a soft (client)
    // navigation that fires no `load` event, so assert the URL with
    // toHaveURL (which polls) rather than waitForURL(..., {load}).
    const firstRow = page.locator('a[href*="/admin/products/"]').first();
    await firstRow.click();
    await expect(page).toHaveURL(/\/admin\/products\/[0-9a-f-]+\/edit/);

    // General tab — edit the name with a reversible E2E marker.
    const marker = ` [e2e ${Date.now()}]`;
    const nameInput = page.getByLabel(/^name/i);
    const original = (await nameInput.inputValue()).replace(/ \[e2e \d+\]$/, "");
    await nameInput.fill(original + marker);
    await page.getByRole("button", { name: /save/i }).first().click();

    // Wait for the SUCCESS TOAST specifically — "Product saved". Do NOT
    // match /saved/i loosely: the dirty-state indicator reads "Unsaved
    // changes", which also contains "saved" and would let the test reload
    // before the save Server Action commits (racing the write). The toast
    // only appears after the action returns ok, so it's the real signal.
    await expect(page.getByText(/product saved/i)).toBeVisible();
    await page.reload();
    await expect(page.getByLabel(/^name/i)).toHaveValue(original + marker);

    // Revert so the run is idempotent.
    await page.getByLabel(/^name/i).fill(original);
    await page.getByRole("button", { name: /save/i }).first().click();
    await expect(page.getByText(/product saved/i)).toBeVisible();
  });
});
