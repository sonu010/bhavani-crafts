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
import type { AdminTagRow } from "@/lib/db/admin/tags";
import { renameTagAction } from "./actions";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * Rename a tag. Parent passes `key={tag.id}` so each open re-mounts
 * with the right defaults — same pattern the image-license dialog
 * uses to satisfy React Compiler's no-set-state-in-effect rule.
 */
export function RenameTagDialog({
  tag,
  open,
  onOpenChange,
  onSaved,
}: {
  tag: AdminTagRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (id: string, name: string, slug: string) => void;
}) {
  const [name, setName] = useState(tag?.name ?? "");
  const [slug, setSlug] = useState(tag?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(true);
  const [isPending, startSave] = useTransition();

  const onNameChange = (v: string) => {
    setName(v);
    if (!slugTouched) setSlug(slugify(v));
  };

  const onSave = () => {
    if (!tag) return;
    startSave(async () => {
      const r = await renameTagAction(tag.id, { name: name.trim(), slug: slug.trim() });
      if (r.ok) {
        toast.success("Tag renamed");
        onSaved(tag.id, name.trim(), slug.trim());
        onOpenChange(false);
      } else if (r.error.code === "slug_in_use") {
        toast.error("Slug already in use");
      } else if (r.error.code === "validation") {
        toast.error(r.error.message);
      } else {
        toast.error("Could not rename");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rename tag</DialogTitle>
        </DialogHeader>
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium text-bark-900">Name</span>
          <Input
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            autoFocus
          />
        </label>
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium text-bark-900">Slug</span>
          <Input
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setSlugTouched(true);
            }}
            className="font-mono text-sm"
          />
          <span className="block text-xs text-stone-500">
            Auto-derives from name until you edit it manually.
          </span>
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
          <Button type="button" onClick={onSave} disabled={isPending}>
            {isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
