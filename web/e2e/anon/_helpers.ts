/**
 * Shared helpers for anonymous storefront journey specs.
 *
 * The mission of these helpers (and the journey suites that use them):
 * we got bitten by a bug where the storefront returned 200 but the
 * landing-atlas section silently rendered EMPTY because getPrimaryImages
 * threw a `fetch failed` on a too-long PostgREST URL, and readOrEmpty
 * swallowed it. The status-code-only tests passed. So every assertion
 * here proves the section ACTUALLY HAS CONTENT — tile counts, card
 * counts, image presence — not just that its heading is on the page.
 */
import { expect, type Page, type Locator } from "@playwright/test";

/**
 * Assert a locator resolves to at least N elements. Wraps the typical
 * `expect.poll(() => loc.count())` boilerplate so call sites stay short.
 */
export async function expectAtLeast(
  loc: Locator,
  min: number,
  message?: string,
) {
  await expect
    .poll(() => loc.count(), {
      message: message ?? `expected at least ${min} elements`,
      timeout: 10_000,
    })
    .toBeGreaterThanOrEqual(min);
}

/**
 * Pick the first `/p/<slug>` link rendered on the current page and
 * return its href. Throws if no PDP link is visible — most storefront
 * journeys start by clicking through to a PDP, so an empty page is
 * itself a failure worth surfacing.
 */
export async function firstPdpHref(page: Page): Promise<string> {
  const link = page.locator('a[href^="/p/"]').first();
  await expect(link).toBeVisible({ timeout: 15_000 });
  const href = await link.getAttribute("href");
  if (!href) throw new Error("first PDP link had no href");
  return href;
}

/**
 * Pick the first `/c/<slug>` link rendered on the current page and
 * return its href. Same rationale as firstPdpHref.
 */
export async function firstCategoryHref(page: Page): Promise<string> {
  const link = page.locator('a[href^="/c/"]').first();
  await expect(link).toBeVisible({ timeout: 15_000 });
  const href = await link.getAttribute("href");
  if (!href) throw new Error("first category link had no href");
  return href;
}

/**
 * Read the current cart-badge count from the header. Returns 0 when
 * no badge is rendered (the empty-cart state). The badge lives inside
 * a button whose aria-label is "Cart, N items" — we match the count
 * out of that label so we don't depend on visual badge markup.
 */
export async function readCartBadge(page: Page): Promise<number> {
  const btn = page.locator("button[aria-label^='Cart']").first();
  await expect(btn).toBeVisible();
  const label = (await btn.getAttribute("aria-label")) ?? "";
  const m = label.match(/Cart,\s*(\d+)\s*items?/i);
  return m ? Number(m[1]) : 0;
}

/**
 * Open the cart drawer via the header button. Returns the dialog
 * locator so callers can drive it.
 */
export async function openCartDrawer(page: Page): Promise<Locator> {
  await page.locator("button[aria-label^='Cart']").first().click();
  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  return drawer;
}

/**
 * Pull the visible price from a product card. Cards render the price as
 * "₹250" inside the card's link. Used by comparison flows.
 */
export async function priceOnPdp(page: Page): Promise<string> {
  const price = page.locator("text=/₹[0-9,]+/").first();
  await expect(price).toBeVisible();
  return (await price.textContent())?.trim() ?? "";
}

/**
 * Watch the page for SSR fallback warnings emitted by readOrEmpty
 * (`[storefront] read "<key>" failed; rendering fallback`). These
 * surface as browser console.error messages in Next 16 dev mode but
 * NOT in production — in prod they go to the server log. So this is
 * primarily a tripwire for dev-mode test runs (Playwright uses
 * `next dev` per playwright.config.ts webServer). We attach the
 * collector at test start and return a getter the caller asserts on
 * at the end.
 */
export function attachFallbackWatcher(page: Page): () => string[] {
  const seen: string[] = [];
  page.on("console", (msg) => {
    const text = msg.text();
    if (/\[storefront\]\s+read\s+"[^"]+"\s+failed/i.test(text)) {
      seen.push(text);
    }
  });
  page.on("pageerror", (err) => {
    seen.push(`pageerror: ${err.message}`);
  });
  return () => seen.slice();
}

/**
 * Each storefront product card has an <img> with an alt attribute and a
 * `/p/<slug>` link. Asserts both — a card with no img would mean the
 * primary-images batch came back empty for that product.
 */
export async function expectCardsHaveImages(loc: Locator, min: number) {
  await expectAtLeast(loc, min, "expected product cards");
  const imgs = loc.locator("img");
  await expectAtLeast(imgs, min, "expected each card to have an image");
}
