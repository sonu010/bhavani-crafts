/**
 * Customer checkout journey — happy path.
 *
 * PDP → add to cart → /checkout → fill contact + shipping → submit →
 * land on /checkout/pending with the BC-YYYY-NNNN order number visible.
 *
 * Exercises the full pipeline we built without Razorpay keys:
 *   - cart store (Zustand persist)
 *   - /checkout client form + cart-summary
 *   - createCheckoutOrder server action
 *   - create_anon_order RPC (under the hood)
 *   - /checkout/pending page reading the ?order= param
 *
 * Cleanup is via service-role at the end; the test owns its own
 * `${TAG}@…example.invalid` email so it can't collide with other runs.
 */
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

test("anon checkout happy path lands on /checkout/pending with an order number", async ({
  page,
}) => {
  const srv = createClient(URL, KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const ts = Date.now();
  const customerEmail = `zzz-e2e-checkout-${ts}@example.invalid`;

  // 1. PDP → Add to cart. The seed includes brass-diya-small (no
  //    variants, ₹250) — a good single-line checkout fixture.
  await page.goto("/p/brass-diya-small");
  await page
    .getByRole("button", { name: /^add to cart$/i })
    .first()
    .click();

  // Drawer opens with the line.
  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();

  // 2. Click the drawer's "Checkout" CTA.
  await drawer.getByRole("link", { name: /^checkout$/i }).click();
  await expect(page).toHaveURL(/\/checkout$/);

  // 3. Fill the form.
  await page.getByLabel(/full name/i).fill("Anon Tester");
  await page.getByLabel(/^email$/i).fill(customerEmail);
  await page.getByLabel(/^phone$/i).fill("+919876543210");
  await page.getByLabel(/^address line 1$/i).fill("12 Bhavani Lane");
  await page.getByLabel(/^city$/i).fill("Hyderabad");
  await page.getByLabel(/^state$/i).fill("Telangana");
  await page.getByLabel(/^pin$/i).fill("500001");

  // 4. Submit.
  await page.getByRole("button", { name: /^place order/i }).click();

  // 5. Land on /checkout/pending?order=BC-YYYY-NNNN.
  await expect(page).toHaveURL(/\/checkout\/pending\?order=BC-\d{4}-\d{4,}/);

  // 6. Reference is visible on the page.
  await expect(page.getByText(/order received/i)).toBeVisible();
  await expect(page.getByText(/BC-\d{4}-\d{4,}/)).toBeVisible();

  // 7. The order row exists in the DB with the expected fields.
  try {
    const { data } = await srv
      .from("orders")
      .select("status, customer_name, customer_phone, total_inr, order_number, subtotal_inr")
      .eq("customer_email", customerEmail)
      .maybeSingle();
    expect(data).not.toBeNull();
    expect(data!.status).toBe("pending_payment");
    expect(data!.customer_name).toBe("Anon Tester");
    expect(data!.customer_phone).toBe("+919876543210");
    // Server resolves price + shipping. Seed price for brass-diya-small
    // is ₹250; we don't lock the exact total here (shipping is owner-
    // editable in app_settings), just assert subtotal matches the seed
    // and total > subtotal.
    expect(data!.subtotal_inr).toBe(250);
    expect(data!.total_inr).toBeGreaterThanOrEqual(250);
  } finally {
    await srv.from("orders").delete().eq("customer_email", customerEmail);
  }
});
