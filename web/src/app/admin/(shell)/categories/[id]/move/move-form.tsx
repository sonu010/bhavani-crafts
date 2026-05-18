"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { CategoryTreeNode } from "@/lib/schemas/category";
import {
  bulkMoveProductsToCategoryAction,
  previewMoveCountAction,
} from "../../actions";

type ReviewStatus =
  | "draft"
  | "needs_review"
  | "ready_to_publish"
  | "published"
  | "archived";

const STATUS_OPTIONS: Array<{ value: ReviewStatus; label: string }> = [
  { value: "draft", label: "Draft" },
  { value: "needs_review", label: "Needs review" },
  { value: "ready_to_publish", label: "Ready to publish" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

interface FlatNode {
  id: string;
  name: string;
  depth: number;
}

function flatten(
  nodes: CategoryTreeNode[],
  depth = 0,
  skipId: string | null = null,
  out: FlatNode[] = [],
): FlatNode[] {
  for (const n of nodes) {
    if (n.id === skipId) continue;
    out.push({ id: n.id, name: n.name, depth });
    if (n.children.length > 0) {
      flatten(n.children, depth + 1, skipId, out);
    }
  }
  return out;
}

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-husk-200 bg-paper-0 px-2 text-sm text-bark-900 outline-none focus-visible:border-teal-800 focus-visible:ring-3 focus-visible:ring-teal-800/30";

/**
 * Bulk-move form.
 *
 * Target picker uses `flatten(skipId=sourceId)` so the source subtree
 * doesn't appear. The server still validates (cycle check via
 * `category_with_descendants`) — the client filter is just UX.
 *
 * Preview count refreshes when status filters change. Debounced
 * via 250ms timeout so rapid toggles don't fan out N requests.
 */
export function MoveProductsForm({
  sourceId,
  sourceName,
  initialCount,
  categoryTree,
}: {
  sourceId: string;
  sourceName: string;
  initialCount: number;
  categoryTree: CategoryTreeNode[];
}) {
  const router = useRouter();
  const [targetId, setTargetId] = useState<string>("");
  const [selectedStatuses, setSelectedStatuses] = useState<Set<ReviewStatus>>(
    () => new Set(),
  );
  const [count, setCount] = useState(initialCount);
  const [refreshing, setRefreshing] = useState(false);
  const [moving, startMove] = useTransition();

  const flatTargets = useMemo(
    () => flatten(categoryTree, 0, sourceId),
    [categoryTree, sourceId],
  );

  const toggleStatus = useCallback((s: ReviewStatus) => {
    setSelectedStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }, []);

  // Refresh count when filters change (debounced).
  useEffect(() => {
    const handle = setTimeout(() => {
      setRefreshing(true);
      (async () => {
        const r = await previewMoveCountAction(sourceId, {
          statuses: selectedStatuses.size > 0 ? [...selectedStatuses] : null,
        });
        setRefreshing(false);
        if (r.ok) setCount(r.count);
      })();
    }, 250);
    return () => clearTimeout(handle);
  }, [sourceId, selectedStatuses]);

  const onMove = useCallback(() => {
    if (!targetId) {
      toast.error("Pick a target category first");
      return;
    }
    const targetName = flatTargets.find((t) => t.id === targetId)?.name ?? "—";
    if (!window.confirm(`Move ${count} products into "${targetName}"?`)) {
      return;
    }
    startMove(async () => {
      const r = await bulkMoveProductsToCategoryAction(sourceId, targetId, {
        statuses: selectedStatuses.size > 0 ? [...selectedStatuses] : null,
      });
      if (r.ok) {
        toast.success(`Moved ${r.moved} product${r.moved === 1 ? "" : "s"}`);
        router.push("/admin/categories");
        router.refresh();
        return;
      }
      switch (r.error.code) {
        case "same_category":
          toast.error("Source and target are the same");
          break;
        case "target_is_descendant":
          toast.error("Target is a descendant of the source");
          break;
        case "source_not_found":
        case "target_not_found":
          toast.error("Category not found");
          break;
        case "nothing_to_move":
          toast.error("Nothing matches the current filters");
          break;
      }
    });
  }, [sourceId, targetId, selectedStatuses, count, flatTargets, router]);

  const canMove = targetId !== "" && count > 0 && !moving;

  return (
    <div className="space-y-6 pb-24">
      <header className="rounded-lg border border-husk-200 bg-paper-0 p-4 sm:p-6">
        <p className="text-xs uppercase tracking-wide text-stone-500">Source</p>
        <p className="mt-1 text-lg font-medium text-bark-900">{sourceName}</p>
        <p className="mt-1 font-mono text-xs text-stone-500">
          {initialCount} product{initialCount === 1 ? "" : "s"} directly attached
        </p>
      </header>

      <fieldset className="space-y-4 rounded-lg border border-husk-200 bg-paper-0 p-4 sm:p-6">
        <legend className="px-1 text-xs uppercase tracking-wide text-stone-500">
          Target
        </legend>
        <select
          className={SELECT_CLASS}
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
          disabled={moving}
          aria-label="Target category"
        >
          <option value="">— Pick a target —</option>
          {flatTargets.map((t) => (
            <option key={t.id} value={t.id}>
              {"— ".repeat(t.depth)}
              {t.name}
            </option>
          ))}
        </select>
        <p className="text-xs text-stone-500">
          The source category and its descendants are filtered out — the
          server rejects them anyway.
        </p>
      </fieldset>

      <fieldset className="space-y-3 rounded-lg border border-husk-200 bg-paper-0 p-4 sm:p-6">
        <legend className="px-1 text-xs uppercase tracking-wide text-stone-500">
          Narrow by status (optional)
        </legend>
        <div className="flex flex-wrap gap-2">
          {STATUS_OPTIONS.map((opt) => {
            const active = selectedStatuses.has(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleStatus(opt.value)}
                disabled={moving}
                className={[
                  "rounded-full border px-3 py-1 text-xs font-medium transition",
                  active
                    ? "border-teal-800 bg-teal-800/10 text-teal-900"
                    : "border-husk-200 bg-paper-0 text-stone-600 hover:bg-paper-50",
                ].join(" ")}
              >
                {opt.label}
              </button>
            );
          })}
          {selectedStatuses.size > 0 ? (
            <button
              type="button"
              onClick={() => setSelectedStatuses(new Set())}
              disabled={moving}
              className="text-xs text-stone-500 underline-offset-2 hover:underline"
            >
              Clear
            </button>
          ) : null}
        </div>
        <p className="text-xs text-stone-500">
          No filter selected ⇒ moves every product directly in this
          category.
        </p>
      </fieldset>

      <div className="flex flex-col gap-3 rounded-lg border border-husk-200 bg-paper-0 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
        <span className="inline-flex items-center gap-2 text-stone-600">
          {refreshing ? <Loader2 className="size-3.5 animate-spin" /> : null}
          {count === 0
            ? "Nothing matches the current filters."
            : `Will move ${count} product${count === 1 ? "" : "s"}.`}
        </span>
        <Button type="button" onClick={onMove} disabled={!canMove}>
          {moving ? "Moving…" : `Move ${count}`}
          <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
