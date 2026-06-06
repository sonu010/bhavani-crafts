/**
 * Admin navigation regression guard.
 *
 * Backstory: the /admin/activity and /admin/jobs filter bars once had a
 * useEffect whose `sync` callback depended on `searchParams`. Each
 * `router.replace` produced a new `searchParams` reference → recreated
 * the callback → re-fired the effect → replaced again, ~3×/second. That
 * perpetual transition storm pegged the client and made it impossible to
 * navigate to other tabs.
 *
 * Under that loop the router sits in a never-ending pending transition,
 * so clicking a nav link does not resolve. These tests click away from
 * each filter page and assert the navigation lands — which fails if the
 * loop comes back. (We deliberately do NOT use `waitForLoadState
 * ("networkidle")`: it's flaky — HTTP keep-alive sockets prevent it from
 * settling even when the page is perfectly idle.)
 */
import { test, expect } from "@playwright/test";

async function navigatesAwayFrom(
  page: import("@playwright/test").Page,
  path: string,
) {
  await page.goto(path);
  // Sidebar present → page is interactive.
  await expect(page.getByRole("link", { name: /^products$/i }).first()).toBeVisible();
  await page.getByRole("link", { name: /^products$/i }).first().click();
  // If the page were looping, the pending transition would block this.
  await expect(page).toHaveURL(/\/admin\/products/, { timeout: 15_000 });
}

test.describe("admin navigation (no filter-bar loop)", () => {
  test("can navigate away from /admin/activity", async ({ page }) => {
    await navigatesAwayFrom(page, "/admin/activity");
  });

  test("can navigate away from /admin/jobs", async ({ page }) => {
    await navigatesAwayFrom(page, "/admin/jobs");
  });
});
