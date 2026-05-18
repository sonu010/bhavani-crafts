"use client";

import { useCallback, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronRight,
  FolderPlus,
  MoveRight,
  Pencil,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { AdminCategoryNode } from "@/lib/db/admin/categories";
import { softDeleteCategoryAction } from "./actions";

/** Matches Button's `size="icon" variant="outline"` so the Link rows
 *  align with the soft-delete Button next to them. */
const ICON_LINK_CLASS =
  "inline-flex size-8 items-center justify-center rounded-lg border border-husk-200 bg-paper-0 text-bark-900 transition hover:bg-paper-50 focus-visible:border-teal-800 focus-visible:ring-3 focus-visible:ring-teal-800/30";

/**
 * Recursive category tree.
 *
 * Each row: chevron, name, count badges, action buttons. Indentation
 * scales with depth at 16px steps. Collapsed branches don't render
 * children — saves DOM nodes when the user only opens one branch.
 *
 * Expanded state lives both in React state (for snappy clicks) AND
 * URL search params (for deep-linking + reload survival). The
 * router.replace call is debounced via useTransition so rapid
 * collapse/expand doesn't spam history.
 */
export function CategoriesTree({
  tree,
  initialExpanded,
}: {
  tree: AdminCategoryNode[];
  initialExpanded: string[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(initialExpanded),
  );
  // Only `startTransition` is consumed; the pending flag isn't useful
  // here since router.replace itself isn't awaited from the UI.
  const [, startTransition] = useTransition();

  const syncUrl = useCallback(
    (next: Set<string>) => {
      const sp = new URLSearchParams(searchParams.toString());
      if (next.size === 0) {
        sp.delete("expanded");
      } else {
        sp.set("expanded", [...next].join(","));
      }
      const qs = sp.toString();
      startTransition(() => {
        router.replace(qs ? `?${qs}` : "?", { scroll: false });
      });
    },
    [router, searchParams],
  );

  const toggle = useCallback(
    (id: string) => {
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        syncUrl(next);
        return next;
      });
    },
    [syncUrl],
  );

  if (tree.length === 0) {
    return (
      <p className="rounded-lg border border-husk-200 bg-paper-0 p-6 text-sm text-stone-500">
        No categories yet.{" "}
        <Link
          href="/admin/categories/new"
          className="text-teal-800 underline-offset-2 hover:underline"
        >
          Create the first →
        </Link>
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-husk-200 bg-paper-0">
      <ul role="tree" className="divide-y divide-husk-200/60">
        {tree.map((node) => (
          <TreeRow
            key={node.id}
            node={node}
            depth={0}
            expanded={expanded}
            onToggle={toggle}
          />
        ))}
      </ul>
    </div>
  );
}

function TreeRow({
  node,
  depth,
  expanded,
  onToggle,
}: {
  node: AdminCategoryNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const hasChildren = node.children.length > 0;
  const isOpen = expanded.has(node.id);

  const onDelete = useCallback(() => {
    const ok = window.confirm(
      `Delete category "${node.name}"? This soft-deletes — restore via Trash.`,
    );
    if (!ok) return;
    setDeleting(true);
    (async () => {
      const r = await softDeleteCategoryAction(node.id);
      setDeleting(false);
      if (r.ok) {
        toast.success(`"${node.name}" moved to Trash`);
        // Reload to pull a fresh tree (the deleted row is gone +
        // ancestor counts shift).
        window.location.reload();
        return;
      }
      switch (r.error.code) {
        case "has_children":
          toast.error(
            `Has ${r.error.childCount} subcategor${r.error.childCount === 1 ? "y" : "ies"}; move or delete them first`,
          );
          break;
        case "has_products":
          toast.error(
            `Has ${r.error.productCount} product${r.error.productCount === 1 ? "" : "s"}; recategorize them first`,
          );
          break;
        case "not_found":
          toast.error("Category not found");
          break;
      }
    })();
  }, [node.id, node.name]);

  // Indent visually but keep a single grid row for accessibility.
  const indentPx = depth * 16;

  return (
    <li
      role="treeitem"
      aria-expanded={hasChildren ? isOpen : undefined}
      aria-selected={false}
    >
      <div
        className="flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-paper-50"
        style={{ paddingLeft: 8 + indentPx }}
      >
        <button
          type="button"
          onClick={() => hasChildren && onToggle(node.id)}
          aria-label={hasChildren ? (isOpen ? "Collapse" : "Expand") : undefined}
          className={`-ml-1 flex size-5 shrink-0 items-center justify-center rounded text-stone-500 hover:bg-husk-100 ${hasChildren ? "" : "invisible"}`}
        >
          <ChevronRight
            className={`size-4 transition-transform ${isOpen ? "rotate-90" : ""}`}
          />
        </button>

        <span className="min-w-0 flex-1 truncate text-bark-900">{node.name}</span>

        <span
          className="shrink-0 rounded-full bg-husk-100 px-2 py-0.5 font-mono text-[10px] text-stone-600"
          title={`${node.direct_count} direct · ${node.descendant_count} with descendants`}
        >
          {node.descendant_count}
        </span>

        <span className="hidden truncate font-mono text-[10px] text-stone-500 sm:block sm:max-w-32">
          {node.slug}
        </span>

        <div className="flex items-center gap-1">
          <Link
            href={`/admin/categories/${node.id}/edit`}
            aria-label="Edit category"
            className={ICON_LINK_CLASS}
          >
            <Pencil className="size-3.5" />
          </Link>
          <Link
            href={`/admin/categories/new?parent=${node.id}`}
            aria-label="Add child category"
            className={ICON_LINK_CLASS}
          >
            <FolderPlus className="size-3.5" />
          </Link>
          <Link
            href={`/admin/categories/${node.id}/move`}
            aria-label="Move products out of this category"
            className={ICON_LINK_CLASS}
          >
            <MoveRight className="size-3.5" />
          </Link>
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={onDelete}
            disabled={deleting}
            aria-label="Soft-delete category"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      {hasChildren && isOpen ? (
        <ul role="group" className="divide-y divide-husk-200/40">
          {node.children.map((child) => (
            <TreeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
