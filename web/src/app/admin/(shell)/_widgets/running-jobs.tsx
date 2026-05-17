import type { RunningJob } from "@/lib/db/admin/dashboard";
import { WidgetCard } from "./widget-card";

function pct(progress: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((progress / total) * 100)));
}

export function RunningJobsWidget({ jobs }: { jobs: RunningJob[] }) {
  if (jobs.length === 0) {
    return (
      <WidgetCard title="Background jobs">
        <p className="text-sm text-stone-500">No running or queued jobs.</p>
      </WidgetCard>
    );
  }
  return (
    <WidgetCard title="Background jobs">
      <ul className="space-y-2">
        {jobs.map((j) => {
          const p = pct(j.progress, j.total);
          return (
            <li key={j.id} className="space-y-1">
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-mono text-bark-900" title={j.kind}>
                  {j.kind}
                </span>
                <span className="font-mono tabular-nums text-stone-500">
                  {p}%
                </span>
              </div>
              <div
                aria-label={`${j.kind} ${p}% complete`}
                className="h-1.5 w-full overflow-hidden rounded-full bg-husk-200"
              >
                <div
                  className={
                    j.status === "running"
                      ? "h-full bg-teal-800"
                      : "h-full bg-stone-500"
                  }
                  style={{ width: `${p}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </WidgetCard>
  );
}
