import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import type { CatalogCounts } from "@/lib/db/admin/dashboard";
import { WidgetCard } from "./widget-card";

/**
 * Catalog counts widget.
 *
 * Each row is now a Link to /admin/products with the matching filter
 * applied — the owner can click "Out of stock: 47" → land on the
 * list pre-filtered to the 47 rows that need attention. Used to be
 * a static number with no path forward; the New-product gap and the
 * dead-end metric were two faces of the same problem.
 *
 * When `total = 0` (fresh deploy, no seed) the widget swaps to a
 * "Create the first product" CTA so the owner never stares at a
 * widget full of zeroes without knowing what to do.
 */

function Row({
  label,
  value,
  href,
}: {
  label: string;
  value: number;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group -mx-2 flex items-baseline justify-between gap-3 rounded px-2 py-1 transition-colors hover:bg-husk-100 focus-visible:bg-husk-100 focus-visible:outline-none"
    >
      <span className="flex items-center gap-1 text-sm text-stone-500 group-hover:text-bark-900">
        {label}
        <ArrowRight className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
      </span>
      <span className="font-mono text-base tabular-nums text-bark-900">
        {value.toLocaleString()}
      </span>
    </Link>
  );
}

export function CatalogCountsWidget({ counts }: { counts: CatalogCounts }) {
  if (counts.total === 0) {
    return (
      <WidgetCard title="Catalog">
        <div className="space-y-3 py-1">
          <p className="text-sm text-stone-500">
            No products yet. Add your first one to get the catalog rolling.
          </p>
          <Link
            href="/admin/products/new"
            className="inline-flex items-center gap-1.5 rounded-md bg-bark-900 px-3 py-1.5 text-xs font-medium text-paper-0 transition-colors hover:bg-bark-800"
          >
            <Plus className="size-3" />
            Create the first product
          </Link>
        </div>
      </WidgetCard>
    );
  }

  return (
    <WidgetCard title="Catalog">
      <div className="space-y-0.5">
        <Row label="Total" value={counts.total} href="/admin/products" />
        <Row
          label="Published"
          value={counts.published}
          href="/admin/products?status=published"
        />
        <Row
          label="Out of stock"
          value={counts.outOfStock}
          href="/admin/products?stock=out_of_stock"
        />
        <Row
          label="Uncategorised"
          value={counts.uncategorized}
          href="/admin/products?uncategorized=1"
        />
      </div>
    </WidgetCard>
  );
}
