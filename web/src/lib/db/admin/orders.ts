import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/db/types.gen";

type SC = SupabaseClient<Database>;

/**
 * Admin orders data access (P3.5 scaffold). Bypasses anon RLS via the
 * service-role-backed SC the page hands in. Mirrors the pattern in
 * `lib/db/admin/audit.ts`.
 *
 * Two reads:
 *   - `listAdminOrders`: paginated newest-first list for the index
 *     page.
 *   - `getAdminOrderById`: full row + items for the detail page.
 */

export const ORDERS_PER_PAGE = 25;

export type AdminOrderStatus =
  Database["public"]["Enums"]["order_status"];

export interface AdminOrderListItem {
  id: string;
  orderNumber: string;
  status: AdminOrderStatus;
  customerName: string;
  customerEmail: string;
  totalInr: number;
  createdAt: string;
  itemCount: number;
}

/**
 * Escape a user-typed string for safe inclusion in a PostgREST `ilike`
 * pattern. `%` and `_` are SQL wildcards; if we don't escape them the
 * user could trivially match the whole table by typing `%`. PostgREST
 * uses backslash for the LIKE escape.
 */
function escapeIlike(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export async function listAdminOrders(
  supabase: SC,
  opts: {
    page?: number;
    status?: AdminOrderStatus;
    /**
     * Free-text search against order_number, customer_name,
     * customer_email. Case-insensitive substring; trim the input,
     * skip the filter when empty.
     */
    q?: string;
  } = {},
): Promise<{ items: AdminOrderListItem[]; total: number; page: number }> {
  const page = Math.max(1, opts.page ?? 1);
  const from = (page - 1) * ORDERS_PER_PAGE;
  const to = from + ORDERS_PER_PAGE - 1;

  let q = supabase
    .from("orders")
    .select(
      "id, order_number, status, customer_name, customer_email, total_inr, created_at, order_items(id)",
      { count: "exact" },
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (opts.status) q = q.eq("status", opts.status);

  const search = opts.q?.trim();
  if (search) {
    const pattern = `%${escapeIlike(search)}%`;
    // PostgREST `or(...)` lets us do a single OR across columns; each
    // term needs the operator + value pair.
    q = q.or(
      [
        `order_number.ilike.${pattern}`,
        `customer_email.ilike.${pattern}`,
        `customer_name.ilike.${pattern}`,
      ].join(","),
    );
  }

  const { data, error, count } = await q;
  if (error) throw new Error(`listAdminOrders: ${error.message}`);

  const items: AdminOrderListItem[] = (data ?? []).map((row) => ({
    id: row.id as string,
    orderNumber: row.order_number as string,
    status: row.status as AdminOrderStatus,
    customerName: row.customer_name as string,
    customerEmail: row.customer_email as string,
    totalInr: row.total_inr as number,
    createdAt: row.created_at as string,
    itemCount: Array.isArray(row.order_items) ? row.order_items.length : 0,
  }));

  return { items, total: count ?? items.length, page };
}

export interface AdminOrderDetailItem {
  id: string;
  productId: string | null;
  variantId: string | null;
  sku: string;
  name: string;
  variantLabel: string | null;
  unitPriceInr: number;
  quantity: number;
  lineTotalInr: number;
}

export interface AdminOrderDetail {
  id: string;
  orderNumber: string;
  status: AdminOrderStatus;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  shippingAddress: Json;
  notes: string | null;
  subtotalInr: number;
  shippingInr: number;
  totalInr: number;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  createdAt: string;
  updatedAt: string;
  paidAt: string | null;
  cancelledAt: string | null;
  refundedAt: string | null;
  items: AdminOrderDetailItem[];
}

export async function getAdminOrderById(
  supabase: SC,
  id: string,
): Promise<AdminOrderDetail | null> {
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, status, customer_name, customer_email, customer_phone, shipping_address, notes, subtotal_inr, shipping_inr, total_inr, razorpay_order_id, razorpay_payment_id, created_at, updated_at, paid_at, cancelled_at, refunded_at, order_items(id, product_id, variant_id, sku, name, variant_label, unit_price_inr, quantity, line_total_inr)",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(`getAdminOrderById: ${error.message}`);
  if (!data) return null;

  const items: AdminOrderDetailItem[] = Array.isArray(data.order_items)
    ? (data.order_items as Array<Record<string, unknown>>).map((it) => ({
        id: it.id as string,
        productId: (it.product_id as string | null) ?? null,
        variantId: (it.variant_id as string | null) ?? null,
        sku: it.sku as string,
        name: it.name as string,
        variantLabel: (it.variant_label as string | null) ?? null,
        unitPriceInr: it.unit_price_inr as number,
        quantity: it.quantity as number,
        lineTotalInr: it.line_total_inr as number,
      }))
    : [];

  return {
    id: data.id as string,
    orderNumber: data.order_number as string,
    status: data.status as AdminOrderStatus,
    customerName: data.customer_name as string,
    customerEmail: data.customer_email as string,
    customerPhone: data.customer_phone as string,
    shippingAddress: data.shipping_address as Json,
    notes: (data.notes as string | null) ?? null,
    subtotalInr: data.subtotal_inr as number,
    shippingInr: data.shipping_inr as number,
    totalInr: data.total_inr as number,
    razorpayOrderId: (data.razorpay_order_id as string | null) ?? null,
    razorpayPaymentId: (data.razorpay_payment_id as string | null) ?? null,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
    paidAt: (data.paid_at as string | null) ?? null,
    cancelledAt: (data.cancelled_at as string | null) ?? null,
    refundedAt: (data.refunded_at as string | null) ?? null,
    items,
  };
}
