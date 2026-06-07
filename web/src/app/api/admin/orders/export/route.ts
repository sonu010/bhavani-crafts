/**
 * GET /api/admin/orders/export.csv?status=…&q=…
 *
 * Streams the currently-filtered orders set as a CSV file the owner
 * can hand to an accountant at month-end. Same filter axes as
 * /admin/orders (status + free-text q); no pagination — emits ALL
 * matching rows, paginating PostgREST's 1000-row cap internally.
 *
 * Auth: requireAdminContext gates the export — same posture as the
 * page that links here.
 *
 * Format: RFC 4180 CSV, UTF-8 BOM-prefixed so Excel on macOS opens it
 * with the right encoding. Each row is one ORDER (not one item) so
 * accountants see a single ledger line per checkout; the line items
 * are summarised as "qty × sku, qty × sku, …" in one cell.
 */
import { NextResponse, type NextRequest } from "next/server";
import { requireAdminContext } from "@/lib/db/admin-context";
import type { AdminOrderStatus } from "@/lib/db/admin/orders";
import { csvRow } from "@/lib/utils/csv";

const STATUS_VALUES: AdminOrderStatus[] = [
  "pending_payment",
  "paid",
  "failed",
  "cancelled",
  "refunded",
];

const PAGE = 1000; // PostgREST cap

function escapeIlike(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function fmtAddress(addr: unknown): string {
  if (!addr || typeof addr !== "object") return "";
  const a = addr as Record<string, unknown>;
  return [
    a.line1,
    a.line2,
    a.landmark,
    a.city,
    a.state,
    a.pin,
    a.country,
  ]
    .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
    .join(", ");
}

interface OrderItemSlim {
  sku: string;
  name: string;
  quantity: number;
}

function summariseItems(items: OrderItemSlim[]): string {
  return items
    .map((it) => `${it.quantity} × ${it.sku}`)
    .join("; ");
}

export async function GET(req: NextRequest): Promise<Response> {
  const { supabase } = await requireAdminContext();

  const url = new URL(req.url);
  const statusRaw = url.searchParams.get("status");
  const status =
    statusRaw && (STATUS_VALUES as string[]).includes(statusRaw)
      ? (statusRaw as AdminOrderStatus)
      : null;
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 120);

  // Header row.
  const HEADERS = [
    "order_number",
    "status",
    "created_at",
    "paid_at",
    "cancelled_at",
    "refunded_at",
    "customer_name",
    "customer_email",
    "customer_phone",
    "shipping_address",
    "subtotal_inr",
    "shipping_inr",
    "total_inr",
    "item_count",
    "items",
    "razorpay_order_id",
    "razorpay_payment_id",
    "notes",
  ];

  // Build the CSV in memory. At expected MVP volumes (10s/100s of
  // rows/month) this is fine; a true stream would matter at 10k+.
  const lines: string[] = [csvRow(HEADERS)];

  let from = 0;
  while (true) {
    let qb = supabase
      .from("orders")
      .select(
        "id, order_number, status, created_at, paid_at, cancelled_at, refunded_at, " +
          "customer_name, customer_email, customer_phone, shipping_address, " +
          "subtotal_inr, shipping_inr, total_inr, " +
          "razorpay_order_id, razorpay_payment_id, notes, " +
          "order_items(sku, name, quantity)",
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);

    if (status) qb = qb.eq("status", status);
    if (q) {
      const pattern = `%${escapeIlike(q)}%`;
      qb = qb.or(
        [
          `order_number.ilike.${pattern}`,
          `customer_email.ilike.${pattern}`,
          `customer_name.ilike.${pattern}`,
        ].join(","),
      );
    }

    const { data, error } = await qb;
    if (error) {
      return NextResponse.json(
        { error: `export failed: ${error.message}` },
        { status: 500 },
      );
    }
    if (!data || data.length === 0) break;

    // Cast through Record because the select-with-join string is too
    // complex for Supabase JS's row inference (it falls back to
    // GenericStringError on the joined columns). The select string
    // is the source of truth.
    for (const raw of data) {
      const row = raw as unknown as Record<string, unknown> & {
        order_items?: OrderItemSlim[] | null;
      };
      const items = Array.isArray(row.order_items) ? row.order_items : [];
      lines.push(
        csvRow([
          row.order_number,
          row.status,
          row.created_at,
          row.paid_at ?? "",
          row.cancelled_at ?? "",
          row.refunded_at ?? "",
          row.customer_name,
          row.customer_email,
          row.customer_phone,
          fmtAddress(row.shipping_address),
          row.subtotal_inr,
          row.shipping_inr,
          row.total_inr,
          items.length,
          summariseItems(items),
          row.razorpay_order_id ?? "",
          row.razorpay_payment_id ?? "",
          row.notes ?? "",
        ]),
      );
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }

  // UTF-8 BOM so Excel on macOS picks up the encoding correctly.
  const body = "﻿" + lines.join("\r\n") + "\r\n";
  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .slice(0, 19);
  const filename = `orders-${stamp}.csv`;

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
