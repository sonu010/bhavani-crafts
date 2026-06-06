import Link from "next/link";
import { ArrowRight, Receipt } from "lucide-react";
import type { PendingOrdersSummary } from "@/lib/db/admin/dashboard";

/**
 * "You have N orders waiting" strip that renders at the top of the
 * admin dashboard when `total > 0`. Hides entirely when there's
 * nothing pending — no point making the owner glance at a zero.
 *
 * Distinct from the 2×3 widget grid below. This is an action
 * surface: count + the newest three numbers + a "Review" CTA → goes
 * straight to `/admin/orders?status=pending_payment`.
 */

function inr(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

export function PendingOrdersBanner({
  summary,
}: {
  summary: PendingOrdersSummary;
}) {
  if (summary.total === 0) return null;

  return (
    <section className="rounded-lg border border-saffron-200 bg-saffron-50 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-full bg-saffron-100 text-clay-700">
            <Receipt className="size-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-clay-900">
              {summary.total === 1
                ? "1 order waiting for payment"
                : `${summary.total} orders waiting for payment`}
            </h2>
            <p className="mt-0.5 text-xs text-clay-700">
              Newest first. Confirm WhatsApp/UPI/bank receipts on the order
              detail page.
            </p>
            {summary.recent.length > 0 ? (
              <ul className="mt-3 space-y-1.5">
                {summary.recent.map((o) => (
                  <li key={o.id} className="flex items-center gap-3 text-xs">
                    <Link
                      href={`/admin/orders/${o.id}`}
                      className="font-mono text-clay-900 underline-offset-2 hover:underline"
                    >
                      {o.orderNumber}
                    </Link>
                    <span className="text-clay-700">·</span>
                    <span className="text-clay-700">{o.customerName}</span>
                    <span className="text-clay-700">·</span>
                    <span className="font-mono tabular-nums text-clay-900">
                      {inr(o.totalInr)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
        <Link
          href="/admin/orders?status=pending_payment"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-clay-700 px-4 py-2 text-xs font-medium text-paper-0 transition-colors hover:bg-clay-800"
        >
          Review {summary.total}
          <ArrowRight className="size-3.5" />
        </Link>
      </div>
    </section>
  );
}
