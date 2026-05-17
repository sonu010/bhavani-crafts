import type { ZeroResultSearch } from "@/lib/db/admin/dashboard";
import { WidgetCard } from "./widget-card";

export function ZeroResultSearchesWidget({
  searches,
}: {
  searches: ZeroResultSearch[];
}) {
  if (searches.length === 0) {
    return (
      <WidgetCard title="Searches with 0 results">
        <p className="text-sm text-stone-500">
          No empty searches in the last 14 days.
        </p>
      </WidgetCard>
    );
  }
  return (
    <WidgetCard title="Searches with 0 results">
      <ul className="space-y-1.5">
        {searches.map((s) => (
          <li
            key={s.query}
            className="flex items-baseline justify-between gap-3 text-sm"
          >
            <span className="truncate text-bark-900" title={s.query}>
              &ldquo;{s.query}&rdquo;
            </span>
            <span className="font-mono tabular-nums text-stone-500">
              {s.count}×
            </span>
          </li>
        ))}
      </ul>
    </WidgetCard>
  );
}
