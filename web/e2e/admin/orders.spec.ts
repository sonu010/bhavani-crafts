/**
 * Admin orders Mark-paid lifecycle.
 *
 * Seeds a pending_payment order via the service-role client (no real
 * checkout needed — that's covered in the anon journey spec), then:
 *   /admin/orders                   navigate from any admin page
 *   /admin/orders search by SKU     filter to our zzz fixture
 *   /admin/orders/<id>              click through to detail
 *   "Mark paid" → dialog → confirm  status flip
 *   detail re-renders with "Paid"   router.refresh() + audit row
 *
 * Pre-seed via supabase-js because the storefront /checkout flow has
 * its own dedicated journey spec; this one is admin-only and should
 * be deterministic without touching client cart state.
 */
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { uniq } from "./_helpers";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

test("admin orders — pending order shows up, Mark paid flips status", async ({
  page,
}) => {
  const srv = createClient(URL, KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const tag = `zzz-e2e-${uniq()}`;
  const email = `${tag}@example.invalid`;

  // 1. Seed a pending_payment order.
  const { data: order, error: orderErr } = await srv
    .from("orders")
    .insert({
      customer_name: `Zzz E2E ${tag}`,
      customer_email: email,
      customer_phone: "0000000000",
      shipping_address: { country: "IN", line1: "Test", city: "Hyderabad", state: "TG", pin: "500001" },
      subtotal_inr: 250,
      shipping_inr: 50,
      total_inr: 300,
      status: "pending_payment",
    })
    .select("id, order_number")
    .single();
  if (orderErr) throw orderErr;

  await srv.from("order_items").insert({
    order_id: order!.id,
    sku: "ZZZ-E2E-SKU",
    name: "Zzz E2E item",
    unit_price_inr: 250,
    quantity: 1,
    line_total_inr: 250,
  });

  try {
    // 2. Visit /admin/orders + filter to our fixture via the search box.
    await page.goto("/admin/orders");
    await expect(page.getByRole("heading", { name: /orders/i })).toBeVisible();

    await page
      .getByRole("searchbox", { name: /search orders/i })
      .fill(order!.order_number as string);
    await page.getByRole("button", { name: /^search$/i }).click();

    // 3. Our row is in the table; click through.
    const numberLink = page.getByRole("link", { name: order!.order_number as string });
    await expect(numberLink).toBeVisible();
    await numberLink.click();
    await expect(page).toHaveURL(new RegExp(`/admin/orders/${order!.id}`));

    // 4. Status pill says "Pending payment".
    await expect(page.getByText(/pending payment/i).first()).toBeVisible();

    // 5. Click "Mark paid" → confirm in the dialog.
    await page.getByRole("button", { name: /^mark paid$/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /^mark paid$/i }).click();

    // 6. router.refresh() re-renders the server detail. The status pill
    //    should now say "Paid". The toast also fires; we use the pill as
    //    the authoritative signal.
    await expect(page.getByText(/^paid$/i).first()).toBeVisible({ timeout: 10_000 });

    // 7. Double-check the DB side via srv: row is paid + paid_at stamped.
    const { data: after } = await srv
      .from("orders")
      .select("status, paid_at")
      .eq("id", order!.id)
      .single();
    expect(after!.status).toBe("paid");
    expect(after!.paid_at).not.toBeNull();

    // 8. Audit row exists for the flip.
    const { data: audit } = await srv
      .from("audit_logs")
      .select("action")
      .eq("entity_id", order!.id)
      .eq("action", "order.mark_paid");
    expect(audit?.length ?? 0).toBeGreaterThanOrEqual(1);
  } finally {
    // Cleanup — items cascade off the order delete.
    await srv.from("audit_logs").delete().eq("entity_id", order!.id);
    await srv.from("orders").delete().eq("id", order!.id);
  }
});

test("admin orders — search filter narrows the table to the matching row", async ({
  page,
}) => {
  const srv = createClient(URL, KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const tag = uniq();
  const email = `zzz-e2e-search-${tag}@example.invalid`;

  const { data, error } = await srv
    .from("orders")
    .insert({
      customer_name: `Search Probe ${tag}`,
      customer_email: email,
      customer_phone: "0000000000",
      shipping_address: { country: "IN" },
      subtotal_inr: 100,
      shipping_inr: 50,
      total_inr: 150,
      status: "pending_payment",
    })
    .select("id, order_number")
    .single();
  if (error) throw error;

  try {
    await page.goto("/admin/orders");

    // Search by the exact order_number — only our row should appear.
    await page
      .getByRole("searchbox", { name: /search orders/i })
      .fill(data!.order_number as string);
    await page.getByRole("button", { name: /^search$/i }).click();

    await expect(page).toHaveURL(/q=BC-/);
    await expect(
      page.getByRole("link", { name: data!.order_number as string }),
    ).toBeVisible();
  } finally {
    await srv.from("orders").delete().eq("id", data!.id);
  }
});
