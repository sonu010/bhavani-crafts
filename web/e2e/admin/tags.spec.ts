/**
 * Tags admin — create + merge + soft-delete.
 *
 *   /admin/tags
 *   - Top-bar input "Add a tag …" + "Add tag" button (NOT "Create")
 *   - Per-row icons: aria-label "Rename tag" / "Merge into another tag" /
 *     "Soft-delete tag" (soft-delete uses window.confirm)
 *   - Merge dialog: <select label="Target tag"> + "Merge" button +
 *     window.confirm before the actual merge fires
 *
 * The tags list is a <ul> (not a <table>). After create the client does
 * `router.refresh()`, but the list re-render is flaky from Playwright's
 * point of view — we explicitly `page.reload()` after the input clears
 * to force a fresh server fetch before looking for the new row.
 */
import { test, expect } from "@playwright/test";
import { autoAcceptConfirms, uniq } from "./_helpers";

/** Type the tag name + click Add tag + wait for the input to clear. */
async function createTag(page: import("@playwright/test").Page, name: string) {
  const addInput = page.getByPlaceholder(/add a tag/i);
  await addInput.fill(name);
  await page.getByRole("button", { name: /^add tag$/i }).click();
  // Input clears only on a successful create — server-action's onSuccess
  // path. More reliable than the toast (which auto-dismisses).
  await expect(addInput).toHaveValue("");
}

test("tag create + soft-delete (no products attached) — row goes to trash", async ({ page }) => {
  await autoAcceptConfirms(page);

  const name = `zzz-tag-del-${uniq()}`;
  await page.goto("/admin/tags");
  await createTag(page, name);

  // Force a fresh fetch so the new tag is in the rendered list.
  await page.goto("/admin/tags");
  const row = page.getByRole("listitem").filter({ hasText: name });
  await expect(row).toHaveCount(1);

  await row.getByRole("button", { name: /soft-delete tag/i }).click();
  await expect(page.getByText(new RegExp(`"${name}" moved to Trash`))).toBeVisible();
});

test("tag merge — create two → merge source into target → source removed", async ({
  page,
}) => {
  await autoAcceptConfirms(page);

  const u = uniq();
  const nameA = `zzz-tag-a-${u}`;
  const nameB = `zzz-tag-b-${u}`;

  await page.goto("/admin/tags");
  await createTag(page, nameA);
  await createTag(page, nameB);

  // Refresh to see both rows.
  await page.goto("/admin/tags");
  await expect(page.getByRole("listitem").filter({ hasText: nameA })).toHaveCount(1);
  await expect(page.getByRole("listitem").filter({ hasText: nameB })).toHaveCount(1);

  // Open the merge dialog on A.
  const rowA = page.getByRole("listitem").filter({ hasText: nameA });
  await rowA.getByRole("button", { name: /merge into another tag/i }).click();

  // The merge dialog has a Target-tag <select>; options are `${name} (${count})`.
  // `selectOption({ label })` only accepts a string, so we resolve the
  // exact label (and its value) by reading the matching <option>.
  const targetSelect = page.getByRole("combobox");
  const targetLabel = await targetSelect
    .locator("option")
    .filter({ hasText: nameB })
    .first()
    .textContent();
  if (!targetLabel) throw new Error(`merge: target option for ${nameB} not found`);
  await targetSelect.selectOption({ label: targetLabel });
  await page.getByRole("button", { name: /^merge$/i }).click();

  // Merge success triggers `window.location.reload()` in onMergeDone,
  // so the success toast appears only for a flicker. Don't race it; the
  // durable signal is the list state. Use `toHaveCount` with a generous
  // timeout — it polls, so it correctly waits through the reload (we
  // deliberately avoid `waitForLoadState("networkidle")`, which is flaky
  // when HTTP keep-alive keeps the network "busy").
  await expect(page.getByRole("listitem").filter({ hasText: nameA })).toHaveCount(0, {
    timeout: 20_000,
  });
  await expect(page.getByRole("listitem").filter({ hasText: nameB })).toHaveCount(1);
});
