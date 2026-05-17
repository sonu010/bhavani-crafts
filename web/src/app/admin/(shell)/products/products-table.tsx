import { Fragment } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { AdminProductRow } from "@/lib/db/admin/products";

/**
 * Relative-time label. Server-rendered, single-granularity (days+) so the
 * output is stable across renders without client JS.
 */
function relativeDays(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  if (days < 1) return "today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

const STATUS_BADGE_VARIANT: Record<
  AdminProductRow["review_status"],
  { label: string; shortLabel: string; className: string }
> = {
  draft: {
    label: "Draft",
    shortLabel: "Draft",
    className: "border-husk-200 bg-husk-100 text-stone-500",
  },
  needs_review: {
    label: "Needs review",
    shortLabel: "Review",
    className: "border-clay-700/30 bg-clay-700/10 text-clay-700",
  },
  ready_to_publish: {
    label: "Ready",
    shortLabel: "Ready",
    className: "border-moss-600/30 bg-moss-600/10 text-moss-600",
  },
  published: {
    label: "Published",
    shortLabel: "Live",
    className: "border-teal-800/30 bg-teal-800/10 text-teal-800",
  },
  archived: {
    label: "Archived",
    shortLabel: "Archived",
    className: "border-husk-200 bg-husk-100 text-stone-500",
  },
};

/**
 * Admin products list — mobile-first card rows.
 *
 * Same layout at every breakpoint; no horizontal scroll, no
 * column-toggling between viewports. Each row is the full tap target,
 * navigating to /admin/products/[id]/edit. The bulk-action checkbox
 * was removed (it was inert) and lands cleanly in P2-T09 when bulk
 * actions ship.
 *
 * Spacing scales lightly with breakpoint: thumbnail 48px on mobile,
 * 56px from sm+; meta line wraps tighter on the narrowest screens.
 */
export function ProductsTable({ rows }: { rows: AdminProductRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-husk-200 bg-paper-0 p-6 text-center text-sm text-stone-500 sm:p-8">
        No products match this filter.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-husk-200 overflow-hidden rounded-xl border border-husk-200 bg-paper-0">
      {rows.map((row) => {
        const badge = STATUS_BADGE_VARIANT[row.review_status];
        const meta: string[] = [];
        if (row.category?.name) meta.push(row.category.name);
        if (row.sku) meta.push(row.sku);
        meta.push(relativeDays(row.created_at));

        return (
          <li key={row.id}>
            <Link
              href={`/admin/products/${row.id}/edit`}
              className="group flex items-center gap-3 px-3 py-3 transition-colors hover:bg-husk-100 sm:gap-4 sm:px-4"
            >
              {/* Thumbnail */}
              {row.thumbnail_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  alt=""
                  src={row.thumbnail_url}
                  className="size-12 shrink-0 rounded-md border border-husk-200 object-cover sm:size-14"
                />
              ) : (
                <div className="size-12 shrink-0 rounded-md border border-husk-200 bg-husk-100 sm:size-14" />
              )}

              {/* Title + meta. min-w-0 lets this flex child shrink so
                 truncate actually clamps; overflow-hidden is a belt to
                 the suspenders for any descendant that escapes its
                 own truncate. */}
              <div className="min-w-0 flex-1 overflow-hidden">
                <div
                  className="truncate text-sm font-medium text-bark-900 group-hover:underline sm:text-base"
                  title={row.name}
                >
                  {row.name}
                </div>
                {/* Meta is one block-level line with whitespace-nowrap +
                   overflow ellipsis. The earlier nested-flex layout
                   meant individual truncate spans never shrank — they
                   all wanted their intrinsic width and the row blew
                   past the viewport on long category + SKU pairs. */}
                <div className="mt-0.5 truncate text-xs text-stone-500">
                  {meta.map((m, i) => (
                    <Fragment key={i}>
                      {i > 0 ? <span aria-hidden> · </span> : null}
                      <span className={i === 1 && row.sku ? "font-mono" : ""}>
                        {m}
                      </span>
                    </Fragment>
                  ))}
                </div>
              </div>

              {/* Status + chevron */}
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant="outline" className={badge.className}>
                  {/* Short label on the narrowest screens; full from sm */}
                  <span className="sm:hidden">{badge.shortLabel}</span>
                  <span className="hidden sm:inline">{badge.label}</span>
                </Badge>
                <ChevronRight
                  aria-hidden
                  className="size-4 text-stone-500 group-hover:text-bark-900"
                />
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
