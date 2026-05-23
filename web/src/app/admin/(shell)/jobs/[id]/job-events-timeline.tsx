"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { JobEventRow } from "@/lib/db/admin/jobs";

const LEVEL_PILL: Record<"info" | "warn" | "error", string> = {
  info: "bg-husk-100 text-stone-700",
  warn: "bg-saffron-50 text-clay-700",
  error: "bg-brick-50 text-brick-700",
};

/**
 * Vertical event list. Each row collapses its `data_json` payload
 * behind a chevron so the timeline stays scannable on busy jobs.
 */
export function JobEventsTimeline({ events }: { events: JobEventRow[] }) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-stone-500">
        No events yet. The worker writes a row on every meaningful step.
      </p>
    );
  }
  return (
    <ul className="space-y-1.5">
      {events.map((e) => (
        <EventRow key={e.id} event={e} />
      ))}
    </ul>
  );
}

function EventRow({ event }: { event: JobEventRow }) {
  const [open, setOpen] = useState(false);
  const hasData = event.data_json !== null && event.data_json !== undefined;
  return (
    <li className="rounded-md border border-husk-200/60 bg-paper-50 px-3 py-2 text-sm">
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase ${LEVEL_PILL[event.level]}`}
          >
            {event.level}
          </span>
          <span className="truncate text-bark-900">{event.message}</span>
        </div>
        <span className="shrink-0 font-mono text-[10px] text-stone-500">
          {new Date(event.created_at).toLocaleTimeString()}
        </span>
      </div>
      {hasData ? (
        <div className="mt-1">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1 font-mono text-[10px] text-stone-500 hover:text-bark-900"
          >
            <ChevronRight
              className={`size-3 transition-transform ${open ? "rotate-90" : ""}`}
            />
            {open ? "hide" : "show"} payload
          </button>
          {open ? (
            <pre className="mt-1 max-h-48 overflow-auto rounded-md border border-husk-200 bg-paper-0 p-2 text-[11px] text-bark-900">
              {JSON.stringify(event.data_json, null, 2)}
            </pre>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
