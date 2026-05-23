"use client";

import { useState, useTransition } from "react";
import { AlertTriangle } from "lucide-react";
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
  TRASH_ENTITY_LABELS,
  type TrashedRow,
  type TrashEntityType,
} from "@/lib/db/admin/trash-public";
import { hardDeleteEntityAction } from "./actions";

const CASCADE_NOTE: Record<TrashEntityType, string> = {
  products:
    "Cascade: removes all images, variants, attribute values, and tag links for this product.",
  categories: "The row is removed permanently. Already-restored products are unaffected.",
  tags: "The row is removed permanently and product_tags links cascade-delete.",
  product_images:
    "The row is removed permanently. Storage object stays in the bucket until cleaned by the retention sweep.",
  product_variants:
    "Cascade: removes the variant's option-value links.",
};

/**
 * Typed-confirmation modal. The Confirm button stays disabled until
 * the input matches the literal string `DELETE` (case-sensitive). On
 * success, the parent refreshes the page to drop the row.
 */
export function HardDeleteDialog({
  entity,
  target,
  open,
  onOpenChange,
  onDeleted,
}: {
  entity: TrashEntityType;
  target: TrashedRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const [input, setInput] = useState("");
  const [isPending, startDelete] = useTransition();

  const matched = input === "DELETE";

  const onConfirm = () => {
    if (!target || !matched) return;
    startDelete(async () => {
      const r = await hardDeleteEntityAction(entity, target.id);
      if (r.ok) {
        toast.success(`Permanently deleted "${r.label}"`);
        onDeleted();
      } else if (r.error.code === "not_deleted") {
        toast.error("Row is no longer in Trash — restored elsewhere?");
      } else if (r.error.code === "not_found") {
        toast.error("Already gone");
      } else {
        toast.error("Could not delete");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-brick-700">
            <AlertTriangle className="size-5" />
            Permanently delete
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          <p className="text-sm text-bark-900">
            Delete{" "}
            <span className="font-medium">
              {target?.label ?? TRASH_ENTITY_LABELS[entity].toLowerCase()}
            </span>
            ?
          </p>
          <p className="text-xs text-stone-500">{CASCADE_NOTE[entity]}</p>
          <p className="text-xs font-medium text-brick-700">
            This cannot be undone.
          </p>
        </div>

        <label className="block space-y-1.5 text-sm">
          <span className="font-medium text-bark-900">
            Type <span className="font-mono">DELETE</span> to confirm
          </span>
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="DELETE"
            className="font-mono"
            autoFocus
          />
        </label>

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
            onClick={onConfirm}
            disabled={!matched || isPending}
            // The brick destructive variant lives in our button.tsx
            // CVA. Use it via `variant="destructive"` when we wire it
            // in — for now, the disabled state + warning copy carry
            // the weight.
          >
            {isPending ? "Deleting…" : "Confirm hard delete"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
