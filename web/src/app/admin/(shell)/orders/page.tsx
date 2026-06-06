import Link from "next/link";
import { requireAdminContext } from "@/lib/db/admin-context";
import {
  listAdminOrders,
  ORDERS_PER_PAGE,
  type AdminOrderStatus,
} from "@/lib/db/admin/orders";

/**
 * /admin/orders — newest-first table of all orders.
 *
 * Built proactively while Razorpay test keys are owner-pending: even
 * without live payments, the storefront's `/checkout` flow inserts a
 * `pending_payment` row and routes the customer to /checkout/pending
 * with a WhatsApp follow-up link. This page lets the owner see those
 * pending orders + the WhatsApp threads they spawn so nothing is
 * stranded while the integration is finalised.
 *
 * Server-rendered; reads via the admin-context client (RLS-bypassing).
 * No edits yet — view-only. Status flips will land in T28
 * (verify endpoint + admin mark-paid for the manual-WhatsApp path).
 */

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Orders",
  robots: { index: false, follow: false },
};

const STATUS_LABEL: Record<AdminOrderStatus, string> = {
  pending_payment: "Pending payment",
  paid: "Paid",
  failed: "Failed",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

const STATUS_PILL: Record<AdminOrderStatus, string> = {
  pending_payment: "bg-saffron-50 text-clay-700",
  paid: "bg-moss-100 text-moss-800",
  failed: "bg-brick-50 text-brick-700",
  cancelled: "bg-husk-100 text-stone-700",
  refunded: "bg-husk-100 text-stone-700",
};

function pickStatus(
  raw: string | string[] | undefined,
): AdminOrderStatus | undefined {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (!v) return undefined;
  return (Object.keys(STATUS_LABEL) as AdminOrderStatus[]).find(
    (s) => s === v,
  );
}

function inr(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

function ago(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string }>;
}) {
  const { supabase } = await requireAdminContext();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const status = pickStatus(sp.status);

  const { items, total } = await listAdminOrders(supabase, { page, status });
  const totalPages = Math.max(1, Math.ceil(total / ORDERS_PER_PAGE));

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-bark-900">
            Orders
          </h1>
          <p className="text-sm text-stone-500">
            {total} {total === 1 ? "order" : "orders"}{" "}
            {status ? `· ${STATUS_LABEL[status].toLowerCase()}` : ""}
          </p>
        </div>
      </header>

      {/* Status filter strip */}
      <nav className="-mx-1 flex flex-wrap items-center gap-1 text-sm">
        <Link
          href="/admin/orders"
          className={`rounded-full border px-3 py-1 transition-colors ${
            !status
              ? "border-bark-900 bg-bark-900 text-paper-0"
              : "border-husk-200 text-stone-600 hover:border-bark-900 hover:text-bark-900"
          }`}
        >
          All
        </Link>
        {(Object.keys(STATUS_LABEL) as AdminOrderStatus[]).map((s) => (
          <Link
            key={s}
            href={`/admin/orders?status=${s}`}
            className={`rounded-full border px-3 py-1 transition-colors ${
              status === s
                ? "border-bark-900 bg-bark-900 text-paper-0"
                : "border-husk-200 text-stone-600 hover:border-bark-900 hover:text-bark-900"
            }`}
          >
            {STATUS_LABEL[s]}
          </Link>
        ))}
      </nav>

      {items.length === 0 ? (
        <div className="rounded-lg border border-husk-200 bg-paper-0 p-8 text-center text-sm text-stone-500">
          No orders yet. They&rsquo;ll appear here as customers check out.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-husk-200 bg-paper-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-husk-200 text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-4 py-3 font-medium">Order</th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Items</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Placed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-husk-200">
              {items.map((o) => (
                <tr key={o.id} className="transition-colors hover:bg-husk-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/orders/${o.id}`}
                      className="font-mono text-bark-900 underline-offset-2 hover:underline"
                    >
                      {o.orderNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-bark-900">{o.customerName}</div>
                    <div className="text-xs text-stone-500">
                      {o.customerEmail}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-stone-600">{o.itemCount}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-bark-900">
                    {inr(o.totalInr)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_PILL[o.status]}`}
                    >
                      {STATUS_LABEL[o.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-stone-500">{ago(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 ? (
        <nav className="flex items-center justify-between text-sm">
          <Link
            href={
              page > 1
                ? `/admin/orders?page=${page - 1}${status ? `&status=${status}` : ""}`
                : "#"
            }
            aria-disabled={page === 1}
            className={`rounded-md border border-husk-200 px-3 py-1.5 ${
              page === 1
                ? "pointer-events-none text-stone-400"
                : "text-bark-900 hover:border-bark-900"
            }`}
          >
            ← Newer
          </Link>
          <span className="text-stone-500">
            Page {page} of {totalPages}
          </span>
          <Link
            href={
              page < totalPages
                ? `/admin/orders?page=${page + 1}${status ? `&status=${status}` : ""}`
                : "#"
            }
            aria-disabled={page === totalPages}
            className={`rounded-md border border-husk-200 px-3 py-1.5 ${
              page === totalPages
                ? "pointer-events-none text-stone-400"
                : "text-bark-900 hover:border-bark-900"
            }`}
          >
            Older →
          </Link>
        </nav>
      ) : null}
    </div>
  );
}
