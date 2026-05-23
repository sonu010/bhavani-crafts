"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-husk-200 bg-paper-0 px-2 text-sm text-bark-900 outline-none focus-visible:border-teal-800 focus-visible:ring-3 focus-visible:ring-teal-800/30";

/**
 * URL-driven filter bar for /admin/activity.
 *
 * All filters live in search params so links are shareable. Changes
 * push via `router.replace` wrapped in `useTransition` to avoid
 * history spam during typing.
 */
export function FilterBar({
  initial,
  actions,
  entityTypes,
}: {
  initial: {
    action: string | null;
    entityType: string | null;
    entityId: string | null;
    since: string | null;
    until: string | null;
  };
  actions: string[];
  entityTypes: string[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [action, setAction] = useState(initial.action ?? "");
  const [entityType, setEntityType] = useState(initial.entityType ?? "");
  const [entityId, setEntityId] = useState(initial.entityId ?? "");
  const [since, setSince] = useState(initial.since ?? "");
  const [until, setUntil] = useState(initial.until ?? "");

  const sync = useCallback(
    (updates: Record<string, string>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      // Reset cursor when filters change.
      next.delete("cursor");
      next.delete("row");
      const qs = next.toString();
      startTransition(() => {
        router.replace(qs ? `?${qs}` : "?", { scroll: false });
      });
    },
    [router, searchParams],
  );

  // Debounce the entity_id + date inputs.
  useEffect(() => {
    const handle = setTimeout(
      () =>
        sync({
          action,
          entity_type: entityType,
          entity_id: entityId,
          since,
          until,
        }),
      300,
    );
    return () => clearTimeout(handle);
  }, [action, entityType, entityId, since, until, sync]);

  const clear = () => {
    setAction("");
    setEntityType("");
    setEntityId("");
    setSince("");
    setUntil("");
  };

  const hasAny =
    action !== "" ||
    entityType !== "" ||
    entityId !== "" ||
    since !== "" ||
    until !== "";

  return (
    <div className="space-y-3 rounded-lg border border-husk-200 bg-paper-0 p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <label className="text-sm">
          <span className="sr-only">Action</span>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className={SELECT_CLASS}
          >
            <option value="">All actions</option>
            {actions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="sr-only">Entity type</span>
          <select
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            className={SELECT_CLASS}
          >
            <option value="">All entity types</option>
            {entityTypes.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="sr-only">Entity ID</span>
          <Input
            value={entityId}
            onChange={(e) => setEntityId(e.target.value)}
            placeholder="Entity ID (uuid)"
            className="font-mono text-xs"
          />
        </label>
        <label className="text-sm">
          <span className="sr-only">Since</span>
          <Input
            type="date"
            value={since}
            onChange={(e) => setSince(e.target.value)}
          />
        </label>
        <label className="text-sm">
          <span className="sr-only">Until</span>
          <Input
            type="date"
            value={until}
            onChange={(e) => setUntil(e.target.value)}
          />
        </label>
      </div>

      {hasAny ? (
        <div className="flex items-center justify-end">
          <Button type="button" variant="outline" size="sm" onClick={clear}>
            <X className="size-3.5" />
            Clear filters
          </Button>
        </div>
      ) : null}
    </div>
  );
}
