import Link from "next/link";
import { requireAdminContext } from "@/lib/db/admin-context";
import {
  getTrashCounts,
  listTrashed,
  TRASH_ENTITY_LABELS,
  TRASH_ENTITY_TYPES,
  TRASH_PER_PAGE,
  type TrashEntityType,
} from "@/lib/db/admin/trash";
import { perfStart } from "@/lib/perf";
import { TrashTable } from "./trash-table";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Trash — Bhavani Crafts",
  robots: { index: false, follow: false },
};

interface SP {
  entity?: string | string[];
  page?: string | string[];
}

function pickOne(v: string | string[] | undefined): string | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

function isEntityType(v: string | null): v is TrashEntityType {
  return v !== null && (TRASH_ENTITY_TYPES as readonly string[]).includes(v);
}

function thirtyDaysAgo(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toLocaleDateString();
}

/**
 * `/admin/trash` — soft-delete recovery surface. ADR-006:
 *
 *   - Restore is reversible (no confirmation).
 *   - Hard delete requires typed-confirmation ("Type DELETE").
 *   - Bulk hard-delete is NOT exposed; only bulk restore.
 *   - 30-day retention is enforced by a Phase 5 cron (not built
 *     yet); the header surfaces the cutoff so the contract stays
 *     visible.
 */
export default async function TrashPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const t = perfStart("/admin/trash");
  const sp = await searchParams;
  const { admin } = await requireAdminContext();
  t.mark("auth");

  const entityRaw = pickOne(sp.entity);
  const entity: TrashEntityType = isEntityType(entityRaw)
    ? entityRaw
    : "products";

  const pageRaw = pickOne(sp.page);
  const page = pageRaw && /^\d+$/.test(pageRaw) ? Math.max(0, parseInt(pageRaw, 10)) : 0;

  const [{ rows, total }, counts] = await Promise.all([
    listTrashed(admin, entity, page),
    getTrashCounts(admin),
  ]);
  t.mark("fetch");
  t.end();

  const totalPages = Math.max(1, Math.ceil(total / TRASH_PER_PAGE));

  return (
    <div className="space-y-4">
      <header className="space-y-2">
        <h1 className="font-display text-2xl text-bark-900">Trash</h1>
        <p className="text-sm text-stone-500">
          Soft-deleted rows. Items older than{" "}
          <span className="font-mono">{thirtyDaysAgo()}</span> are subject to
          permanent removal by the 30-day retention sweep (Phase 5). Restore
          to recover; hard-delete now to permanently remove.
        </p>
      </header>

      {/* Tabs */}
      <nav
        aria-label="Trash sections"
        className="flex flex-wrap gap-2 border-b border-husk-200 pb-2"
      >
        {TRASH_ENTITY_TYPES.map((t) => {
          const isActive = t === entity;
          const c = counts[t] ?? 0;
          return (
            <Link
              key={t}
              href={`/admin/trash?entity=${t}`}
              aria-current={isActive ? "page" : undefined}
              className={[
                "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition",
                isActive
                  ? "bg-bark-900 text-paper-0"
                  : "border border-husk-200 bg-paper-0 text-stone-600 hover:bg-paper-50",
              ].join(" ")}
            >
              {TRASH_ENTITY_LABELS[t]}
              <span
                className={[
                  "rounded-full px-1.5 py-0 font-mono text-[10px]",
                  isActive
                    ? "bg-paper-0/20 text-paper-0"
                    : "bg-husk-100 text-stone-600",
                ].join(" ")}
              >
                {c}
              </span>
            </Link>
          );
        })}
      </nav>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-husk-200 bg-paper-0 p-6 text-sm text-stone-500">
          No items in Trash for {TRASH_ENTITY_LABELS[entity].toLowerCase()}.
        </p>
      ) : (
        <TrashTable rows={rows} entity={entity} />
      )}

      {totalPages > 1 ? (
        <nav className="flex items-center justify-end gap-2 text-sm">
          <span className="text-stone-500">
            Page {page + 1} of {totalPages}
          </span>
          {page > 0 ? (
            <Link
              href={`/admin/trash?entity=${entity}&page=${page - 1}`}
              className="rounded-md border border-husk-200 bg-paper-0 px-3 py-1.5 hover:bg-paper-50"
            >
              ← Prev
            </Link>
          ) : null}
          {page + 1 < totalPages ? (
            <Link
              href={`/admin/trash?entity=${entity}&page=${page + 1}`}
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
