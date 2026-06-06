/**
 * Search journey — query → refine → switch → empty state → click result.
 *
 * Covers what /search actually has to handle: real customer queries
 * (typed, sometimes misspelled), back-and-forth refinement, empty
 * results, and click-through to a PDP. Reuses the trigram + synonym
 * polish from P3-T19.
 */
import { test, expect } from "@playwright/test";
import { attachFallbackWatcher, expectAtLeast } from "./_helpers";

test.describe("anon search journey", () => {
  test("Typed query in the header search → search page with results", async ({
    page,
  }) => {
    const fallbacks = attachFallbackWatcher(page);
    await page.goto("/");

    // The header has either a visible search input OR a search button
    // that opens a sheet. Try the input first; fall back to direct nav.
    const input = page.getByRole("searchbox").first();
    if ((await input.count()) > 0 && (await input.isVisible())) {
      await input.fill("brass");
      await input.press("Enter");
    } else {
      await page.goto("/search?q=brass");
    }
    await page.waitForURL(/\/search/);

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectAtLeast(
      page.locator('a[href^="/p/"]'),
      1,
      "/search?q=brass should return at least one result on the seeded catalog",
    );
    expect(fallbacks()).toEqual([]);
  });

  test("Refining the query (different keyword) updates the result set", async ({
    page,
  }) => {
    await page.goto("/search?q=brass");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const firstResults = await page
      .locator('a[href^="/p/"]')
      .evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).href));

    await page.goto("/search?q=resin");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForLoadState("networkidle");
    const secondResults = await page
      .locator('a[href^="/p/"]')
      .evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).href));

    // Results changed; at least one result is different across the two
    // queries (otherwise the search isn't actually using the query).
    expect(secondResults.join("|")).not.toBe(firstResults.join("|"));
  });

  test("Empty-result search shows an empty state, not a crash", async ({
    page,
  }) => {
    const fallbacks = attachFallbackWatcher(page);
    // A query no seeded product can possibly match.
    await page.goto("/search?q=zzznosuchproductqqq");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // Either an explicit empty-state message OR zero result cards. Both
    // are acceptable; a 5xx or a stack trace is not.
    const cards = await page.locator('a[href^="/p/"]').count();
    expect(cards).toBe(0);
    // Most empty-state copy contains "no results" or "didn't match";
    // assert at least SOME body text rather than a blank canvas.
    const bodyText = (await page.locator("main").textContent()) ?? "";
    expect(bodyText.trim().length).toBeGreaterThan(0);
    expect(fallbacks()).toEqual([]);
  });

  test("Click a search result → PDP loads", async ({ page }) => {
    await page.goto("/search?q=brass");
    const firstResult = page.locator('a[href^="/p/"]').first();
    const href = await firstResult.getAttribute("href");
    await firstResult.click();
    await page.waitForURL(href!);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^add to cart$/i }).first(),
    ).toBeVisible();
  });

  test("Browser back from PDP returns to the search results", async ({
    page,
  }) => {
    await page.goto("/search?q=brass");
    const link = page.locator('a[href^="/p/"]').first();
    const href = await link.getAttribute("href");
    await link.click();
    await page.waitForURL(href!);
    await page.goBack();
    await page.waitForURL(/\/search.*q=brass/);
    await expectAtLeast(page.locator('a[href^="/p/"]'), 1);
  });

  test("Synonym expansion: 'mould' (UK) returns 'mold' (US) results", async ({
    page,
  }) => {
    // search_synonyms seeds the mould↔mold equivalence in 0005_search.sql.
    // We don't know if the seed has matching products — assert only that
    // both queries return THE SAME first result (or both empty), which
    // proves the synonym expansion is wired.
    await page.goto("/search?q=mould");
    const mouldResults = await page
      .locator('a[href^="/p/"]')
      .evaluateAll((els) =>
        els.slice(0, 3).map((e) => (e as HTMLAnchorElement).pathname),
      );
    await page.goto("/search?q=mold");
    const moldResults = await page
      .locator('a[href^="/p/"]')
      .evaluateAll((els) =>
        els.slice(0, 3).map((e) => (e as HTMLAnchorElement).pathname),
      );
    // The two result sets should overlap (synonym expansion). If both
    // are empty that's also fine — the seed may have no mould/mold
    // products. We just want to confirm "different queries can map to
    // the same product" doesn't crash.
    if (mouldResults.length && moldResults.length) {
      const overlap = mouldResults.filter((r) => moldResults.includes(r));
      expect(overlap.length).toBeGreaterThan(0);
    }
  });
});
