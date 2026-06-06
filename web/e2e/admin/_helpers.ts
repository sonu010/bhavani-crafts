/**
 * Shared helpers for the admin E2E specs.
 *
 * Conventions:
 *   • Every spec creates its own fixtures with the `zzz-e2e-…` prefix.
 *     That sorts them last in any UI, and the vitest fixture-purge
 *     sweeps anything leaked across runs.
 *   • Specs are independent — none assume another has run first. Order
 *     is whatever Playwright picks.
 *   • Locators use role + accessible name first; CSS as a fallback.
 *   • For Server-Action `redirect()` flows: assert with
 *     `expect(page).toHaveURL(...)` (polls — works with soft nav). Do
 *     NOT use `page.waitForURL(..., { waitUntil: "load" })` — the
 *     `load` event doesn't fire on soft navs (see SESSION-RESUME
 *     "Soft navigations").
 */
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * Unique-per-test suffix. ms epoch + short random tail; collision-safe
 * across parallel-running specs in a single workers=1 run.
 */
export function uniq(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** zzz-prefixed slug, ≤80 chars (matches the DB CHECK constraint). */
export function zzzSlug(scope: string): string {
  const s = `zzz-e2e-${scope}-${uniq()}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  return s.slice(0, 80);
}

/** ZZZ-prefixed SKU (uppercase + dashes, matches the admin form's coercion). */
export function zzzSku(scope: string): string {
  return `ZZZ-E2E-${scope.toUpperCase()}-${uniq().toUpperCase()}`.replace(/[^A-Z0-9-]/g, "-").slice(0, 32);
}

/**
 * From any admin page, navigate via the left-sidebar link to another
 * tab and assert the URL lands. Uses `.first()` because the mobile
 * Sheet may render the same labels.
 */
export async function navAdmin(page: Page, label: string, expectUrl: RegExp) {
  await page.getByRole("link", { name: new RegExp(`^${label}$`, "i") }).first().click();
  await expect(page).toHaveURL(expectUrl);
}

/**
 * Visit /admin/products/new — which immediately inserts a draft row and
 * redirects to the editor's General tab. Returns the new product id
 * parsed from the URL.
 */
export async function createDraftProduct(page: Page): Promise<string> {
  await page.goto("/admin/products/new");
  // The redirect target is /admin/products/<uuid>/edit?tab=general.
  await expect(page).toHaveURL(/\/admin\/products\/[0-9a-f-]{36}\/edit/);
  const url = new URL(page.url());
  const id = url.pathname.split("/")[3];
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) {
    throw new Error(`createDraftProduct: bad product id parsed from ${page.url()}`);
  }
  return id;
}

/**
 * Click the General tab's "Save" button and wait for the success toast.
 * The "Unsaved changes" indicator contains the substring "saved", so
 * we assert on the specific toast text ("Product saved").
 */
export async function saveGeneralTab(page: Page) {
  // The General tab's sticky-bottom save button is labelled "Save changes"
  // and is disabled while the form is not dirty. We use the role+name
  // selector explicitly so a future label tweak fails the test loudly
  // rather than silently matching some other "save" button on the page.
  const btn = page.getByRole("button", { name: /^save changes$/i });
  await expect(btn).toBeEnabled();
  await btn.click();
  await expect(page.getByText(/product saved/i)).toBeVisible();
}

/**
 * Accept the next `window.confirm()` Playwright sees on the page.
 * Several admin actions (Unpublish, soft-delete a tag, …) use the
 * browser confirm dialog. Register this BEFORE the click that triggers
 * the dialog.
 */
export async function autoAcceptConfirms(page: Page) {
  page.on("dialog", (d) => {
    void d.accept();
  });
}
