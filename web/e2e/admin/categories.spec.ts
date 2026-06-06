/**
 * Categories admin — create + rename + soft-delete + restore.
 *
 *   /admin/categories         (tree view, per-row icon actions)
 *   /admin/categories/new     (Create → lands on /edit/<id> + toast)
 *   /admin/categories/<id>/edit  (Save → stays put + toast)
 *   /admin/trash?entity=category
 *
 * Tree-row aria-labels: "Edit category", "Soft-delete category"
 * (uses window.confirm — we auto-accept).
 *
 * Form inputs are registered via react-hook-form; the `<Field>` wrapper
 * doesn't carry htmlFor, so target inputs by their `name=` attribute.
 */
import { test, expect } from "@playwright/test";
import { autoAcceptConfirms, uniq } from "./_helpers";

test("category lifecycle — create → rename → soft-delete → restore", async ({ page }) => {
  await autoAcceptConfirms(page);

  const slug = `zzz-cat-${uniq()}`;
  const name = `Zzz Cat Probe ${Date.now()}`;
  const renamed = `${name} (renamed)`;

  // 1. Create — lands on the edit page with a Category-created toast.
  await page.goto("/admin/categories/new");
  await page.locator('input[name="name"]').fill(name);
  await page.locator('input[name="slug"]').fill(slug);
  await page.locator('textarea[name="description"]').fill("E2E probe category — auto-cleanable.");
  await page.getByRole("button", { name: /^create$/i }).click();
  await expect(page).toHaveURL(/\/admin\/categories\/[0-9a-f-]{36}\/edit/);
  await expect(page.getByText(/category created/i)).toBeVisible();

  // 2. Rename inline (we're already on /edit/<id>) — Save stays put.
  await page.locator('input[name="name"]').fill(renamed);
  await page.getByRole("button", { name: /^save$/i }).click();
  await expect(page.getByText(/^saved$/i).first()).toBeVisible();

  // 3. Tree shows the renamed row.
  await page.goto("/admin/categories");
  await expect(page.getByText(renamed).first()).toBeVisible();

  // 4. Soft-delete via the row's icon button (window.confirm auto-accepted).
  //    Scope to the <li> carrying our unique slug so we never click the
  //    wrong row.
  const ourRow = page
    .locator("li")
    .filter({ hasText: slug })
    .first();
  await ourRow.getByRole("button", { name: /soft-delete category/i }).click();
  await expect(page.getByText(renamed)).toHaveCount(0);

  // 5. Trash → categories tab → soft-deleted row appears.
  //    Entity types are plural (`categories`, not `category`) per
  //    lib/db/admin/trash-public.ts:TRASH_ENTITY_TYPES.
  await page.goto("/admin/trash?entity=categories");
  const trashTable = page.locator("table");
  await expect(trashTable.getByText(renamed)).toBeVisible();

  // 6. Restore.
  await trashTable
    .getByRole("row")
    .filter({ hasText: renamed })
    .getByRole("button", { name: /^restore$/i })
    .click();
  await expect(page.getByText(/^restored "/i).first()).toBeVisible();
  await expect(trashTable.getByText(renamed)).toHaveCount(0);

  // 7. Back in the tree.
  await page.goto("/admin/categories");
  await expect(page.getByText(renamed).first()).toBeVisible();
});
