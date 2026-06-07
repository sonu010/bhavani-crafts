import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type { ZeroResultSearch } from "@/lib/db/admin/dashboard";
import { WidgetCard } from "./widget-card";

/**
 * Each row links to the storefront's /search?q=<query> in a new tab,
 * so the owner can see exactly what a customer saw (the empty-state)
 * + decide whether to add the product, the tag, or a search synonym.
 * Used to be a read-only display.
 */
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
      <ul className="space-y-0.5">
        {searches.map((s) => (
          <li key={s.query}>
            <Link
              href={`/search?q=${encodeURIComponent(s.query)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="group -mx-2 flex items-baseline justify-between gap-3 rounded px-2 py-1 text-sm transition-colors hover:bg-husk-100 focus-visible:bg-husk-100 focus-visible:outline-none"
            >
              <span
                className="flex items-center gap-1 truncate text-bark-900"
                title={s.query}
              >
                <span className="truncate">&ldquo;{s.query}&rdquo;</span>
                <ExternalLink className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
              </span>
              <span className="font-mono tabular-nums text-stone-500">
                {s.count}×
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </WidgetCard>
  );
}
