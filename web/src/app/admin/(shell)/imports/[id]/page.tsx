import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireAdminContext } from "@/lib/db/admin-context";
import {
  getImportRowSummary,
  getImportRun,
  listImportRunRows,
  type ImportAction,
} from "@/lib/db/admin/imports";
import { RunImportButton } from "./run-import-button";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Import — Bhavani Crafts",
  robots: { index: false, follow: false },
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ACTION_PILL: Record<string, string> = {
  create: "bg-moss-50 text-moss-800",
  update: "bg-teal-50 text-teal-800",
  skip: "bg-husk-100 text-stone-700",
  error: "bg-brick-50 text-brick-700",
};

const STATUS_PILL: Record<string, string> = {
  queued: "bg-husk-200 text-stone-700",
  running: "bg-teal-50 text-teal-800",
  succeeded: "bg-moss-100 text-moss-800",
  failed: "bg-brick-50 text-brick-700",
  cancelled: "bg-husk-200 text-stone-500",
};

/**
 * Preview / report view. Branches on `status`:
 *   - succeeded with no `applied_at` rows → preview (post-validate);
 *     show counts + per-row table + Run import button.
 *   - succeeded with applied rows → report; same view + applied
 *     timestamps; Run import becomes "Re-run remaining" if any
 *     unsapplied rows exist (in practice the action filter handles
 *     that).
 *   - failed → highlight at top with retry CTA.
 */
export default async function ImportRunDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ action?: string | string[]; page?: string | string[] }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const sp = await searchParams;

  const { admin } = await requireAdminContext();
  const run = await getImportRun(admin, id);
  if (!run) notFound();

  const actionFilter = (() => {
    const raw = Array.isArray(sp.action) ? sp.action[0] : sp.action;
    if (raw && ["create", "update", "skip", "error"].includes(raw)) {
      return raw as ImportAction;
    }
    return null;
  })();
  const page = (() => {
    const raw = Array.isArray(sp.page) ? sp.page[0] : sp.page;
    return raw && /^\d+$/.test(raw) ? Math.max(0, parseInt(raw, 10)) : 0;
  })();

  const [summary, paged] = await Promise.all([
    getImportRowSummary(admin, id),
    listImportRunRows(admin, id, { action: actionFilter, page, perPage: 100 }),
  ]);

  const counts = summary.byAction;
  const PER_PAGE = 100;
  const totalPages = Math.max(1, Math.ceil(paged.total / PER_PAGE));
  const appliedCount = paged.rows.filter((r) => r.applied_at !== null).length;
  const canRun =
    (counts.create ?? 0) + (counts.update ?? 0) > 0 &&
    run.status !== "running";

  const baseParams = (excludeKey?: "action" | "page") => {
    const p = new URLSearchParams();
    if (actionFilter && excludeKey !== "action") p.set("action", actionFilter);
    return p;
  };

  return (
    <div className="space-y-4">
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm">
        <Link
          href="/admin/imports"
          className="inline-flex items-center gap-1 text-stone-500 underline-offset-2 hover:text-bark-900 hover:underline"
        >
          <ChevronLeft className="size-4" />
          Imports
        </Link>
        <span aria-hidden className="text-stone-500">
          /
        </span>
        <span className="truncate font-mono text-bark-900">{run.filename ?? id}</span>
      </nav>

      <header className="rounded-lg border border-husk-200 bg-paper-0 p-4 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="font-mono text-xs text-stone-500">
              {new Date(run.created_at).toLocaleString()}
              {run.finished_at
                ? ` · finished ${new Date(run.finished_at).toLocaleString()}`
                : ""}
            </p>
            <p className="text-lg font-medium text-bark-900">
              {run.filename ?? "(unnamed)"}
            </p>
          </div>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[10px] uppercase ${STATUS_PILL[run.status] ?? "bg-husk-200 text-stone-700"}`}
          >
            {run.status}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <SummaryStat label="Create" value={counts.create ?? 0} tone="moss" />
          <SummaryStat label="Update" value={counts.update ?? 0} tone="teal" />
          <SummaryStat label="Skip" value={counts.skip ?? 0} tone="stone" />
          <SummaryStat label="Errors" value={counts.error ?? 0} tone="brick" />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <RunImportButton runId={run.id} disabled={!canRun} />
          {appliedCount > 0 ? (
            <span className="inline-flex items-center font-mono text-xs text-stone-500">
              {appliedCount} row{appliedCount === 1 ? "" : "s"} on this page applied
            </span>
          ) : null}
        </div>
      </header>

      {/* Filter chips */}
      <nav aria-label="Filter by action" className="flex flex-wrap gap-1.5">
        <FilterChip current={actionFilter} value={null}>
          All {summary.total}
        </FilterChip>
        {(["create", "update", "skip", "error"] as const).map((a) => (
          <FilterChip key={a} current={actionFilter} value={a}>
            {a} {counts[a] ?? 0}
          </FilterChip>
        ))}
      </nav>

      <div className="overflow-hidden rounded-lg border border-husk-200 bg-paper-0">
        {paged.rows.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-stone-500">
            No rows match this filter.
          </p>
        ) : (
          <ul className="divide-y divide-husk-200/60 text-sm">
            {paged.rows.map((r) => (
              <li key={r.id} className="space-y-1 px-3 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-mono text-xs text-stone-500">
                    row {r.row_number} · {r.sku ?? "—"}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase ${ACTION_PILL[r.action ?? "skip"] ?? "bg-husk-100 text-stone-700"}`}
                  >
                    {r.action ?? "skip"}
                  </span>
                </div>
                {r.error_message ? (
                  <p className="font-mono text-xs text-brick-700">
                    {r.error_message}
                  </p>
                ) : null}
                {r.applied_at ? (
                  <p className="font-mono text-[10px] text-moss-700">
                    applied {new Date(r.applied_at).toLocaleString()}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {totalPages > 1 ? (
        <nav className="flex items-center justify-end gap-2 text-sm">
          <span className="text-stone-500">
            Page {page + 1} of {totalPages}
          </span>
          {page > 0 ? (
            <Link
              href={`?${(() => {
                const p = baseParams();
                if (page - 1 > 0) p.set("page", String(page - 1));
                return p.toString();
              })()}`}
              className="rounded-md border border-husk-200 bg-paper-0 px-3 py-1.5 hover:bg-paper-50"
            >
              ← Prev
            </Link>
          ) : null}
          {page + 1 < totalPages ? (
            <Link
              href={`?${(() => {
                const p = baseParams();
                p.set("page", String(page + 1));
                return p.toString();
              })()}`}
              className="rounded-md border border-husk-200 bg-paper-0 px-3 py-1.5 hover:bg-paper-50"
            >
              Next →
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}

function SummaryStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "moss" | "teal" | "stone" | "brick";
}) {
  const tones = {
    moss: "bg-moss-50 text-moss-800",
    teal: "bg-teal-50 text-teal-800",
    stone: "bg-husk-100 text-stone-700",
    brick: "bg-brick-50 text-brick-700",
  };
  return (
    <div className={`rounded-md p-2 ${tones[tone]}`}>
      <p className="font-mono text-[10px] uppercase opacity-80">{label}</p>
      <p className="font-mono text-2xl">{value}</p>
    </div>
  );
}

function FilterChip({
  current,
  value,
  children,
}: {
  current: ImportAction | null;
  value: ImportAction | null;
  children: React.ReactNode;
}) {
  const active = current === value;
  const sp = new URLSearchParams();
  if (value) sp.set("action", value);
  const href = sp.toString() ? `?${sp.toString()}` : "?";
  return (
    <Link
      href={href}
      className={[
        "rounded-full border px-3 py-1 text-xs font-medium transition",
        active
          ? "border-teal-800 bg-teal-800/10 text-teal-900"
          : "border-husk-200 bg-paper-0 text-stone-600 hover:bg-paper-50",
      ].join(" ")}
    >
      {children}
    </Link>
  );
}
