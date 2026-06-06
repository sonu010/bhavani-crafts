import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireAdminContext } from "@/lib/db/admin-context";
import {
  getAdminOrderById,
  type AdminOrderStatus,
} from "@/lib/db/admin/orders";
import { OrderStatusActions } from "./status-actions";

/**
 * /admin/orders/<id> — full order detail (customer + shipping + items
 * + totals + Razorpay refs). View-only at this stage; status flips
 * land with T28 (the verify endpoint + a manual "Mark paid" action
 * for orders that came in via the WhatsApp follow-up flow).
 *
 * Service-role-backed read; renders all PII.
 */

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Order",
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

function inr(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtTs(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtAddress(addr: Record<string, unknown> | null): string {
  if (!addr) return "—";
  const parts = [
    addr.line1,
    addr.line2,
    addr.landmark,
    addr.city,
    addr.state,
    addr.pin,
    addr.country,
  ]
    .filter((p): p is string => typeof p === "string" && p.trim().length > 0);
  return parts.length > 0 ? parts.join(", ") : "—";
}

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { supabase } = await requireAdminContext();
  const { id } = await params;
  const order = await getAdminOrderById(supabase, id);
  if (!order) notFound();

  const addr = (order.shippingAddress as Record<string, unknown>) ?? {};

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <Link
          href="/admin/orders"
          className="inline-flex items-center gap-1 text-sm text-stone-500 hover:text-bark-900"
        >
          <ChevronLeft className="size-3.5" />
          All orders
        </Link>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="font-mono text-2xl text-bark-900">
            {order.orderNumber}
          </h1>
          <span
            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_PILL[order.status]}`}
          >
            {STATUS_LABEL[order.status]}
          </span>
        </div>
        <p className="text-sm text-stone-500">
          Placed {fmtTs(order.createdAt)}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Customer + shipping (left, spans 2 on desktop) */}
        <div className="space-y-6 lg:col-span-2">
          <section className="rounded-lg border border-husk-200 bg-paper-0 p-5">
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-stone-500">
              Customer
            </h2>
            <dl className="space-y-2 text-sm">
              <div className="flex gap-3">
                <dt className="w-20 text-stone-500">Name</dt>
                <dd className="text-bark-900">{order.customerName}</dd>
              </div>
              <div className="flex gap-3">
                <dt className="w-20 text-stone-500">Email</dt>
                <dd>
                  <a
                    href={`mailto:${order.customerEmail}`}
                    className="text-teal-800 underline-offset-2 hover:underline"
                  >
                    {order.customerEmail}
                  </a>
                </dd>
              </div>
              <div className="flex gap-3">
                <dt className="w-20 text-stone-500">Phone</dt>
                <dd>
                  <a
                    href={`tel:${order.customerPhone}`}
                    className="text-teal-800 underline-offset-2 hover:underline"
                  >
                    {order.customerPhone}
                  </a>
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-lg border border-husk-200 bg-paper-0 p-5">
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-stone-500">
              Shipping address
            </h2>
            <p className="text-sm leading-relaxed text-bark-900">
              {fmtAddress(addr)}
            </p>
            {order.notes ? (
              <div className="mt-4 border-t border-husk-200 pt-4">
                <h3 className="text-xs font-medium uppercase tracking-wide text-stone-500">
                  Customer notes
                </h3>
                <p className="mt-2 whitespace-pre-line text-sm text-bark-900">
                  {order.notes}
                </p>
              </div>
            ) : null}
          </section>

          <section className="overflow-x-auto rounded-lg border border-husk-200 bg-paper-0">
            <h2 className="border-b border-husk-200 px-5 py-3 text-xs font-medium uppercase tracking-wide text-stone-500">
              Items ({order.items.length})
            </h2>
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-5 py-2 font-medium">Item</th>
                  <th className="px-5 py-2 text-right font-medium">Unit</th>
                  <th className="px-5 py-2 text-right font-medium">Qty</th>
                  <th className="px-5 py-2 text-right font-medium">Line</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-husk-200">
                {order.items.map((it) => (
                  <tr key={it.id}>
                    <td className="px-5 py-3">
                      <div className="text-bark-900">{it.name}</div>
                      {it.variantLabel ? (
                        <div className="text-xs text-stone-500">
                          {it.variantLabel}
                        </div>
                      ) : null}
                      <div className="font-mono text-xs text-stone-500">
                        {it.sku}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right font-mono tabular-nums text-bark-900">
                      {inr(it.unitPriceInr)}
                    </td>
                    <td className="px-5 py-3 text-right font-mono tabular-nums text-bark-900">
                      {it.quantity}
                    </td>
                    <td className="px-5 py-3 text-right font-mono tabular-nums text-bark-900">
                      {inr(it.lineTotalInr)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>

        {/* Totals + Razorpay refs + actions (right column) */}
        <aside className="space-y-6">
          <OrderStatusActions orderId={order.id} status={order.status} />

          <section className="rounded-lg border border-husk-200 bg-paper-0 p-5">
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-stone-500">
              Totals
            </h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-stone-600">Subtotal</dt>
                <dd className="font-mono tabular-nums text-bark-900">
                  {inr(order.subtotalInr)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-stone-600">Shipping</dt>
                <dd className="font-mono tabular-nums text-bark-900">
                  {inr(order.shippingInr)}
                </dd>
              </div>
              <div className="flex justify-between border-t border-husk-200 pt-2 text-base font-medium">
                <dt className="text-bark-900">Total</dt>
                <dd className="font-mono tabular-nums text-bark-900">
                  {inr(order.totalInr)}
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-lg border border-husk-200 bg-paper-0 p-5 text-sm">
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-stone-500">
              Timeline
            </h2>
            <dl className="space-y-2">
              <div className="flex justify-between gap-3">
                <dt className="text-stone-500">Created</dt>
                <dd className="text-bark-900">{fmtTs(order.createdAt)}</dd>
              </div>
              {order.paidAt ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-stone-500">Paid</dt>
                  <dd className="text-bark-900">{fmtTs(order.paidAt)}</dd>
                </div>
              ) : null}
              {order.cancelledAt ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-stone-500">Cancelled</dt>
                  <dd className="text-bark-900">{fmtTs(order.cancelledAt)}</dd>
                </div>
              ) : null}
              {order.refundedAt ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-stone-500">Refunded</dt>
                  <dd className="text-bark-900">{fmtTs(order.refundedAt)}</dd>
                </div>
              ) : null}
            </dl>
          </section>

          {order.razorpayOrderId || order.razorpayPaymentId ? (
            <section className="rounded-lg border border-husk-200 bg-paper-0 p-5">
              <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-stone-500">
                Razorpay
              </h2>
              <dl className="space-y-2 text-sm">
                {order.razorpayOrderId ? (
                  <div>
                    <dt className="text-xs text-stone-500">Order ID</dt>
                    <dd className="break-all font-mono text-xs text-bark-900">
                      {order.razorpayOrderId}
                    </dd>
                  </div>
                ) : null}
                {order.razorpayPaymentId ? (
                  <div>
                    <dt className="text-xs text-stone-500">Payment ID</dt>
                    <dd className="break-all font-mono text-xs text-bark-900">
                      {order.razorpayPaymentId}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
