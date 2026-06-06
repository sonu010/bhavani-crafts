import Link from "next/link";
import { requireAdminContext } from "@/lib/db/admin-context";
import { listDistinctJobKinds, listJobs } from "@/lib/db/admin/jobs";
import { JOB_STATUSES, type JobStatus } from "@/lib/db/admin/jobs-public";
import { perfStart } from "@/lib/perf";
import { JobsTable } from "./jobs-table";
import { JobsFilterBar } from "./filter-bar";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Background jobs",
  robots: { index: false, follow: false },
};

interface SP {
  status?: string | string[];
  kind?: string | string[];
}

function statusFilter(raw: string | string[] | undefined): JobStatus[] | null {
  if (!raw) return null;
  const arr = Array.isArray(raw) ? raw : [raw];
  const ok = arr.filter((s): s is JobStatus =>
    (JOB_STATUSES as string[]).includes(s),
  );
  return ok.length > 0 ? ok : null;
}

function pickOne(v: string | string[] | undefined): string | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

/**
 * Background jobs index. Polling lives client-side in `<JobsTable>`;
 * the server fetches the initial snapshot.
 */
export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const t = perfStart("/admin/jobs");
  const sp = await searchParams;
  const { admin } = await requireAdminContext();
  t.mark("auth");

  const filters = {
    statuses: statusFilter(sp.status),
    kind: pickOne(sp.kind),
  };

  const [jobs, kinds] = await Promise.all([
    listJobs(admin, filters),
    listDistinctJobKinds(admin),
  ]);
  t.mark("fetch");
  t.end();

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl text-bark-900">Background jobs</h1>
          <p className="text-sm text-stone-500">
            {jobs.length === 0
              ? "No jobs yet. CSV imports and bulk operations land here."
              : `${jobs.length} job${jobs.length === 1 ? "" : "s"} in the recent window.`}
          </p>
        </div>
      </header>

      <JobsFilterBar
        initial={{
          statuses: filters.statuses ?? [],
          kind: filters.kind,
        }}
        kinds={kinds}
      />

      {jobs.length === 0 ? (
        <p className="rounded-lg border border-husk-200 bg-paper-0 p-6 text-sm text-stone-500">
          No matching jobs. Try{" "}
          <Link
            href="/admin/jobs"
            className="text-teal-800 underline-offset-2 hover:underline"
          >
            clearing filters
          </Link>
          .
        </p>
      ) : (
        <JobsTable initialJobs={jobs} />
      )}
    </div>
  );
}
