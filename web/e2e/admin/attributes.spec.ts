/**
 * Attribute definitions admin — create + edit + delete.
 *
 *   /admin/attributes         (list, per-row Edit + Delete icons)
 *   /admin/attributes/new     (form → on success redirects to /<id>/edit)
 *   /admin/attributes/<id>/edit
 *
 * Form is react-hook-form with a custom Field wrapper (no htmlFor),
 * so we target inputs by `name=`. Submit is "Create" or "Save".
 * Delete uses window.confirm (we auto-accept). Note: Delete here is
 * permanent if no rows reference it — there's no Trash entity for
 * attribute_definitions.
 */
import { test, expect } from "@playwright/test";
import { autoAcceptConfirms, uniq } from "./_helpers";

test("attribute lifecycle — create → rename → delete", async ({ page }) => {
  await autoAcceptConfirms(page);

  const u = uniq();
  const name = `Zzz Attr ${u}`;
  const renamed = `${name} (renamed)`;
  const slug = `zzz-attr-${u}`;

  // 1. Create — Type defaults to text; no options/unit needed.
  await page.goto("/admin/attributes/new");
  await page.locator('input[name="name"]').fill(name);
  await page.locator('input[name="slug"]').fill(slug);
  await page.getByRole("button", { name: /^create$/i }).click();
  await expect(page).toHaveURL(/\/admin\/attributes\/[0-9a-f-]{36}\/edit/);
  await expect(page.getByText(/attribute created/i)).toBeVisible();

  // 2. Rename inline (we're on /edit/<id> after create) — Save stays put.
  await page.locator('input[name="name"]').fill(renamed);
  await page.getByRole("button", { name: /^save$/i }).click();
  await expect(page.getByText(/^saved$/i).first()).toBeVisible();

  // 3. List shows the renamed row.
  await page.goto("/admin/attributes");
  await expect(page.getByText(renamed).first()).toBeVisible();

  // 4. Delete via the per-row icon (window.confirm auto-accepted).
  //    Scope by the unique slug so we never touch a different row.
  const row = page.getByRole("listitem").filter({ hasText: slug }).first();
  await row.getByRole("button", { name: /delete attribute/i }).click();

  // 5. Row removed from the list.
  await expect(page.getByText(renamed)).toHaveCount(0);
});
