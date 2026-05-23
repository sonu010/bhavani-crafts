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
import {
  LICENSE_STATUSES,
  type LicenseStatus,
} from "@/lib/db/admin/images-public";
import { updateImageLicenseAction } from "../actions";

const LABEL: Record<LicenseStatus, string> = {
  unverified: "Unverified — blocks publish",
  owned: "Owned — Bhavani took the photo",
  licensed: "Licensed — third-party rights held",
  public_domain: "Public domain / CC0",
  disputed: "Disputed — pulled from public",
  removed: "Removed — pending replacement",
};

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-husk-200 bg-paper-0 px-2 text-base md:text-sm text-bark-900 outline-none focus-visible:border-teal-800 focus-visible:ring-3 focus-visible:ring-teal-800/30";

/**
 * License status editor. Owner picks one of six enum values; only
 * `owned` / `licensed` / `public_domain` unblock publish (the
 * launch-blockers check + storefront RLS both gate on those three).
 */
export function LicenseEditDialog({
  productId,
  imageId,
  currentStatus,
  open,
  onOpenChange,
  onSaved,
}: {
  productId: string;
  imageId: string | null;
  currentStatus: LicenseStatus | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (imageId: string, status: LicenseStatus) => void;
}) {
  // The parent remounts this dialog (via `key={imageId}`) when the
  // target image changes, so initial state from props is authoritative.
  const [value, setValue] = useState<LicenseStatus>(currentStatus ?? "unverified");
  const [isPending, startSave] = useTransition();

  const onSave = () => {
    if (!imageId) return;
    startSave(async () => {
      const r = await updateImageLicenseAction(productId, imageId, value);
      if (r.ok) {
        toast.success("License status updated");
        onSaved(imageId, value);
        onOpenChange(false);
      } else {
        toast.error("Could not update license");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>License status</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-stone-500">
          Publishing is blocked while any image is{" "}
          <span className="font-mono">unverified</span>. Set to{" "}
          <span className="font-mono">owned</span>,{" "}
          <span className="font-mono">licensed</span>, or{" "}
          <span className="font-mono">public_domain</span> to allow publish.
        </p>
        <select
          value={value}
          onChange={(e) => setValue(e.target.value as LicenseStatus)}
          className={SELECT_CLASS}
        >
          {LICENSE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {LABEL[s]}
            </option>
          ))}
        </select>
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
