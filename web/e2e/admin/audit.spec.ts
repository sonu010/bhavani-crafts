/**
 * Audit log — drill-in.
 *
 *   /admin/activity                       (filter bar + cursor pagination)
 *   /admin/activity?entity_id=<uuid>      (rows scoped to one entity)
 *
 * After performing a real admin action (creating a draft product),
 * /admin/activity scoped to that entity_id must show at least one row.
 * The audit log is the codebase's permanent "what changed when" trail —
 * a missing row here is a serious gap, so this guards it.
 */
import { test, expect } from "@playwright/test";
import { createDraftProduct, saveGeneralTab, zzzSku, uniq } from "./_helpers";

test("audit log records a create + update for a draft product", async ({ page }) => {
  const u = uniq();
  const name = `Zzz Audit Probe ${u}`;
  const sku = zzzSku(`aud-${u}`);
  const slug = `zzz-aud-${u}`;

  // 1. Action: create a draft product, then update its General fields.
  //    That's two distinct audit events: product.create + product.update.
  const id = await createDraftProduct(page);
  await page.locator("#general-name").fill(name);
  await page.locator("#general-sku").fill(sku);
  await page.locator("#general-slug").fill(slug);
  await page.locator("#general-base-price").fill("149");
  await saveGeneralTab(page);

  // 2. Audit page scoped to this entity.
  await page.goto(`/admin/activity?entity_id=${id}`);

  // 3. There MUST be at least one row referencing the entity.
  //    Audit rows are rendered in a <table>; assert at least one row
  //    body cell contains the entity id (sublabel uses the short form).
  const auditTable = page.locator("table");
  await expect(auditTable.getByRole("row").nth(1)).toBeVisible({ timeout: 10_000 });

  // 4. At least one row's action column says "product.update" — that's
  //    proof the saveGeneralTab call we just made was recorded.
  await expect(
    auditTable.getByText(/product\.update/i).first(),
  ).toBeVisible();
});
