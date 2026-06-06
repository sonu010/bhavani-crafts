/**
 * CSV imports — upload → validate → run → verify products in catalog.
 *
 *   /admin/imports/new        (file input + "Upload + validate")
 *   POST /api/admin/imports/upload (multipart)
 *   /admin/imports/<id>       (review staged rows + "Run import")
 *
 * Build a 2-row CSV in memory, drop it via Playwright's file-input
 * API, validate, run, then check the products list for the new SKUs.
 */
import { test, expect } from "@playwright/test";
import { autoAcceptConfirms, uniq, zzzSku } from "./_helpers";

test("CSV import lifecycle — upload → validate → run → products land in catalog", async ({
  page,
}) => {
  await autoAcceptConfirms(page);

  const u = uniq();
  const skuA = zzzSku(`imp-a-${u}`);
  const skuB = zzzSku(`imp-b-${u}`);
  const nameA = `Zzz Import Probe A ${u}`;
  const nameB = `Zzz Import Probe B ${u}`;

  const csv = [
    "sku,name,base_price_inr,stock_status,tags",
    `${skuA},${nameA},199,in_stock,handmade`,
    `${skuB},${nameB},299,low_stock,handmade,brass`,
  ].join("\n");

  // 1. Upload — drop the CSV via setInputFiles; click Upload + validate.
  await page.goto("/admin/imports/new");
  await page.locator('input[type="file"]').setInputFiles({
    name: `zzz-${u}.csv`,
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf8"),
  });
  await page.getByRole("button", { name: /upload \+ validate/i }).click();

  // 2. The toast format is `Validated N rows · X ok · Y errors`. The
  //    client then router.push()es to /admin/imports/<runId>, so we wait
  //    for that URL.
  await expect(page).toHaveURL(/\/admin\/imports\/[0-9a-f-]{36}/, { timeout: 30_000 });

  // 3. Run the import (confirm dialog auto-accepted).
  await page.getByRole("button", { name: /^run import$/i }).click();
  // Success toast format: `Applied N · failed M · skipped K`.
  await expect(page.getByText(/^applied \d+ · failed \d+ · skipped \d+$/i)).toBeVisible({
    timeout: 30_000,
  });

  // 4. Both products show up in the admin products list (filter to
  //    needs_review since imports default to that review_status).
  await page.goto(`/admin/products?status=needs_review&q=${encodeURIComponent(skuA)}`);
  await expect(page.getByText(nameA).first()).toBeVisible();
  await page.goto(`/admin/products?status=needs_review&q=${encodeURIComponent(skuB)}`);
  await expect(page.getByText(nameB).first()).toBeVisible();
});
