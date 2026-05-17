"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { CategoryTreeNode } from "@/lib/schemas/category";

interface FlatNode {
  id: string;
  slug: string;
  name: string;
  depth: number;
  /** Ancestor names joined by " / " — used for the search-result subtitle. */
  ancestors: string;
}

function flatten(
  nodes: CategoryTreeNode[],
  depth = 0,
  ancestors: string[] = [],
  out: FlatNode[] = [],
): FlatNode[] {
  for (const n of nodes) {
    out.push({
      id: n.id,
      slug: n.slug,
      name: n.name,
      depth,
      ancestors: ancestors.join(" / "),
    });
    if (n.children.length > 0) {
      flatten(n.children, depth + 1, [...ancestors, n.name], out);
    }
  }
  return out;
}

/**
 * Single-select category picker.
 *
 * Trigger button shows the current selection ("None" if null). Click
 * opens a Dialog with a search input + a tree-flattened scrollable
 * list. Selecting an item closes the dialog and fires onChange.
 *
 * Implementation note: shadcn's `Command` primitive isn't installed in
 * this codebase. We do the search filter client-side over the flat
 * list — 362 categories is a trivially small set.
 */
export function CategoryPicker({
  tree,
  value,
  onChange,
  disabled,
}: {
  tree: CategoryTreeNode[];
  value: { id: string; name: string } | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const flat = useMemo(() => flatten(tree), [tree]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return flat;
    return flat.filter(
      (n) =>
        n.name.toLowerCase().includes(q) || n.slug.toLowerCase().includes(q),
    );
  }, [flat, query]);

  function pick(id: string | null) {
    onChange(id);
    setOpen(false);
    setQuery("");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        disabled={disabled}
        render={
          <Button
            variant="outline"
            className="h-9 w-full justify-between gap-2"
          >
            <span className="truncate text-left">
              {value ? value.name : (
                <span className="text-stone-500">No category</span>
              )}
            </span>
            <ChevronDown className="size-4 shrink-0 text-stone-500" />
          </Button>
        }
      />
      <DialogContent className="max-h-[80vh] max-w-lg gap-3 p-0">
        <DialogHeader className="border-b border-husk-200 px-4 py-3">
          <DialogTitle>Pick a category</DialogTitle>
        </DialogHeader>

        <div className="border-b border-husk-200 px-4 pb-3">
          <div className="relative">
            <Search
              aria-hidden
              className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-stone-500"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type to filter…"
              className="pl-8"
              autoFocus
            />
          </div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-2 pb-3">
          {/* "None" option always at the top. */}
          <button
            type="button"
            onClick={() => pick(null)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-stone-500 hover:bg-husk-100 hover:text-bark-900"
          >
            <X className="size-3.5" />
            No category
          </button>

          {filtered.length === 0 ? (
            <p className="px-3 py-4 text-sm text-stone-500">
              No matches for &ldquo;{query}&rdquo;.
            </p>
          ) : (
            filtered.map((n) => {
              const selected = value?.id === n.id;
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => pick(n.id)}
                  aria-current={selected ? "true" : undefined}
                  style={{ paddingLeft: 8 + n.depth * 14 }}
                  className={
                    "flex w-full items-center justify-between gap-2 rounded-md py-1.5 pr-2 text-left text-sm transition-colors " +
                    (selected
                      ? "bg-teal-800/10 text-bark-900"
                      : "text-bark-900 hover:bg-husk-100")
                  }
                >
                  <span className="truncate">{n.name}</span>
                  {query && n.ancestors ? (
                    <span className="hidden truncate text-xs text-stone-500 sm:inline">
                      {n.ancestors}
                    </span>
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
