/**
 * Tiny JSON diff renderer for the audit-log detail panel.
 *
 * Renders two JSONs (before, after) side-by-side, key-by-key at the
 * top level only. Deeply-nested changes show "<changed>" so the
 * owner sees "what shape was touched" without trying to scan a wall
 * of identical sub-trees.
 *
 * Not a general-purpose diff library — this exists to make the audit
 * viewer scannable, not to replace `react-diff-viewer`.
 */
import type { ReactElement } from "react";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [k: string]: JsonValue };

function isObj(v: unknown): v is { [k: string]: JsonValue } {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== "object" || typeof b !== "object") return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

function previewValue(v: unknown): string {
  if (v === null) return "null";
  if (v === undefined) return "—";
  if (typeof v === "string") return JSON.stringify(v);
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v))
    return v.length === 0 ? "[]" : `[${v.length} item${v.length === 1 ? "" : "s"}]`;
  return "{…}";
}

export interface DiffRow {
  key: string;
  status: "added" | "removed" | "changed" | "unchanged";
  before: string;
  after: string;
}

export function diff(before: unknown, after: unknown): DiffRow[] {
  const a = isObj(before) ? before : {};
  const b = isObj(after) ? after : {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const rows: DiffRow[] = [];
  for (const k of [...keys].sort()) {
    const hasA = k in a;
    const hasB = k in b;
    if (hasA && !hasB) {
      rows.push({ key: k, status: "removed", before: previewValue(a[k]), after: "—" });
    } else if (!hasA && hasB) {
      rows.push({ key: k, status: "added", before: "—", after: previewValue(b[k]) });
    } else if (!shallowEqual(a[k], b[k])) {
      rows.push({
        key: k,
        status: "changed",
        before: previewValue(a[k]),
        after: previewValue(b[k]),
      });
    } else {
      rows.push({
        key: k,
        status: "unchanged",
        before: previewValue(a[k]),
        after: previewValue(b[k]),
      });
    }
  }
  return rows;
}

export function JsonDiff({
  before,
  after,
}: {
  before: unknown;
  after: unknown;
}): ReactElement {
  const rows = diff(before, after);
  if (rows.length === 0) {
    return (
      <p className="text-sm text-stone-500">
        No fields recorded — this audit row carries only a timestamp + actor.
      </p>
    );
  }
  return (
    <table className="w-full text-xs">
      <thead className="border-b border-husk-200/70 bg-paper-50 text-left">
        <tr>
          <th className="px-2 py-1 font-medium text-stone-600">Field</th>
          <th className="px-2 py-1 font-medium text-stone-600">Before</th>
          <th className="px-2 py-1 font-medium text-stone-600">After</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr
            key={r.key}
            className={`border-b border-husk-200/40 ${
              r.status === "added"
                ? "bg-moss-50/50"
                : r.status === "removed"
                  ? "bg-brick-50/50"
                  : r.status === "changed"
                    ? "bg-saffron-50/50"
                    : ""
            }`}
          >
            <td className="px-2 py-1 align-top font-mono text-bark-900">
              {r.key}
              {r.status !== "unchanged" ? (
                <span className="ml-1 font-mono text-[10px] text-stone-500">
                  {r.status}
                </span>
              ) : null}
            </td>
            <td className="px-2 py-1 align-top font-mono text-stone-600">
              {r.before}
            </td>
            <td className="px-2 py-1 align-top font-mono text-bark-900">
              {r.after}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
