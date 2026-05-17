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
      // Mobile-first: single-row horizontal scroll. `-mx-3` bleeds the
      // scroll edges out to the shell's mobile padding so users see chip
      // edges instead of a hard cut. `sm:flex-wrap` restores wrapping
      // once we have horizontal room.
      className="-mx-3 flex items-center gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-x-visible sm:px-0 sm:pb-0"
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
              "inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1 text-sm transition-colors " +
              (isActive
                ? "border-teal-800 bg-teal-800/5 text-bark-900"
                : "border-husk-200 text-stone-500 hover:bg-husk-100 hover:text-bark-900")
            }
          >
            <span>{label}</span>
            <span className="font-mono text-xs tabular-nums text-stone-500">
              {counts[status].toLocaleString()}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
