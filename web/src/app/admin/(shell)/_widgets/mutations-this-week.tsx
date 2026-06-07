import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { MutationCount } from "@/lib/db/admin/dashboard";
import { WidgetCard } from "./widget-card";

/**
 * Each row links into /admin/activity with the action pre-filtered so
 * the owner can drill straight into "what changed?" rather than reading
 * a number off the dashboard with no path forward.
 */
export function MutationsThisWeekWidget({
  mutations,
}: {
  mutations: MutationCount[];
}) {
  if (mutations.length === 0) {
    return (
      <WidgetCard title="Mutations this week">
        <p className="text-sm text-stone-500">No catalog edits this week.</p>
      </WidgetCard>
    );
  }
  return (
    <WidgetCard title="Mutations this week">
      <ul className="space-y-0.5">
        {mutations.map((m) => (
          <li key={m.action}>
            <Link
              href={`/admin/activity?action=${encodeURIComponent(m.action)}`}
              className="group -mx-2 flex items-baseline justify-between gap-3 rounded px-2 py-1 text-sm transition-colors hover:bg-husk-100 focus-visible:bg-husk-100 focus-visible:outline-none"
            >
              <span
                className="flex items-center gap-1 truncate font-mono text-bark-900"
                title={m.action}
              >
                {m.action}
                <ArrowRight className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
              </span>
              <span className="font-mono tabular-nums text-stone-500">
                {m.count}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </WidgetCard>
  );
}
