import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireAdminContext } from "@/lib/db/admin-context";
import { getJob, listJobEvents } from "@/lib/db/admin/jobs";
import { JobActions } from "./job-actions";
import { JobEventsTimeline } from "./job-events-timeline";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Job — Bhavani Crafts",
  robots: { index: false, follow: false },
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const { admin } = await requireAdminContext();
  const [job, events] = await Promise.all([
    getJob(admin, id),
    listJobEvents(admin, id),
  ]);
  if (!job) notFound();

  return (
    <div className="space-y-4">
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm">
        <Link
          href="/admin/jobs"
          className="inline-flex items-center gap-1 text-stone-500 underline-offset-2 hover:text-bark-900 hover:underline"
        >
          <ChevronLeft className="size-4" />
          Jobs
        </Link>
        <span aria-hidden className="text-stone-500">
          /
        </span>
        <span className="font-mono text-bark-900">{job.kind}</span>
      </nav>

      <header className="rounded-lg border border-husk-200 bg-paper-0 p-4 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="font-mono text-xs text-stone-500">
              {new Date(job.created_at).toLocaleString()}
            </p>
            <p className="text-lg font-medium text-bark-900">{job.kind}</p>
            <p className="font-mono text-xs text-stone-500">id {job.id}</p>
          </div>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[10px] uppercase ${pillFor(job.status)}`}
          >
            {job.status}
          </span>
        </div>

        {job.total > 0 ? (
          <div className="mt-4">
            <p className="font-mono text-xs text-stone-500">
              {job.progress}/{job.total}
            </p>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-husk-200">
              <div
                className={`h-full ${job.status === "failed" ? "bg-brick-500" : "bg-teal-800"}`}
                style={{
                  width: `${Math.min(100, Math.round((job.progress / Math.max(1, job.total)) * 100))}%`,
                }}
              />
            </div>
          </div>
        ) : null}

        {job.error ? (
          <pre className="mt-4 max-h-64 overflow-auto rounded-md border border-brick-300/60 bg-brick-50 p-3 text-xs text-brick-700">
            {job.error}
          </pre>
        ) : null}

        <div className="mt-4 grid grid-cols-1 gap-3 text-xs sm:grid-cols-3">
          <Stat
            label="Started"
            value={
              job.started_at ? new Date(job.started_at).toLocaleString() : "—"
            }
          />
          <Stat
            label="Finished"
            value={
              job.finished_at ? new Date(job.finished_at).toLocaleString() : "—"
            }
          />
          <Stat label="Created by" value={job.created_by ?? "—"} />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <JobActions jobId={job.id} status={job.status} />
        </div>
      </header>

      <section className="rounded-lg border border-husk-200 bg-paper-0 p-4 sm:p-6">
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-stone-500">
          Event timeline
        </h2>
        <JobEventsTimeline events={events} />
      </section>

      {job.payload_json !== null || job.result_json !== null || job.checkpoint !== null ? (
        <section className="rounded-lg border border-husk-200 bg-paper-0 p-4 sm:p-6">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-stone-500">
            Payload + result
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <JsonBlock label="payload" json={job.payload_json} />
            <JsonBlock label="result" json={job.result_json} />
            <JsonBlock label="checkpoint" json={job.checkpoint} />
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase text-stone-500">{label}</p>
      <p className="truncate font-mono text-bark-900">{value}</p>
    </div>
  );
}

function JsonBlock({ label, json }: { label: string; json: unknown }) {
  if (json === null || json === undefined) return null;
  return (
    <div>
      <p className="font-mono text-[10px] uppercase text-stone-500">{label}</p>
      <pre className="mt-1 max-h-64 overflow-auto rounded-md border border-husk-200 bg-paper-50 p-2 text-xs text-bark-900">
        {JSON.stringify(json, null, 2)}
      </pre>
    </div>
  );
}

function pillFor(status: string): string {
  switch (status) {
    case "queued":
      return "bg-husk-200 text-stone-700";
    case "running":
      return "bg-teal-50 text-teal-800";
    case "succeeded":
      return "bg-moss-100 text-moss-800";
    case "failed":
      return "bg-brick-50 text-brick-700";
    case "cancelled":
      return "bg-husk-200 text-stone-500";
    default:
      return "bg-husk-200 text-stone-700";
  }
}
