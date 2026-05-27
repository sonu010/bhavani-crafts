"use client";

import { Fragment, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { AdminProductRow } from "@/lib/db/admin/products";
import { BulkToolbar } from "./bulk-toolbar";

/**
 * Relative-time label. Single-granularity (days+) so the output is
 * stable across renders without depending on minute-by-minute drift.
 */
function relativeDays(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  if (days < 1) return "today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

const STATUS_BADGE_VARIANT: Record<
  AdminProductRow["review_status"],
  { label: string; shortLabel: string; className: string }
> = {
  draft: {
    label: "Draft",
    shortLabel: "Draft",
    className: "border-husk-200 bg-husk-100 text-stone-500",
  },
  needs_review: {
    label: "Needs review",
    shortLabel: "Review",
    className: "border-clay-700/30 bg-clay-700/10 text-clay-700",
  },
  ready_to_publish: {
    label: "Ready",
    shortLabel: "Ready",
    className: "border-moss-600/30 bg-moss-600/10 text-moss-600",
  },
  published: {
    label: "Published",
    shortLabel: "Live",
    className: "border-teal-800/30 bg-teal-800/10 text-teal-800",
  },
  archived: {
    label: "Archived",
    shortLabel: "Archived",
    className: "border-husk-200 bg-husk-100 text-stone-500",
  },
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseSelected(raw: string | null): Set<string> {
  if (!raw) return new Set();
  return new Set(raw.split(",").filter((s) => UUID_RE.test(s)));
}

/**
 * Admin products list — mobile-first card rows + selection layer.
 *
 *   - Selection state lives in URL (`?selected=id1,id2,…`) so a
 *     reload preserves what was picked.
 *   - The header checkbox toggles all visible rows; deselecting it
 *     clears only the rows currently in view, leaving any prior
 *     out-of-page selections intact.
 *   - The sticky `<BulkToolbar>` mounts when at least one row is
 *     selected.
 *
 * Same layout at every breakpoint; no horizontal scroll. Each row's
 * link content remains the primary tap target → `/admin/products/[id]/edit`.
 */
export function ProductsTable({
  rows,
  backHref,
  allTags,
  categoryOptions,
}: {
  rows: AdminProductRow[];
  /** Encoded current URL (path + search) so the editor's breadcrumb
   *  returns to the same filter state. */
  backHref?: string;
  allTags: Array<{ slug: string; name: string }>;
  categoryOptions: Array<{ id: string; name: string; depth: number }>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const selected = useMemo(
    () => parseSelected(searchParams.get("selected")),
    [searchParams],
  );

  const visibleIds = useMemo(() => rows.map((r) => r.id), [rows]);

  const writeSelection = useCallback(
    (next: Set<string>) => {
      const sp = new URLSearchParams(searchParams.toString());
      if (next.size === 0) sp.delete("selected");
      else sp.set("selected", [...next].join(","));
      const qs = sp.toString();
      router.replace(qs ? `?${qs}` : "?", { scroll: false });
    },
    [router, searchParams],
  );

  const toggleOne = useCallback(
    (id: string) => {
      const next = new Set(selected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      writeSelection(next);
    },
    [selected, writeSelection],
  );

  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  const toggleAllVisible = useCallback(() => {
    const next = new Set(selected);
    if (allVisibleSelected) {
      for (const id of visibleIds) next.delete(id);
    } else {
      for (const id of visibleIds) next.add(id);
    }
    writeSelection(next);
  }, [allVisibleSelected, selected, visibleIds, writeSelection]);

  const clearSelection = useCallback(() => {
    writeSelection(new Set());
  }, [writeSelection]);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-husk-200 bg-paper-0 p-6 text-center text-sm text-stone-500 sm:p-8">
        No products match this filter.
      </div>
    );
  }

  const selectedIds = [...selected];

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-husk-200 bg-paper-0">
        {/* Header row — select-all toggle */}
        <div className="flex items-center gap-3 border-b border-husk-200 bg-paper-50 px-3 py-2 text-xs text-stone-500 sm:gap-4 sm:px-4">
          <label className="flex shrink-0 cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              className="size-4 accent-teal-800"
              checked={allVisibleSelected}
              onChange={toggleAllVisible}
              aria-label="Select all visible rows"
            />
            <span className="hidden sm:inline">
              {allVisibleSelected
                ? `${visibleIds.length} selected on this page`
                : `Select page (${visibleIds.length})`}
            </span>
          </label>
          {selectedIds.length > 0 ? (
            <>
              <span className="font-mono">
                {selectedIds.length} total selected
              </span>
              <button
                type="button"
                onClick={clearSelection}
                className="ml-auto text-stone-500 underline-offset-2 hover:text-bark-900 hover:underline"
              >
                Clear
              </button>
            </>
          ) : null}
        </div>

        <ul className="divide-y divide-husk-200">
          {rows.map((row) => {
            const badge = STATUS_BADGE_VARIANT[row.review_status];
            const meta: string[] = [];
            if (row.category?.name) meta.push(row.category.name);
            if (row.sku) meta.push(row.sku);
            meta.push(relativeDays(row.created_at));

            const editHref = backHref
              ? `/admin/products/${row.id}/edit?back=${encodeURIComponent(backHref)}`
              : `/admin/products/${row.id}/edit`;

            const isSelected = selected.has(row.id);

            return (
              <li
                key={row.id}
                className={`flex items-center gap-3 transition-colors sm:gap-4 ${isSelected ? "bg-teal-50/30" : "hover:bg-husk-100"}`}
              >
                {/* Checkbox — stops propagation so clicking it
                   doesn't navigate the parent link. */}
                <label className="flex shrink-0 cursor-pointer items-center pl-3 py-3 sm:pl-4">
                  <input
                    type="checkbox"
                    className="size-4 accent-teal-800"
                    checked={isSelected}
                    onChange={() => toggleOne(row.id)}
                    aria-label={`Select ${row.name}`}
                    onClick={(e) => e.stopPropagation()}
                  />
                </label>

                <Link
                  href={editHref}
                  className="group flex min-w-0 flex-1 items-center gap-3 py-3 pr-3 sm:gap-4 sm:pr-4"
                >
                  {row.thumbnail_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      alt=""
                      src={row.thumbnail_url}
                      className="size-12 shrink-0 rounded-md border border-husk-200 object-cover sm:size-14"
                    />
                  ) : (
                    <div className="size-12 shrink-0 rounded-md border border-husk-200 bg-husk-100 sm:size-14" />
                  )}

                  <div className="min-w-0 flex-1 overflow-hidden">
                    <div
                      className="truncate text-sm font-medium text-bark-900 group-hover:underline sm:text-base"
                      title={row.name}
                    >
                      {row.name}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-stone-500">
                      {meta.map((m, i) => (
                        <Fragment key={i}>
                          {i > 0 ? <span aria-hidden> · </span> : null}
                          <span className={i === 1 && row.sku ? "font-mono" : ""}>
                            {m}
                          </span>
                        </Fragment>
                      ))}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant="outline" className={badge.className}>
                      <span className="sm:hidden">{badge.shortLabel}</span>
                      <span className="hidden sm:inline">{badge.label}</span>
                    </Badge>
                    <ChevronRight
                      aria-hidden
                      className="size-4 text-stone-500 group-hover:text-bark-900"
                    />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      {selectedIds.length > 0 ? (
        <BulkToolbar
          selectedIds={selectedIds}
          allTags={allTags}
          categoryOptions={categoryOptions}
          onCleared={clearSelection}
        />
      ) : null}
    </>
  );
}
