import Link from "next/link";
import type { AuditLogRow } from "@/lib/db/admin/audit";

/**
 * Table of audit rows. Server-rendered — clicks navigate via Link,
 * which preserves the rest of the URL (`?row=<id>` plus all filters).
 *
 * Mobile collapses to a card list (single column per row) following
 * the same pattern the products list uses.
 */
export function AuditTable({
  rows,
  activeRowId,
  sharedSearchString,
}: {
  rows: AuditLogRow[];
  activeRowId: string | null;
  sharedSearchString: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-husk-200 bg-paper-0 p-6 text-sm text-stone-500">
        No matching audit events.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-husk-200 bg-paper-0">
      <table className="hidden w-full text-sm md:table">
        <thead className="border-b border-husk-200 bg-paper-50 text-left">
          <tr>
            <th className="px-3 py-2 font-medium text-stone-600">When</th>
            <th className="px-3 py-2 font-medium text-stone-600">Action</th>
            <th className="px-3 py-2 font-medium text-stone-600">Entity</th>
            <th className="px-3 py-2 font-medium text-stone-600">Actor</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              className={`border-b border-husk-200/60 last:border-b-0 ${activeRowId === r.id ? "bg-saffron-50/60" : ""}`}
            >
              <td className="px-3 py-2 align-top font-mono text-xs text-stone-500">
                <Link
                  href={`?${(() => {
                    const p = new URLSearchParams(sharedSearchString);
                    p.set("row", r.id);
                    return p.toString();
                  })()}`}
                  className="hover:underline"
                >
                  {new Date(r.created_at).toLocaleString()}
                </Link>
              </td>
              <td className="px-3 py-2 align-top font-mono text-xs text-bark-900">
                {r.action}
              </td>
              <td className="px-3 py-2 align-top font-mono text-xs text-stone-600">
                <span className="text-stone-500">{r.entity_type}</span> ·{" "}
                <span className="text-bark-900">{r.entity_id.slice(0, 8)}</span>
              </td>
              <td className="px-3 py-2 align-top text-xs text-stone-600">
                {r.actor_name ?? r.actor_email ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="divide-y divide-husk-200/60 md:hidden">
        {rows.map((r) => (
          <li key={r.id}>
            <Link
              href={`?${(() => {
                const p = new URLSearchParams(sharedSearchString);
                p.set("row", r.id);
                return p.toString();
              })()}`}
              className={`block space-y-1 px-3 py-3 text-sm hover:bg-paper-50 ${activeRowId === r.id ? "bg-saffron-50/60" : ""}`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-xs text-bark-900">
                  {r.action}
                </span>
                <span className="font-mono text-[10px] text-stone-500">
                  {new Date(r.created_at).toLocaleString()}
                </span>
              </div>
              <div className="font-mono text-[11px] text-stone-500">
                {r.entity_type} · {r.entity_id.slice(0, 8)} ·{" "}
                {r.actor_name ?? r.actor_email ?? "—"}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
