"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { JobRow } from "@/lib/db/admin/jobs";
import {
  TERMINAL_STATUSES,
  type JobStatus,
} from "@/lib/db/admin/jobs-public";

const STATUS_PILL: Record<JobStatus, string> = {
  queued: "bg-husk-200 text-stone-700",
  running: "bg-teal-50 text-teal-800",
  succeeded: "bg-moss-100 text-moss-800",
  failed: "bg-brick-50 text-brick-700",
  cancelled: "bg-husk-200 text-stone-500",
};

const POLL_MS = 2000;

/**
 * Jobs table with live polling. Polls every 2s while any visible job
 * is non-terminal; stops once everything is terminal so we don't beat
 * the DB for no reason. The poll itself just calls
 * `router.refresh()` — Next handles re-running the page's server
 * fetches with the current search params.
 */
export function JobsTable({
  initialJobs,
}: {
  initialJobs: JobRow[];
}) {
  const router = useRouter();
  const [jobs] = useState(initialJobs);

  const anyActive = jobs.some((j) => !TERMINAL_STATUSES.has(j.status));

  useEffect(() => {
    if (!anyActive) return;
    const handle = setInterval(() => {
      router.refresh();
    }, POLL_MS);
    return () => clearInterval(handle);
  }, [anyActive, router]);

  return (
    <div className="overflow-hidden rounded-lg border border-husk-200 bg-paper-0">
      <table className="hidden w-full text-sm md:table">
        <thead className="border-b border-husk-200 bg-paper-50 text-left">
          <tr>
            <th className="px-3 py-2 font-medium text-stone-600">Kind</th>
            <th className="px-3 py-2 font-medium text-stone-600">Status</th>
            <th className="px-3 py-2 font-medium text-stone-600">Progress</th>
            <th className="px-3 py-2 font-medium text-stone-600">Created</th>
            <th className="px-3 py-2 font-medium text-stone-600">Finished</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => (
            <tr key={j.id} className="border-b border-husk-200/60 last:border-b-0">
              <td className="px-3 py-2 align-top">
                <Link
                  href={`/admin/jobs/${j.id}`}
                  className="font-mono text-xs text-bark-900 hover:underline"
                >
                  {j.kind}
                </Link>
              </td>
              <td className="px-3 py-2 align-top">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase ${STATUS_PILL[j.status]}`}
                >
                  {j.status === "running" ? (
                    <span className="size-1.5 animate-pulse rounded-full bg-teal-800" />
                  ) : null}
                  {j.status}
                </span>
              </td>
              <td className="px-3 py-2 align-top">
                <ProgressBar progress={j.progress} total={j.total} status={j.status} />
              </td>
              <td className="px-3 py-2 align-top font-mono text-xs text-stone-500">
                {new Date(j.created_at).toLocaleString()}
              </td>
              <td className="px-3 py-2 align-top font-mono text-xs text-stone-500">
                {j.finished_at ? new Date(j.finished_at).toLocaleString() : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="divide-y divide-husk-200/60 md:hidden">
        {jobs.map((j) => (
          <li key={j.id}>
            <Link
              href={`/admin/jobs/${j.id}`}
              className="block space-y-1.5 px-3 py-3 text-sm hover:bg-paper-50"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-xs text-bark-900">{j.kind}</span>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[10px] uppercase ${STATUS_PILL[j.status]}`}
                >
                  {j.status}
                </span>
              </div>
              <ProgressBar progress={j.progress} total={j.total} status={j.status} />
              <div className="font-mono text-[10px] text-stone-500">
                created {new Date(j.created_at).toLocaleString()}
                {j.finished_at
                  ? ` · finished ${new Date(j.finished_at).toLocaleString()}`
                  : ""}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProgressBar({
  progress,
  total,
  status,
}: {
  progress: number;
  total: number;
  status: JobStatus;
}) {
  if (total === 0) return <span className="text-xs text-stone-400">—</span>;
  const pct = Math.min(100, Math.round((progress / total) * 100));
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-1.5 w-24 overflow-hidden rounded-full bg-husk-200"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`h-full ${status === "failed" ? "bg-brick-500" : "bg-teal-800"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="font-mono text-[10px] text-stone-500">
        {progress}/{total}
      </span>
    </div>
  );
}
