import type { MutationCount } from "@/lib/db/admin/dashboard";
import { WidgetCard } from "./widget-card";

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
      <ul className="space-y-1.5">
        {mutations.map((m) => (
          <li
            key={m.action}
            className="flex items-baseline justify-between gap-3 text-sm"
          >
            <span className="font-mono text-bark-900" title={m.action}>
              {m.action}
            </span>
            <span className="font-mono tabular-nums text-stone-500">
              {m.count}
            </span>
          </li>
        ))}
      </ul>
    </WidgetCard>
  );
}
