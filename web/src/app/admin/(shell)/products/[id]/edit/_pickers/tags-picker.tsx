"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export interface TagOption {
  slug: string;
  name: string;
}

/**
 * Multi-select tags picker.
 *
 * Trigger shows the count + a sample ("3 tags: eco, popular, +1"). Dialog
 * lists all available tags as checkboxes. Selected tags float to the
 * top inside the dialog for visibility. Inline-create-new-tag is on the
 * roadmap (P2-T21 owns the tag table); for this pass we only select
 * from existing tags.
 *
 * Like the category picker, this is a hand-rolled multi-select since
 * shadcn `Command` isn't installed.
 */
export function TagsPicker({
  options,
  value,
  onChange,
  disabled,
}: {
  options: TagOption[];
  /** Currently-selected slugs (controlled). */
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selectedSet = useMemo(() => new Set(value), [value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? options.filter(
          (t) =>
            t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q),
        )
      : options;
    // Selected first, then unselected — both alphabetical.
    return base.slice().sort((a, b) => {
      const aSel = selectedSet.has(a.slug);
      const bSel = selectedSet.has(b.slug);
      if (aSel !== bSel) return aSel ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [options, query, selectedSet]);

  function toggle(slug: string) {
    if (selectedSet.has(slug)) {
      onChange(value.filter((s) => s !== slug));
    } else {
      onChange([...value, slug]);
    }
  }

  const triggerLabel = useMemo(() => {
    if (value.length === 0) return "No tags";
    const slugToName = new Map(options.map((t) => [t.slug, t.name]));
    const first = slugToName.get(value[0]) ?? value[0];
    if (value.length === 1) return first;
    const second = slugToName.get(value[1]) ?? value[1];
    if (value.length === 2) return `${first}, ${second}`;
    return `${first}, ${second}, +${value.length - 2}`;
  }, [value, options]);

  return (
    <div className="space-y-2">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger
          disabled={disabled}
          render={
            <Button
              variant="outline"
              className="h-9 w-full justify-between gap-2"
            >
              <span className="truncate text-left">
                {value.length === 0 ? (
                  <span className="text-stone-500">{triggerLabel}</span>
                ) : (
                  triggerLabel
                )}
              </span>
              <ChevronDown className="size-4 shrink-0 text-stone-500" />
            </Button>
          }
        />
        <DialogContent className="max-h-[80vh] max-w-lg gap-3 p-0">
          <DialogHeader className="border-b border-husk-200 px-4 py-3">
            <DialogTitle>Pick tags</DialogTitle>
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
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-sm text-stone-500">
                No tags match &ldquo;{query}&rdquo;.
              </p>
            ) : (
              filtered.map((t) => {
                const selected = selectedSet.has(t.slug);
                return (
                  <label
                    key={t.slug}
                    className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-husk-100"
                  >
                    <input
                      type="checkbox"
                      className="size-4 accent-teal-800"
                      checked={selected}
                      onChange={() => toggle(t.slug)}
                    />
                    <span className="flex-1 truncate text-bark-900">
                      {t.name}
                    </span>
                    <span className="font-mono text-xs text-stone-500">
                      {t.slug}
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Selected chips, below the trigger for visibility. Tappable to
         remove the tag inline. */}
      {value.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {value.map((slug) => {
            const name = options.find((t) => t.slug === slug)?.name ?? slug;
            return (
              <button
                key={slug}
                type="button"
                onClick={() => toggle(slug)}
                disabled={disabled}
                aria-label={`Remove tag ${name}`}
                className="inline-flex"
              >
                <Badge
                  variant="outline"
                  className="border-teal-800/30 bg-teal-800/10 text-teal-800 hover:bg-teal-800/15"
                >
                  {name}
                  <span aria-hidden className="ml-1 text-stone-500">
                    ×
                  </span>
                </Badge>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
