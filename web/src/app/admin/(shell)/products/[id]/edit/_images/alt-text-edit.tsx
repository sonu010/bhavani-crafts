"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { updateImageAltAction } from "../actions";

/**
 * Alt-text editor — opens as a modal, saves on click, dismisses on
 * success. The trigger is rendered by the parent (sortable-thumbnail
 * button) which sets `imageId` to open. Passing null closes.
 */
export function AltTextEditDialog({
  productId,
  imageId,
  currentAlt,
  open,
  onOpenChange,
  onSaved,
}: {
  productId: string;
  imageId: string | null;
  currentAlt: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (imageId: string, alt: string) => void;
}) {
  // The parent remounts this dialog (via `key={imageId}`) every time
  // the target image changes, so useState's initial value is the
  // authoritative source — no useEffect-based sync needed.
  const [value, setValue] = useState(currentAlt ?? "");
  const [isPending, startSave] = useTransition();

  const onSave = () => {
    if (!imageId) return;
    startSave(async () => {
      const r = await updateImageAltAction(productId, imageId, value);
      if (r.ok) {
        toast.success("Alt text saved");
        onSaved(imageId, value.trim());
        onOpenChange(false);
      } else {
        toast.error("Could not save alt text");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Alt text</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-stone-500">
          Describes the image for screen readers and search engines. Leave
          empty to fall back to the product name on the storefront.
        </p>
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. Red 50ml flat-bottom craft bottle"
          autoFocus
        />
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button type="button" onClick={onSave} disabled={isPending}>
            {isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
