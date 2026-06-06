/**
 * Anonymous search (P3-T18 + T19). Verifies the /search surface
 * against supabase/seed.sql + the seeded search_synonyms set.
 *
 * Seed has products named "Resin Coaster Set", "Resin Coaster Kit",
 * "Brass Diya …", etc. — so "resin" returns results, "zxqzqxz" doesn't.
 */
import { test, expect } from "@playwright/test";

test.describe("anonymous search", () => {
  test("FTS hit returns product cards", async ({ page }) => {
    await page.goto("/search?q=resin");
    await expect(page.getByRole("heading", { name: /search results/i })).toBeVisible();
    // The seed has at least the Resin Coaster Set.
    await expect(page.locator('a[href="/p/resin-coaster-set"]')).toBeVisible();
  });

  test("zero-result query renders the empty state", async ({ page }) => {
    await page.goto("/search?q=zxqzqxz");
    await expect(page.getByText(/nothing matched/i)).toBeVisible();
    await expect(
      page.getByRole("link", { name: /browse the catalog/i }),
    ).toBeVisible();
  });

  test("query under 2 chars shows the keep-typing prompt", async ({ page }) => {
    await page.goto("/search?q=a");
    await expect(page.getByRole("heading", { name: /keep typing/i })).toBeVisible();
  });

  test("/search with no query renders the search shell", async ({ page }) => {
    const res = await page.goto("/search");
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: /^search$/i })).toBeVisible();
  });
});

test.describe("PDP JSON-LD (P3-T17)", () => {
  test("simple product emits a Product JSON-LD with a single Offer", async ({ page }) => {
    await page.goto("/p/brass-diya-small");
    const ld = await page.locator('script[type="application/ld+json"]').textContent();
    expect(ld).not.toBeNull();
    const json = JSON.parse(ld!);
    expect(json["@type"]).toBe("Product");
    expect(json.name).toMatch(/brass diya/i);
    expect(json.sku).toBeTruthy();
    expect(json.offers["@type"]).toBe("Offer");
    expect(json.offers.priceCurrency).toBe("INR");
    expect(json.offers.price).toBe("250");
    expect(json.offers.availability).toContain("InStock");
  });

  test("variant product emits an AggregateOffer with low/high prices", async ({ page }) => {
    await page.goto("/p/resin-coaster-set");
    const ld = await page.locator('script[type="application/ld+json"]').textContent();
    expect(ld).not.toBeNull();
    const json = JSON.parse(ld!);
    expect(json["@type"]).toBe("Product");
    expect(json.offers["@type"]).toBe("AggregateOffer");
    expect(json.offers.priceCurrency).toBe("INR");
    expect(json.offers.lowPrice).toBe("950");
    expect(json.offers.highPrice).toBe("1300");
    expect(json.offers.offerCount).toBeGreaterThanOrEqual(2);
  });
});
