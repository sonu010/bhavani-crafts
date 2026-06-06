/**
 * Product lifecycle — the headline admin flow.
 *
 * Creates a draft product, edits its General fields, soft-deletes it
 * from the products list via the bulk toolbar (typed-confirmation),
 * sees it in Trash, restores it, soft-deletes it again, then HARD-
 * DELETES it from Trash with the second typed-confirmation. Exercises:
 *   /admin/products/new      (draft create + redirect)
 *   /admin/products/<id>/edit (General tab + save)
 *   /admin/products           (search-by-sku filter + checkbox + bulk)
 *   /admin/trash              (per-row Restore + per-row Hard delete)
 *
 * Local stack only — the destructive ops are safe because the seed is
 * disposable (`pnpm db:reset:test` rebuilds it).
 */
import { test, expect } from "@playwright/test";
import { createDraftProduct, saveGeneralTab, zzzSku } from "./_helpers";

test("product lifecycle — create → edit → soft-delete → restore → hard-delete", async ({
  page,
}) => {
  const sku = zzzSku("life");
  const name = `Zzz Lifecycle Probe ${Date.now()}`;
  const slug = `zzz-life-${Date.now().toString(36)}`;

  // 1. Create — /admin/products/new inserts a draft + redirects to edit.
  const id = await createDraftProduct(page);
  await expect(page).toHaveURL(new RegExp(`/admin/products/${id}/edit`));

  // 2. Edit General fields.
  await page.locator("#general-name").fill(name);
  await page.locator("#general-sku").fill(sku);
  await page.locator("#general-slug").fill(slug);
  await page.locator("#general-base-price").fill("199");
  await saveGeneralTab(page);

  // 3. Verify the new row shows up in the list (filtered by status=draft).
  //    Use ?q= to scope to our unique SKU so the row is unambiguous.
  await page.goto(`/admin/products?status=draft&q=${encodeURIComponent(sku)}`);
  const rowLink = page.locator(`a[href*="/admin/products/${id}/edit"]`).first();
  await expect(rowLink).toBeVisible();

  // 4. Bulk soft-delete — tick THIS row's checkbox (targeted by name so
  //    we never confuse it with the header "select all"), open the
  //    Delete dialog, type "delete", Confirm.
  //    Important: the row checkbox triggers a `router.replace` to sync
  //    selection state into the URL — Playwright's `.check()` waits for
  //    the post-click `checked` state, which races against the router
  //    navigation. Use `.click()` instead; we verify success by the
  //    bulk-actions toolbar appearing.
  await page.getByRole("checkbox", { name: new RegExp(`Select ${name}`) }).click();
  const bulkBar = page.getByRole("toolbar", { name: /bulk actions/i });
  await expect(bulkBar).toBeVisible();
  await bulkBar.getByRole("button", { name: /^delete$/i }).click();
  await page.getByPlaceholder("delete").fill("delete");
  await page.getByRole("button", { name: /^confirm$/i }).click();
  await expect(page.getByText(/moved to trash/i)).toBeVisible();

  // 5. See it in Trash. The trash page renders TWO layouts simultaneously
  //    (a desktop <table> + a mobile <ul>) with CSS hiding one; both are
  //    in the DOM. Scope to the table to avoid strict-mode violations.
  await page.goto("/admin/trash");
  const trashTable = page.locator("table");
  await expect(trashTable.getByText(name)).toBeVisible();

  // 6. Restore — per-row icon button (aria-label="Restore"). Filter
  //    the row by the unique product name so we never act on the wrong row.
  await trashTable
    .getByRole("row")
    .filter({ hasText: name })
    .getByRole("button", { name: /^restore$/i })
    .click();
  // Toast is `Restored "<name>"`; tighten the regex so we don't match
  // the verb-noun "Restore" on the button row labels.
  await expect(page.getByText(/^restored "/i).first()).toBeVisible();
  await expect(trashTable.getByText(name)).toHaveCount(0);

  // 7. Back in the list at status=draft (restored row went back to its prior state).
  await page.goto(`/admin/products?status=draft&q=${encodeURIComponent(sku)}`);
  await expect(rowLink).toBeVisible();

  // 8. Soft-delete again, prepping for hard-delete.
  await page.getByRole("checkbox", { name: new RegExp(`Select ${name}`) }).click();
  const bulkBar2 = page.getByRole("toolbar", { name: /bulk actions/i });
  await expect(bulkBar2).toBeVisible();
  await bulkBar2.getByRole("button", { name: /^delete$/i }).click();
  await page.getByPlaceholder("delete").fill("delete");
  await page.getByRole("button", { name: /^confirm$/i }).click();
  await expect(page.getByText(/moved to trash/i)).toBeVisible();

  // 9. Hard-delete from Trash — typed "DELETE" (uppercase) confirmation.
  //    Button aria-label is "Hard-delete permanently".
  await page.goto("/admin/trash");
  await expect(trashTable.getByText(name)).toBeVisible();
  await trashTable
    .getByRole("row")
    .filter({ hasText: name })
    .getByRole("button", { name: /hard-delete permanently/i })
    .click();
  await page.getByPlaceholder("DELETE").fill("DELETE");
  await page.getByRole("button", { name: /confirm hard delete/i }).click();
  await expect(trashTable.getByText(name)).toHaveCount(0);
});
