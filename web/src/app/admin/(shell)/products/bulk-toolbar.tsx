"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  TagIcon,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  bulkAddTagAction,
  bulkMoveCategoryAction,
  bulkPublishAction,
  bulkRemoveTagAction,
  bulkSoftDeleteAction,
  bulkUnpublishAction,
} from "./actions";

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-husk-200 bg-paper-0 px-2 text-base md:text-sm text-bark-900 outline-none focus-visible:border-teal-800 focus-visible:ring-3 focus-visible:ring-teal-800/30";

type DialogMode =
  | { kind: "publish" }
  | { kind: "unpublish" }
  | { kind: "move-category" }
  | { kind: "add-tag" }
  | { kind: "remove-tag" }
  | { kind: "soft-delete" };

/**
 * Sticky bottom toolbar — six bulk actions on the selected products.
 *
 * Confirm flow:
 *   - publish / unpublish / move / add-tag / remove-tag → simple
 *     count-confirm dialog with a primary CTA
 *   - soft-delete → typed-confirmation: owner types "delete"
 *     (lowercase) before the destructive CTA enables
 *
 * After each successful action the toolbar:
 *   1. clears the URL `?selected=` set via `onCleared`
 *   2. calls `router.refresh()` so the list reflects the change
 */
export function BulkToolbar({
  selectedIds,
  allTags,
  categoryOptions,
  onCleared,
}: {
  selectedIds: string[];
  allTags: Array<{ slug: string; name: string }>;
  categoryOptions: Array<{ id: string; name: string; depth: number }>;
  onCleared: () => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<DialogMode | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [pickedTagSlug, setPickedTagSlug] = useState("");
  const [pickedCategoryId, setPickedCategoryId] = useState("");
  const [isPending, startAction] = useTransition();

  const closeDialog = useCallback(() => {
    setMode(null);
    setConfirmText("");
    setPickedTagSlug("");
    setPickedCategoryId("");
  }, []);

  const finalize = useCallback(
    (touched: number, verb: string) => {
      toast.success(
        `${verb} ${touched} product${touched === 1 ? "" : "s"}`,
      );
      closeDialog();
      onCleared();
      router.refresh();
    },
    [closeDialog, onCleared, router],
  );

  const run = useCallback(
    (
      fn: () => Promise<
        | { ok: true; touched: number }
        | { ok: false; error: { code: string } }
      >,
      verb: string,
    ) => {
      startAction(async () => {
        const r = await fn();
        if (r.ok) {
          finalize(r.touched, verb);
        } else {
          toast.error(`Failed: ${r.error.code}`);
        }
      });
    },
    [finalize],
  );

  const onConfirm = () => {
    if (!mode) return;
    switch (mode.kind) {
      case "publish":
        return run(() => bulkPublishAction(selectedIds), "Published");
      case "unpublish":
        return run(() => bulkUnpublishAction(selectedIds), "Unpublished");
      case "move-category":
        if (!pickedCategoryId) {
          toast.error("Pick a target category first");
          return;
        }
        return run(
          () => bulkMoveCategoryAction(selectedIds, pickedCategoryId),
          "Moved",
        );
      case "add-tag":
        if (!pickedTagSlug) {
          toast.error("Pick a tag first");
          return;
        }
        return run(
          () => bulkAddTagAction(selectedIds, pickedTagSlug),
          "Tagged",
        );
      case "remove-tag":
        if (!pickedTagSlug) {
          toast.error("Pick a tag first");
          return;
        }
        return run(
          () => bulkRemoveTagAction(selectedIds, pickedTagSlug),
          "Untagged",
        );
      case "soft-delete":
        if (confirmText !== "delete") {
          toast.error("Type 'delete' to confirm");
          return;
        }
        return run(() => bulkSoftDeleteAction(selectedIds), "Moved to Trash");
    }
  };

  const count = selectedIds.length;
  const deleteEnabled = confirmText === "delete";

  return (
    <>
      <div
        className="sticky bottom-0 z-10 -mx-3 mt-4 border-t border-husk-200 bg-paper-0/95 px-3 py-3 backdrop-blur sm:-mx-6 sm:px-6"
        role="toolbar"
        aria-label="Bulk actions"
      >
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-mono text-xs text-stone-500">
            {count} selected
          </span>
          <div className="flex flex-wrap gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setMode({ kind: "publish" })}
            >
              <Eye className="size-3.5" />
              Publish
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setMode({ kind: "unpublish" })}
            >
              <EyeOff className="size-3.5" />
              Unpublish
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setMode({ kind: "move-category" })}
            >
              <ArrowRight className="size-3.5" />
              Move
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setMode({ kind: "add-tag" })}
            >
              <TagIcon className="size-3.5" />
              Add tag
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setMode({ kind: "remove-tag" })}
            >
              <TagIcon className="size-3.5" />
              Remove tag
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setMode({ kind: "soft-delete" })}
            >
              <Trash2 className="size-3.5 text-brick-600" />
              Delete
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={mode !== null} onOpenChange={(o) => (o ? null : closeDialog())}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {mode?.kind === "soft-delete"
                ? `Soft-delete ${count} product${count === 1 ? "" : "s"}?`
                : mode?.kind === "publish"
                  ? `Publish ${count} product${count === 1 ? "" : "s"}?`
                  : mode?.kind === "unpublish"
                    ? `Unpublish ${count} product${count === 1 ? "" : "s"}?`
                    : mode?.kind === "move-category"
                      ? `Move ${count} product${count === 1 ? "" : "s"} to category`
                      : mode?.kind === "add-tag"
                        ? `Add tag to ${count} product${count === 1 ? "" : "s"}`
                        : mode?.kind === "remove-tag"
                          ? `Remove tag from ${count} product${count === 1 ? "" : "s"}`
                          : ""}
            </DialogTitle>
          </DialogHeader>

          {mode?.kind === "publish" ? (
            <p className="text-sm text-stone-600">
              Sets <span className="font-mono">is_published = true</span> +{" "}
              <span className="font-mono">review_status = published</span>.
              Storefront PDPs go live after revalidation.
            </p>
          ) : null}

          {mode?.kind === "unpublish" ? (
            <p className="text-sm text-stone-600">
              Sets <span className="font-mono">is_published = false</span> +{" "}
              <span className="font-mono">review_status = ready_to_publish</span>.
              Storefront PDPs return 404.
            </p>
          ) : null}

          {mode?.kind === "move-category" ? (
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium text-bark-900">Target category</span>
              <select
                value={pickedCategoryId}
                onChange={(e) => setPickedCategoryId(e.target.value)}
                className={SELECT_CLASS}
                disabled={isPending}
              >
                <option value="">— Pick a category —</option>
                {categoryOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {"— ".repeat(c.depth)}
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {(mode?.kind === "add-tag" || mode?.kind === "remove-tag") ? (
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium text-bark-900">Tag</span>
              <select
                value={pickedTagSlug}
                onChange={(e) => setPickedTagSlug(e.target.value)}
                className={SELECT_CLASS}
                disabled={isPending}
              >
                <option value="">— Pick a tag —</option>
                {allTags.map((t) => (
                  <option key={t.slug} value={t.slug}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {mode?.kind === "soft-delete" ? (
            <>
              <p className="text-sm text-bark-900">
                Sets <span className="font-mono">deleted_at</span> on each row;
                recoverable from{" "}
                <a
                  href="/admin/trash"
                  className="text-teal-800 underline-offset-2 hover:underline"
                >
                  Trash
                </a>
                . Hard delete is per-row in Trash only (ADR-006).
              </p>
              <label className="block space-y-1.5 text-sm">
                <span className="font-medium text-bark-900">
                  Type <span className="font-mono">delete</span> to confirm
                </span>
                <Input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="delete"
                  className="font-mono"
                  autoFocus
                />
              </label>
            </>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={closeDialog}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={onConfirm}
              disabled={
                isPending ||
                (mode?.kind === "soft-delete" && !deleteEnabled) ||
                (mode?.kind === "move-category" && !pickedCategoryId) ||
                ((mode?.kind === "add-tag" || mode?.kind === "remove-tag") &&
                  !pickedTagSlug)
              }
            >
              {isPending ? (
                "Working…"
              ) : (
                <>
                  <CheckCircle2 className="size-3.5" />
                  Confirm
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
