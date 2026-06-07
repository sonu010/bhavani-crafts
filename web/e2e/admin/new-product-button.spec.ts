/**
 * Pin the "New product" entry point on /admin/products.
 *
 * Born from a real owner-reported gap: the /admin/products/new route
 * existed and worked, but no UI linked to it — owner had no way to
 * add a new product short of typing the URL. This spec asserts the
 * button is present, clickable, and inserts a draft + redirects into
 * the editor.
 *
 * Cleanup deletes the draft we created so re-runs don't pile up
 * `Untitled product` rows.
 */
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

test("Admin can click 'New product' → land in the editor with a draft row", async ({
  page,
}) => {
  const srv = createClient(URL, KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  await page.goto("/admin/products");
  await expect(page.getByRole("heading", { name: /^products$/i })).toBeVisible();

  // The button is the only "New product" link on the page.
  const button = page.getByRole("link", { name: /new product/i }).first();
  await expect(button).toBeVisible();
  await expect(button).toHaveAttribute("href", "/admin/products/new");

  await button.click();
  // /admin/products/new inserts a draft and redirects to the editor.
  // The URL pattern is /admin/products/<uuid>/edit?tab=general.
  await expect(page).toHaveURL(
    /\/admin\/products\/[0-9a-f-]{36}\/edit\?tab=general/,
  );

  // Pull the new product's id off the URL and clean up.
  const match = page.url().match(/\/admin\/products\/([0-9a-f-]{36})\/edit/);
  const newId = match?.[1];
  expect(newId).toBeDefined();

  // The editor shell rendered (heading mentions "Untitled product").
  await expect(page.getByText(/untitled product/i).first()).toBeVisible();

  if (newId) {
    await srv.from("products").delete().eq("id", newId);
  }
});
