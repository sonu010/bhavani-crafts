/**
 * Bulk actions on /admin/products.
 *
 *   Toolbar buttons (aria-label "Bulk actions"): Publish · Unpublish ·
 *   Move · Add tag · Remove tag · Delete (the "Delete" button is the
 *   soft-delete; bulk hard-delete is intentionally NOT exposed —
 *   ADR-006).
 *
 *   Each action opens a Dialog with title `${Verb} N products?`.
 *   Soft-delete + move + add-tag + remove-tag also need a small input
 *   in the dialog before the Confirm button enables.
 *
 * This spec creates two draft products, multi-selects them, performs
 * bulk soft-delete with the typed-"delete" confirmation, and verifies
 * both land in Trash.
 */
import { test, expect } from "@playwright/test";
import { createDraftProduct, saveGeneralTab, zzzSku, uniq } from "./_helpers";

test("bulk soft-delete two products from the products list", async ({ page }) => {
  // Create two draft products with unique names so we can target them
  // by `?q=` later.
  const u = uniq();
  const nameA = `Zzz Bulk Probe A ${u}`;
  const nameB = `Zzz Bulk Probe B ${u}`;
  const skuA = zzzSku(`bul-a-${u}`);
  const skuB = zzzSku(`bul-b-${u}`);
  const slugA = `zzz-bul-a-${u}`;
  const slugB = `zzz-bul-b-${u}`;
  // Both will share the same `q=` prefix so the products list shows both.
  const sharedQ = `Zzz Bulk Probe ${u}`;

  for (const [name, sku, slug] of [
    [nameA, skuA, slugA],
    [nameB, skuB, slugB],
  ]) {
    await createDraftProduct(page);
    await page.locator("#general-name").fill(name);
    await page.locator("#general-sku").fill(sku);
    await page.locator("#general-slug").fill(slug);
    await page.locator("#general-base-price").fill("199");
    await saveGeneralTab(page);
  }

  // Open the list filtered to ONLY our two rows.
  await page.goto(`/admin/products?status=draft&q=${encodeURIComponent(sharedQ)}`);
  await expect(page.getByRole("checkbox", { name: new RegExp(`Select ${nameA}`) })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: new RegExp(`Select ${nameB}`) })).toBeVisible();

  // Multi-select via the "select all visible rows" header checkbox —
  // with our `q=` filter the page shows exactly our two rows, so the
  // single header click selects both. (Two per-row clicks race against
  // each other via the `router.replace` selection sync — see the loop
  // fix in SESSION-RESUME for the precise mechanism.)
  await page.getByRole("checkbox", { name: /select all visible rows/i }).click();

  // Bulk-delete toolbar appears; click Delete; type "delete"; Confirm.
  const bulkBar = page.getByRole("toolbar", { name: /bulk actions/i });
  await expect(bulkBar).toBeVisible();
  await expect(bulkBar).toContainText("2 selected");
  await bulkBar.getByRole("button", { name: /^delete$/i }).click();
  await page.getByPlaceholder("delete").fill("delete");
  await page.getByRole("button", { name: /^confirm$/i }).click();
  await expect(page.getByText(/moved to trash/i)).toBeVisible();

  // Both rows now in Trash.
  await page.goto("/admin/trash");
  const trashTable = page.locator("table");
  await expect(trashTable.getByText(nameA)).toBeVisible();
  await expect(trashTable.getByText(nameB)).toBeVisible();
});
