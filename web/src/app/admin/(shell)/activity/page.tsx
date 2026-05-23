import Link from "next/link";
import { requireAdminContext } from "@/lib/db/admin-context";
import {
  AUDIT_PER_PAGE,
  getAuditLog,
  listAuditLogs,
  listDistinctActions,
  listDistinctEntityTypes,
  type AuditCursor,
} from "@/lib/db/admin/audit";
import { JsonDiff } from "@/lib/utils/json-diff";
import { perfStart } from "@/lib/perf";
import { AuditTable } from "./audit-table";
import { FilterBar } from "./filter-bar";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Audit log — Bhavani Crafts",
  robots: { index: false, follow: false },
};

interface SP {
  action?: string | string[];
  entity_type?: string | string[];
  entity_id?: string | string[];
  since?: string | string[];
  until?: string | string[];
  cursor?: string | string[];
  row?: string | string[];
}

function pickOne(v: string | string[] | undefined): string | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

function parseCursor(raw: string | null): AuditCursor | null {
  if (!raw) return null;
  try {
    const decoded = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (
      typeof decoded?.created_at === "string" &&
      typeof decoded?.id === "string"
    ) {
      return decoded;
    }
  } catch {
    // fallthrough
  }
  return null;
}

function encodeCursor(c: AuditCursor): string {
  return Buffer.from(JSON.stringify(c), "utf8").toString("base64url");
}

function dateBoundary(raw: string | null, end: boolean): string | null {
  if (!raw) return null;
  // The input is yyyy-mm-dd. Normalize to inclusive boundaries: start
  // of day for `since`, end of day for `until`.
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
  if (!parsed) return null;
  return end ? `${parsed}T23:59:59.999Z` : `${parsed}T00:00:00.000Z`;
}

/**
 * `/admin/activity` — paginated, filterable view over `audit_logs`.
 * Row-detail panel opens via `?row=<id>` so links are shareable.
 *
 * Distinct actions + entity types are pulled once for the filter
 * combobox. They could be cached with `unstable_cache(..., {
 * tags: ['audit-actions'], revalidate: 60 })` later — under the
 * MVP traffic level the SELECT DISTINCT is fine.
 */
export default async function AuditActivityPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const t = perfStart("/admin/activity");
  const sp = await searchParams;
  const { admin } = await requireAdminContext();
  t.mark("auth");

  const filters = {
    action: pickOne(sp.action),
    entityType: pickOne(sp.entity_type),
    entityId: pickOne(sp.entity_id),
    since: dateBoundary(pickOne(sp.since), false),
    until: dateBoundary(pickOne(sp.until), true),
  };
  const cursor = parseCursor(pickOne(sp.cursor));
  const rowId = pickOne(sp.row);

  const [{ rows, nextCursor }, actions, entityTypes, rowDetail] =
    await Promise.all([
      listAuditLogs(admin, filters, cursor),
      listDistinctActions(admin),
      listDistinctEntityTypes(admin),
      rowId ? getAuditLog(admin, rowId) : Promise.resolve(null),
    ]);
  t.mark("fetch");
  t.end();

  const sharedParams = new URLSearchParams();
  for (const [k, v] of Object.entries({
    action: filters.action,
    entity_type: filters.entityType,
    entity_id: filters.entityId,
    since: pickOne(sp.since),
    until: pickOne(sp.until),
  })) {
    if (v) sharedParams.set(k, v);
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl text-bark-900">Audit log</h1>
          <p className="text-sm text-stone-500">
            Every admin mutation, append-only. {rows.length}{" "}
            row{rows.length === 1 ? "" : "s"}
            {nextCursor ? " · more available" : ""}.
          </p>
        </div>
      </header>

      <FilterBar
        initial={{
          action: filters.action,
          entityType: filters.entityType,
          entityId: filters.entityId,
          since: pickOne(sp.since),
          until: pickOne(sp.until),
        }}
        actions={actions}
        entityTypes={entityTypes}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <AuditTable
          rows={rows}
          activeRowId={rowId}
          sharedSearchString={sharedParams.toString()}
        />
        <aside className="rounded-lg border border-husk-200 bg-paper-0 p-4 lg:sticky lg:top-4 lg:self-start">
          {rowDetail ? (
            <div className="space-y-3 text-sm">
              <div>
                <p className="font-mono text-xs text-stone-500">
                  {new Date(rowDetail.created_at).toLocaleString()}
                </p>
                <p className="font-medium text-bark-900">{rowDetail.action}</p>
                <p className="font-mono text-xs text-stone-500">
                  {rowDetail.entity_type} · {rowDetail.entity_id}
                </p>
                <p className="font-mono text-xs text-stone-500">
                  actor:{" "}
                  {rowDetail.actor_name ??
                    rowDetail.actor_email ??
                    rowDetail.actor_id ??
                    "—"}
                </p>
              </div>
              <div className="border-t border-husk-200/60 pt-3">
                <JsonDiff
                  before={rowDetail.before_json}
                  after={rowDetail.after_json}
                />
              </div>
            </div>
          ) : (
            <p className="text-sm text-stone-500">
              Click a row to view its before/after diff.
            </p>
          )}
        </aside>
      </div>

      <nav className="flex justify-end gap-2">
        {cursor ? (
          <Link
            href={`?${(() => {
              const p = new URLSearchParams(sharedParams.toString());
              p.delete("cursor");
              return p.toString();
            })()}`}
            className="rounded-md border border-husk-200 bg-paper-0 px-3 py-1.5 text-sm text-bark-900 hover:bg-paper-50"
          >
            ← First page
          </Link>
        ) : null}
        {nextCursor ? (
          <Link
            href={`?${(() => {
              const p = new URLSearchParams(sharedParams.toString());
              p.set("cursor", encodeCursor(nextCursor));
              return p.toString();
            })()}`}
            className="rounded-md border border-husk-200 bg-paper-0 px-3 py-1.5 text-sm text-bark-900 hover:bg-paper-50"
          >
            Next {AUDIT_PER_PAGE} →
          </Link>
        ) : null}
      </nav>
    </div>
  );
}
