import Link from "next/link";
import type { RunningJob } from "@/lib/db/admin/dashboard";
import { WidgetCard } from "./widget-card";

function pct(progress: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((progress / total) * 100)));
}

/**
 * Each row is a Link straight to /admin/jobs/<id> so the owner can
 * jump from a 20%-progress bar to the full job detail (events log,
 * error context, retry button) without searching the jobs list.
 *
 * Empty-state links to /admin/jobs so the owner can see history even
 * when nothing is currently running.
 */
export function RunningJobsWidget({ jobs }: { jobs: RunningJob[] }) {
  if (jobs.length === 0) {
    return (
      <WidgetCard title="Background jobs">
        <p className="text-sm text-stone-500">No running or queued jobs.</p>
        <Link
          href="/admin/jobs"
          className="mt-2 inline-flex text-xs text-teal-800 underline-offset-2 hover:underline"
        >
          View history →
        </Link>
      </WidgetCard>
    );
  }
  return (
    <WidgetCard title="Background jobs">
      <ul className="space-y-2">
        {jobs.map((j) => {
          const p = pct(j.progress, j.total);
          return (
            <li key={j.id}>
              <Link
                href={`/admin/jobs/${j.id}`}
                className="group block space-y-1 rounded px-1 py-0.5 transition-colors hover:bg-husk-100 focus-visible:bg-husk-100 focus-visible:outline-none"
              >
                <div className="flex items-baseline justify-between text-sm">
                  <span
                    className="font-mono text-bark-900 group-hover:underline"
                    title={j.kind}
                  >
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
              </Link>
            </li>
          );
        })}
      </ul>
    </WidgetCard>
  );
}
