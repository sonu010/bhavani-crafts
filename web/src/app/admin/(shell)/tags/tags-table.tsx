"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GitMerge, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AdminTagRow } from "@/lib/db/admin/tags";
import { createTagAction, softDeleteTagAction } from "./actions";
import { MergeTagDialog } from "./merge-dialog";
import { RenameTagDialog } from "./rename-dialog";

/**
 * Tags table.
 *
 *   - Filter chip at top (client-side; 458 tags is fine).
 *   - Inline create form above the list.
 *   - Per-row: Rename / Merge / Delete.
 *
 * Local state mirrors server state after each successful action so we
 * don't need a full router.refresh() round-trip for every mutation.
 * Merge triggers a hard reload because the affected product counts
 * across MANY rows shift at once.
 */
export function TagsTable({ tags: initialTags }: { tags: AdminTagRow[] }) {
  const router = useRouter();
  const [tags, setTags] = useState<AdminTagRow[]>(initialTags);
  const [query, setQuery] = useState("");
  const [newName, setNewName] = useState("");
  const [creating, startCreate] = useTransition();
  const [renameTarget, setRenameTarget] = useState<AdminTagRow | null>(null);
  const [mergeSource, setMergeSource] = useState<AdminTagRow | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tags;
    return tags.filter(
      (t) =>
        t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q),
    );
  }, [tags, query]);

  const onCreate = useCallback(() => {
    const name = newName.trim();
    if (!name) {
      toast.error("Name is required");
      return;
    }
    startCreate(async () => {
      const r = await createTagAction({ name });
      if (r.ok) {
        toast.success(`Tag "${name}" created`);
        setNewName("");
        // Refresh the list. Could splice the new row in directly, but
        // a full refetch via router.refresh keeps server counts in
        // sync if other writers raced.
        router.refresh();
      } else if (r.error.code === "slug_in_use") {
        toast.error("A tag with that slug already exists");
      } else if (r.error.code === "validation") {
        toast.error(r.error.message);
      }
    });
  }, [newName, router]);

  const onDelete = useCallback((tag: AdminTagRow) => {
    if (
      !window.confirm(
        `Delete tag "${tag.name}"? ${tag.product_count > 0 ? `${tag.product_count} product${tag.product_count === 1 ? " keeps" : "s keep"} the link until you merge or restore.` : "This soft-deletes (restorable from Trash)."}`,
      )
    ) {
      return;
    }
    (async () => {
      const r = await softDeleteTagAction(tag.id);
      if (r.ok) {
        toast.success(`"${tag.name}" moved to Trash`);
        setTags((rows) => rows.filter((t) => t.id !== tag.id));
      } else {
        toast.error("Could not delete tag");
      }
    })();
  }, []);

  const onMergeDone = useCallback(() => {
    // Counts across many rows shift; full reload is simplest.
    window.location.reload();
  }, []);

  const onRenameDone = useCallback(
    (id: string, name: string, slug: string) => {
      setTags((rows) =>
        rows.map((t) => (t.id === id ? { ...t, name, slug } : t)),
      );
    },
    [],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border border-husk-200 bg-paper-0 p-3 sm:flex-row sm:items-end">
        <label className="flex-1 text-sm">
          <span className="sr-only">New tag</span>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onCreate();
              }
            }}
            placeholder="Add a tag (e.g. monsoon-collection)"
            disabled={creating}
          />
        </label>
        <Button type="button" onClick={onCreate} disabled={creating || !newName.trim()}>
          <Plus className="size-4" />
          {creating ? "Adding…" : "Add tag"}
        </Button>
      </div>

      <div className="rounded-lg border border-husk-200 bg-paper-0">
        <div className="border-b border-husk-200/60 px-3 py-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter…"
            className="h-8 text-sm"
          />
        </div>

        {filtered.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-stone-500">
            {query ? "No tags match" : "No tags yet"}
          </p>
        ) : (
          <ul className="divide-y divide-husk-200/60">
            {filtered.map((tag) => (
              <li
                key={tag.id}
                className="flex items-center gap-3 px-3 py-2 text-sm"
              >
                <span className="min-w-0 flex-1 truncate text-bark-900">
                  {tag.name}
                </span>
                <span className="hidden truncate font-mono text-[11px] text-stone-500 sm:block sm:max-w-40">
                  {tag.slug}
                </span>
                <span
                  className="shrink-0 rounded-full bg-husk-100 px-2 py-0.5 font-mono text-[10px] text-stone-600"
                  title={`${tag.product_count} product${tag.product_count === 1 ? "" : "s"}`}
                >
                  {tag.product_count}
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    onClick={() => setRenameTarget(tag)}
                    aria-label="Rename tag"
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    onClick={() => setMergeSource(tag)}
                    aria-label="Merge into another tag"
                    disabled={tags.length < 2}
                    title="Merge this tag into another"
                  >
                    <GitMerge className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    onClick={() => onDelete(tag)}
                    aria-label="Soft-delete tag"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <RenameTagDialog
        key={renameTarget?.id ?? "rename-empty"}
        tag={renameTarget}
        open={renameTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
        onSaved={onRenameDone}
      />

      <MergeTagDialog
        key={mergeSource?.id ?? "merge-empty"}
        sourceTag={mergeSource}
        allTags={tags}
        open={mergeSource !== null}
        onOpenChange={(open) => {
          if (!open) setMergeSource(null);
        }}
        onMerged={onMergeDone}
      />
    </div>
  );
}
