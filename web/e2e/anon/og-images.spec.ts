/**
 * OG images — P5-T04.
 *
 * Asserts each route's `<meta property="og:image">` resolves to a
 * 200 image of the expected dimensions. Copy review (the actual
 * rendered text + brand mark) is out-of-band — spot-check on
 * opengraph.xyz or metatags.io.
 *
 * The home page seeds use `brass-diya-small` (PDP) and `pooja-items`
 * (category); the og-images.spec.ts in P3-T24 confirms those slugs
 * exist in the test catalogue.
 *
 * Note: Next 16 emits the og:image URL with the production origin
 * baked in from `metadataBase` (set in `app/layout.tsx`). We don't
 * fetch that absolute URL directly — instead we parse out the path +
 * query and refetch against Playwright's baseURL, so this works in
 * any environment (local, CI, preview).
 */
import { test, expect } from "@playwright/test";

const ROUTES = [
  { path: "/", label: "home" },
  { path: "/c/pooja-items", label: "category" },
  { path: "/p/brass-diya-small", label: "product" },
] as const;

async function getOgImage(page: import("@playwright/test").Page, path: string) {
  await page.goto(path);
  return page.locator('meta[property="og:image"]').first().getAttribute("content");
}

function ogPath(absoluteUrl: string): string {
  const u = new URL(absoluteUrl);
  return `${u.pathname}${u.search}`;
}

test.describe("anonymous OG images", () => {
  for (const { path, label } of ROUTES) {
    test(`${label} (${path}) → og:image resolves to 1200×630 image`, async ({
      page,
      request,
    }) => {
      const og = await getOgImage(page, path);
      expect(og, `${path} missing <meta property="og:image">`).not.toBeNull();
      expect(og!).toMatch(/^https?:\/\//);

      const res = await request.get(ogPath(og!));
      expect(res.status(), `OG image fetch failed for ${path}`).toBe(200);

      const contentType = res.headers()["content-type"] ?? "";
      expect(contentType).toMatch(/^image\//);

      // Width/height meta-tags are auto-injected from `size` export;
      // confirm they match the template constants.
      const width = await page
        .locator('meta[property="og:image:width"]')
        .first()
        .getAttribute("content");
      const height = await page
        .locator('meta[property="og:image:height"]')
        .first()
        .getAttribute("content");
      expect(width).toBe("1200");
      expect(height).toBe("630");
    });
  }

  test("PDP and category OGs resolve to different image URLs (not the global fallback)", async ({
    page,
  }) => {
    const home = await getOgImage(page, "/");
    const category = await getOgImage(page, "/c/pooja-items");
    const product = await getOgImage(page, "/p/brass-diya-small");

    expect(home).not.toBeNull();
    expect(category).not.toBeNull();
    expect(product).not.toBeNull();

    // The home OG lives at /opengraph-image; category at
    // /c/<slug>/opengraph-image-<hash>; product at /p/<slug>/opengraph-image-<hash>.
    // Next 16 suffixes a build-time hash on dynamic OG routes.
    expect(home).toMatch(/\/opengraph-image/);
    expect(category).toMatch(/\/c\/pooja-items\/opengraph-image/);
    expect(product).toMatch(/\/p\/brass-diya-small\/opengraph-image/);
  });
});
