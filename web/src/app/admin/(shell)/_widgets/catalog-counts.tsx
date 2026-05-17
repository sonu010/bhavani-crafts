import type { CatalogCounts } from "@/lib/db/admin/dashboard";
import { WidgetCard } from "./widget-card";

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-sm text-stone-500">{label}</span>
      <span className="font-mono text-base tabular-nums text-bark-900">
        {value.toLocaleString()}
      </span>
    </div>
  );
}

export function CatalogCountsWidget({ counts }: { counts: CatalogCounts }) {
  return (
    <WidgetCard title="Catalog">
      <div className="space-y-1.5">
        <Row label="Total" value={counts.total} />
        <Row label="Published" value={counts.published} />
        <Row label="Out of stock" value={counts.outOfStock} />
        <Row label="Uncategorised" value={counts.uncategorized} />
      </div>
    </WidgetCard>
  );
}
