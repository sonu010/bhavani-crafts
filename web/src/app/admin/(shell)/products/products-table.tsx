import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import type { AdminProductRow } from "@/lib/db/admin/products";

/**
 * Relative-time label. Server-rendered, so we deliberately use a single
 * granularity (days) rather than the full "5 minutes ago" gradient — the
 * latter would require client JS to stay accurate across renders.
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
  { label: string; className: string }
> = {
  draft: { label: "Draft", className: "border-husk-200 bg-husk-100 text-stone-500" },
  needs_review: {
    label: "Needs review",
    className: "border-clay-700/30 bg-clay-700/10 text-clay-700",
  },
  ready_to_publish: {
    label: "Ready",
    className: "border-moss-600/30 bg-moss-600/10 text-moss-600",
  },
  published: {
    label: "Published",
    className: "border-teal-800/30 bg-teal-800/10 text-teal-800",
  },
  archived: {
    label: "Archived",
    className: "border-husk-200 bg-husk-100 text-stone-500",
  },
};

/**
 * Admin products table. Server component. The checkbox column is wired
 * for layout consistency but inert until P2-T09 (bulk actions).
 */
export function ProductsTable({ rows }: { rows: AdminProductRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-husk-200 bg-paper-0 p-8 text-center text-sm text-stone-500">
        No products match this filter.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-husk-200 bg-paper-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10 pl-4">
              <Checkbox aria-label="Select all (bulk actions arrive in P2-T09)" disabled />
            </TableHead>
            <TableHead className="w-12"></TableHead>
            <TableHead>Name</TableHead>
            <TableHead className="hidden md:table-cell">Category</TableHead>
            <TableHead className="hidden md:table-cell">SKU</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden lg:table-cell">Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const badge = STATUS_BADGE_VARIANT[row.review_status];
            return (
              <TableRow key={row.id}>
                <TableCell className="pl-4">
                  <Checkbox
                    aria-label={`Select ${row.name}`}
                    disabled
                  />
                </TableCell>
                <TableCell>
                  {row.thumbnail_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      alt=""
                      src={row.thumbnail_url}
                      className="size-10 rounded border border-husk-200 object-cover"
                    />
                  ) : (
                    <div className="size-10 rounded border border-husk-200 bg-husk-100" />
                  )}
                </TableCell>
                <TableCell>
                  <Link
                    href={`/admin/products/${row.id}/edit`}
                    className="block max-w-xs truncate text-bark-900 hover:underline"
                    title={row.name}
                  >
                    {row.name}
                  </Link>
                  <div
                    className="max-w-xs truncate font-mono text-xs text-stone-500"
                    title={row.slug}
                  >
                    {row.slug}
                  </div>
                </TableCell>
                <TableCell className="hidden text-sm text-stone-500 md:table-cell">
                  {row.category?.name ?? "—"}
                </TableCell>
                <TableCell className="hidden font-mono text-xs text-stone-500 md:table-cell">
                  {row.sku ?? "—"}
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={badge.className}
                  >
                    {badge.label}
                  </Badge>
                </TableCell>
                <TableCell className="hidden font-mono text-xs text-stone-500 lg:table-cell">
                  {relativeDays(row.created_at)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
