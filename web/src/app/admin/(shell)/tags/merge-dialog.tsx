"use client";

import { useMemo, useState, useTransition } from "react";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AdminTagRow } from "@/lib/db/admin/tags";
import { mergeTagsAction } from "./actions";

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-husk-200 bg-paper-0 px-2 text-base md:text-sm text-bark-900 outline-none focus-visible:border-teal-800 focus-visible:ring-3 focus-visible:ring-teal-800/30";

/**
 * Combine source tag into target.
 *
 * The target picker excludes the source itself. The action verifies
 * source/target exist + are different + that target isn't soft-
 * deleted; we just hide the obvious case here.
 *
 * Confirmation step shows the impact before the action runs.
 */
export function MergeTagDialog({
  sourceTag,
  allTags,
  open,
  onOpenChange,
  onMerged,
}: {
  sourceTag: AdminTagRow | null;
  allTags: AdminTagRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMerged: () => void;
}) {
  const [targetId, setTargetId] = useState("");
  const [isPending, startMerge] = useTransition();

  const targets = useMemo(
    () =>
      allTags
        .filter((t) => t.id !== sourceTag?.id)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [allTags, sourceTag?.id],
  );

  const targetTag = targets.find((t) => t.id === targetId) ?? null;

  const onMerge = () => {
    if (!sourceTag || !targetTag) return;
    if (
      !window.confirm(
        `Merge "${sourceTag.name}" into "${targetTag.name}"? ${sourceTag.product_count} product link${sourceTag.product_count === 1 ? "" : "s"} re-pointed; source tag soft-deleted.`,
      )
    ) {
      return;
    }
    startMerge(async () => {
      const r = await mergeTagsAction(sourceTag.id, targetTag.id);
      if (r.ok) {
        toast.success(
          `Merged. ${r.moved} new link${r.moved === 1 ? "" : "s"} · ${r.duplicates} already had both`,
        );
        onOpenChange(false);
        onMerged();
      } else if (r.error.code === "same_tag") {
        toast.error("Source and target are the same");
      } else if (r.error.code === "not_found") {
        toast.error("Tag not found");
      } else {
        toast.error("Could not merge");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Merge tag</DialogTitle>
        </DialogHeader>

        <div className="rounded-md border border-husk-200 bg-paper-50 p-3 text-sm">
          <p className="font-medium text-bark-900">{sourceTag?.name}</p>
          <p className="font-mono text-xs text-stone-500">
            {sourceTag?.product_count} product link
            {sourceTag?.product_count === 1 ? "" : "s"}
          </p>
        </div>

        <div className="flex items-center justify-center text-stone-500">
          <ArrowRight className="size-4" />
        </div>

        <label className="block space-y-1.5 text-sm">
          <span className="font-medium text-bark-900">Target tag</span>
          <select
            className={SELECT_CLASS}
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            disabled={isPending}
          >
            <option value="">— Pick target —</option>
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.product_count})
              </option>
            ))}
          </select>
        </label>

        <p className="text-xs text-stone-500">
          Every product currently tagged with the source will be tagged with
          the target instead. Products already tagged with both are
          skipped (no duplicate row). The source tag is then
          soft-deleted — restore from Trash if you change your mind.
        </p>

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={onMerge}
            disabled={isPending || !targetTag}
          >
            {isPending ? "Merging…" : "Merge"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
