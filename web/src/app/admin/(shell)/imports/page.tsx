import Link from "next/link";
import { requireAdminContext } from "@/lib/db/admin-context";
import { listImportRuns } from "@/lib/db/admin/imports";
import { perfStart } from "@/lib/perf";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Imports",
  robots: { index: false, follow: false },
};

const STATUS_PILL: Record<string, string> = {
  queued: "bg-husk-200 text-stone-700",
  running: "bg-teal-50 text-teal-800",
  succeeded: "bg-moss-100 text-moss-800",
  failed: "bg-brick-50 text-brick-700",
  cancelled: "bg-husk-200 text-stone-500",
};

/**
 * `/admin/imports` — the CSV-import history. Each row links into the
 * preview / report view at `/admin/imports/[id]`.
 */
export default async function ImportsPage() {
  const t = perfStart("/admin/imports");
  const { admin } = await requireAdminContext();
  t.mark("auth");
  const runs = await listImportRuns(admin);
  t.mark("fetch");
  t.end();

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl text-bark-900">Imports</h1>
          <p className="text-sm text-stone-500">
            CSV imports. Upload validates first; nothing touches the
            catalog until you click <span className="font-mono">Run import</span>.
          </p>
        </div>
        <Link
          href="/admin/imports/new"
          className="inline-flex items-center justify-center rounded-md border border-husk-200 bg-paper-0 px-3 py-1.5 text-sm font-medium text-bark-900 hover:bg-paper-50"
        >
          + New import
        </Link>
      </header>

      {runs.length === 0 ? (
        <p className="rounded-lg border border-husk-200 bg-paper-0 p-6 text-sm text-stone-500">
          No imports yet.{" "}
          <Link
            href="/admin/imports/new"
            className="text-teal-800 underline-offset-2 hover:underline"
          >
            Start your first →
          </Link>
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-husk-200 bg-paper-0">
          <ul className="divide-y divide-husk-200/60">
            {runs.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/admin/imports/${r.id}`}
                  className="block px-3 py-3 hover:bg-paper-50"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate font-mono text-sm text-bark-900">
                      {r.filename ?? "(unnamed)"}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase ${STATUS_PILL[r.status] ?? "bg-husk-100 text-stone-700"}`}
                    >
                      {r.status}
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-xs text-stone-500">
                    {new Date(r.created_at).toLocaleString()} · {r.total_rows}{" "}
                    rows · {r.success_count} ok · {r.error_count} errors
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
