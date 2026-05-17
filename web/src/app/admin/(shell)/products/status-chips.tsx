import Link from "next/link";
import type {
  AdminProductStatus,
  ProductStatusCounts,
} from "@/lib/db/admin/products";

const CHIP_ORDER: { status: AdminProductStatus; label: string }[] = [
  { status: "needs_review", label: "Needs review" },
  { status: "ready_to_publish", label: "Ready" },
  { status: "published", label: "Published" },
  { status: "draft", label: "Draft" },
  { status: "archived", label: "Archived" },
];

/**
 * Filter chips above the products table. Each chip is a same-page Link
 * that swaps `?status=`. Active chip uses teal-800 outline + dot;
 * inactive chips are husk-bordered with stone text.
 *
 * Counts come from `countProductsByStatus`. The "first month" default
 * focuses on the `needs_review` queue (5,804 seeded products).
 */
export function StatusChips({
  counts,
  active,
  sort,
  extraParams,
}: {
  counts: ProductStatusCounts;
  active: AdminProductStatus;
  sort: string;
  /** Filter params to preserve when swapping the status chip (q, category, tags, stock, source). */
  extraParams?: Record<string, string>;
}) {
  return (
    <nav
      aria-label="Filter products by status"
      className="flex flex-wrap items-center gap-2"
    >
      {CHIP_ORDER.map(({ status, label }) => {
        const isActive = status === active;
        const search = new URLSearchParams();
        search.set("status", status);
        search.set("sort", sort);
        for (const [k, v] of Object.entries(extraParams ?? {})) {
          if (v) search.set(k, v);
        }
        return (
          <Link
            key={status}
            href={`/admin/products?${search.toString()}`}
            aria-current={isActive ? "page" : undefined}
            className={
              "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm transition-colors " +
              (isActive
                ? "border-teal-800 bg-teal-800/5 text-bark-900"
                : "border-husk-200 text-stone-500 hover:bg-husk-100 hover:text-bark-900")
            }
          >
            <span className="text-sm">{label}</span>
            <span className="font-mono text-xs tabular-nums text-stone-500">
              {counts[status].toLocaleString()}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
