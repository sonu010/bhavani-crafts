"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JOB_STATUSES, type JobStatus } from "@/lib/db/admin/jobs-public";

const STATUS_LABEL: Record<JobStatus, string> = {
  queued: "Queued",
  running: "Running",
  succeeded: "Succeeded",
  failed: "Failed",
  cancelled: "Cancelled",
};

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-husk-200 bg-paper-0 px-2 text-base md:text-sm text-bark-900 outline-none focus-visible:border-teal-800 focus-visible:ring-3 focus-visible:ring-teal-800/30";

/**
 * URL-driven filter bar. Status is a multi-toggle (chip group); kind
 * is a single-select dropdown built from the distinct list the server
 * page already loaded.
 */
export function JobsFilterBar({
  initial,
  kinds,
}: {
  initial: {
    statuses: JobStatus[];
    kind: string | null;
  };
  kinds: string[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [statuses, setStatuses] = useState<Set<JobStatus>>(
    () => new Set(initial.statuses),
  );
  const [kind, setKind] = useState(initial.kind ?? "");

  const toggleStatus = useCallback((s: JobStatus) => {
    setStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }, []);

  const sync = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("status");
    for (const s of statuses) next.append("status", s);
    if (kind) next.set("kind", kind);
    else next.delete("kind");
    const qs = next.toString();
    startTransition(() => {
      router.replace(qs ? `?${qs}` : "?", { scroll: false });
    });
  }, [statuses, kind, router, searchParams]);

  // Push to URL when filters change (debounced).
  useEffect(() => {
    const handle = setTimeout(sync, 200);
    return () => clearTimeout(handle);
  }, [sync]);

  const clear = () => {
    setStatuses(new Set());
    setKind("");
  };

  const hasAny = statuses.size > 0 || kind !== "";

  return (
    <div className="space-y-3 rounded-lg border border-husk-200 bg-paper-0 p-3">
      <div className="flex flex-wrap gap-2">
        {JOB_STATUSES.map((s) => {
          const active = statuses.has(s);
          return (
            <button
              key={s}
              type="button"
              onClick={() => toggleStatus(s)}
              className={[
                "rounded-full border px-3 py-1 text-xs font-medium transition",
                active
                  ? "border-teal-800 bg-teal-800/10 text-teal-900"
                  : "border-husk-200 bg-paper-0 text-stone-600 hover:bg-paper-50",
              ].join(" ")}
            >
              {STATUS_LABEL[s]}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="flex-1 text-sm">
          <span className="sr-only">Job kind</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className={SELECT_CLASS}
          >
            <option value="">All kinds</option>
            {kinds.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        {hasAny ? (
          <Button type="button" variant="outline" size="sm" onClick={clear}>
            <X className="size-3.5" />
            Clear
          </Button>
        ) : null}
      </div>
    </div>
  );
}
