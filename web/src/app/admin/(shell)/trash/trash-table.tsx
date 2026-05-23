"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  TRASH_ENTITY_LABELS,
  type TrashEntityType,
  type TrashedRow,
} from "@/lib/db/admin/trash-public";
import { bulkRestoreAction, restoreEntityAction } from "./actions";
import { HardDeleteDialog } from "./hard-delete-dialog";

/**
 * Trashed-row table. Server passes rows; we manage:
 *   - selection set (for bulk restore)
 *   - the hard-delete dialog target
 *
 * Bulk hard-delete is intentionally absent — ADR-006.
 */
export function TrashTable({
  rows,
  entity,
}: {
  rows: TrashedRow[];
  entity: TrashEntityType;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hardDeleteTarget, setHardDeleteTarget] = useState<TrashedRow | null>(
    null,
  );
  const [bulkRestoring, startBulkRestore] = useTransition();

  const allSelected = useMemo(
    () => rows.length > 0 && rows.every((r) => selected.has(r.id)),
    [rows, selected],
  );

  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      if (rows.every((r) => prev.has(r.id))) {
        const next = new Set(prev);
        for (const r of rows) next.delete(r.id);
        return next;
      }
      const next = new Set(prev);
      for (const r of rows) next.add(r.id);
      return next;
    });
  }, [rows]);

  const toggleOne = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const onRestoreOne = useCallback(
    (id: string, label: string) => {
      (async () => {
        const r = await restoreEntityAction(entity, id);
        if (r.ok) {
          toast.success(`Restored "${r.label || label}"`);
          router.refresh();
        } else {
          toast.error("Could not restore");
        }
      })();
    },
    [entity, router],
  );

  const onBulkRestore = useCallback(() => {
    if (selected.size === 0) return;
    if (
      !window.confirm(
        `Restore ${selected.size} ${TRASH_ENTITY_LABELS[entity].toLowerCase()}?`,
      )
    )
      return;
    startBulkRestore(async () => {
      const r = await bulkRestoreAction(entity, [...selected]);
      if (r.ok) {
        toast.success(
          `Restored ${r.count} ${TRASH_ENTITY_LABELS[entity].toLowerCase()}`,
        );
        setSelected(new Set());
        router.refresh();
      } else {
        toast.error("Could not restore");
      }
    });
  }, [entity, selected, router]);

  return (
    <div className="space-y-3">
      {selected.size > 0 ? (
        <div className="flex flex-col gap-2 rounded-lg border border-husk-200 bg-paper-50 p-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm text-bark-900">
            {selected.size} selected
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSelected(new Set())}
              disabled={bulkRestoring}
            >
              Clear
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={onBulkRestore}
              disabled={bulkRestoring}
            >
              <Undo2 className="size-3.5" />
              {bulkRestoring ? "Restoring…" : `Restore ${selected.size}`}
            </Button>
            {/* No bulk hard-delete — ADR-006 forbids it. */}
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-husk-200 bg-paper-0">
        <table className="hidden w-full text-sm md:table">
          <thead className="border-b border-husk-200 bg-paper-50 text-left">
            <tr>
              <th className="px-3 py-2">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="size-4 accent-teal-800"
                />
              </th>
              <th className="px-3 py-2 font-medium text-stone-600">Name</th>
              <th className="px-3 py-2 font-medium text-stone-600">Detail</th>
              <th className="px-3 py-2 font-medium text-stone-600">Deleted</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-husk-200/60 last:border-b-0">
                <td className="px-3 py-2 align-top">
                  <input
                    type="checkbox"
                    aria-label={`Select ${r.label}`}
                    checked={selected.has(r.id)}
                    onChange={() => toggleOne(r.id)}
                    className="size-4 accent-teal-800"
                  />
                </td>
                <td className="px-3 py-2 align-top text-bark-900">{r.label}</td>
                <td className="px-3 py-2 align-top font-mono text-xs text-stone-500">
                  {r.sublabel ?? "—"}
                </td>
                <td className="px-3 py-2 align-top font-mono text-xs text-stone-500">
                  {new Date(r.deleted_at).toLocaleString()}
                </td>
                <td className="px-3 py-2 align-top">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      onClick={() => onRestoreOne(r.id, r.label)}
                      aria-label="Restore"
                    >
                      <Undo2 className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      onClick={() => setHardDeleteTarget(r)}
                      aria-label="Hard-delete permanently"
                    >
                      <Trash2 className="size-3.5 text-brick-600" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <ul className="divide-y divide-husk-200/60 md:hidden">
          {rows.map((r) => (
            <li key={r.id} className="space-y-2 px-3 py-3 text-sm">
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  aria-label={`Select ${r.label}`}
                  checked={selected.has(r.id)}
                  onChange={() => toggleOne(r.id)}
                  className="mt-1 size-4 shrink-0 accent-teal-800"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-bark-900">{r.label}</p>
                  {r.sublabel ? (
                    <p className="truncate font-mono text-[11px] text-stone-500">
                      {r.sublabel}
                    </p>
                  ) : null}
                  <p className="font-mono text-[10px] text-stone-500">
                    deleted {new Date(r.deleted_at).toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onRestoreOne(r.id, r.label)}
                >
                  <Undo2 className="size-3.5" />
                  Restore
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setHardDeleteTarget(r)}
                >
                  <Trash2 className="size-3.5 text-brick-600" />
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <HardDeleteDialog
        key={hardDeleteTarget?.id ?? "hd-empty"}
        entity={entity}
        target={hardDeleteTarget}
        open={hardDeleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setHardDeleteTarget(null);
        }}
        onDeleted={() => {
          setHardDeleteTarget(null);
          router.refresh();
        }}
      />
    </div>
  );
}
